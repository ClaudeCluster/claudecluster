# Docker Development Setup

This guide covers setting up ClaudeCluster for local development using Docker Compose.

## Prerequisites

### Required Software

- **Docker Desktop** (4.20+) or Docker Engine (20.10+)
- **Docker Compose** (2.0+) - usually included with Docker Desktop
- **Node.js** (18+) and **pnpm** (8+) - for CLI usage
- **curl** and **jq** (optional) - for testing and health checks

### Required API Keys

- **Anthropic API Key** - Required for Claude access
- **Claude CLI Session Token** - Required for worker authentication

Get your session token by running:
```bash
claude auth status
```

## Quick Start

### 1. Environment Setup

Copy the environment template and fill in your API keys:

```bash
cp .env.example .env
```

Edit `.env` and set:
```bash
ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"
CLAUDE_CLI_SESSION_TOKEN="your-session-token-here"
```

### 2. Start Services

```bash
# Build and start all services
pnpm run docker:up

# Or use the script directly
./scripts/docker-dev.sh up
```

### 3. Verify Setup

```bash
# Check service health
pnpm run docker:health

# Test CLI connectivity
pnpm run docker:test-cli
```

### 4. Run Your First Task

```bash
# Simple example
pnpm run cli run "Create a hello world function in Python"

# With verbose output
pnpm run cli run "Create a hello world function in Python" --verbose
```

## Architecture Overview

The Docker setup creates these services:

### MCP Server (`mcp-server`)
- **Port**: 3000
- **Purpose**: Coordinates task routing and management
- **Endpoint**: `http://localhost:3000`
- **Health**: `http://localhost:3000/health`

### Worker 1 (`worker-1`)
- **Port**: 3001 (externally mapped)
- **Purpose**: Executes Claude Code tasks
- **Endpoint**: `http://localhost:3001`
- **Health**: `http://localhost:3001/hello`

### Worker 2 (`worker-2`)
- **Port**: 3002 (externally mapped)
- **Purpose**: Second worker for parallel execution
- **Endpoint**: `http://localhost:3002`
- **Health**: `http://localhost:3002/hello`

## Docker Management Commands

### Basic Operations

```bash
# Start services
pnpm run docker:up

# Stop services
pnpm run docker:down

# Restart services
pnpm run docker:restart

# View service status
pnpm run docker:status
```

### Building and Updates

```bash
# Build Docker images
pnpm run docker:build

# Rebuild everything from scratch
pnpm run docker:rebuild

# Build specific service
docker compose build mcp-server
```

### Monitoring and Debugging

```bash
# View logs from all services
pnpm run docker:logs

# Follow logs in real-time
pnpm run docker:logs -f

# View logs from specific service
docker compose logs -f mcp-server
docker compose logs -f worker-1
```

### Health Checks

```bash
# Check all service health
pnpm run docker:health

# Check environment configuration
pnpm run docker:env-check

# Test CLI connectivity
pnpm run docker:test-cli
```

### Cleanup

```bash
# Clean up all resources (containers, volumes, images)
pnpm run docker:clean

# Remove containers only (keeps images)
pnpm run docker:down
```

## CLI Usage with Docker

### Basic Usage

The CLI is preconfigured to work with the Docker setup:

```bash
# Default usage (connects to localhost:3000)
pnpm run cli run "Your coding task here"

# Override server URL
pnpm run cli run "Your task" --server http://localhost:3000

# Use specific worker
pnpm run cli run "Your task" --worker worker-1

# Set priority and timeout
pnpm run cli run "Your task" --priority 8 --timeout 60
```

### Advanced Usage

```bash
# JSON output for automation
pnpm run cli run "Your task" --json

# Verbose logging for debugging
pnpm run cli run "Your task" --verbose

# Custom log levels
pnpm run cli run "Your task" --log-level debug
```

### Configuration Override

You can override configuration using environment variables:

```bash
# Override server URL
export CLAUDECLUSTER_SERVER_URL=http://localhost:3000
pnpm run cli run "Your task"

# Override log level
export CLAUDECLUSTER_LOGGING_LEVEL=debug
pnpm run cli run "Your task"
```

## Development Workflow

### 1. Daily Development

```bash
# Start your development session
pnpm run docker:up

# Make code changes to packages/

# Rebuild specific service
docker compose build mcp-server  # After changing MCP code
docker compose build worker-1    # After changing worker code

# Restart services to pick up changes
pnpm run docker:restart

# Test your changes
pnpm run cli run "Test task"
```

### 2. Hot Reloading (Development Mode)

For faster development, you can run services in development mode:

```bash
# Edit docker-compose.yml to use development builds
# Change NODE_ENV=development in environment sections

# Mount source code for hot reloading
# Add volumes:
#   - ./packages/mcp/src:/app/packages/mcp/src
#   - ./packages/worker/src:/app/packages/worker/src
```

### 3. Debugging Issues

```bash
# Check service logs
pnpm run docker:logs -f

# Get shell access to containers
docker compose exec mcp-server /bin/bash
docker compose exec worker-1 /bin/bash

# Check resource usage
docker stats

# Inspect container details
docker compose ps
docker inspect claudecluster-mcp-server
```

## Troubleshooting

### Common Issues

#### Services Won't Start

**Symptoms:**
- Containers exit immediately
- Health checks fail
- Connection refused errors

**Solutions:**

1. **Check Docker daemon:**
   ```bash
   docker info
   ```

2. **Check environment variables:**
   ```bash
   pnpm run docker:env-check
   ```

3. **Check logs:**
   ```bash
   pnpm run docker:logs
   ```

4. **Verify API keys:**
   ```bash
   # Check if API key is set correctly
   cat .env | grep ANTHROPIC_API_KEY
   ```

#### CLI Can't Connect

