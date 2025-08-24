#!/bin/bash
#
# End-to-End Test Execution Script
# Runs comprehensive E2E tests against ClaudeCluster deployment
#

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Default configuration
DEFAULT_MCP_SERVER_URL="http://localhost:3000"
DEFAULT_WORKER_URLS=""
DEFAULT_TEST_SUITE="smoke"
DEFAULT_TIMEOUT="300"
DEFAULT_PARALLEL_WORKERS="4"
DEFAULT_RETRIES="2"

# Parse command line arguments
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Run ClaudeCluster end-to-end tests"
    echo ""
    echo "Options:"
    echo "  -s, --server-url URL     MCP server URL (default: $DEFAULT_MCP_SERVER_URL)"
    echo "  -w, --worker-urls URLS   Comma-separated worker URLs"
    echo "  -t, --test-suite SUITE   Test suite: smoke, integration, resilience, performance, all (default: $DEFAULT_TEST_SUITE)"
    echo "  --timeout SECONDS        Test timeout in seconds (default: $DEFAULT_TIMEOUT)"
    echo "  --parallel-workers N     Number of parallel test workers (default: $DEFAULT_PARALLEL_WORKERS)"
    echo "  --retries N              Number of retries for failed tests (default: $DEFAULT_RETRIES)"
    echo "  --local                  Run against local Docker services"
    echo "  --cloud                  Run against cloud deployment"
    echo "  --ci                     Run in CI mode (no interactive prompts)"
    echo "  --verbose                Enable verbose logging"
    echo "  --dry-run               Show what would be tested without running"
    echo "  --output-dir DIR        Custom output directory for test results"
    echo "  --junit                 Generate JUnit XML reports"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  TEST_MCP_SERVER_URL     MCP server URL"
    echo "  TEST_WORKER_URLS        Worker URLs (comma-separated)"
    echo "  TEST_TIMEOUT            Test timeout seconds"
    echo "  TEST_VERBOSE            Enable verbose output (true/false)"
    echo "  CI                      CI mode flag"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Run smoke tests against localhost"
    echo "  $0 --local --test-suite=all           # Run all tests against local Docker"
    echo "  $0 --cloud --server-url=https://...  # Run against cloud deployment"
    echo "  $0 --ci --junit --test-suite=smoke    # CI smoke test with JUnit output"
}

# Initialize variables
MCP_SERVER_URL="${TEST_MCP_SERVER_URL:-$DEFAULT_MCP_SERVER_URL}"
WORKER_URLS="${TEST_WORKER_URLS:-$DEFAULT_WORKER_URLS}"
TEST_SUITE="$DEFAULT_TEST_SUITE"
TIMEOUT="$DEFAULT_TIMEOUT"
PARALLEL_WORKERS="$DEFAULT_PARALLEL_WORKERS"
RETRIES="$DEFAULT_RETRIES"
LOCAL_MODE=false
CLOUD_MODE=false
CI_MODE="${CI:-false}"
VERBOSE_MODE="${TEST_VERBOSE:-false}"
DRY_RUN=false
OUTPUT_DIR=""
JUNIT_REPORTS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--server-url)
            MCP_SERVER_URL="$2"
            shift 2
            ;;
        -w|--worker-urls)
            WORKER_URLS="$2"
            shift 2
            ;;
        -t|--test-suite)
            TEST_SUITE="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --parallel-workers)
            PARALLEL_WORKERS="$2"
            shift 2
            ;;
        --retries)
            RETRIES="$2"
            shift 2
            ;;
        --local)
            LOCAL_MODE=true
            shift
            ;;
        --cloud)
            CLOUD_MODE=true
            shift
            ;;
        --ci)
            CI_MODE=true
            shift
            ;;
        --verbose)
            VERBOSE_MODE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --junit)
            JUNIT_REPORTS=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Error: Unknown option $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo "ℹ️  $*"
}

log_success() {
    echo "✅ $*"
}

log_warning() {
    echo "⚠️  $*"
}

log_error() {
    echo "❌ $*" >&2
}

# Validation functions
validate_dependencies() {
    local missing_deps=()
    
    if ! command -v node >/dev/null 2>&1; then
        missing_deps+=("node")
    fi
    
    if ! command -v npm >/dev/null 2>&1 && ! command -v pnpm >/dev/null 2>&1; then
        missing_deps+=("npm or pnpm")
    fi
    
    if [[ "$LOCAL_MODE" == "true" ]] && ! command -v docker >/dev/null 2>&1; then
        missing_deps+=("docker")
    fi
    
    if [[ "${#missing_deps[@]}" -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        return 1
    fi
}

validate_test_suite() {
    case "$TEST_SUITE" in
        smoke|integration|resilience|performance|all)
            return 0
            ;;
        *)
            log_error "Invalid test suite: $TEST_SUITE"
            log_error "Valid options: smoke, integration, resilience, performance, all"
            return 1
            ;;
    esac
}

