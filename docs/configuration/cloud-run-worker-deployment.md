# Google Cloud Run Worker Deployment Guide

This guide covers deploying ClaudeCluster Workers to Google Cloud Run for serverless operation with automatic scaling and managed infrastructure.

## Overview

Google Cloud Run provides a serverless platform for containerized applications, making it ideal for ClaudeCluster Workers that need to:

- Scale automatically based on demand
- Handle intermittent workloads cost-effectively  
- Provide secure, managed infrastructure
- Support long-running tasks with streaming responses

## Prerequisites

### Required Software

- **Google Cloud SDK (gcloud)** - Latest version
- **Docker** - For building container images
- **curl** - For testing deployed services

### Google Cloud Setup

1. **Google Cloud Project**
   ```bash
   # Create a new project (optional)
   gcloud projects create your-project-id
   
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
   # Enable APIs (done automatically by deployment script)
   gcloud services enable run.googleapis.com
   gcloud services enable artifactregistry.googleapis.com
   gcloud services enable secretmanager.googleapis.com
   ```

### Required IAM Permissions

#### For Deployment Account

The account running deployments needs these roles:

**Essential Roles:**
- `roles/run.admin` - Deploy and manage Cloud Run services
- `roles/artifactregistry.admin` - Push/pull container images
- `roles/secretmanager.admin` - Create and manage secrets
- `roles/iam.serviceAccountUser` - Use service accounts

**Additional Roles:**
- `roles/serviceusage.serviceUsageAdmin` - Enable APIs
- `roles/resourcemanager.projectIamAdmin` - Grant permissions to service accounts

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
    --role="roles/secretmanager.admin"

gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
    --member="user:USER_EMAIL" \
    --role="roles/iam.serviceAccountUser"
