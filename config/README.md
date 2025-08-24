# ClaudeCluster Configuration

This directory contains configuration files for different ClaudeCluster deployment environments.

## Configuration Files

### `docker.json`

Default configuration for local Docker development using `docker-compose.yml`. This configuration:

- Points to the MCP server at `http://localhost:3000`
- Configures workers at `http://localhost:3001` and `http://localhost:3002`
- Sets up health checks and timeouts appropriate for local development
- Enables CORS for local web dashboard access

### Using Configurations

#### CLI Usage

The CLI automatically uses the default configuration, but you can override settings:

```bash
# Use default Docker configuration (localhost:3000)
pnpm run cli run "Create a simple hello world function"

# Override server URL
pnpm run cli run "Create a simple hello world function" --server http://localhost:3000

# Use verbose logging for debugging
pnpm run cli run "Create a simple hello world function" --verbose

# Specify custom timeout (in seconds)
pnpm run cli run "Create a simple hello world function" --timeout 60
```

#### Environment Variables

You can also override configuration using environment variables:

```bash
# Override server URL
export CLAUDECLUSTER_SERVER_URL=http://localhost:3000
pnpm run cli run "Your prompt here"

# Override log level
export CLAUDECLUSTER_LOGGING_LEVEL=debug
pnpm run cli run "Your prompt here"
```

#### Configuration File Priority

Configuration is loaded in this order (later sources override earlier ones):

1. Default values (hardcoded)
2. Configuration files (e.g., `config/docker.json`)
3. Environment variables (`CLAUDECLUSTER_*`)
4. CLI flags (`--server`, `--verbose`, etc.)

## Docker Development Workflow

### 1. Start Services

```bash
# Using npm scripts
pnpm run docker:up

# Or using script directly
./scripts/docker-dev.sh up
```

### 2. Test CLI Connection

```bash
# Check if CLI can connect to MCP server
pnpm run docker:health

# Run a simple task
pnpm run cli run "Create a simple hello world function in Python"
```

### 3. Monitor Logs

```bash
# Follow all service logs
pnpm run docker:logs -f

# Follow specific service logs
docker compose logs -f mcp-server
docker compose logs -f worker-1
```

### 4. Debug Configuration

```bash
# Check environment variables
pnpm run docker:env-check

# Test CLI configuration
pnpm run cli run "test prompt" --verbose
```

## Health Checks and Monitoring

### Service Health Endpoints

- **MCP Server**: `http://localhost:3000/health`
- **Worker 1**: `http://localhost:3001/hello`
- **Worker 2**: `http://localhost:3002/hello`

### Manual Health Checks

```bash
# Check MCP server health
curl -s http://localhost:3000/health | jq .

# Check worker health
curl -s http://localhost:3001/hello
curl -s http://localhost:3002/hello
```

### Using the Health Script

```bash
# Automated health check for all services
pnpm run docker:health
```

## Troubleshooting

### Common Issues

1. **Services not starting**
   - Check Docker is running: `docker info`
   - Verify `.env` file exists with required API keys
   - Check logs: `pnpm run docker:logs`

2. **CLI connection failures**
   - Verify MCP server is healthy: `curl http://localhost:3000/health`
   - Check firewall/network settings
   - Try verbose logging: `--verbose` flag

3. **Workers not responding**
   - Check worker health endpoints
   - Verify Claude CLI authentication in containers
   - Check worker logs: `docker compose logs worker-1`

4. **Configuration issues**
   - Validate environment: `pnpm run docker:env-check`
   - Check configuration loading: `--verbose` flag
   - Verify API keys are set correctly

### Getting Help

```bash
# Docker management help
./scripts/docker-dev.sh help

# CLI help
pnpm run cli --help
pnpm run cli run --help
```

## Security Notes

- Never commit `.env` files containing real API keys
- Use environment variables for sensitive configuration in production
- Regularly rotate API keys and session tokens
- Monitor logs for exposed sensitive information