# ClaudeCluster Worker - Docker Documentation

This document provides comprehensive instructions for building, running, and managing the ClaudeCluster Worker Docker container.

## Prerequisites

- Docker 20.10+ installed
- Docker Compose 2.0+ (optional, for orchestrated setup)
- Claude CLI installed and authenticated locally
- 4GB+ available RAM (2GB minimum for development)
- Network access to anthropic.com for Claude CLI

## Quick Start

### 1. Build the Docker Image

```bash
# Navigate to the worker directory
cd packages/worker

# Build the image
docker build -t claudecluster/worker:latest .

# Or use docker-compose to build
docker-compose build
```

### 2. Run with Docker Compose (Recommended)

```bash
# Start the worker service
docker-compose up -d

# View logs
docker-compose logs -f worker

# Stop the service
docker-compose down
```

### 3. Run with Docker Command

```bash
# Basic run command
docker run -d \
  --name claudecluster-worker \
  -p 3001:3001 \
  -v "$HOME/.config/claude/config.json:/app/auth/config.json:ro" \
  -e NODE_ENV=development \
  -e LOG_LEVEL=debug \
  claudecluster/worker:latest

# View logs
docker logs -f claudecluster-worker

# Stop container
docker stop claudecluster-worker
docker rm claudecluster-worker
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Environment mode (development/production) |
| `PORT` | `3001` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server host |
| `LOG_LEVEL` | `info` | Logging level (debug/info/warn/error) |
| `CLAUDE_CLI_PATH` | `claude` | Path to Claude CLI executable |
| `PTY_TIMEOUT_MS` | `300000` | PTY session timeout (5 minutes) |
| `MAX_CONCURRENT_PROCESSES` | `5` | Max concurrent PTY processes |
| `PTY_TERMINAL_COLS` | `80` | PTY terminal columns |
| `PTY_TERMINAL_ROWS` | `24` | PTY terminal rows |
| `EXECUTOR_TYPE` | `auto` | Force executor type (stub/pty/auto) |
| `STREAMING_TYPE` | `stub` | Force streaming type (stub/sse) |

### Volume Mounts

#### Required Volumes

- **Claude CLI Auth** (Required): Mount your Claude CLI configuration
  ```bash
  -v "$HOME/.config/claude/config.json:/app/auth/config.json:ro"
  ```

#### Optional Volumes

- **Logs**: Persist log files
  ```bash
  -v "./logs:/app/logs"
  ```

- **Development**: Mount source code for hot reload
  ```bash
  -v "./src:/app/src"
  ```

## Development Setup

### Docker Compose Development Configuration

The included `docker-compose.yml` is optimized for development with:

- **Debug logging** enabled
- **Source code mounting** for live changes  
- **Reduced resource limits** for local development
- **Development-friendly** environment variables

```bash
# Start development environment
docker-compose up --build

# Rebuild and restart
docker-compose up --build --force-recreate

# View real-time logs
docker-compose logs -f worker
```

### Building from Source

```bash
# Build with development configuration
docker build \
  --target runtime \
  --build-arg NODE_ENV=development \
  -t claudecluster/worker:dev .

# Build production optimized image  
docker build \
  --target runtime \
  --build-arg NODE_ENV=production \
  -t claudecluster/worker:prod .
```

## Production Deployment

### Resource Requirements

- **Memory**: 4GB recommended (2GB minimum)
- **CPU**: 1-2 cores recommended
- **Disk**: 1GB for container + logs
- **Network**: Outbound HTTPS (443) to anthropic.com

### Production Docker Run

```bash
docker run -d \
  --name claudecluster-worker-prod \
  --restart unless-stopped \
  -p 3001:3001 \
  -v "/secure/path/claude-config.json:/app/auth/config.json:ro" \
  -v "/var/log/claudecluster:/app/logs" \
  --memory=4g \
  --cpus="2.0" \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  -e PTY_TIMEOUT_MS=600000 \
  --health-cmd="curl -f http://localhost:3001/hello || exit 1" \
  --health-interval=30s \
  --health-timeout=10s \
  --health-retries=3 \
  claudecluster/worker:latest
```

## Testing the Container

### Health Check

The container includes built-in health checks:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' claudecluster-worker

# Manual health check
curl http://localhost:3001/hello
```

Expected response:
```json
{
  "status": "available",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "0.1.0",
  "uptime": 12345,
  "activeTasks": 0,
  "systemInfo": {
    "nodeVersion": "v18.19.0",
    "platform": "linux",
    "arch": "x64"
  }
}
```

### PTY Functionality Test

```bash
# Check PTY status
curl http://localhost:3001/pty/status

# Test task execution
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "echo Hello from Claude!",
    "workerId": "test-worker",
    "priority": 5
  }'
```

### Development Testing

```bash
# Run tests inside container
docker exec -it claudecluster-worker pnpm test

# Check logs
docker exec -it claudecluster-worker tail -f /app/logs/worker.log

# Interactive shell access
docker exec -it claudecluster-worker /bin/bash
```

## Troubleshooting

### Common Issues

#### 1. node-pty Compilation Errors