# Environment setup
setup_local_environment() {
    if [[ "$LOCAL_MODE" == "true" ]]; then
        log_info "Setting up local Docker environment..."
        
        # Use default local URLs
        MCP_SERVER_URL="http://localhost:3000"
        WORKER_URLS="http://localhost:3001,http://localhost:3002"
        
        # Check if services are running
        if ! docker compose -f "$PROJECT_ROOT/docker-compose.yml" ps | grep -q "Up"; then
            log_warning "Local services not running. Starting them..."
            cd "$PROJECT_ROOT"
            docker compose up -d
            
            # Wait for services to be ready
            log_info "Waiting for services to be healthy..."
            sleep 10
            
            # Check health
            local max_attempts=30
            local attempt=0
            
            while [[ $attempt -lt $max_attempts ]]; do
                if curl -s -f "$MCP_SERVER_URL/health" >/dev/null 2>&1; then
                    log_success "MCP server is healthy"
                    break
                fi
                
                log_info "Waiting for MCP server... (attempt $((attempt + 1))/$max_attempts)"
                sleep 2
                ((attempt++))
            done
            
            if [[ $attempt -eq $max_attempts ]]; then
                log_error "Local MCP server failed to become healthy"
                return 1
            fi
        else
            log_info "Local services are already running"
        fi
    fi
}

# Test execution functions
run_test_suite() {
    local suite="$1"
    local test_patterns=()
    
    case "$suite" in
        smoke)
            test_patterns=("tests/e2e/smoke/**/*.test.js")
            ;;
        integration)
            test_patterns=("tests/e2e/integration/**/*.test.js")
            ;;
        resilience)
            test_patterns=("tests/e2e/resilience/**/*.test.js")
            ;;
        performance)
            test_patterns=("tests/e2e/performance/**/*.test.js")
            ;;
        all)
            test_patterns=("tests/e2e/**/*.test.js")
            ;;
        *)
            log_error "Unknown test suite: $suite"
            return 1
            ;;
    esac
    
    # Build Jest command
    local jest_cmd="npx jest"
    local jest_args=()
    
    # Add test patterns
    jest_args+=("${test_patterns[@]}")
    
    # Configuration
    jest_args+=("--config" "tests/e2e/jest.config.js")
    jest_args+=("--maxWorkers" "$PARALLEL_WORKERS")
    jest_args+=("--testTimeout" "$((TIMEOUT * 1000))")
    
    # Retry configuration
    if [[ "$RETRIES" -gt 0 ]]; then
        jest_args+=("--testFailureExitCode" "0")  # Don't exit on first failure
    fi
    
    # Output configuration
    if [[ -n "$OUTPUT_DIR" ]]; then
        jest_args+=("--outputFile" "$OUTPUT_DIR/test-results.json")
    fi
    
    if [[ "$JUNIT_REPORTS" == "true" ]]; then
        jest_args+=("--reporters=default")
        jest_args+=("--reporters=jest-junit")
        
        # Configure jest-junit
        export JEST_JUNIT_OUTPUT_DIR="${OUTPUT_DIR:-$PROJECT_ROOT/test-results}"
        export JEST_JUNIT_OUTPUT_NAME="e2e-results.xml"
        export JEST_JUNIT_SUITE_NAME="ClaudeCluster E2E Tests"
    fi
    
    # Verbose mode
    if [[ "$VERBOSE_MODE" == "true" ]]; then
        jest_args+=("--verbose")
    fi
    
    # CI mode adjustments
    if [[ "$CI_MODE" == "true" ]]; then
        jest_args+=("--ci")
        jest_args+=("--coverage")
        jest_args+=("--watchAll=false")
    fi
    
    log_info "Running $suite tests..."
    log_info "Command: $jest_cmd ${jest_args[*]}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would execute above command"
        return 0
    fi
    
    # Set environment variables for tests
    export TEST_MCP_SERVER_URL="$MCP_SERVER_URL"
    export TEST_WORKER_URLS="$WORKER_URLS"
    export TEST_VERBOSE="$VERBOSE_MODE"
    export TEST_TIMEOUT="$TIMEOUT"
    
    # Execute tests with retries
    local attempt=0
    local max_attempts=$((RETRIES + 1))
    
    while [[ $attempt -lt $max_attempts ]]; do
        if [[ $attempt -gt 0 ]]; then
            log_info "Retrying tests (attempt $((attempt + 1))/$max_attempts)..."
        fi
        
        if cd "$PROJECT_ROOT" && $jest_cmd "${jest_args[@]}"; then
            log_success "$suite tests passed"
            return 0
        else
            log_warning "$suite tests failed on attempt $((attempt + 1))"
            ((attempt++))
            
            if [[ $attempt -lt $max_attempts ]]; then
                log_info "Waiting before retry..."
                sleep 5
            fi
        fi
    done
    
    log_error "$suite tests failed after $max_attempts attempts"
    return 1
}

