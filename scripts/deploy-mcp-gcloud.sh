#!/bin/bash
# Deploy ClaudeCluster MCP Server to Google Cloud Run
# Usage: ./scripts/deploy-mcp-gcloud.sh [environment]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-dev}
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-""}
REGION=${GOOGLE_CLOUD_REGION:-"us-central1"}
ARTIFACT_REGISTRY_REPO=${ARTIFACT_REGISTRY_REPO:-"claudecluster"}
SERVICE_NAME="claudecluster-mcp"
IMAGE_NAME="mcp-server"

# Functions
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

print_usage() {
    echo "ClaudeCluster MCP Server Google Cloud Deployment"
    echo ""
    echo "Usage: $0 [environment]"
    echo ""
    echo "Environments:"
    echo "  dev      Development deployment (default)"
    echo "  staging  Staging deployment"
    echo "  prod     Production deployment"
    echo ""
    echo "Environment Variables:"
    echo "  GOOGLE_CLOUD_PROJECT         - GCP Project ID (required)"
    echo "  GOOGLE_CLOUD_REGION          - GCP Region (default: us-central1)"
    echo "  ARTIFACT_REGISTRY_REPO       - Artifact Registry repo (default: claudecluster)"
    echo "  WORKER_ENDPOINTS             - Comma-separated worker URLs (optional)"
    echo ""
    echo "Prerequisites:"
    echo "  - gcloud CLI installed and authenticated"
    echo "  - Docker installed"
    echo "  - Artifact Registry repository created"
    echo "  - Required IAM permissions"
    echo "  - Worker(s) already deployed (optional but recommended)"
    echo ""
    echo "Examples:"
    echo "  $0 dev"
    echo "  GOOGLE_CLOUD_PROJECT=my-project $0 prod"
    echo "  WORKER_ENDPOINTS=https://worker1.com,https://worker2.com $0 staging"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if gcloud is installed and authenticated
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed"
        log_info "Install from: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    
    # Check if authenticated
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1 > /dev/null; then
        log_error "Not authenticated with gcloud"
        log_info "Run: gcloud auth login"
        exit 1
    fi
    
    local active_account=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1)
    log_success "Authenticated with gcloud as: $active_account"
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    log_success "Docker is available"
    
    # Check if project ID is set
    if [ -z "$PROJECT_ID" ]; then
        # Try to get from gcloud config
        PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
        if [ -z "$PROJECT_ID" ]; then
            log_error "GOOGLE_CLOUD_PROJECT not set and no default project configured"
            log_info "Set with: export GOOGLE_CLOUD_PROJECT=your-project-id"
            log_info "Or run: gcloud config set project your-project-id"
            exit 1
        fi
    fi
    log_success "Using project: $PROJECT_ID"
}

setup_artifact_registry() {
    log_info "Setting up Artifact Registry..."
    
    # Enable Artifact Registry API
    log_info "Enabling Artifact Registry API..."
    gcloud services enable artifactregistry.googleapis.com --project=$PROJECT_ID
    
    # Check if repository exists
    if gcloud artifacts repositories describe $ARTIFACT_REGISTRY_REPO \
        --location=$REGION --project=$PROJECT_ID &>/dev/null; then
        log_success "Artifact Registry repository '$ARTIFACT_REGISTRY_REPO' already exists"
    else
        log_info "Creating Artifact Registry repository..."
        gcloud artifacts repositories create $ARTIFACT_REGISTRY_REPO \
            --repository-format=docker \
            --location=$REGION \
            --description="ClaudeCluster container images" \
            --project=$PROJECT_ID
        log_success "Created Artifact Registry repository"
    fi
    
    # Configure Docker authentication
    log_info "Configuring Docker authentication for Artifact Registry..."
    gcloud auth configure-docker ${REGION}-docker.pkg.dev --project=$PROJECT_ID
    
    log_success "Artifact Registry setup complete"
}

