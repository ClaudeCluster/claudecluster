# Health Checks and Service Monitoring

This guide covers ClaudeCluster's health check system and service monitoring capabilities.

## Health Check Architecture

### Overview

ClaudeCluster implements comprehensive health checks at multiple layers:

1. **Application Level** - HTTP endpoints for service health
2. **Docker Level** - Container health checks with automatic restarts
3. **Infrastructure Level** - Network connectivity and resource availability

### Health Check Endpoints

#### MCP Server Health
- **Endpoint**: `GET /health`
- **URL**: `http://localhost:3000/health`
- **Purpose**: Overall system health and worker availability

**Response Format:**
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "0.1.0",
  "uptime": 60000,
  "workers": {
    "total": 2,
    "available": 2,
    "offline": 0
  },
  "tasks": {
    "pending": 0,
    "running": 1,
    "completed": 5
  },
  "systemInfo": {
    "nodeVersion": "v18.19.0",
    "platform": "linux",
    "arch": "x64",
    "memoryUsage": {
      "rss": 45000000,
      "heapTotal": 20000000,
      "heapUsed": 15000000
    }
  }
}
```

#### Worker Health
- **Endpoint**: `GET /hello`
- **URLs**: 
  - Worker 1: `http://localhost:3001/hello`
  - Worker 2: `http://localhost:3002/hello`
- **Purpose**: Individual worker status and task execution capability

**Response Format:**
```json
{
  "status": "available|busy|error|offline",
  "workerId": "worker-1",
  "name": "ClaudeCluster Worker 1",
  "uptime": 45000,
  "activeTasks": 0,
  "totalTasksExecuted": 3,
  "lastTaskTimestamp": "2024-01-01T00:00:00.000Z",
  "capabilities": ["claude-code"],
  "version": "0.1.0"
}
```

## Docker Health Check Configuration

### Health Check Parameters

Each service in `docker-compose.yml` has health checks configured:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s    # Check every 30 seconds
  timeout: 10s     # Timeout after 10 seconds
  retries: 3       # Retry 3 times before marking unhealthy
  start_period: 60s # Wait 60 seconds before starting checks
```

### Health Check Commands

#### Manual Health Checks

```bash
# Check all services
pnpm run docker:health

# Comprehensive validation
pnpm run docker:validate-health

# Individual service checks
curl http://localhost:3000/health | jq .
curl http://localhost:3001/hello | jq .
curl http://localhost:3002/hello | jq .
```

#### Docker Health Status

```bash
# Check Docker-level health
docker compose ps

# Inspect specific container health
docker inspect --format='{{.State.Health.Status}}' claudecluster-mcp
docker inspect --format='{{.State.Health.Status}}' claudecluster-worker-1

# View health check logs
docker inspect --format='{{range .State.Health.Log}}{{.Start}}: {{.Output}}{{end}}' claudecluster-mcp
```

## Service Readiness Indicators

### Log Patterns

Services log specific messages when ready:

#### MCP Server Ready
```
🚀 MCP Server listening on 0.0.0.0:3000
📡 Worker registry initialized with static configuration
```

#### Worker Ready
```
🚀 Worker server listening on 0.0.0.0:3001
✅ Health service initialized - Worker ready for tasks
```

### Readiness Validation Script

Use the comprehensive validation script:

```bash
# Run full validation
pnpm run docker:validate-health

# The script checks:
# - Docker container status
# - HTTP endpoint health
# - Service logs for readiness
# - Error scenario handling
# - Response format validation
```

## Monitoring and Alerting

### Service Metrics

#### MCP Server Metrics
- **Uptime**: Service availability duration
- **Worker Status**: Available/offline worker counts
- **Task Metrics**: Pending, running, completed task counts
- **System Resources**: Memory usage, platform info

#### Worker Metrics
- **Task Execution**: Active and total task counts
- **Performance**: Task completion times, error rates
- **Resource Usage**: CPU, memory, process counts
- **Health Status**: Current operational state

### Log Monitoring

#### Log Levels
- **ERROR**: Service errors, task failures, connection issues
- **WARN**: Configuration issues, degraded performance
- **INFO**: Service lifecycle, task submissions, completions
- **DEBUG**: Detailed execution traces, configuration loading

#### Log Access

```bash
# View all service logs
pnpm run docker:logs

# Follow logs in real-time
pnpm run docker:logs -f

# Filter by service
docker compose logs -f mcp-server
docker compose logs -f worker-1 worker-2

