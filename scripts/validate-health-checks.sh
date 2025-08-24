#!/bin/bash
# Validate Health Checks and Service Readiness
# Usage: ./scripts/validate-health-checks.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
MAX_WAIT_TIME=120  # Maximum time to wait for services (seconds)
HEALTH_CHECK_INTERVAL=5  # Interval between health checks (seconds)

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    echo -e "${PURPLE}[DEBUG]${NC} $1"
}

print_section() {
    echo ""
    echo "=================================================="
    echo "$1"
    echo "=================================================="
}

check_prerequisites() {
    print_section "Checking Prerequisites"
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running"
        exit 1
    fi
    log_success "Docker is running"
    
    # Check if curl is available
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    log_success "curl is available"
    
    # Check if jq is available (optional)
    if command -v jq &> /dev/null; then
        log_success "jq is available for JSON parsing"
        JQ_AVAILABLE=true
    else
        log_warning "jq not available - JSON output will be raw"
        JQ_AVAILABLE=false
    fi
}

check_docker_services() {
    print_section "Checking Docker Services Status"
    
    # Check if containers exist
    local containers=$(docker compose ps -q 2>/dev/null | wc -l)
    if [ "$containers" -eq 0 ]; then
        log_error "No Docker containers found. Start services with: pnpm run docker:up"
        exit 1
    fi
    log_success "Found $containers Docker containers"
    
    # Show service status
    log_info "Current service status:"
    docker compose ps
    
    # Check if all containers are running
    local running=$(docker compose ps --filter status=running -q | wc -l)
    local total=$(docker compose ps -q | wc -l)
    
    if [ "$running" -eq "$total" ]; then
        log_success "All $total containers are running"
    else
        log_warning "$running out of $total containers are running"
        log_info "Showing detailed status:"
        docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    fi
}

wait_for_service() {
    local service_name=$1
    local health_url=$2
    local wait_time=0
    
    log_info "Waiting for $service_name to be ready at $health_url"
    
    while [ $wait_time -lt $MAX_WAIT_TIME ]; do
        if curl -s -f "$health_url" >/dev/null 2>&1; then
            log_success "$service_name is ready! (took ${wait_time}s)"
            return 0
        fi
        
        echo -n "."
        sleep $HEALTH_CHECK_INTERVAL
        wait_time=$((wait_time + HEALTH_CHECK_INTERVAL))
    done
    
    echo ""
    log_error "$service_name failed to become ready within ${MAX_WAIT_TIME}s"
    return 1
}

