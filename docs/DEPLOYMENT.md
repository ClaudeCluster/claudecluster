# ClaudeCluster Deployment Guide

This guide provides comprehensive deployment instructions for ClaudeCluster across different environments, from local development to production cloud deployments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Cloud Deployment](#cloud-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Configuration Management](#configuration-management)
- [Scaling and Performance](#scaling-and-performance)
- [Monitoring and Observability](#monitoring-and-observability)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Prerequisites

### System Requirements

- **Node.js**: 18.0+ (for local development and CLI tools)
- **Docker**: 20.10+ (for containerized deployments)
- **pnpm**: 8.0+ (package management)
- **Git**: 2.30+ (source control)

### Cloud Provider Requirements

#### Google Cloud Platform

- **Project**: GCP project with billing enabled
- **APIs**: Cloud Run, Artifact Registry, Secret Manager, IAM, Cloud Build
- **Authentication**: Service account with appropriate roles
- **CLI Tools**: `gcloud` CLI installed and authenticated

```bash
# Install and configure gcloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init
gcloud auth application-default login
```

#### Required IAM Roles

```bash
# Service account roles for deployment
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.admin"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.admin"
```

## Local Development

### Docker Compose Setup

The fastest way to get ClaudeCluster running locally:

```bash
# Clone the repository
git clone https://github.com/your-org/claudecluster.git
cd claudecluster

# Install dependencies
pnpm install

# Build the project
pnpm build

# Start all services with Docker Compose
pnpm run docker:up

# Check service health
pnpm run docker:health
```

### Manual Local Setup

For development without Docker:

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start MCP server in development mode
pnpm --filter @claudecluster/mcp dev &

# Start workers in development mode  
pnpm --filter @claudecluster/worker dev &

# Test the setup
curl http://localhost:3000/health
```

### Environment Configuration

Create `.env` file in the project root:

```bash
# Local development environment
NODE_ENV=development

# MCP Server Configuration
MCP_SERVER_PORT=3000
MCP_SERVER_HOST=0.0.0.0

# Worker Configuration
WORKER_PORT=3001
WORKER_HOST=0.0.0.0
WORKER_CONCURRENCY=5

# Security (development only - use proper auth in production)
DISABLE_AUTH=true

# Logging
LOG_LEVEL=debug
LOG_FORMAT=pretty

# Development features
ENABLE_CORS=true
ENABLE_SWAGGER_UI=true
```

### Development Scripts

```bash
# Start all services in development mode
pnpm run dev

# Build and watch for changes
pnpm run build --watch

# Run tests
pnpm run test
pnpm run test:e2e

# Code quality
pnpm run lint
pnpm run format
pnpm run typecheck
```

## Cloud Deployment

### Google Cloud Run Deployment

#### Quick Deploy

Use the provided deployment scripts for rapid deployment:

```bash
# Deploy MCP server
./scripts/deploy-mcp-gcloud.sh \
  --project-id=your-project-id \
  --environment=production \
  --region=us-central1

# Deploy worker
./scripts/deploy-worker-gcloud.sh \
  --project-id=your-project-id \
  --environment=production \
  --region=us-central1
```

#### Manual Cloud Run Deployment

Step-by-step manual deployment process:

```bash
# 1. Configure project and region
export PROJECT_ID="your-project-id"
export REGION="us-central1"

# 2. Create Artifact Registry repository
gcloud artifacts repositories create claudecluster \
  --repository-format=docker \
  --location=$REGION \
  --project=$PROJECT_ID

# 3. Build and push MCP server image
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/claudecluster/mcp-server:latest \
  -f packages/mcp/Dockerfile.cloudrun .

docker push $REGION-docker.pkg.dev/$PROJECT_ID/claudecluster/mcp-server:latest

# 4. Deploy MCP server
gcloud run deploy claudecluster-mcp-server \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/claudecluster/mcp-server:latest \
  --platform=managed \
  --region=$REGION \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=2 \
  --memory=2Gi \
  --concurrency=100 \
  --max-instances=10 \
  --set-env-vars="NODE_ENV=production"

# 5. Build and push worker image
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/claudecluster/worker:latest \
  -f packages/worker/Dockerfile.cloudrun .

docker push $REGION-docker.pkg.dev/$PROJECT_ID/claudecluster/worker:latest

# 6. Deploy worker
gcloud run deploy claudecluster-worker \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/claudecluster/worker:latest \
  --platform=managed \
  --region=$REGION \
  --no-allow-unauthenticated \
  --port=8080 \
  --cpu=2 \
  --memory=2Gi \
  --concurrency=5 \
  --max-instances=50 \
  --set-env-vars="NODE_ENV=production"
```

### Multi-Environment Setup

#### Environment-Specific Configurations

```yaml
# config/environments/development.yml
environment: development
mcp_server:
  concurrency: 10
  max_instances: 2
  cpu: 1
  memory: 1Gi
  
worker:
  concurrency: 3
  max_instances: 5
  cpu: 1
  memory: 1Gi
  
logging:
  level: debug
  
auth:
  enabled: false
```

```yaml
# config/environments/production.yml
environment: production
mcp_server:
  concurrency: 100
  max_instances: 20
  cpu: 2
  memory: 4Gi
  
worker:
  concurrency: 5
  max_instances: 100
  cpu: 2
  memory: 2Gi
  
logging:
  level: info
  
auth:
  enabled: true
  type: api_key
```

#### Environment-Specific Deployment

```bash
# Deploy to development
./scripts/deploy-mcp-gcloud.sh \
  --project-id=your-project-dev \
  --environment=development \
  --region=us-central1 \
  --config-file=config/environments/development.yml

# Deploy to staging  
./scripts/deploy-mcp-gcloud.sh \
  --project-id=your-project-staging \
  --environment=staging \
  --region=us-central1 \
  --config-file=config/environments/staging.yml

# Deploy to production
./scripts/deploy-mcp-gcloud.sh \
  --project-id=your-project-prod \
  --environment=production \
  --region=us-central1 \
  --config-file=config/environments/production.yml
```

### Load Balancing and CDN

#### Global Load Balancer Setup

```bash
# Create load balancer for high availability
gcloud compute url-maps create claudecluster-lb \
  --default-backend-bucket=claudecluster-error-bucket

# Add backend services  
gcloud compute backend-services create claudecluster-mcp-backend \
  --protocol=HTTP \
  --port-name=http \
  --health-checks=claudecluster-health-check \
  --global

# Add Cloud Run services as backends
gcloud compute backend-services add-backend claudecluster-mcp-backend \
  --backend-service=claudecluster-mcp-backend \
  --global
```

## Kubernetes Deployment

### Prerequisites

```bash
# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

# For GKE
gcloud container clusters get-credentials claudecluster-cluster \
  --zone=us-central1-a \
  --project=your-project-id
```

### Kubernetes Manifests

#### Namespace and RBAC

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: claudecluster
  labels:
    name: claudecluster
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: claudecluster-sa
  namespace: claudecluster
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: claudecluster-role
rules:
- apiGroups: [""]
  resources: ["pods", "services", "endpoints"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: claudecluster-binding
subjects:
- kind: ServiceAccount
  name: claudecluster-sa
  namespace: claudecluster
roleRef:
  kind: ClusterRole
  name: claudecluster-role
  apiGroup: rbac.authorization.k8s.io
```

#### ConfigMaps and Secrets

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: claudecluster-config
  namespace: claudecluster
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  MCP_SERVER_PORT: "8080"
  WORKER_PORT: "8080"
  WORKER_CONCURRENCY: "5"
---
apiVersion: v1
kind: Secret
metadata:
  name: claudecluster-secrets
  namespace: claudecluster
type: Opaque
data:
  api-key: <base64-encoded-api-key>
  database-password: <base64-encoded-password>
```

#### MCP Server Deployment

```yaml
# k8s/mcp-server.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claudecluster-mcp-server
  namespace: claudecluster
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claudecluster-mcp-server
  template:
    metadata:
      labels:
        app: claudecluster-mcp-server
    spec:
      serviceAccountName: claudecluster-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: mcp-server
        image: gcr.io/your-project/claudecluster-mcp-server:latest
        ports:
        - containerPort: 8080
          name: http
        env:
        - name: PORT
          value: "8080"
        envFrom:
        - configMapRef:
            name: claudecluster-config
        - secretRef:
            name: claudecluster-secrets
        resources:
          requests:
            cpu: 500m
            memory: 1Gi
          limits:
            cpu: 2
            memory: 4Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
---
apiVersion: v1
kind: Service
metadata:
  name: claudecluster-mcp-server
  namespace: claudecluster
spec:
  selector:
    app: claudecluster-mcp-server
  ports:
  - port: 80
    targetPort: 8080
    name: http
  type: ClusterIP
```

#### Worker Deployment

```yaml
# k8s/worker.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claudecluster-worker
  namespace: claudecluster
spec:
  replicas: 5
  selector:
    matchLabels:
      app: claudecluster-worker
  template:
    metadata:
      labels:
        app: claudecluster-worker
    spec:
      serviceAccountName: claudecluster-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: worker
        image: gcr.io/your-project/claudecluster-worker:latest
        ports:
        - containerPort: 8080
          name: http
        env:
        - name: PORT
          value: "8080"
        envFrom:
        - configMapRef:
            name: claudecluster-config
        - secretRef:
            name: claudecluster-secrets
        resources:
          requests:
            cpu: 1
            memory: 2Gi
          limits:
            cpu: 2
            memory: 4Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
---
apiVersion: v1
kind: Service
metadata:
  name: claudecluster-worker
  namespace: claudecluster
spec:
  selector:
    app: claudecluster-worker
  ports:
  - port: 80
    targetPort: 8080
    name: http
  type: ClusterIP
```

#### Ingress Configuration

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: claudecluster-ingress
  namespace: claudecluster
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/rate-limit-rpm: "100"
spec:
  tls:
  - hosts:
    - claudecluster.example.com
    secretName: claudecluster-tls
  rules:
  - host: claudecluster.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: claudecluster-mcp-server
            port:
              number: 80
```

#### Horizontal Pod Autoscaler

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: claudecluster-mcp-hpa
  namespace: claudecluster
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: claudecluster-mcp-server
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: claudecluster-worker-hpa
  namespace: claudecluster
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: claudecluster-worker
  minReplicas: 5
  maxReplicas: 100
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 80
```

### Deploy to Kubernetes

```bash
# Apply all manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n claudecluster
kubectl get services -n claudecluster
kubectl get ingress -n claudecluster

# View logs
kubectl logs -f deployment/claudecluster-mcp-server -n claudecluster
kubectl logs -f deployment/claudecluster-worker -n claudecluster
```

## Configuration Management

### Environment Variables

#### MCP Server Configuration

```bash
# Core server settings
PORT=8080
HOST=0.0.0.0
NODE_ENV=production

# Worker discovery and communication
WORKER_DISCOVERY_METHOD=static  # static, kubernetes, consul
WORKER_ENDPOINTS=worker1:8080,worker2:8080
WORKER_HEALTH_CHECK_INTERVAL=30000
WORKER_TIMEOUT=60000

# Rate limiting and concurrency
MAX_CONCURRENT_TASKS=100
RATE_LIMIT_REQUESTS_PER_MINUTE=1000
RATE_LIMIT_BURST_SIZE=50

# Security settings
CORS_ENABLED=false
CORS_ORIGINS=https://your-domain.com
API_KEY_HEADER=X-API-Key
JWT_SECRET_KEY=your-jwt-secret

# Logging and monitoring
LOG_LEVEL=info
LOG_FORMAT=json
ENABLE_REQUEST_LOGGING=true
METRICS_ENABLED=true
METRICS_PORT=9090
```

#### Worker Configuration

```bash
# Worker identification and communication
WORKER_ID=worker-${HOSTNAME}
WORKER_PORT=8080
WORKER_HOST=0.0.0.0

# Task execution settings
MAX_CONCURRENT_TASKS=5
TASK_TIMEOUT=300000  # 5 minutes
TASK_EXECUTION_ENVIRONMENT=container

# Resource limits
MAX_MEMORY_MB=2048
MAX_CPU_CORES=2
DISK_QUOTA_MB=1024

# Health and monitoring
HEALTH_CHECK_INTERVAL=10000
METRICS_ENABLED=true
ENABLE_TASK_LOGGING=true
```

### Configuration Files

#### Production Configuration

```yaml
# config/production.yml
server:
  port: 8080
  host: "0.0.0.0"
  cors:
    enabled: false
    origins: []
  
rate_limiting:
  enabled: true
  requests_per_minute: 1000
  burst_size: 50
  
workers:
  discovery_method: "kubernetes"
  health_check_interval: 30000
  timeout: 60000
  
security:
  authentication:
    enabled: true
    methods: ["api_key", "jwt"]
  authorization:
    enabled: true
    
logging:
  level: "info"
  format: "json"
  
monitoring:
  metrics:
    enabled: true
    port: 9090
  tracing:
    enabled: true
    jaeger_endpoint: "http://jaeger:14268"
```

#### Development Configuration

```yaml
# config/development.yml
server:
  port: 3000
  host: "localhost"
  cors:
    enabled: true
    origins: ["http://localhost:3001", "http://localhost:8080"]
  
rate_limiting:
  enabled: false
  
workers:
  discovery_method: "static"
  endpoints: ["http://localhost:3001", "http://localhost:3002"]
  
security:
  authentication:
    enabled: false
  authorization:
    enabled: false
    
logging:
  level: "debug"
  format: "pretty"
  
monitoring:
  metrics:
    enabled: false
  tracing:
    enabled: false
```

### Secret Management

#### Google Cloud Secret Manager

```bash
# Create secrets
echo -n "your-api-key" | gcloud secrets create claudecluster-api-key --data-file=-
echo -n "your-jwt-secret" | gcloud secrets create claudecluster-jwt-secret --data-file=-

# Grant access to Cloud Run services
gcloud secrets add-iam-policy-binding claudecluster-api-key \
  --member="serviceAccount:claudecluster-mcp@your-project.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### Kubernetes Secrets

```bash
# Create secrets from files
kubectl create secret generic claudecluster-secrets \
  --from-file=api-key=./secrets/api-key.txt \
  --from-file=jwt-secret=./secrets/jwt-secret.txt \
  -n claudecluster

# Create secrets from literal values
kubectl create secret generic claudecluster-secrets \
  --from-literal=api-key=your-api-key \
  --from-literal=jwt-secret=your-jwt-secret \
  -n claudecluster
```

## Scaling and Performance

### Horizontal Scaling

#### Cloud Run Scaling

```bash
# Configure auto-scaling for MCP server
gcloud run services update claudecluster-mcp-server \
  --region=us-central1 \
  --min-instances=2 \
  --max-instances=20 \
  --concurrency=100

# Configure auto-scaling for workers
gcloud run services update claudecluster-worker \
  --region=us-central1 \
  --min-instances=5 \
  --max-instances=100 \
  --concurrency=5
```

#### Kubernetes Scaling

```bash
# Manual scaling
kubectl scale deployment claudecluster-mcp-server --replicas=10 -n claudecluster
kubectl scale deployment claudecluster-worker --replicas=20 -n claudecluster

# Configure HPA (already shown above in K8s section)
# Enable cluster autoscaler for node-level scaling
```

### Vertical Scaling

#### Resource Optimization

```yaml
# Optimized resource allocation
resources:
  requests:
    cpu: 500m      # 0.5 CPU cores
    memory: 1Gi    # 1 GB RAM
  limits:
    cpu: 2         # 2 CPU cores
    memory: 4Gi    # 4 GB RAM
```

### Performance Tuning

#### Node.js Optimization

```bash
# Environment variables for performance
NODE_ENV=production
NODE_OPTIONS="--max-old-space-size=2048 --enable-source-maps"
UV_THREADPOOL_SIZE=16
```

#### Container Optimization

```dockerfile
# Multi-stage build for smaller images
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime
RUN apk add --no-cache dumb-init
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY dist ./dist
EXPOSE 8080
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

## Monitoring and Observability

### Health Checks

#### Application Health Endpoints

```javascript
// Health check implementation
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version
  });
});

