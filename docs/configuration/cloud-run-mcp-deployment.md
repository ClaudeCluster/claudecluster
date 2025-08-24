# Google Cloud Run MCP Server Deployment Guide

This guide covers deploying the ClaudeCluster MCP (Model Context Protocol) Server to Google Cloud Run for serverless orchestration and task routing.

## Overview

The ClaudeCluster MCP Server acts as the central coordinator that:

- Receives task requests from CLI clients
- Routes tasks to available workers
- Manages task queues and priorities
- Provides real-time streaming updates via Server-Sent Events (SSE)
- Monitors worker health and availability

Deploying to Google Cloud Run provides:

- **Serverless scaling** - Automatically handles traffic spikes
- **Global availability** - Deploy across multiple regions
- **Managed infrastructure** - No server management required
- **Integrated monitoring** - Built-in logging and metrics
- **Cost efficiency** - Pay only for actual usage

## Prerequisites

### Required Software

- **Google Cloud SDK (gcloud)** - Latest version
- **Docker** - For building container images
- **curl** and **jq** - For testing deployed services

### Google Cloud Setup

1. **Google Cloud Project**
   ```bash
   # Set the active project
   gcloud config set project your-project-id
   export GOOGLE_CLOUD_PROJECT=your-project-id
   ```

2. **Authentication**
   ```bash
   # Login to Google Cloud
   gcloud auth login
   
   # Set up application default credentials
   gcloud auth application-default login
   ```

3. **Enable Required APIs**
   ```bash
   # APIs will be enabled automatically by deployment script
   gcloud services enable run.googleapis.com
   gcloud services enable artifactregistry.googleapis.com
   ```

### Required IAM Permissions

#### For Deployment Account

**Essential Roles:**
- `roles/run.admin` - Deploy and manage Cloud Run services
- `roles/artifactregistry.admin` - Push/pull container images
- `roles/iam.serviceAccountUser` - Use service accounts

**Grant permissions:**
```bash
# Replace USER_EMAIL with your email or service account
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
    --member="user:USER_EMAIL" \
    --role="roles/run.admin"

gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
    --member="user:USER_EMAIL" \
    --role="roles/artifactregistry.admin"

gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
    --member="user:USER_EMAIL" \
    --role="roles/iam.serviceAccountUser"
```

### Environment Variables

Set these before deployment:

```bash
# Required
export GOOGLE_CLOUD_PROJECT="your-project-id"

# Optional: Override defaults
export GOOGLE_CLOUD_REGION="us-central1"
export ARTIFACT_REGISTRY_REPO="claudecluster"

# Optional: Specify worker endpoints
export WORKER_ENDPOINTS="https://worker1-url,https://worker2-url"
```

## Deployment Process

### Automated Deployment

Use the provided deployment script for streamlined deployment:

```bash
# Deploy to development environment
pnpm run cloud:deploy-mcp-dev

# Deploy to staging environment  
pnpm run cloud:deploy-mcp-staging

# Deploy to production environment
pnpm run cloud:deploy-mcp-prod

# Or use the script directly
./scripts/deploy-mcp-gcloud.sh dev
```

### Deployment Workflow

The automated script performs these steps:

1. **Prerequisites Check** - Verifies gcloud auth, Docker, and project setup
2. **Artifact Registry Setup** - Creates repository if needed
3. **Image Build & Push** - Builds optimized container and pushes to registry
4. **Worker Discovery** - Automatically detects deployed workers
5. **Cloud Run Deployment** - Deploys service with proper configuration
6. **Health Verification** - Tests endpoints and confirms deployment
7. **Configuration Summary** - Shows URLs and next steps

### Manual Deployment Steps

If you prefer manual deployment:

#### 1. Build and Push Container Image

```bash
# Set variables
PROJECT_ID="your-project-id"
REGION="us-central1"
REPO_NAME="claudecluster"
IMAGE_NAME="mcp-server"

# Create Artifact Registry repository (if not exists)
gcloud artifacts repositories create $REPO_NAME \
    --repository-format=docker \
    --location=$REGION \
    --project=$PROJECT_ID

# Configure Docker authentication
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build and push image
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest"

docker build -t $IMAGE_URI \
    -f packages/mcp/Dockerfile.cloudrun \
    .

docker push $IMAGE_URI
```

#### 2. Deploy to Cloud Run

```bash
# Deploy MCP server
gcloud run deploy claudecluster-mcp-dev \
    --image=$IMAGE_URI \
    --platform=managed \
    --region=$REGION \
    --project=$PROJECT_ID \
    --allow-unauthenticated \
    --set-env-vars="NODE_ENV=production,PORT=8080,LOG_LEVEL=info" \
    --cpu=2 \
    --memory=2Gi \
    --timeout=3600 \
    --concurrency=100 \
    --min-instances=0 \
    --max-instances=10
```