**Symptoms:**
- "Connection refused" errors
- Timeouts when running CLI commands
- Health check failures

**Solutions:**

1. **Verify services are running:**
   ```bash
   pnpm run docker:status
   pnpm run docker:health
   ```

2. **Check MCP server health:**
   ```bash
   curl http://localhost:3000/health
   ```

3. **Test CLI connectivity:**
   ```bash
   pnpm run docker:test-cli
   ```

4. **Use verbose logging:**
   ```bash
   pnpm run cli run "test" --verbose
   ```

#### Workers Not Responding

**Symptoms:**
- Tasks submitted but no progress
- Worker health checks fail
- "No workers available" errors

**Solutions:**

1. **Check worker logs:**
   ```bash
   docker compose logs worker-1
   docker compose logs worker-2
   ```

2. **Verify Claude CLI authentication:**
   ```bash
   # Check session token in container
   docker compose exec worker-1 claude auth status
   ```

3. **Test worker endpoints:**
   ```bash
   curl http://localhost:3001/hello
   curl http://localhost:3002/hello
   ```

4. **Restart workers:**
   ```bash
   docker compose restart worker-1 worker-2
   ```

#### Build Failures

**Symptoms:**
- Docker build commands fail
- Missing dependencies errors
- Permission errors

**Solutions:**

1. **Clean rebuild:**
   ```bash
   pnpm run docker:clean
   pnpm run docker:build
   ```

2. **Check Docker space:**
   ```bash
   docker system df
   docker system prune
   ```

3. **Update base images:**
   ```bash
   docker compose build --pull --no-cache
   ```

#### Port Conflicts

**Symptoms:**
- "Port already in use" errors
- Services can't bind to ports

**Solutions:**

1. **Check what's using ports:**
   ```bash
   lsof -i :3000  # MCP server port
   lsof -i :3001  # Worker 1 port
   lsof -i :3002  # Worker 2 port
   ```

2. **Stop conflicting services:**
   ```bash
   # Stop other ClaudeCluster instances
   pnpm run docker:down
   
   # Kill processes using ports
   sudo kill -9 $(lsof -ti:3000)
   ```

3. **Change ports in docker-compose.yml:**
   ```yaml
   ports:
     - "3010:3000"  # Use different external port
   ```

#### Performance Issues

**Symptoms:**
- Slow task execution
- High resource usage
- Container restarts

**Solutions:**

1. **Check resource usage:**
   ```bash
   docker stats
   ```

2. **Increase Docker resources:**
   - Docker Desktop → Settings → Resources
   - Increase CPU and Memory limits

3. **Check container logs for errors:**
   ```bash
   pnpm run docker:logs | grep -E "(ERROR|WARN)"
   ```

### Getting Help

1. **Check service status:**
   ```bash
   pnpm run docker:status
   pnpm run docker:health
   ```

2. **Review logs:**
   ```bash
   pnpm run docker:logs -f
   ```

3. **Test connectivity:**
   ```bash
   pnpm run docker:test-cli
   ```

4. **Check environment:**
   ```bash
   pnpm run docker:env-check
   ```

5. **Use verbose CLI mode:**
   ```bash
   pnpm run cli run "test task" --verbose
   ```

## Advanced Configuration

### Custom Configuration

Create custom configuration files in the `config/` directory:

```json
{
  "server": {
    "url": "http://localhost:3000",
    "timeout": 60000
  },
  "workers": {
    "static": {
      "endpoints": ["http://localhost:3001", "http://localhost:3002"],
      "healthCheck": {
        "interval": 30000,
        "timeout": 5000
      }
    }
  }
}
```

### Environment Overrides

Use environment variables to override any configuration:

```bash
# Server configuration
export CLAUDECLUSTER_SERVER_URL=http://localhost:3000
export CLAUDECLUSTER_SERVER_TIMEOUT=60000

# Worker configuration  
export CLAUDECLUSTER_WORKERS_STATIC_ENDPOINTS=http://localhost:3001,http://localhost:3002

# Logging configuration
export CLAUDECLUSTER_LOGGING_LEVEL=debug
```

### Docker Compose Overrides

Create a `docker-compose.override.yml` for local customizations:

```yaml
version: '3.8'

services:
  mcp-server:
    environment:
      - LOG_LEVEL=debug
    volumes:
      - ./packages/mcp/src:/app/packages/mcp/src

  worker-1:
    environment:
      - LOG_LEVEL=debug
    volumes:
      - ./packages/worker/src:/app/packages/worker/src
```

## Security Considerations

### Development Security

- Never commit `.env` files with real API keys
- Use separate API keys for development and production
- Regularly rotate API keys and session tokens
- Monitor logs for exposed sensitive information

### Network Security

- Services run on localhost only by default
- Use Docker network isolation for internal communication
- Health checks don't expose sensitive information

### Container Security

- Containers run as non-root user (`claudeuser`)
- Minimal base images to reduce attack surface
- Health checks for service monitoring

## Performance Optimization

### Docker Performance

```bash
# Allocate more resources to Docker
# Docker Desktop → Settings → Resources

# Use Docker layer caching
docker compose build --parallel

# Clean up unused resources
docker system prune -f
```

### Application Performance

```bash
# Monitor container resources
docker stats

# Increase worker concurrency (if needed)
# Edit CLAUDECLUSTER_WORKER_CONCURRENT_TASKS in docker-compose.yml

# Tune health check intervals
# Edit healthcheck settings in docker-compose.yml
```

## Next Steps

After successfully setting up local Docker development:

1. **Deploy to Cloud** - Cloud Run Deployment (coming soon)
2. **Production Setup** - Production Configuration (coming soon)
3. **Monitoring** - Set up logging and metrics collection
4. **CI/CD** - Integrate Docker builds into your CI/CD pipeline