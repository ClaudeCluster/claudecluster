#!/bin/bash
# claude-prototype-wrapper.sh
# Container wrapper script for ClaudeCluster agentic mode
#
# This script runs inside the Docker container to handle repository cloning,
# environment setup, and task execution with Claude Code.

set -e

# Configuration
WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
LOG_LEVEL="${LOG_LEVEL:-INFO}"
TIMEOUT="${TIMEOUT:-300}"
MAX_OUTPUT_SIZE="${MAX_OUTPUT_SIZE:-10485760}" # 10MB

# Color codes for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
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
        "DEBUG")
            if [[ "$LOG_LEVEL" == "DEBUG" ]]; then
                echo -e "${GREEN}[DEBUG]${NC} $timestamp - $message"
            fi
            ;;
        *)
            echo "$timestamp - $message"
            ;;
    esac
}

# Error handler
error_exit() {
    local message="$1"
    local exit_code="${2:-1}"
    log "ERROR" "$message"
    exit "$exit_code"
}

# Cleanup function
cleanup() {
    log "INFO" "Cleaning up container session"
    
    # Kill any running background processes
    jobs -p | xargs -r kill 2>/dev/null || true
    
    # Clean up temporary files
    if [[ -d "/tmp/claudecluster" ]]; then
        rm -rf "/tmp/claudecluster" 2>/dev/null || true
    fi
    
    log "INFO" "Cleanup completed"
}

# Set up signal handlers
trap cleanup EXIT
trap 'error_exit "Script interrupted by signal"' INT TERM

# Validate required environment variables
validate_environment() {
    log "INFO" "Validating environment variables"
    
    if [[ -z "$SESSION_ID" ]]; then
        error_exit "SESSION_ID environment variable is required" 2
    fi
    
    if [[ -z "$TASK" ]]; then
        error_exit "TASK environment variable is required" 2
    fi
    
    if [[ -z "$CLAUDE_API_KEY" ]]; then
        error_exit "CLAUDE_API_KEY environment variable is required" 2
    fi
    
    log "INFO" "Environment validation passed"
}

# Set up workspace directory
setup_workspace() {
    log "INFO" "Setting up workspace directory: $WORKSPACE_DIR"
    
    # Create workspace directory with proper permissions
    mkdir -p "$WORKSPACE_DIR"
    chmod 755 "$WORKSPACE_DIR"
    
    # Create temporary directory for this session
    export TMPDIR="/tmp/claudecluster/$SESSION_ID"
    mkdir -p "$TMPDIR"
    chmod 700 "$TMPDIR"
    
    # Change to workspace directory
    cd "$WORKSPACE_DIR"
    
    log "INFO" "Workspace setup completed"
}

# Clone repository if provided
clone_repository() {
    if [[ -n "$REPO_URL" ]]; then
        log "INFO" "Cloning repository: $REPO_URL"
        
        local repo_dir="$WORKSPACE_DIR/repo"
        
        # Validate repository URL format
        if [[ ! "$REPO_URL" =~ ^https?:// && ! "$REPO_URL" =~ ^git@ ]]; then
            error_exit "Invalid repository URL format: $REPO_URL" 3
        fi
        
        # Clone with timeout and error handling
        timeout "$TIMEOUT" git clone --depth 1 --single-branch "$REPO_URL" "$repo_dir" || \
            error_exit "Failed to clone repository: $REPO_URL" 3
        
        # Verify clone was successful
        if [[ ! -d "$repo_dir/.git" ]]; then
            error_exit "Repository clone verification failed" 3
        fi
        
        # Change to repository directory
        cd "$repo_dir"
        
        # Log repository information
        log "INFO" "Repository cloned successfully"
        log "DEBUG" "Repository root: $(pwd)"
        log "DEBUG" "Repository HEAD: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
    else
        log "INFO" "No repository URL provided, using empty workspace"
    fi
}

# Set up Claude Code environment
setup_claude_code() {
    log "INFO" "Setting up Claude Code environment"
    
    # Verify Claude Code is available
    if ! command -v claude-code >/dev/null 2>&1; then
        error_exit "Claude Code executable not found in PATH" 4
    fi
    
    # Set up authentication
    export CLAUDE_API_KEY="$CLAUDE_API_KEY"
    
    # Configure Claude Code for non-interactive mode
    export CLAUDE_CODE_NON_INTERACTIVE=1
    export CLAUDE_CODE_SESSION_ID="$SESSION_ID"
    
    # Set resource limits for Claude Code
    ulimit -m 2097152 2>/dev/null || true  # 2GB memory limit
    ulimit -t 600 2>/dev/null || true      # 10 minute CPU time limit
    
    log "INFO" "Claude Code environment setup completed"
    log "DEBUG" "Claude Code version: $(claude-code --version 2>/dev/null || echo 'unknown')"
}

# Execute task with Claude Code
execute_task() {
    log "INFO" "Executing task for session: $SESSION_ID"
    log "INFO" "Task description: $TASK"
    
    local start_time=$(date +%s)
    local output_file="$TMPDIR/claude_output.txt"
    local error_file="$TMPDIR/claude_error.txt"
    local exit_code=0
    
    # Prepare task input
    local task_input
    if [[ -n "$TASK_FILE" && -f "$TASK_FILE" ]]; then
        # Read task from file if provided
        task_input="$(cat "$TASK_FILE")"
        log "DEBUG" "Task input read from file: $TASK_FILE"
    else
        # Use task from environment variable
        task_input="$TASK"
    fi
    
    # Execute Claude Code with timeout and resource limits
    log "INFO" "Starting Claude Code execution"
    
    {
        echo "$task_input" | timeout "$TIMEOUT" claude-code --non-interactive \
            --session-id "$SESSION_ID" \
            --max-output-size "$MAX_OUTPUT_SIZE" \
            2>"$error_file"
    } > "$output_file" || exit_code=$?
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Log execution results
    log "INFO" "Claude Code execution completed in ${duration}s with exit code: $exit_code"
    
    # Handle output
    if [[ -f "$output_file" && -s "$output_file" ]]; then
        local output_size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null || echo "unknown")
        log "INFO" "Task output size: $output_size bytes"
        
        # Output the results (will be captured by container attach)
        echo "=== CLAUDE CODE OUTPUT START ==="
        cat "$output_file"
        echo "=== CLAUDE CODE OUTPUT END ==="
    else
        log "WARN" "No output generated by Claude Code"
    fi
    
    # Handle errors
    if [[ -f "$error_file" && -s "$error_file" ]]; then
        log "WARN" "Claude Code generated error output:"
        echo "=== CLAUDE CODE ERROR START ===" >&2
        cat "$error_file" >&2
        echo "=== CLAUDE CODE ERROR END ===" >&2
    fi
    
    # Return appropriate exit code
    case "$exit_code" in
        0)
            log "INFO" "Task completed successfully"
            return 0
            ;;
        124)
            error_exit "Task execution timed out after ${TIMEOUT}s" 5
            ;;
        *)
            error_exit "Task execution failed with exit code: $exit_code" 5
            ;;
    esac
}