#### 3. Configure Worker Endpoints (Optional)

```bash
# Add worker endpoints after deployment
gcloud run services update claudecluster-mcp-dev \
    --set-env-vars="CLAUDECLUSTER_WORKERS_STATIC_ENDPOINTS=https://worker1-url,https://worker2-url" \
    --region=$REGION \
    --project=$PROJECT_ID
```

## Configuration

### Environment-Specific Settings

#### Development
- **CPU**: 1-2 vCPUs  
- **Memory**: 2 GiB
- **Timeout**: 60 minutes
- **Concurrency**: 100 requests per instance
- **Scaling**: 0-5 instances

#### Staging  
- **CPU**: 2 vCPUs
- **Memory**: 2 GiB
- **Timeout**: 60 minutes
- **Concurrency**: 100 requests per instance
- **Scaling**: 0-10 instances

#### Production
- **CPU**: 2-4 vCPUs
- **Memory**: 4 GiB  
- **Timeout**: 60 minutes
- **Concurrency**: 100 requests per instance
- **Scaling**: 1-20 instances

### Environment Variables

#### Core Configuration
```bash
NODE_ENV=production                    # Production mode
PORT=8080                             # Cloud Run port
HOST=0.0.0.0                          # Bind to all interfaces
LOG_LEVEL=info                        # Logging level
```

#### Worker Configuration
```bash
# Static worker endpoints (comma-separated)
CLAUDECLUSTER_WORKERS_STATIC_ENDPOINTS=https://worker1,https://worker2

# Health check settings
CLAUDECLUSTER_WORKERS_STATIC_HEALTH_CHECK_ENABLED=true
CLAUDECLUSTER_WORKERS_STATIC_HEALTH_CHECK_INTERVAL=60000   # 60 seconds
CLAUDECLUSTER_WORKERS_STATIC_HEALTH_CHECK_TIMEOUT=10000    # 10 seconds
```

#### Advanced Configuration
```bash
# MCP server settings
CLAUDECLUSTER_MCP_PORT=8080
CLAUDECLUSTER_MCP_HOST=0.0.0.0
CLAUDECLUSTER_MCP_CORS_ENABLED=true
CLAUDECLUSTER_MCP_CORS_ORIGINS=*

# Task management
CLAUDECLUSTER_TASKS_DEFAULT_TIMEOUT=300000     # 5 minutes
CLAUDECLUSTER_TASKS_MAX_CONCURRENT=100
CLAUDECLUSTER_TASKS_PRIORITY_QUEUE_SIZE=1000
```

## Worker Integration

### Automatic Worker Discovery

The deployment script automatically discovers workers deployed in the same project:

```bash
# Script looks for workers matching pattern: claudecluster-worker-{environment}
# For dev deployment, looks for: claudecluster-worker-dev
# For prod deployment, looks for: claudecluster-worker-prod
```

### Manual Worker Configuration

Add worker endpoints after deployment:

```bash
# Update MCP server with worker URLs
gcloud run services update claudecluster-mcp-dev \
    --set-env-vars="CLAUDECLUSTER_WORKERS_STATIC_ENDPOINTS=https://worker1.com,https://worker2.com" \
    --region=$REGION \
    --project=$PROJECT_ID
```

### Worker Registration Verification

```bash
# Check worker registration via MCP health endpoint
MCP_URL=$(gcloud run services describe claudecluster-mcp-dev \
    --format="value(status.url)" --region=$REGION --project=$PROJECT_ID)

curl "${MCP_URL}/health" | jq '.workers'

# Expected response:
{
  "total": 2,
  "available": 2,
  "offline": 0
}
```

## Testing and Validation

### Health Check Verification

```bash
# Get MCP server URL
MCP_URL=$(gcloud run services describe claudecluster-mcp-dev \
    --region=$REGION --project=$PROJECT_ID \
    --format="value(status.url)")

# Test health endpoint
curl "${MCP_URL}/health" | jq .

# Expected response includes:
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime": 12345,
  "workers": {
    "total": 2,
    "available": 2,
    "offline": 0
  },
  "tasks": {
    "pending": 0,
    "running": 0,
    "completed": 5
  }
}
```

### Worker Connectivity Test

```bash
# Test worker list endpoint
curl "${MCP_URL}/workers" | jq .

# Expected response:
{
  "workers": [
    {
      "id": "worker-1",
      "endpoint": "https://worker1-url",
      "status": "available",
      "activeTasks": 0
    }
  ],
  "totalWorkers": 1,
  "availableWorkers": 1
}
```

### Task Submission Test