# Health check functions
check_service_health() {
    log_info "Checking service health..."
    
    # Check MCP server
    if ! curl -s -f "$MCP_SERVER_URL/health" >/dev/null 2>&1; then
        log_error "MCP server health check failed: $MCP_SERVER_URL"
        return 1
    fi
    log_success "MCP server is healthy: $MCP_SERVER_URL"
    
    # Check workers if provided
    if [[ -n "$WORKER_URLS" ]]; then
        IFS=',' read -ra WORKER_ARRAY <<< "$WORKER_URLS"
        for worker_url in "${WORKER_ARRAY[@]}"; do
            worker_url=$(echo "$worker_url" | xargs) # trim whitespace
            if curl -s -f "$worker_url/health" >/dev/null 2>&1; then
                log_success "Worker is healthy: $worker_url"
            else
                log_warning "Worker health check failed: $worker_url"
            fi
        done
    fi
}

# Cleanup functions
cleanup() {
    if [[ "$LOCAL_MODE" == "true" && "$CI_MODE" == "false" ]]; then
        log_info "Cleaning up local environment..."
        # Don't auto-stop in local mode unless explicitly requested
        # User might want to inspect services after tests
    fi
}

# Report generation
generate_report() {
    if [[ -n "$OUTPUT_DIR" ]]; then
        local report_file="$OUTPUT_DIR/test-summary-$TIMESTAMP.txt"
        
        cat > "$report_file" << EOF
ClaudeCluster E2E Test Summary
==============================
Timestamp: $(date)
Test Suite: $TEST_SUITE
Server URL: $MCP_SERVER_URL
Worker URLs: $WORKER_URLS
Timeout: ${TIMEOUT}s
Parallel Workers: $PARALLEL_WORKERS
Retries: $RETRIES
Mode: $(if [[ "$LOCAL_MODE" == "true" ]]; then echo "Local"; elif [[ "$CLOUD_MODE" == "true" ]]; then echo "Cloud"; else echo "Direct"; fi)

Results: See detailed output above
EOF
        
        log_info "Test summary written to: $report_file"
    fi
}

# Main execution
main() {
    log_info "ClaudeCluster E2E Test Runner"
    log_info "=============================="
    
    # Validation
    validate_dependencies || exit 1
    validate_test_suite || exit 1
    
    # Setup output directory
    if [[ -n "$OUTPUT_DIR" ]]; then
        mkdir -p "$OUTPUT_DIR"
    elif [[ "$JUNIT_REPORTS" == "true" ]]; then
        OUTPUT_DIR="$PROJECT_ROOT/test-results"
        mkdir -p "$OUTPUT_DIR"
    fi
    
    # Environment setup
    setup_local_environment || exit 1
    
    # Pre-flight checks
    if [[ "$DRY_RUN" == "false" ]]; then
        check_service_health || exit 1
    fi
    
    # Install test dependencies
    log_info "Installing test dependencies..."
    cd "$PROJECT_ROOT"
    
    if command -v pnpm >/dev/null 2>&1; then
        pnpm install
    else
        npm install
    fi
    
    # Run tests
    local overall_success=true
    
    if [[ "$TEST_SUITE" == "all" ]]; then
        # Run each suite individually for better reporting
        local suites=("smoke" "integration" "resilience" "performance")
        for suite in "${suites[@]}"; do
            if ! run_test_suite "$suite"; then
                overall_success=false
                if [[ "$CI_MODE" == "true" ]]; then
                    # In CI, fail fast on first suite failure
                    break
                fi
            fi
        done
    else
        if ! run_test_suite "$TEST_SUITE"; then
            overall_success=false
        fi
    fi
    
    # Generate reports
    generate_report
    
    # Cleanup
    cleanup
    
    if [[ "$overall_success" == "true" ]]; then
        log_success "All tests completed successfully!"
        exit 0
    else
        log_error "Some tests failed"
        exit 1
    fi
}

# Trap for cleanup
trap cleanup EXIT

# Execute main function
main "$@"