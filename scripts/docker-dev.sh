#!/bin/bash
# ClaudeCluster Docker Development Management Script
# Usage: ./scripts/docker-dev.sh [command]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Docker Compose project name
COMPOSE_PROJECT_NAME="claudecluster"

# Functions
print_usage() {
    echo "ClaudeCluster Docker Development Manager"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  build      Build all Docker images"
    echo "  up         Start all services"
    echo "  down       Stop all services"
    echo "  restart    Restart all services"
    echo "  logs       Show logs for all services"
    echo "  status     Show service status"
    echo "  clean      Remove all containers, volumes, and images"
    echo "  shell      Open shell in MCP server container"
    echo "  worker-shell [1|2]  Open shell in worker container"
    echo "  health     Check health of all services"
    echo "  env-check  Check environment variables"
    echo "  rebuild    Clean rebuild of all services"
    echo ""
    echo "Examples:"
    echo "  $0 up                 # Start all services"
    echo "  $0 logs -f            # Follow logs"
    echo "  $0 worker-shell 1     # Shell into worker-1"
}

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

check_env() {
    if [ ! -f ".env" ]; then
        log_error ".env file not found!"
        log_info "Copy .env.example to .env and fill in the required values:"
        log_info "cp .env.example .env"
        exit 1
    fi

    # Check for required environment variables
    if ! grep -q "ANTHROPIC_API_KEY.*=.*[^your_anthropic_api_key_here]" .env; then
        log_warning "ANTHROPIC_API_KEY may not be set correctly in .env"
    fi

    if ! grep -q "CLAUDE_CLI_SESSION_TOKEN.*=.*[^your_claude_cli_session_token_here]" .env; then
        log_warning "CLAUDE_CLI_SESSION_TOKEN may not be set correctly in .env"
        log_info "Get your session token by running: claude auth status"
    fi
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi

    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
}

docker_build() {
    log_info "Building ClaudeCluster Docker images..."
    check_env
    check_docker
    
    docker compose -p "$COMPOSE_PROJECT_NAME" build --pull
    log_success "Build completed successfully"
}

docker_up() {
    log_info "Starting ClaudeCluster services..."
    check_env
    check_docker
    
    docker compose -p "$COMPOSE_PROJECT_NAME" up -d
    
    log_info "Waiting for services to be healthy..."
    sleep 5
    
    # Wait for health checks
    for i in {1..30}; do
        if docker compose -p "$COMPOSE_PROJECT_NAME" ps --filter health=healthy | grep -q "healthy"; then
            log_success "Services are starting up..."
            break
        fi
        echo -n "."
        sleep 2
    done
    
    echo ""
    docker_status
    log_success "Services started successfully"
    log_info "MCP Server available at: http://localhost:3000"
    log_info "Worker 1 available at: http://localhost:3001"  
    log_info "Worker 2 available at: http://localhost:3002"
}

docker_down() {
    log_info "Stopping ClaudeCluster services..."
    docker compose -p "$COMPOSE_PROJECT_NAME" down
    log_success "Services stopped successfully"
}

docker_restart() {
    log_info "Restarting ClaudeCluster services..."
    docker_down
    sleep 2
    docker_up
}

docker_logs() {
    check_docker
    
    # If additional arguments are provided (like -f), pass them through
    shift
    docker compose -p "$COMPOSE_PROJECT_NAME" logs "$@"
}

docker_status() {
    check_docker
    log_info "ClaudeCluster service status:"
    docker compose -p "$COMPOSE_PROJECT_NAME" ps
}

docker_clean() {
    log_warning "This will remove ALL ClaudeCluster containers, volumes, and images!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cleaning up ClaudeCluster resources..."
        
        # Stop and remove containers
        docker compose -p "$COMPOSE_PROJECT_NAME" down -v --remove-orphans
        
        # Remove images
        docker images | grep claudecluster | awk '{print $3}' | xargs -r docker rmi -f
        
        # Remove named volumes
        docker volume ls | grep claudecluster | awk '{print $2}' | xargs -r docker volume rm
        
        # Prune unused resources
        docker system prune -f
        
        log_success "Cleanup completed"
    else
        log_info "Cleanup cancelled"
    fi
}

docker_shell() {
    check_docker
    log_info "Opening shell in MCP server container..."
    docker compose -p "$COMPOSE_PROJECT_NAME" exec mcp-server /bin/bash
}

docker_worker_shell() {
    worker_num=${1:-1}
    
    if [[ ! "$worker_num" =~ ^[12]$ ]]; then
        log_error "Worker number must be 1 or 2"
        exit 1
    fi
    
    check_docker
    log_info "Opening shell in worker-$worker_num container..."
    docker compose -p "$COMPOSE_PROJECT_NAME" exec "worker-$worker_num" /bin/bash
}

docker_health() {
    check_docker
    log_info "Checking service health..."
    
    echo ""
    echo "=== MCP Server Health ==="
    if curl -s http://localhost:3000/health | jq . 2>/dev/null; then
        log_success "MCP Server is healthy"
    else
        log_error "MCP Server health check failed"
    fi
    
    echo ""
    echo "=== Worker 1 Health ==="
    if curl -s http://localhost:3001/hello 2>/dev/null; then
        log_success "Worker 1 is healthy"
    else
        log_error "Worker 1 health check failed"
    fi
    
    echo ""
    echo "=== Worker 2 Health ==="
    if curl -s http://localhost:3002/hello 2>/dev/null; then
        log_success "Worker 2 is healthy"
    else
        log_error "Worker 2 health check failed"
    fi
}

docker_env_check() {
    log_info "Checking environment configuration..."
    
    if [ ! -f ".env" ]; then
        log_error ".env file not found"
        return 1
    fi
    
    echo ""
    echo "=== Environment File Status ==="
    
    # Check for required variables
    required_vars=("ANTHROPIC_API_KEY" "CLAUDE_CLI_SESSION_TOKEN")
    
    for var in "${required_vars[@]}"; do
        if grep -q "^${var}=" .env; then
            value=$(grep "^${var}=" .env | cut -d'=' -f2- | tr -d '"')
            if [[ "$value" != *"your_"*"_here" ]] && [[ -n "$value" ]]; then
                log_success "$var is set"
            else
                log_error "$var is not properly configured"
            fi
        else
            log_error "$var is missing from .env file"
        fi
    done
    
    echo ""
    echo "=== Docker Environment Variables ==="
    docker compose -p "$COMPOSE_PROJECT_NAME" config | grep -E "(ANTHROPIC_API_KEY|CLAUDE_CLI_SESSION_TOKEN)" || true
}

docker_rebuild() {
    log_info "Performing clean rebuild of all services..."
    docker_clean
    docker_build
    docker_up
}

# Main script logic
case "$1" in
    build)
        docker_build
        ;;
    up)
        docker_up
        ;;
    down)
        docker_down
        ;;
    restart)
        docker_restart
        ;;
    logs)
        docker_logs "$@"
        ;;
    status)
        docker_status
        ;;
    clean)
        docker_clean
        ;;
    shell)
        docker_shell
        ;;
    worker-shell)
        docker_worker_shell "$2"
        ;;
    health)
        docker_health
        ;;
    env-check)
        docker_env_check
        ;;
    rebuild)
        docker_rebuild
        ;;
    ""|help|--help|-h)
        print_usage
        ;;
    *)
        log_error "Unknown command: $1"
        echo ""
        print_usage
        exit 1
        ;;
esac