```bash
# Submit a test task
curl -X POST "${MCP_URL}/tasks" \
    -H "Content-Type: application/json" \
    -d '{
      "prompt": "echo \"Hello from Cloud Run MCP Server\"",
      "priority": 5
    }' | jq .

# Expected response:
{
  "success": true,
  "taskId": "task-12345",
  "status": "submitted",
  "estimatedWaitTime": 0,
  "assignedWorker": "worker-1"
}
```

### CLI Integration Test

```bash
# Test with ClaudeCluster CLI
pnpm run cli run "Create a simple hello world function" \
    --server $MCP_URL \
    --verbose
```

## Monitoring and Observability

### Cloud Run Console

Monitor the MCP server in Google Cloud Console:

1. Navigate to **Cloud Run** in Google Cloud Console
2. Select your service (e.g., `claudecluster-mcp-dev`)
3. View **Metrics**, **Logs**, and **Revisions** tabs

### Log Viewing

```bash
# View recent logs
gcloud run logs tail claudecluster-mcp-dev \
    --project=$PROJECT_ID

# Follow logs in real-time
gcloud run logs tail claudecluster-mcp-dev \
    --project=$PROJECT_ID --follow

# Filter logs by severity
gcloud run logs read claudecluster-mcp-dev \
    --project=$PROJECT_ID --filter="severity>=ERROR"

# Search for specific events
gcloud run logs read claudecluster-mcp-dev \
    --project=$PROJECT_ID --filter="textPayload:task"
```

### Key Metrics

Monitor these metrics in Cloud Run:

- **Request Count** - Total API requests
- **Request Latency** - Response time distribution
- **Error Rate** - 4xx/5xx responses
- **CPU Utilization** - Compute usage
- **Memory Utilization** - Memory consumption
- **Instance Count** - Active container instances
- **Startup Latency** - Cold start performance

### Custom Metrics

The MCP server exposes application-specific metrics:

```bash
# Worker health metrics
curl "${MCP_URL}/health" | jq '.workers'

# Task queue metrics  
curl "${MCP_URL}/health" | jq '.tasks'

# System resource metrics
curl "${MCP_URL}/health" | jq '.systemInfo'
```

## Troubleshooting

### Common Issues

#### 1. Service Won't Start

**Symptoms:**
- Service shows as "not ready"
- Health checks fail
- Container exits immediately

**Diagnosis:**
```bash
# Check service status
gcloud run services describe claudecluster-mcp-dev \
    --region=$REGION --project=$PROJECT_ID

# View logs for startup errors
gcloud run logs tail claudecluster-mcp-dev --project=$PROJECT_ID
```

**Solutions:**
- Check environment variables are set correctly
- Verify port configuration (must use PORT env var)
- Ensure dependencies are available in container
- Check for resource limit issues

#### 2. Worker Connectivity Issues

**Symptoms:**
- MCP server reports no workers available
- Tasks fail with "no workers" error
- Worker health checks fail

**Diagnosis:**
```bash
# Check worker configuration
curl "${MCP_URL}/workers" | jq .

# Test worker endpoints directly
curl https://worker-url/hello
```

**Solutions:**
```bash
# Update worker endpoints
gcloud run services update claudecluster-mcp-dev \
    --set-env-vars="CLAUDECLUSTER_WORKERS_STATIC_ENDPOINTS=correct-worker-urls" \
    --region=$REGION --project=$PROJECT_ID

# Verify worker deployment
gcloud run services list --region=$REGION --project=$PROJECT_ID
```

#### 3. Authentication/Permission Issues

**Symptoms:**
- "Permission denied" errors during deployment
- Service can't access other resources
- Image pull failures

**Solutions:**
```bash
# Check deployment permissions
gcloud projects get-iam-policy $PROJECT_ID

# Verify service account permissions
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects get-iam-policy $PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:${SERVICE_ACCOUNT}"
```

#### 4. Performance Issues

**Symptoms:**
- High latency
- Timeout errors
- CPU/memory exhaustion

**Solutions:**
```bash
# Increase resources
gcloud run services update claudecluster-mcp-dev \
    --cpu=4 --memory=4Gi \
    --region=$REGION --project=$PROJECT_ID

# Adjust concurrency
gcloud run services update claudecluster-mcp-dev \
    --concurrency=50 \
    --region=$REGION --project=$PROJECT_ID

# Set minimum instances to avoid cold starts
gcloud run services update claudecluster-mcp-dev \
    --min-instances=1 \
    --region=$REGION --project=$PROJECT_ID
```

### Debug Commands