build_and_push_image() {
    log_info "Building and pushing MCP server Docker image..."
    
    # Set image tag based on environment and timestamp
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local image_tag="${ENVIRONMENT}-${timestamp}"
    local full_image_path="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/${IMAGE_NAME}:${image_tag}"
    local latest_image_path="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/${IMAGE_NAME}:${ENVIRONMENT}-latest"
    
    log_info "Building image: $full_image_path"
    
    # Build the Docker image from the project root (for monorepo access)
    docker build \
        -t "$full_image_path" \
        -t "$latest_image_path" \
        -f packages/mcp/Dockerfile.cloudrun \
        .
    
    log_success "Built Docker image"
    
    # Push both tags
    log_info "Pushing image to Artifact Registry..."
    docker push "$full_image_path"
    docker push "$latest_image_path"
    
    log_success "Pushed image to Artifact Registry"
    
    # Store image path for deployment
    IMAGE_URI="$latest_image_path"
    echo "$IMAGE_URI" > ".cloud-run-mcp-image-uri-${ENVIRONMENT}"
    
    log_info "Image URI: $IMAGE_URI"
}

get_worker_endpoints() {
    log_info "Determining worker endpoints..."
    
    # Check if worker endpoints are provided via environment variable
    if [ -n "$WORKER_ENDPOINTS" ]; then
        log_success "Using provided worker endpoints: $WORKER_ENDPOINTS"
        echo "$WORKER_ENDPOINTS"
        return
    fi
    
    # Try to get worker URL from previous deployment
    local worker_url_file=".cloud-run-url-${ENVIRONMENT}"
    if [ -f "$worker_url_file" ]; then
        local worker_url=$(cat "$worker_url_file")
        log_success "Found worker URL from previous deployment: $worker_url"
        echo "$worker_url"
        return
    fi
    
    # Try to discover worker service in same project
    local worker_service_name="claudecluster-worker-${ENVIRONMENT}"
    if gcloud run services describe "$worker_service_name" \
        --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
        
        local discovered_url=$(gcloud run services describe "$worker_service_name" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --format="value(status.url)")
        
        log_success "Discovered worker service: $discovered_url"
        echo "$discovered_url"
        return
    fi
    
    # No workers found - will deploy without worker configuration
    log_warning "No worker endpoints found. MCP server will deploy without workers configured."
    log_info "You can update worker configuration later with:"
    log_info "  gcloud run services update $service_name --set-env-vars=\"CLAUDECLUSTER_WORKERS_STATIC_ENDPOINTS=https://your-worker-url\""
    echo ""
}

deploy_cloud_run() {
    log_info "Deploying MCP server to Cloud Run..."
    
    # Enable Cloud Run API
    gcloud services enable run.googleapis.com --project=$PROJECT_ID
    
    local service_name="${SERVICE_NAME}-${ENVIRONMENT}"
    local worker_endpoints=$(get_worker_endpoints)
    
    # Prepare environment variables
    local env_vars="NODE_ENV=production,PORT=8080,HOST=0.0.0.0,LOG_LEVEL=info"
    
    # Add worker endpoints if available
    if [ -n "$worker_endpoints" ]; then
        env_vars="${env_vars},CLAUDECLUSTER_WORKERS_STATIC_ENDPOINTS=${worker_endpoints}"
        env_vars="${env_vars},CLAUDECLUSTER_WORKERS_STATIC_HEALTH_CHECK_ENABLED=true"
        env_vars="${env_vars},CLAUDECLUSTER_WORKERS_STATIC_HEALTH_CHECK_INTERVAL=60000"
        env_vars="${env_vars},CLAUDECLUSTER_WORKERS_STATIC_HEALTH_CHECK_TIMEOUT=10000"
        log_info "Configured with worker endpoints: $worker_endpoints"
    else
        log_info "Deploying without worker endpoints (can be configured later)"
    fi
    
    # Deploy to Cloud Run
    gcloud run deploy "$service_name" \
        --image="$IMAGE_URI" \
        --platform=managed \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --allow-unauthenticated \
        --set-env-vars="$env_vars" \
        --cpu=2 \
        --memory=2Gi \
        --timeout=3600 \
        --concurrency=100 \
        --min-instances=0 \
        --max-instances=10 \
        --port=8080
    
    # Get service URL
    local service_url=$(gcloud run services describe "$service_name" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format="value(status.url)")
    
    log_success "Deployed MCP server to Cloud Run: $service_url"
    echo "$service_url" > ".cloud-run-mcp-url-${ENVIRONMENT}"
    
    # Test health endpoint
    log_info "Testing health endpoint..."
    sleep 10  # Give service a moment to start
    
    if curl -f "${service_url}/health" > /dev/null 2>&1; then
        log_success "Health check passed: ${service_url}/health"
        
        # Show health details if available
        log_info "MCP server health status:"
        curl -s "${service_url}/health" | head -20
    else
        log_warning "Health check failed - service may still be starting up"
        log_info "Check logs with: gcloud run logs tail $service_name --project=$PROJECT_ID"
    fi
    
    log_info "Service URL: $service_url"
}