# Generate execution summary
generate_summary() {
    log "INFO" "Generating execution summary"
    
    echo "=== EXECUTION SUMMARY ==="
    echo "Session ID: $SESSION_ID"
    echo "Workspace: $WORKSPACE_DIR"
    echo "Repository: ${REPO_URL:-'None'}"
    echo "Task: $TASK"
    echo "Execution Time: $(date)"
    echo "Container: $(hostname)"
    echo "=== SUMMARY END ==="
}

# Health check function
health_check() {
    log "INFO" "Running health check"
    
    # Check if Claude Code is responsive
    if ! timeout 10 claude-code --version >/dev/null 2>&1; then
        error_exit "Health check failed: Claude Code not responsive" 6
    fi
    
    # Check disk space
    local available_space=$(df "$WORKSPACE_DIR" | awk 'NR==2{print $4}')
    if [[ "$available_space" -lt 102400 ]]; then  # Less than 100MB
        log "WARN" "Low disk space: ${available_space}KB available"
    fi
    
    # Check memory usage
    local memory_usage=$(free | grep Mem | awk '{print ($3/$2) * 100.0}' 2>/dev/null || echo "unknown")
    log "DEBUG" "Memory usage: ${memory_usage}%"
    
    log "INFO" "Health check passed"
}

# Main execution flow
main() {
    log "INFO" "ClaudeCluster Container Wrapper starting"
    log "INFO" "Session ID: $SESSION_ID"
    
    # Run health check first
    health_check
    
    # Validate environment
    validate_environment
    
    # Set up workspace
    setup_workspace
    
    # Clone repository if needed
    clone_repository
    
    # Set up Claude Code
    setup_claude_code
    
    # Execute the task
    execute_task
    
    # Generate summary
    generate_summary
    
    log "INFO" "Container wrapper execution completed successfully"
}

# Handle special commands
case "${1:-}" in
    --health-check)
        health_check
        exit 0
        ;;
    --version)
        echo "ClaudeCluster Container Wrapper v1.0.0"
        exit 0
        ;;
    --help)
        echo "ClaudeCluster Container Wrapper"
        echo ""
        echo "Environment Variables:"
        echo "  SESSION_ID       - Unique session identifier (required)"
        echo "  TASK            - Task description to execute (required)"
        echo "  CLAUDE_API_KEY  - Claude API key for authentication (required)"
        echo "  REPO_URL        - Git repository URL to clone (optional)"
        echo "  WORKSPACE_DIR   - Workspace directory (default: /workspace)"
        echo "  LOG_LEVEL       - Logging level: DEBUG, INFO, WARN, ERROR (default: INFO)"
        echo "  TIMEOUT         - Execution timeout in seconds (default: 300)"
        echo ""
        echo "Commands:"
        echo "  --health-check  - Run health check and exit"
        echo "  --version       - Show version and exit"
        echo "  --help          - Show this help and exit"
        exit 0
        ;;
    "")
        # Normal execution
        main
        ;;
    *)
        error_exit "Unknown command: $1" 1
        ;;
esac