```

#### For Cloud Run Service Account

The Cloud Run service needs access to secrets:

```bash
# Get the Cloud Run service account
PROJECT_NUMBER=$(gcloud projects describe $GOOGLE_CLOUD_PROJECT --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant secret access
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor"
```

### Required Environment Variables

Set these before deployment:

```bash
# Required for worker operation
export ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"
export CLAUDE_CLI_SESSION_TOKEN="your-claude-cli-token"

# Optional: Override default settings  
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_REGION="us-central1"
export ARTIFACT_REGISTRY_REPO="claudecluster"
```

## Deployment Process

### Automated Deployment

Use the provided deployment script for streamlined deployment:

```bash
# Deploy to development environment
pnpm run cloud:deploy-worker-dev

# Deploy to staging environment  
pnpm run cloud:deploy-worker-staging

# Deploy to production environment
pnpm run cloud:deploy-worker-prod

# Or use the script directly
./scripts/deploy-worker-gcloud.sh dev
```

### Manual Deployment Steps

If you prefer manual deployment or need customization:

#### 1. Build and Push Container Image

```bash
# Set variables
PROJECT_ID="your-project-id"
REGION="us-central1"
REPO_NAME="claudecluster"
IMAGE_NAME="worker"

# Create Artifact Registry repository
gcloud artifacts repositories create $REPO_NAME \
    --repository-format=docker \
    --location=$REGION \
    --project=$PROJECT_ID

# Configure Docker authentication
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build and push image
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest"

docker build -t $IMAGE_URI \
    -f packages/worker/Dockerfile.cloudrun \
    packages/worker/

docker push $IMAGE_URI
```

#### 2. Create Secrets

```bash
# Create secrets in Secret Manager
gcloud secrets create claudecluster-anthropic-api-key-dev \
    --data-file=<(echo -n "$ANTHROPIC_API_KEY") \
    --project=$PROJECT_ID

gcloud secrets create claudecluster-claude-cli-token-dev \
    --data-file=<(echo -n "$CLAUDE_CLI_SESSION_TOKEN") \
    --project=$PROJECT_ID
```

#### 3. Deploy to Cloud Run

```bash
# Deploy service
gcloud run deploy claudecluster-worker-dev \
    --image=$IMAGE_URI \
    --platform=managed \
    --region=$REGION \
    --project=$PROJECT_ID \
    --allow-unauthenticated \
    --set-env-vars="NODE_ENV=production,PORT=8080,LOG_LEVEL=info" \
    --set-secrets="ANTHROPIC_API_KEY=claudecluster-anthropic-api-key-dev:latest" \
    --set-secrets="CLAUDE_CLI_SESSION_TOKEN=claudecluster-claude-cli-token-dev:latest" \
    --cpu=2 \
    --memory=2Gi \
    --timeout=3600 \
    --concurrency=1 \
    --min-instances=0 \
    --max-instances=10
```

## Configuration

### Environment-Specific Settings

#### Development
- **CPU**: 1 vCPU  
- **Memory**: 1 GiB
- **Timeout**: 60 minutes
- **Concurrency**: 1 request per instance
- **Scaling**: 0-5 instances

#### Staging  
- **CPU**: 2 vCPUs
- **Memory**: 2 GiB
- **Timeout**: 60 minutes
- **Concurrency**: 1 request per instance
- **Scaling**: 0-10 instances

#### Production
- **CPU**: 2 vCPUs
- **Memory**: 4 GiB  
- **Timeout**: 60 minutes
- **Concurrency**: 1 request per instance
- **Scaling**: 1-20 instances

### Security Configuration

#### Secret Management

Secrets are stored in Google Secret Manager and mounted as environment variables:

- `ANTHROPIC_API_KEY` - Claude API access
- `CLAUDE_CLI_SESSION_TOKEN` - Claude CLI authentication

#### Network Security

- **HTTPS**: All traffic encrypted in transit
- **Authentication**: Optional (set to allow unauthenticated for MCP server access)
- **VPC**: Can be configured to run in custom VPC

### Resource Limits

#### CPU and Memory
```bash
# Set resource limits during deployment
--cpu=2                    # 2 vCPUs
--memory=2Gi              # 2 GiB memory
--timeout=3600            # 60 minute timeout
```

#### Scaling Configuration
```bash
--concurrency=1           # 1 request per instance (recommended for Claude tasks)
--min-instances=0         # Scale to zero when idle
--max-instances=10        # Maximum 10 instances
```

## Testing and Validation

### Health Check Verification

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe claudecluster-worker-dev \
    --region=us-central1 --project=$PROJECT_ID \
    --format="value(status.url)")

# Test health endpoint
curl "${SERVICE_URL}/hello"

# Expected response:
{
  "status": "available",
  "workerId": "worker-dev-gcp",
  "uptime": 12345,
  "activeTasks": 0,
  "totalTasksExecuted": 0
}
```

### Task Execution Test

```bash
# Test task execution
curl -X POST "${SERVICE_URL}/run" \
    -H "Content-Type: application/json" \
    -d '{
      "prompt": "echo \"Hello from Cloud Run\"",
      "priority": 5
    }'
```

### PTY Status Check

```bash
# Check PTY system status
curl "${SERVICE_URL}/pty/status"

# Expected response:
{
  "executorType": "pty",
  "streamingType": "sse",
  "activeProcesses": 0
}
```

## Monitoring and Observability

### Cloud Run Console

Monitor services in the Google Cloud Console:

1. Navigate to Cloud Run in Google Cloud Console
2. Select your service (e.g., `claudecluster-worker-dev`)
3. View metrics, logs, and revisions

### Log Viewing

```bash
# View recent logs
gcloud run logs tail claudecluster-worker-dev \
    --project=$PROJECT_ID

# Follow logs in real-time
gcloud run logs tail claudecluster-worker-dev \
    --project=$PROJECT_ID --follow

# Filter logs by severity
gcloud run logs read claudecluster-worker-dev \
    --project=$PROJECT_ID --filter="severity>=ERROR"
```

### Metrics and Monitoring

Key metrics to monitor:

- **Request count** - Total requests received
- **Request latency** - Response time distribution  
- **Error rate** - 4xx/5xx response rate
- **CPU utilization** - Compute resource usage
- **Memory utilization** - Memory consumption
- **Instance count** - Number of active instances

Set up alerts for:
- High error rate (>5%)
- High latency (>60 seconds)
- Resource exhaustion

## Troubleshooting

### Common Issues

#### 1. Deployment Fails

**Error**: `Permission denied` or `Access denied`

**Solution:**
```bash
# Check permissions
gcloud projects get-iam-policy $PROJECT_ID

# Ensure you have required roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="user:your-email@domain.com" \
    --role="roles/run.admin"
```

#### 2. Service Won't Start

**Error**: Service shows "unhealthy" status

**Solution:**
```bash
# Check logs for startup errors
gcloud run logs tail claudecluster-worker-dev --project=$PROJECT_ID

# Common causes:
# - Missing environment variables
# - Port configuration issues  
# - Secret access problems
```

#### 3. Authentication Errors

**Error**: `ANTHROPIC_API_KEY not found` or Claude CLI errors

**Solution:**
```bash
# Verify secrets exist
gcloud secrets list --project=$PROJECT_ID

# Check secret versions
gcloud secrets versions list claudecluster-anthropic-api-key-dev \
    --project=$PROJECT_ID

# Update secret if needed
echo -n "$ANTHROPIC_API_KEY" | gcloud secrets versions add \
    claudecluster-anthropic-api-key-dev --data-file=- --project=$PROJECT_ID
```

#### 4. Timeout Issues

**Error**: Tasks timing out or getting killed

**Solution:**
```bash
# Increase timeout (up to 60 minutes max)
gcloud run services update claudecluster-worker-dev \
    --timeout=3600 --project=$PROJECT_ID

# Check resource limits
gcloud run services update claudecluster-worker-dev \
    --memory=4Gi --cpu=2 --project=$PROJECT_ID
```

### Debug Commands

```bash
# Service description
gcloud run services describe claudecluster-worker-dev \
    --region=us-central1 --project=$PROJECT_ID

# Revision details  
gcloud run revisions list --service=claudecluster-worker-dev \
    --region=us-central1 --project=$PROJECT_ID

# Service account permissions
gcloud projects get-iam-policy $PROJECT_ID \
    --flatten="bindings[].members" \
    --format="table(bindings.role)" \
    --filter="bindings.members:serviceAccount"
```

## Cost Optimization

### Pricing Factors

Cloud Run pricing is based on:

- **CPU time** - vCPU seconds during request processing
- **Memory time** - Memory GB-seconds during processing  
- **Requests** - Number of requests handled
- **Networking** - Egress traffic

### Cost Optimization Strategies

1. **Right-size Resources**
   ```bash
   # Use minimum required resources
   --cpu=1 --memory=1Gi    # For light workloads
   --cpu=2 --memory=2Gi    # For standard workloads
   ```

2. **Optimize Cold Starts**
   ```bash
   # Keep minimum instances warm (costs more but faster response)
   --min-instances=1
   
   # Or optimize for cost (slower cold starts)
   --min-instances=0
   ```

3. **Set Appropriate Timeouts**
   ```bash
   # Don't set unnecessarily long timeouts
   --timeout=1800  # 30 minutes instead of 60
   ```

4. **Monitor Usage**
   - Use Cloud Monitoring to track actual resource usage
   - Adjust limits based on real usage patterns
   - Set up billing alerts

## Security Best Practices

### Secret Management

1. **Use Secret Manager** - Never put secrets in environment variables
2. **Rotate Secrets** - Regularly update API keys and tokens
3. **Least Privilege** - Grant minimal required permissions
4. **Audit Access** - Monitor secret access logs

### Network Security

1. **HTTPS Only** - Cloud Run enforces HTTPS
2. **Private Services** - Use `--no-allow-unauthenticated` for internal services
3. **VPC Integration** - Deploy to private VPC when needed
4. **Firewall Rules** - Configure appropriate ingress/egress rules

### Container Security

1. **Non-root User** - Container runs as non-root user
2. **Minimal Base Image** - Use slim/distroless images
3. **Vulnerability Scanning** - Enable Container Analysis
4. **Image Signing** - Use Binary Authorization for production

## Next Steps

After successful worker deployment:

1. **Deploy MCP Server** - See [MCP Server Cloud Run Deployment](./cloud-run-mcp-deployment.md)
2. **Set up Monitoring** - Configure alerting and dashboards  
3. **Load Testing** - Test under expected workloads
4. **Disaster Recovery** - Plan backup and recovery procedures
5. **CI/CD Integration** - Automate deployments

## Useful Commands Reference

```bash
# Quick deployment
pnpm run cloud:deploy-worker-dev

# View service details
gcloud run services list --project=$PROJECT_ID

# Update service
gcloud run services update SERVICE_NAME --project=$PROJECT_ID

# Delete service
gcloud run services delete SERVICE_NAME --project=$PROJECT_ID

# View logs
gcloud run logs tail SERVICE_NAME --project=$PROJECT_ID

# Get service URL
gcloud run services describe SERVICE_NAME \
    --format="value(status.url)" --project=$PROJECT_ID
```