# Filter by log level
docker compose logs mcp-server | grep ERROR
docker compose logs worker-1 | grep -E "(WARN|ERROR)"
```

### Performance Monitoring

#### Resource Usage

```bash
# Monitor container resources
docker stats

# Detailed resource information
docker compose top
```

#### Application Metrics

```bash
# MCP server system info
curl -s http://localhost:3000/health | jq '.systemInfo'

# Worker performance data
curl -s http://localhost:3001/hello | jq '{status, activeTasks, totalTasksExecuted, uptime}'
```

## Troubleshooting Health Issues

### Common Health Check Failures

#### 1. Connection Refused
**Symptoms:**
```
curl: (7) Failed to connect to localhost:3000: Connection refused
```

**Solutions:**
```bash
# Check if service is running
docker compose ps mcp-server

# Check service logs
docker compose logs mcp-server

# Restart service
docker compose restart mcp-server
```

#### 2. Service Timeout
**Symptoms:**
```
curl: (28) Operation timed out after 10000 milliseconds
```

**Solutions:**
```bash
# Check container resources
docker stats claudecluster-mcp

# Increase health check timeout in docker-compose.yml
# timeout: 30s

# Check system load
docker compose top
```

#### 3. Unhealthy Status
**Symptoms:**
```
{
  "status": "unhealthy",
  "workers": {"available": 0, "offline": 2}
}
```

**Solutions:**
```bash
# Check worker health
curl http://localhost:3001/hello
curl http://localhost:3002/hello

# Check worker logs
docker compose logs worker-1 worker-2

# Restart workers
docker compose restart worker-1 worker-2
```

### Health Check Debugging

#### Enable Debug Mode

```bash
# Set debug logging in docker-compose.yml
environment:
  - LOG_LEVEL=debug

# Restart with debug logging
docker compose down
docker compose up -d
```

#### Detailed Health Information

```bash
# Get comprehensive health data
curl -s http://localhost:3000/health | jq .

# Worker-specific diagnostics
curl -s http://localhost:3001/pty/status | jq .
```

#### Manual Health Testing

```bash
# Test health endpoints with timeout
timeout 5s curl -f http://localhost:3000/health
timeout 5s curl -f http://localhost:3001/hello

# Test with verbose output
curl -v http://localhost:3000/health
```

## Best Practices

### Health Check Configuration

1. **Appropriate Timeouts**
   - Use reasonable timeout values (10-30s)
   - Consider service startup time
   - Account for system load variations

2. **Retry Logic**
   - Configure adequate retry counts (3-5)
   - Use exponential backoff for external dependencies
   - Implement circuit breaker patterns

3. **Start Period**
   - Allow sufficient warm-up time (60-120s)
   - Consider dependency initialization
   - Account for resource availability

### Monitoring Strategy

1. **Multi-Layer Monitoring**
   - Application-level health checks
   - Container-level health status
   - Infrastructure monitoring

2. **Proactive Alerting**
   - Monitor health check trends
   - Alert on repeated failures
   - Track performance degradation

3. **Log Management**
   - Structured logging with consistent formats
   - Centralized log aggregation
   - Automated log analysis

### Performance Optimization

1. **Health Check Efficiency**
   - Lightweight health check operations
   - Avoid expensive computations
   - Cache health status when appropriate

2. **Resource Management**
   - Monitor memory usage trends
   - Set appropriate resource limits
   - Implement graceful degradation

3. **Scalability Planning**
   - Design health checks for horizontal scaling
   - Consider load balancer health checks
   - Plan for high availability scenarios

## Integration with CI/CD

### Automated Health Validation

```bash
# In CI/CD pipeline
./scripts/validate-health-checks.sh
if [ $? -eq 0 ]; then
  echo "Health checks passed - deployment successful"
else
  echo "Health checks failed - rolling back deployment"
  exit 1
fi
```

### Deployment Health Gates

```yaml
# Example GitHub Actions workflow
- name: Validate Service Health
  run: |
    pnpm run docker:up
    sleep 60  # Wait for services to start
    pnpm run docker:validate-health
```

### Production Health Monitoring

```bash
# Health check endpoint for load balancers
GET /health

# Returns appropriate HTTP status codes:
# 200 - Healthy
# 503 - Service Unavailable (degraded but functional)
# 500 - Internal Server Error (unhealthy)
```

This comprehensive health check system ensures reliable service operation and provides the foundation for production-grade monitoring and alerting.