**Symptoms**: Build fails with Python/gyp errors
```
error: Microsoft Visual Studio C++ 14.0 is required
gyp ERR! build error
```

**Solution**: The Dockerfile uses Debian with Python 3.11 to avoid this issue. Ensure you're building inside Docker, not locally.

#### 2. Claude CLI Authentication

**Symptoms**: 
```json
{"error": "Claude CLI authentication failed"}
```

**Solutions**:
- Verify Claude CLI is authenticated locally: `claude auth status`
- Check the auth file path: `ls -la $HOME/.config/claude/config.json`  
- Ensure read permissions: `chmod 644 $HOME/.config/claude/config.json`
- Mount the auth file correctly in Docker

#### 3. Port Already in Use

**Symptoms**: 
```
bind: address already in use
```

**Solutions**:
```bash
# Check what's using port 3001
lsof -i :3001

# Use a different port
docker run -p 3002:3001 claudecluster/worker:latest

# Or stop the conflicting service
docker stop $(docker ps -q --filter "publish=3001")
```

#### 4. Memory/Resource Issues

**Symptoms**: Container keeps restarting or OOM kills

**Solutions**:
```bash
# Check container resources
docker stats claudecluster-worker

# Increase memory limit
docker update --memory=4g claudecluster-worker

# Monitor resource usage
docker exec claudecluster-worker top
```

#### 5. Network Connectivity

**Symptoms**: Cannot reach anthropic.com from container

**Solutions**:
```bash
# Test network from container
docker exec claudecluster-worker curl -I https://anthropic.com

# Check DNS resolution
docker exec claudecluster-worker nslookup anthropic.com

# Use host networking for debugging
docker run --network host claudecluster/worker:latest
```

### Debugging Commands

```bash
# View detailed container info
docker inspect claudecluster-worker

# Check container logs
docker logs --details --timestamps claudecluster-worker

# Monitor resource usage
docker stats claudecluster-worker

# Access container shell
docker exec -it claudecluster-worker /bin/bash

# View running processes
docker exec claudecluster-worker ps aux

# Check disk usage
docker exec claudecluster-worker df -h

# Network debugging
docker exec claudecluster-worker netstat -tlnp
```

### Log Analysis

```bash
# View structured logs
docker logs claudecluster-worker | jq '.'

# Filter error logs
docker logs claudecluster-worker 2>&1 | grep -i error

# Follow logs with timestamps
docker logs -f --timestamps claudecluster-worker

# Export logs to file
docker logs claudecluster-worker > worker-container.log 2>&1
```

## Performance Optimization

### Resource Tuning

```bash
# Optimize for memory-constrained environments
docker run \
  --memory=2g \
  --memory-swap=2g \
  --oom-kill-disable=false \
  -e MAX_CONCURRENT_PROCESSES=2 \
  claudecluster/worker:latest

# Optimize for CPU-intensive workloads
docker run \
  --cpus="4.0" \
  --cpuset-cpus="0-3" \
  -e MAX_CONCURRENT_PROCESSES=8 \
  claudecluster/worker:latest
```

### Image Optimization

```bash
# Use multi-stage build for smaller images
docker build --target runtime -t claudecluster/worker:slim .

# Remove build dependencies
docker image prune -f

# Check image size
docker images claudecluster/worker:latest
```

## Security Considerations

### Container Security

- **Non-root user**: Container runs as `claudeuser` (UID 1000)
- **Read-only auth**: Claude CLI config mounted read-only
- **Resource limits**: Memory and CPU limits enforced
- **Health checks**: Built-in monitoring for availability

### Network Security

- **Minimal exposure**: Only port 3001 exposed
- **TLS termination**: Handle TLS at load balancer level
- **Firewall rules**: Restrict outbound to anthropic.com only

### Authentication Security

- **Secure mounting**: Use Docker secrets in production
- **File permissions**: Ensure proper file permissions (644)
- **Key rotation**: Regularly rotate Claude CLI authentication

## Monitoring and Observability

### Built-in Endpoints

- `GET /hello` - Health and status information
- `GET /pty/status` - PTY executor status  
- `POST /pty/switch` - Runtime executor switching

### Metrics Collection

The container exposes structured logs that can be ingested by:

- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Prometheus** + Grafana
- **DataDog**, **New Relic**, or other APM solutions
- **Google Cloud Logging** for GCP deployments

### Log Formats

```json
{
  "level": "info",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "msg": "Task execution completed",
  "taskId": "uuid-here",
  "duration": 1500,
  "status": "completed"
}
```

## Next Steps

After successfully running the worker container:

1. **Test functionality**: Execute the test commands above
2. **Monitor resources**: Ensure adequate CPU/memory allocation
3. **Integration**: Connect with MCP server (Task 7)
4. **Production deployment**: Follow production guidelines
5. **Scaling**: Consider horizontal scaling for multiple workers

## Support

For issues specific to Docker deployment:
- Check the troubleshooting section above
- Review container logs with timestamps
- Test with minimal configuration first
- Consult the main project documentation

---

**Note**: This worker container is part of the ClaudeCluster Phase 0 implementation. PTY functionality requires Docker environment for node-pty compilation. Monitor resource usage and adjust limits based on your workload.