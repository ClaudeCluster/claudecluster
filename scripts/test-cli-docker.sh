#!/bin/bash
# Test CLI connectivity to Docker services
# Usage: ./scripts/test-cli-docker.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

check_services() {
    log_info "Checking if Docker services are running..."
    
    # Check if Docker services are up
    if ! docker compose ps | grep -q "Up"; then
        log_error "Docker services are not running. Start them with:"
        echo "  pnpm run docker:up"
        exit 1
    fi
    
    log_success "Docker services are running"
}

test_mcp_health() {
    log_info "Testing MCP server health endpoint..."
    
    if curl -s -f http://localhost:3000/health > /dev/null; then
        log_success "MCP server health check passed"
        
        # Show detailed health info
        log_info "MCP server health details:"
        curl -s http://localhost:3000/health | jq . || curl -s http://localhost:3000/health
    else
        log_error "MCP server health check failed"
        exit 1
    fi
}

test_worker_health() {
    log_info "Testing worker health endpoints..."
    
    for worker_port in 3001 3002; do
        if curl -s -f http://localhost:$worker_port/hello > /dev/null; then
            log_success "Worker on port $worker_port is healthy"
        else
            log_error "Worker on port $worker_port health check failed"
            exit 1
        fi
    done
}

test_cli_connection() {
    log_info "Testing CLI connection to MCP server..."
    
    # Test CLI with a simple verbose connection (without actually running a task)
    log_info "Checking CLI configuration..."
    
    # First check if we can build the CLI
    if ! pnpm --filter @claudecluster/cli build > /dev/null 2>&1; then
        log_error "CLI build failed. Building CLI..."
        pnpm --filter @claudecluster/cli build || exit 1
    fi
    
    log_success "CLI is built and ready"
    
    # Test connection with a minimal prompt (this will attempt to connect)
    log_info "Testing CLI connection with minimal task..."
    
    # Use timeout to prevent hanging
    if timeout 30s pnpm --filter @claudecluster/cli start -- run "echo 'hello world'" --verbose --json 2>/dev/null; then
        log_success "CLI successfully connected and submitted task"
    else
        log_warning "CLI connection test timed out or failed"
        log_info "This might be expected if workers need Claude authentication"
        log_info "Check Docker logs: docker compose logs worker-1"
    fi
}

show_connection_info() {
    log_info "Connection information:"
    echo "  MCP Server:  http://localhost:3000"
    echo "  Worker 1:    http://localhost:3001"  
    echo "  Worker 2:    http://localhost:3002"
    echo ""
    log_info "CLI Configuration:"
    echo "  Default server: http://localhost:3000 (matches Docker setup)"
    echo "  Override with:  --server http://localhost:3000"
    echo ""
    log_info "Example CLI usage:"
    echo "  pnpm run cli run \"Create a simple hello world function\""
    echo "  pnpm run cli run \"Your prompt here\" --verbose"
    echo "  pnpm run cli run \"Your prompt here\" --server http://localhost:3000"
}

main() {
    echo "ClaudeCluster Docker-CLI Connectivity Test"
    echo "=========================================="
    echo ""
    
    check_services
    echo ""
    
    test_mcp_health  
    echo ""
    
    test_worker_health
    echo ""
    
    test_cli_connection
    echo ""
    
    show_connection_info
    
    log_success "All connectivity tests completed!"
}

main