update_worker_endpoints() {
    local service_name="${SERVICE_NAME}-${ENVIRONMENT}"
    local service_url=$(cat ".cloud-run-mcp-url-${ENVIRONMENT}" 2>/dev/null || echo "")
    
    if [ -n "$service_url" ]; then
        log_info "MCP server deployed at: $service_url"
        log_info "Update worker services to use this MCP server (if needed):"
        
        local worker_service_name="claudecluster-worker-${ENVIRONMENT}"
        if gcloud run services describe "$worker_service_name" \
            --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
            
            log_info "To register this MCP server with worker, run:"
            echo "  gcloud run services update $worker_service_name \\"
            echo "    --set-env-vars=\"CLAUDECLUSTER_MCP_SERVER_URL=$service_url\" \\"
            echo "    --region=$REGION --project=$PROJECT_ID"
        fi
    fi
}

show_deployment_info() {
    local service_name="${SERVICE_NAME}-${ENVIRONMENT}"
    local service_url=$(cat ".cloud-run-mcp-url-${ENVIRONMENT}" 2>/dev/null || echo "Not available")
    local worker_endpoints=$(get_worker_endpoints)
    
    cat << EOF

🎉 ClaudeCluster MCP Server Deployment Complete!

Deployment Details:
  Environment:     $ENVIRONMENT
  Project ID:      $PROJECT_ID
  Region:          $REGION
  Service Name:    $service_name
  Service URL:     $service_url
  Image URI:       $IMAGE_URI

Endpoints:
  Health Check:    $service_url/health
  Task Submission: $service_url/tasks
  Workers List:    $service_url/workers
  SSE Streaming:   $service_url/stream/{taskId}

Worker Configuration:
$([ -n "$worker_endpoints" ] && echo "  Connected Workers: $worker_endpoints" || echo "  No workers configured (can be added later)")

CLI Usage:
  # Test connection
  curl $service_url/health
  
  # Submit task (if workers available)
  curl -X POST $service_url/tasks \\
    -H "Content-Type: application/json" \\
    -d '{"prompt":"echo hello","priority":5}'

Next Steps:
  1. Test the service: curl $service_url/health
  2. Configure CLI to use: --server $service_url
  3. View logs: gcloud run logs tail $service_name --project=$PROJECT_ID
  4. Monitor service: Visit Cloud Run console

Management Commands:
  # View service details
  gcloud run services describe $service_name --region=$REGION --project=$PROJECT_ID
  
  # Update service
  $0 $ENVIRONMENT
  
  # Add worker endpoints
  gcloud run services update $service_name \\
    --set-env-vars="CLAUDECLUSTER_WORKERS_STATIC_ENDPOINTS=https://your-worker-url" \\
    --region=$REGION --project=$PROJECT_ID
  
  # Delete service
  gcloud run services delete $service_name --region=$REGION --project=$PROJECT_ID

EOF
}

main() {
    case "$1" in
        help|--help|-h)
            print_usage
            exit 0
            ;;
        ""|dev|staging|prod)
            ;;
        *)
            log_error "Invalid environment: $1"
            echo ""
            print_usage
            exit 1
            ;;
    esac
    
    echo "🚀 Deploying ClaudeCluster MCP Server to Google Cloud Run"
    echo "Environment: $ENVIRONMENT"
    echo ""
    
    check_prerequisites
    setup_artifact_registry
    build_and_push_image
    deploy_cloud_run
    update_worker_endpoints
    show_deployment_info
    
    log_success "Deployment completed successfully!"
}

main "$@"