app.get('/ready', async (req, res) => {
  try {
    // Check database connectivity
    await db.ping();
    
    // Check worker connectivity
    const workers = await checkWorkerHealth();
    
    res.status(200).json({
      status: 'ready',
      workers: workers.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

### Metrics and Monitoring

#### Prometheus Metrics

```javascript
// Prometheus metrics setup
const prometheus = require('prom-client');

// Custom metrics
const taskCounter = new prometheus.Counter({
  name: 'claudecluster_tasks_total',
  help: 'Total number of tasks processed',
  labelNames: ['status', 'worker_id']
});

const taskDuration = new prometheus.Histogram({
  name: 'claudecluster_task_duration_seconds',
  help: 'Task execution duration',
  labelNames: ['status', 'worker_id'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60]
});

const activeConnections = new prometheus.Gauge({
  name: 'claudecluster_active_connections',
  help: 'Number of active connections'
});
```

#### Grafana Dashboard Configuration

```json
{
  "dashboard": {
    "title": "ClaudeCluster Overview",
    "panels": [
      {
        "title": "Task Throughput",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(claudecluster_tasks_total[5m])",
            "legendFormat": "Tasks/sec"
          }
        ]
      },
      {
        "title": "Task Duration",
        "type": "graph", 
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(claudecluster_task_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      }
    ]
  }
}
```

### Logging

#### Structured Logging

```javascript
// Winston logging configuration
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Usage in application
logger.info('Task submitted', {
  taskId: task.id,
  userId: req.user.id,
  prompt: task.prompt.substring(0, 100),
  timestamp: new Date().toISOString()
});
```

#### Log Aggregation

```yaml
# Fluent Bit configuration for log forwarding
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
data:
  fluent-bit.conf: |
    [INPUT]
        Name tail
        Path /var/log/containers/*claudecluster*.log
        Parser docker
        Tag kube.*
        
    [OUTPUT]
        Name stackdriver
        Match kube.*
        google_service_credentials /var/secrets/google/key.json
        resource k8s_container
```

## Troubleshooting

### Common Issues

#### 1. Service Discovery Problems

**Symptom**: MCP server cannot connect to workers

```bash
# Check worker endpoints
kubectl get endpoints -n claudecluster
kubectl describe service claudecluster-worker -n claudecluster

# Test connectivity
kubectl exec -it deployment/claudecluster-mcp-server -n claudecluster -- \
  curl http://claudecluster-worker/health
```

**Solution**:
```yaml
# Ensure service selector matches pod labels
apiVersion: v1
kind: Service
metadata:
  name: claudecluster-worker
spec:
  selector:
    app: claudecluster-worker  # Must match pod labels
```

#### 2. Resource Limits

**Symptom**: Pods getting OOMKilled or CPU throttled

```bash
# Check resource usage
kubectl top pods -n claudecluster
kubectl describe pod <pod-name> -n claudecluster
```

**Solution**:
```yaml
# Adjust resource limits
resources:
  requests:
    cpu: 1
    memory: 2Gi
  limits:
    cpu: 2
    memory: 4Gi
```

#### 3. Configuration Issues

**Symptom**: Services failing to start due to configuration

```bash
# Check environment variables
kubectl exec deployment/claudecluster-mcp-server -n claudecluster -- env

# Check mounted secrets
kubectl exec deployment/claudecluster-mcp-server -n claudecluster -- \
  ls -la /etc/secrets/
```

#### 4. Network Connectivity

**Symptom**: Services cannot communicate

```bash
# Test DNS resolution
kubectl exec -it deployment/claudecluster-mcp-server -n claudecluster -- \
  nslookup claudecluster-worker.claudecluster.svc.cluster.local

# Check network policies
kubectl get networkpolicy -n claudecluster
```

### Debugging Commands

#### Kubernetes Debugging

```bash
# Get pod logs
kubectl logs deployment/claudecluster-mcp-server -n claudecluster --tail=100 -f

# Execute commands in pod
kubectl exec -it deployment/claudecluster-mcp-server -n claudecluster -- bash

# Check pod events
kubectl get events -n claudecluster --sort-by=.metadata.creationTimestamp

# Port forward for local debugging
kubectl port-forward service/claudecluster-mcp-server 8080:80 -n claudecluster
```

#### Cloud Run Debugging

```bash
# View service logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=claudecluster-mcp-server" \
  --limit=50 --format=json

# Check service configuration
gcloud run services describe claudecluster-mcp-server \
  --region=us-central1 \
  --format=yaml

# Test service directly
curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  https://claudecluster-mcp-server-abc123-uc.a.run.app/health
```

### Performance Debugging

#### Profiling

```javascript
// Add profiling endpoint
const v8Profiler = require('v8-profiler-next');

app.get('/profile/start', (req, res) => {
  v8Profiler.startProfiling('claudecluster-profile');
  res.json({ status: 'profiling started' });
});

app.get('/profile/stop', (req, res) => {
  const profile = v8Profiler.stopProfiling('claudecluster-profile');
  profile.export((error, result) => {
    if (error) {
      res.status(500).json({ error: error.message });
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=profile.cpuprofile');
      res.send(result);
    }
    profile.delete();
  });
});
```

#### Load Testing

```bash
# Install k6 for load testing
curl -s https://dl.k6.io/key.gpg | sudo apt-key add -
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Run load test
cat << EOF > loadtest.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 0 },
  ],
};

export default function() {
  let response = http.post('http://your-service/tasks', {
    prompt: 'echo "load test"',
    priority: 5
  });
  
  check(response, {
    'is status 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
EOF

k6 run loadtest.js
```

## Best Practices

### Security Best Practices

1. **Never disable authentication in production**
2. **Use HTTPS/TLS for all communications**
3. **Implement proper RBAC and least privilege access**
4. **Regularly update dependencies and base images**
5. **Use secrets management systems**
6. **Enable comprehensive logging and monitoring**
7. **Implement proper input validation**
8. **Use non-root containers**

### Performance Best Practices

1. **Set appropriate resource requests and limits**
2. **Configure horizontal pod autoscaling**
3. **Use connection pooling for database connections**
4. **Implement proper caching strategies**
5. **Monitor and optimize garbage collection**
6. **Use keep-alive connections**
7. **Implement proper retry and circuit breaker patterns**

### Operational Best Practices

1. **Use infrastructure as code (Terraform, Helm)**
2. **Implement proper CI/CD pipelines**
3. **Use blue-green or canary deployments**
4. **Implement comprehensive health checks**
5. **Set up proper alerting and monitoring**
6. **Document runbooks and procedures**
7. **Practice disaster recovery procedures**
8. **Maintain configuration in version control**

### Monitoring Best Practices

1. **Monitor the four golden signals: latency, traffic, errors, saturation**
2. **Set up meaningful alerts (avoid alert fatigue)**
3. **Use distributed tracing for complex flows**
4. **Monitor both infrastructure and application metrics**
5. **Implement log aggregation and analysis**
6. **Set up synthetic monitoring for critical paths**
7. **Monitor security-related events**

---

This deployment guide provides a comprehensive foundation for deploying ClaudeCluster across various environments. Adapt the configurations to your specific requirements and environment constraints.