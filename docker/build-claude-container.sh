#!/bin/bash
# Build script for ClaudeCluster agentic mode container

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-claudecluster/claude-agentic}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DOCKERFILE="${DOCKERFILE:-Dockerfile.claude-container}"

# Colors for output
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

# Validate requirements
validate_requirements() {
    log "INFO" "Validating build requirements"
    
    # Check if Docker is available
    if ! command -v docker >/dev/null 2>&1; then
        error_exit "Docker is not installed or not in PATH" 2
    fi
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        error_exit "Docker is not running or not accessible" 2
    fi
    
    # Check if Dockerfile exists
    if [[ ! -f "$SCRIPT_DIR/$DOCKERFILE" ]]; then
        error_exit "Dockerfile not found: $SCRIPT_DIR/$DOCKERFILE" 2
    fi
    
    # Check if wrapper script exists
    if [[ ! -f "$SCRIPT_DIR/scripts/claude-prototype-wrapper.sh" ]]; then
        error_exit "Wrapper script not found: $SCRIPT_DIR/scripts/claude-prototype-wrapper.sh" 2
    fi
    
    log "INFO" "All requirements validated"
}

# Build the container image
build_image() {
    log "INFO" "Building ClaudeCluster agentic container"
    log "INFO" "Image: $IMAGE_NAME:$IMAGE_TAG"
    log "INFO" "Dockerfile: $DOCKERFILE"
    log "INFO" "Build context: $SCRIPT_DIR"
    
    local start_time=$(date +%s)
    
    # Build with detailed output
    docker build \
        --file "$SCRIPT_DIR/$DOCKERFILE" \
        --tag "$IMAGE_NAME:$IMAGE_TAG" \
        --label "build.timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --label "build.commit=$(cd "$PROJECT_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" \
        --label "build.branch=$(cd "$PROJECT_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')" \
        "$SCRIPT_DIR" || error_exit "Docker build failed" 3
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "SUCCESS" "Container built successfully in ${duration}s"
}

# Test the built image
test_image() {
    log "INFO" "Testing built container image"
    
    # Test 1: Version check
    log "INFO" "Testing version command"
    docker run --rm "$IMAGE_NAME:$IMAGE_TAG" --version || \
        error_exit "Version test failed" 4
    
    # Test 2: Health check
    log "INFO" "Testing health check"
    docker run --rm "$IMAGE_NAME:$IMAGE_TAG" --health-check || \
        error_exit "Health check test failed" 4
    
    # Test 3: Help command
    log "INFO" "Testing help command"
    docker run --rm "$IMAGE_NAME:$IMAGE_TAG" --help >/dev/null || \
        error_exit "Help test failed" 4
    
    log "SUCCESS" "All tests passed"
}

# Show image information
show_image_info() {
    log "INFO" "Container image information:"
    
    local image_id=$(docker images "$IMAGE_NAME:$IMAGE_TAG" --format "{{.ID}}")
    local image_size=$(docker images "$IMAGE_NAME:$IMAGE_TAG" --format "{{.Size}}")
    local created=$(docker images "$IMAGE_NAME:$IMAGE_TAG" --format "{{.CreatedAt}}")
    
    echo "  Image ID: $image_id"
    echo "  Image Size: $image_size"
    echo "  Created: $created"
    echo "  Full Name: $IMAGE_NAME:$IMAGE_TAG"
    
    # Show labels
    echo "  Labels:"
    docker inspect "$IMAGE_NAME:$IMAGE_TAG" --format '{{range $k, $v := .Config.Labels}}    {{$k}}: {{$v}}{{"\n"}}{{end}}' | head -20
}

# Usage information
show_usage() {
    cat << EOF
Build script for ClaudeCluster agentic mode container

Usage: $0 [OPTIONS] [COMMAND]

Options:
  --image-name NAME     Container image name (default: claudecluster/claude-agentic)
  --image-tag TAG       Container image tag (default: latest)
  --dockerfile FILE     Dockerfile to use (default: Dockerfile.claude-container)
  --no-test            Skip testing the built image
  --no-cache           Build without using cache
  --push               Push image to registry after build
  --help               Show this help

Commands:
  build                Build the container (default)
  test                 Test an existing container
  clean                Remove built container
  info                 Show container information

Environment Variables:
  IMAGE_NAME           Override image name
  IMAGE_TAG            Override image tag
  DOCKERFILE           Override dockerfile name
  DOCKER_REGISTRY      Registry to push to (for --push)

Examples:
  $0                                    # Build with defaults
  $0 --image-tag v1.0.0 --no-cache    # Build specific version without cache
  $0 test                              # Test existing container
  $0 clean                            # Remove container
EOF
}

# Parse command line arguments
COMMAND="build"
NO_TEST=false
NO_CACHE=false
PUSH=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --image-name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        --image-tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        --dockerfile)
            DOCKERFILE="$2"
            shift 2
            ;;
        --no-test)
            NO_TEST=true
            shift
            ;;
        --no-cache)
            NO_CACHE=true
            shift
            ;;
        --push)
            PUSH=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        build|test|clean|info)
            COMMAND="$1"
            shift
            ;;
        *)
            error_exit "Unknown option: $1" 1
            ;;
    esac
done

# Add --no-cache flag if requested
if [[ "$NO_CACHE" == "true" ]]; then
    DOCKER_BUILD_ARGS="$DOCKER_BUILD_ARGS --no-cache"
fi

# Main execution
case "$COMMAND" in
    build)
        validate_requirements
        build_image
        
        if [[ "$NO_TEST" != "true" ]]; then
            test_image
        fi
        
        show_image_info
        
        if [[ "$PUSH" == "true" ]]; then
            if [[ -n "$DOCKER_REGISTRY" ]]; then
                docker tag "$IMAGE_NAME:$IMAGE_TAG" "$DOCKER_REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
                docker push "$DOCKER_REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
                log "SUCCESS" "Image pushed to $DOCKER_REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
            else
                docker push "$IMAGE_NAME:$IMAGE_TAG"
                log "SUCCESS" "Image pushed to $IMAGE_NAME:$IMAGE_TAG"
            fi
        fi
        
        log "SUCCESS" "Build completed successfully!"
        ;;
    test)
        test_image
        ;;
    clean)
        log "INFO" "Removing container image: $IMAGE_NAME:$IMAGE_TAG"
        docker rmi "$IMAGE_NAME:$IMAGE_TAG" 2>/dev/null || \
            log "WARN" "Image not found or already removed"
        log "SUCCESS" "Cleanup completed"
        ;;
    info)
        show_image_info
        ;;
    *)
        error_exit "Unknown command: $COMMAND" 1
        ;;
esac