test_mcp_health() {
    print_section "Testing MCP Server Health"
    
    local mcp_url="http://localhost:3000/health"
    
    if ! wait_for_service "MCP Server" "$mcp_url"; then
        log_error "MCP Server health check failed"
        return 1
    fi
    
    # Detailed health check
    log_info "Fetching detailed MCP server health..."
    local response=$(curl -s "$mcp_url" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        if $JQ_AVAILABLE; then
            log_success "MCP Server detailed health:"
            echo "$response" | jq .
            
            # Parse specific health metrics
            local status=$(echo "$response" | jq -r '.status // "unknown"')
            local workers_total=$(echo "$response" | jq -r '.workers.total // 0')
            local workers_available=$(echo "$response" | jq -r '.workers.available // 0')
            local uptime=$(echo "$response" | jq -r '.uptime // 0')
            
            log_info "Health Summary:"
            echo "  Status: $status"
            echo "  Workers: $workers_available/$workers_total available"
            echo "  Uptime: ${uptime}ms"
            
            if [ "$status" = "healthy" ]; then
                log_success "MCP Server reports healthy status"
            else
                log_warning "MCP Server status: $status"
            fi
        else
            log_success "MCP Server health response (raw JSON):"
            echo "$response"
        fi
    else
        log_error "Failed to fetch detailed MCP health"
        return 1
    fi
}

test_worker_health() {
    local worker_name=$1
    local worker_port=$2
    
    print_section "Testing $worker_name Health"
    
    local worker_url="http://localhost:$worker_port/hello"
    
    if ! wait_for_service "$worker_name" "$worker_url"; then
        log_error "$worker_name health check failed"
        return 1
    fi
    
    # Detailed health check
    log_info "Fetching detailed $worker_name health..."
    local response=$(curl -s "$worker_url" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        if $JQ_AVAILABLE; then
            log_success "$worker_name detailed health:"
            echo "$response" | jq .
            
            # Parse specific worker metrics
            local status=$(echo "$response" | jq -r '.status // "unknown"')
            local active_tasks=$(echo "$response" | jq -r '.activeTasks // 0')
            local total_tasks=$(echo "$response" | jq -r '.totalTasksExecuted // 0')
            local uptime=$(echo "$response" | jq -r '.uptime // 0')
            
            log_info "$worker_name Summary:"
            echo "  Status: $status"
            echo "  Active Tasks: $active_tasks"
            echo "  Total Tasks Executed: $total_tasks"
            echo "  Uptime: ${uptime}ms"
            
            if [ "$status" = "available" ] || [ "$status" = "ready" ]; then
                log_success "$worker_name reports ready status"
            else
                log_warning "$worker_name status: $status"
            fi
        else
            log_success "$worker_name health response (raw JSON):"
            echo "$response"
        fi
    else
        log_error "Failed to fetch detailed $worker_name health"
        return 1
    fi
}

test_docker_health_checks() {
    print_section "Testing Docker Health Check Integration"
    
    log_info "Checking Docker container health status..."
    
    # Get health status from docker inspect
    local containers=("claudecluster-mcp" "claudecluster-worker-1" "claudecluster-worker-2")
    
    for container in "${containers[@]}"; do
        if docker inspect "$container" >/dev/null 2>&1; then
            local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null)
            
            if [ -n "$health_status" ] && [ "$health_status" != "<no value>" ]; then
                if [ "$health_status" = "healthy" ]; then
                    log_success "$container: Docker health check is $health_status"
                else
                    log_warning "$container: Docker health check is $health_status"
                fi
                
                # Show recent health check logs
                log_debug "Recent health check logs for $container:"
                docker inspect --format='{{range .State.Health.Log}}{{.Start}}: {{.Output}}{{end}}' "$container" 2>/dev/null | tail -3
            else
                log_warning "$container: No Docker health check configured"
            fi
        else
            log_error "$container: Container not found"
        fi
    done
}

test_logging_readiness() {
    print_section "Testing Logging and Service Readiness"
    
    log_info "Checking service logs for readiness indicators..."
    
    # Check MCP server logs
    log_info "MCP Server logs (last 10 lines):"
    docker compose logs --tail=10 mcp-server 2>/dev/null | head -10
    
    # Check for specific readiness indicators
    if docker compose logs mcp-server 2>/dev/null | grep -q "MCP Server listening"; then
        log_success "MCP Server shows readiness in logs"
    else
        log_warning "MCP Server readiness indicator not found in logs"
    fi
    
    # Check worker logs
    for worker in worker-1 worker-2; do
        log_info "$worker logs (last 10 lines):"
        docker compose logs --tail=10 "$worker" 2>/dev/null | head -10
        
        if docker compose logs "$worker" 2>/dev/null | grep -q "Worker server listening"; then
            log_success "$worker shows readiness in logs"
        else
            log_warning "$worker readiness indicator not found in logs"
        fi
    done
}

test_error_scenarios() {
    print_section "Testing Error Scenarios and Recovery"
    
    log_info "Testing health endpoints under error conditions..."
    
    # Test invalid endpoints
    log_info "Testing invalid endpoints (should return 404):"
    
    local invalid_urls=("http://localhost:3000/invalid" "http://localhost:3001/invalid" "http://localhost:3002/invalid")
    
    for url in "${invalid_urls[@]}"; do
        local response_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
        
        if [ "$response_code" = "404" ]; then
            log_success "$url correctly returns 404"
        else
            log_warning "$url returns unexpected code: $response_code"
        fi
    done
}

generate_health_report() {
    print_section "Health Check Summary Report"
    
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    cat << EOF
ClaudeCluster Health Check Report
Generated: $timestamp

Service Endpoints:
  MCP Server:  http://localhost:3000/health
  Worker 1:    http://localhost:3001/hello
  Worker 2:    http://localhost:3002/hello

Health Check Configuration:
  Max Wait Time:     ${MAX_WAIT_TIME}s
  Check Interval:    ${HEALTH_CHECK_INTERVAL}s
  JSON Parsing:      $($JQ_AVAILABLE && echo "Available" || echo "Not Available")

Docker Integration:
  Health Check Interval: 30s
  Health Check Timeout:  10s  
  Start Period:         60s
  Retries:              3

Next Steps:
  1. If all checks passed: Services are ready for use
  2. If checks failed: Check logs with 'pnpm run docker:logs'
  3. For CLI testing: Run 'pnpm run docker:test-cli'
  4. For service restart: Run 'pnpm run docker:restart'

EOF
}

main() {
    echo "ClaudeCluster Health Check and Service Readiness Validator"
    echo "========================================================="
    echo ""
    
    # Run all validation steps
    check_prerequisites
    
    check_docker_services
    
    # Test individual services
    test_mcp_health
    local mcp_result=$?
    
    test_worker_health "Worker 1" 3001
    local worker1_result=$?
    
    test_worker_health "Worker 2" 3002  
    local worker2_result=$?
    
    # Test Docker integration
    test_docker_health_checks
    
    # Test logging
    test_logging_readiness
    
    # Test error scenarios
    test_error_scenarios
    
    # Generate final report
    generate_health_report
    
    # Calculate overall result
    local overall_result=0
    if [ $mcp_result -ne 0 ] || [ $worker1_result -ne 0 ] || [ $worker2_result -ne 0 ]; then
        overall_result=1
    fi
    
    if [ $overall_result -eq 0 ]; then
        print_section "🎉 ALL HEALTH CHECKS PASSED!"
        log_success "ClaudeCluster services are healthy and ready"
        log_info "You can now use the CLI: pnpm run cli run \"Your task here\""
    else
        print_section "❌ HEALTH CHECKS FAILED!"
        log_error "Some services are not healthy"
        log_info "Check logs with: pnpm run docker:logs"
        log_info "Restart services with: pnpm run docker:restart"
    fi
    
    exit $overall_result
}

# Allow script to be sourced for individual function testing
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi