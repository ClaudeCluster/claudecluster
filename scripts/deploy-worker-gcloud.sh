#!/bin/bash
# Deploy ClaudeCluster Worker to Google Cloud Run
# Usage: ./scripts/deploy-worker-gcloud.sh [environment]

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
SERVICE_NAME="claudecluster-worker"
IMAGE_NAME="worker"

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
    echo "ClaudeCluster Worker Google Cloud Deployment"
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
    echo "  ANTHROPIC_API_KEY             - Claude API key (required)"
    echo "  CLAUDE_CLI_SESSION_TOKEN      - Claude CLI session token (required)"
    echo ""
    echo "Prerequisites:"
    echo "  - gcloud CLI installed and authenticated"
    echo "  - Docker installed"
    echo "  - Artifact Registry repository created"
    echo "  - Required IAM permissions"
    echo ""
    echo "Examples:"
    echo "  $0 dev"
    echo "  GOOGLE_CLOUD_PROJECT=my-project $0 prod"
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
    
    # Check required environment variables for runtime
    if [ -z "$ANTHROPIC_API_KEY" ]; then
        log_error "ANTHROPIC_API_KEY environment variable is required"
        exit 1
    fi
    
    if [ -z "$CLAUDE_CLI_SESSION_TOKEN" ]; then
        log_error "CLAUDE_CLI_SESSION_TOKEN environment variable is required"
        log_info "Get your token with: claude auth status"
        exit 1
    fi
    
    log_success "Required environment variables are set"
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
    log_info "Building and pushing worker Docker image..."
    
    # Set image tag based on environment and timestamp
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local image_tag="${ENVIRONMENT}-${timestamp}"
    local full_image_path="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/${IMAGE_NAME}:${image_tag}"
    local latest_image_path="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/${IMAGE_NAME}:${ENVIRONMENT}-latest"
    
    log_info "Building image: $full_image_path"
    
    # Build the Docker image from the worker package using Cloud Run optimized Dockerfile
    docker build \
        -t "$full_image_path" \
        -t "$latest_image_path" \
        -f packages/worker/Dockerfile.cloudrun \
        packages/worker/
    
    log_success "Built Docker image"
    
    # Push both tags
    log_info "Pushing image to Artifact Registry..."
    docker push "$full_image_path"
    docker push "$latest_image_path"
    
    log_success "Pushed image to Artifact Registry"
    
    # Store image path for deployment
    IMAGE_URI="$latest_image_path"
    echo "$IMAGE_URI" > .cloud-run-image-uri
    
    log_info "Image URI: $IMAGE_URI"
}

create_secrets() {
    log_info "Creating secrets in Secret Manager..."
    
    # Enable Secret Manager API
    gcloud services enable secretmanager.googleapis.com --project=$PROJECT_ID
    
    # Create secrets if they don't exist
    local secret_name_api="claudecluster-anthropic-api-key-${ENVIRONMENT}"
    local secret_name_token="claudecluster-claude-cli-token-${ENVIRONMENT}"
    
    # Create API key secret
    if gcloud secrets describe "$secret_name_api" --project=$PROJECT_ID &>/dev/null; then
        log_info "Secret $secret_name_api already exists, updating..."
        echo -n "$ANTHROPIC_API_KEY" | gcloud secrets versions add "$secret_name_api" \
            --data-file=- --project=$PROJECT_ID
    else
        log_info "Creating secret $secret_name_api..."
        echo -n "$ANTHROPIC_API_KEY" | gcloud secrets create "$secret_name_api" \
            --data-file=- --project=$PROJECT_ID
    fi
    
    # Create CLI token secret
    if gcloud secrets describe "$secret_name_token" --project=$PROJECT_ID &>/dev/null; then
        log_info "Secret $secret_name_token already exists, updating..."
        echo -n "$CLAUDE_CLI_SESSION_TOKEN" | gcloud secrets versions add "$secret_name_token" \
            --data-file=- --project=$PROJECT_ID
    else
        log_info "Creating secret $secret_name_token..."
        echo -n "$CLAUDE_CLI_SESSION_TOKEN" | gcloud secrets create "$secret_name_token" \
            --data-file=- --project=$PROJECT_ID
    fi
    
    log_success "Secrets created/updated in Secret Manager"
}

