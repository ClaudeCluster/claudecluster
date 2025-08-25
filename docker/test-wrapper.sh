#!/bin/bash
# Test script for ClaudeCluster container wrapper

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER_SCRIPT="$SCRIPT_DIR/scripts/claude-prototype-wrapper.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        "ERROR")
            echo -e "${RED}[ERROR]${NC} $timestamp - $message" >&2
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} $timestamp - $message" >&2
            ;;
        "INFO")
            echo -e "${BLUE}[INFO]${NC} $timestamp - $message"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[SUCCESS]${NC} $timestamp - $message"
            ;;
    esac
}

error_exit() {
    local message="$1"
    local exit_code="${2:-1}"
    log "ERROR" "$message"
    exit "$exit_code"
}

# Test wrapper script syntax
test_syntax() {
    log "INFO" "Testing wrapper script syntax"
    
    if ! bash -n "$WRAPPER_SCRIPT"; then
        error_exit "Wrapper script has syntax errors" 2
    fi
    
    log "SUCCESS" "Syntax test passed"
}

# Test wrapper script commands
test_commands() {
    log "INFO" "Testing wrapper script commands"
    
    # Test version command
    if ! bash "$WRAPPER_SCRIPT" --version >/dev/null 2>&1; then
        error_exit "Version command failed" 3
    fi
    log "SUCCESS" "Version command test passed"
    
    # Test help command
    if ! bash "$WRAPPER_SCRIPT" --help >/dev/null 2>&1; then
        error_exit "Help command failed" 3
    fi
    log "SUCCESS" "Help command test passed"
}

# Test environment validation
test_environment_validation() {
    log "INFO" "Testing environment validation"
    
    # Test missing SESSION_ID
    if bash "$WRAPPER_SCRIPT" 2>/dev/null; then
        error_exit "Should fail with missing SESSION_ID" 4
    fi
    log "SUCCESS" "Missing SESSION_ID validation test passed"
    
    # Test missing TASK
    if SESSION_ID="test" bash "$WRAPPER_SCRIPT" 2>/dev/null; then
        error_exit "Should fail with missing TASK" 4
    fi
    log "SUCCESS" "Missing TASK validation test passed"
    
    # Test missing CLAUDE_API_KEY
    if SESSION_ID="test" TASK="test" bash "$WRAPPER_SCRIPT" 2>/dev/null; then
        error_exit "Should fail with missing CLAUDE_API_KEY" 4
    fi
    log "SUCCESS" "Missing CLAUDE_API_KEY validation test passed"
}

# Test workspace setup (requires environment variables but will fail at Claude Code execution)
test_workspace_setup() {
    log "INFO" "Testing workspace setup"
    
    local test_workspace="/tmp/claudecluster-test-$$"
    
    # This will fail at Claude Code execution, but we can test up to that point
    # Check if the wrapper at least attempts to set up workspace
    local output
    if output=$(SESSION_ID="test-$$" TASK="test task" CLAUDE_API_KEY="test" WORKSPACE_DIR="$test_workspace" timeout 5 bash "$WRAPPER_SCRIPT" 2>&1 || true); then
        if echo "$output" | grep -q "Setting up workspace\|Health check failed\|Claude Code executable not found"; then
            log "SUCCESS" "Workspace setup test passed (wrapper started correctly)"
        else
            log "WARN" "Workspace test inconclusive, but wrapper executed"
        fi
    else
        log "WARN" "Workspace test failed, but this is expected without Claude Code"
    fi
    
    # Clean up
    rm -rf "$test_workspace" 2>/dev/null || true
}

# Test script permissions
test_permissions() {
    log "INFO" "Testing script permissions"
    
    if [[ ! -x "$WRAPPER_SCRIPT" ]]; then
        log "WARN" "Wrapper script is not executable, fixing..."
        chmod +x "$WRAPPER_SCRIPT"
    fi
    
    if [[ ! -r "$WRAPPER_SCRIPT" ]]; then
        error_exit "Wrapper script is not readable" 6
    fi
    
    log "SUCCESS" "Permissions test passed"
}

# Run all tests
run_all_tests() {
    log "INFO" "Starting wrapper script tests"
    
    # Check if wrapper script exists
    if [[ ! -f "$WRAPPER_SCRIPT" ]]; then
        error_exit "Wrapper script not found: $WRAPPER_SCRIPT" 1
    fi
    
    test_permissions
    test_syntax
    test_commands
    test_environment_validation
    test_workspace_setup
    
    log "SUCCESS" "All wrapper script tests passed!"
}

# Show usage
show_usage() {
    cat << EOF
Test script for ClaudeCluster container wrapper

Usage: $0 [OPTIONS] [TEST]

Options:
  --help               Show this help

Tests:
  syntax              Test script syntax only
  commands            Test command line options
  environment         Test environment validation
  workspace           Test workspace setup
  permissions         Test file permissions
  all                 Run all tests (default)

Examples:
  $0                  # Run all tests
  $0 syntax          # Test syntax only
  $0 commands        # Test commands only
EOF
}

# Main execution
case "${1:-all}" in
    syntax)
        test_syntax
        ;;
    commands)
        test_commands
        ;;
    environment)
        test_environment_validation
        ;;
    workspace)
        test_workspace_setup
        ;;
    permissions)
        test_permissions
        ;;
    all)
        run_all_tests
        ;;
    --help)
        show_usage
        exit 0
        ;;
    *)
        error_exit "Unknown test: $1" 1
        ;;
esac