```bash
# Service details
gcloud run services describe claudecluster-mcp-dev \
    --region=$REGION --project=$PROJECT_ID

# Recent revisions
gcloud run revisions list \
    --service=claudecluster-mcp-dev \
    --region=$REGION --project=$PROJECT_ID

# Container details
gcloud run services describe claudecluster-mcp-dev \
    --region=$REGION --project=$PROJECT_ID \
    --format="export"

# Network connectivity test
gcloud run services describe claudecluster-mcp-dev \
    --format="value(status.url)" \
    --region=$REGION --project=$PROJECT_ID | xargs curl -I
```

## Security Considerations

### Network Security

1. **HTTPS Only** - Cloud Run enforces HTTPS for all traffic
2. **Authentication** - Configure IAM for access control
3. **CORS** - Properly configure Cross-Origin Resource Sharing
4. **Rate Limiting** - Implement request rate limiting

### Access Control

```bash
# Allow unauthenticated access (for public API)
gcloud run services add-iam-policy-binding claudecluster-mcp-dev \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --region=$REGION --project=$PROJECT_ID

# Or restrict to specific users/groups
gcloud run services add-iam-policy-binding claudecluster-mcp-dev \
    --member="user:user@company.com" \
    --role="roles/run.invoker" \
    --region=$REGION --project=$PROJECT_ID
```

### Container Security

1. **Non-root User** - Container runs as non-privileged user
2. **Minimal Base Image** - Uses slim Node.js image
3. **No Secrets in Environment** - Use Secret Manager for sensitive data
4. **Image Scanning** - Enable vulnerability scanning in Artifact Registry

## Cost Optimization

### Pricing Factors

Cloud Run pricing based on:

- **CPU time** - vCPU seconds during request processing
- **Memory time** - Memory GB-seconds during processing  
- **Requests** - Number of requests handled
- **Networking** - Egress traffic (usually minimal)

### Optimization Strategies

1. **Right-size Resources**
   ```bash
   # Start with minimal resources and scale up as needed
   --cpu=1 --memory=2Gi    # For light workloads
   --cpu=2 --memory=2Gi    # For standard workloads
   --cpu=4 --memory=4Gi    # For high-throughput workloads
   ```

2. **Optimize Cold Starts**
   ```bash
   # For production, consider keeping instances warm
   --min-instances=1       # Eliminates cold starts but costs more
   
   # For development, optimize for cost
   --min-instances=0       # Scale to zero when idle
   ```

3. **Adjust Concurrency**
   ```bash
   # Higher concurrency reduces instance count
   --concurrency=100       # Standard setting
   --concurrency=200       # For I/O-bound workloads
   ```

4. **Set Reasonable Timeouts**
   ```bash
   # Don't set unnecessarily long timeouts
   --timeout=1800          # 30 minutes instead of 60
   ```

### Cost Monitoring

- Set up billing alerts in Google Cloud Console
- Monitor usage in Cloud Run metrics
- Review monthly billing reports
- Use sustained use discounts for consistent workloads

## Best Practices

### Configuration Management

1. **Environment-Specific Configs** - Use different settings per environment
2. **Externalized Configuration** - Store config in environment variables
3. **Configuration Validation** - Validate config at startup
4. **Graceful Degradation** - Handle missing config gracefully

### Operational Excellence

1. **Health Checks** - Implement comprehensive health endpoints
2. **Structured Logging** - Use JSON logging for better searchability
3. **Monitoring** - Set up alerting for key metrics
4. **Documentation** - Maintain deployment runbooks

### Deployment Strategy

1. **Blue-Green Deployments** - Use Cloud Run traffic splitting
2. **Gradual Rollout** - Route small percentage to new revision
3. **Rollback Plan** - Keep previous revisions for quick rollback
4. **Testing** - Validate deployments with automated tests

## Next Steps

After successful MCP server deployment:

1. **Test End-to-End** - Run full workflow tests
2. **Set up Monitoring** - Configure comprehensive monitoring
3. **Performance Testing** - Load test under expected traffic
4. **Documentation** - Update operational procedures
5. **CI/CD Integration** - Automate deployment pipeline

## Useful Commands Reference

```bash
# Quick deployment
pnpm run cloud:deploy-mcp-dev

# Service management
gcloud run services list --project=$PROJECT_ID
gcloud run services describe SERVICE_NAME --project=$PROJECT_ID
gcloud run services delete SERVICE_NAME --project=$PROJECT_ID

# Configuration updates
gcloud run services update SERVICE_NAME \
    --set-env-vars="KEY=value" \
    --project=$PROJECT_ID

# Monitoring
gcloud run logs tail SERVICE_NAME --project=$PROJECT_ID
gcloud run services describe SERVICE_NAME \
    --format="value(status.url)" --project=$PROJECT_ID

# Traffic management
gcloud run services update-traffic SERVICE_NAME \
    --to-revisions=REVISION=50,REVISION2=50 \
    --project=$PROJECT_ID
```