deploy_cloud_run() {
    log_info "Deploying to Cloud Run..."
    
    # Enable Cloud Run API
    gcloud services enable run.googleapis.com --project=$PROJECT_ID
    
    local service_name="${SERVICE_NAME}-${ENVIRONMENT}"
    local secret_name_api="claudecluster-anthropic-api-key-${ENVIRONMENT}"
    local secret_name_token="claudecluster-claude-cli-token-${ENVIRONMENT}"
    
    # Deploy to Cloud Run
    gcloud run deploy "$service_name" \
        --image="$IMAGE_URI" \
        --platform=managed \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --allow-unauthenticated \
        --set-env-vars="NODE_ENV=production" \
        --set-env-vars="PORT=8080" \
        --set-env-vars="HOST=0.0.0.0" \
        --set-env-vars="LOG_LEVEL=info" \
        --set-env-vars="WORKER_ID=worker-${ENVIRONMENT}-gcp" \
        --set-env-vars="WORKER_NAME=ClaudeCluster Worker (${ENVIRONMENT})" \
        --set-secrets="ANTHROPIC_API_KEY=${secret_name_api}:latest" \
        --set-secrets="CLAUDE_CLI_SESSION_TOKEN=${secret_name_token}:latest" \
        --cpu=2 \
        --memory=2Gi \
        --timeout=3600 \
        --concurrency=1 \
        --min-instances=0 \
        --max-instances=10 \
        --port=8080
    
    # Get service URL
    local service_url=$(gcloud run services describe "$service_name" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format="value(status.url)")
    
    log_success "Deployed to Cloud Run: $service_url"
    echo "$service_url" > ".cloud-run-url-${ENVIRONMENT}"
    
    # Test health endpoint
    log_info "Testing health endpoint..."
    if curl -f "${service_url}/hello" > /dev/null 2>&1; then
        log_success "Health check passed: ${service_url}/hello"
    else
        log_warning "Health check failed - service may still be starting up"
        log_info "Check logs with: gcloud run logs tail $service_name --project=$PROJECT_ID"
    fi
    
    log_info "Service URL: $service_url"
}

show_deployment_info() {
    local service_name="${SERVICE_NAME}-${ENVIRONMENT}"
    local service_url=$(cat ".cloud-run-url-${ENVIRONMENT}" 2>/dev/null || echo "Not available")
    
    cat << EOF

🎉 ClaudeCluster Worker Deployment Complete!

Deployment Details:
  Environment:     $ENVIRONMENT
  Project ID:      $PROJECT_ID
  Region:          $REGION
  Service Name:    $service_name
  Service URL:     $service_url
  Image URI:       $IMAGE_URI

Endpoints:
  Health Check:    $service_url/hello
  Task Execution:  $service_url/run
  PTY Status:      $service_url/pty/status

Next Steps:
  1. Test the service: curl $service_url/hello
  2. View logs: gcloud run logs tail $service_name --project=$PROJECT_ID
  3. Monitor service: Visit Cloud Run console
  4. Deploy MCP server to connect workers

Management Commands:
  # View service details
  gcloud run services describe $service_name --region=$REGION --project=$PROJECT_ID
  
  # Update service
  $0 $ENVIRONMENT
  
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
    
    echo "🚀 Deploying ClaudeCluster Worker to Google Cloud Run"
    echo "Environment: $ENVIRONMENT"
    echo ""
    
    check_prerequisites
    setup_artifact_registry
    build_and_push_image
    create_secrets
    deploy_cloud_run
    show_deployment_info
    
    log_success "Deployment completed successfully!"
}

main "$@"