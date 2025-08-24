# ClaudeCluster Configuration System

This document describes the unified configuration system used across all ClaudeCluster components (CLI, MCP Server, Worker).

## Configuration Sources and Precedence

Configuration is loaded from multiple sources with the following precedence (highest to lowest):

1. **CLI Flags** - Command-line arguments (CLI only)
2. **Environment Variables** - System environment variables
3. **Configuration Files** - JSON/YAML config files
4. **Default Values** - Built-in defaults

Later sources override earlier ones. For example, an environment variable will override a config file value, but a CLI flag will override both.

## Configuration Files

The system searches for configuration files in the following locations:

### Search Order
1. Current working directory
2. User home directory

### File Names (in order of preference)
- `claudecluster.config.json`
- `claudecluster.config.yaml`
- `claudecluster.config.yml`
- `.claudecluster.json`
- `.claudecluster.yaml`
- `.claudecluster.yml`
- `claudecluster.json`

## Environment Variables

Environment variables use prefixes to target specific components:

- **CLI**: `CLAUDECLUSTER_CLI_*`
- **MCP Server**: `CLAUDECLUSTER_MCP_*`
- **Worker**: `CLAUDECLUSTER_WORKER_*`
- **Global**: `CLAUDECLUSTER_*` (affects all components)

### Nested Configuration

Use dot notation for nested configuration:
```bash
# Sets server.host for CLI
export CLAUDECLUSTER_CLI_SERVER_HOST=localhost

# Sets workers.endpoints for MCP Server
export CLAUDECLUSTER_MCP_WORKERS_ENDPOINTS='[\"http://worker1:3001\",\"http://worker2:3001\"]'

# Sets logging.level for Worker
export CLAUDECLUSTER_WORKER_LOGGING_LEVEL=debug
```

## .env File Support

The system automatically loads `.env` files in the following order:
- `.env`
- `.env.local`
- `.env.development` (if NODE_ENV=development)
- `.env.production` (if NODE_ENV=production)

## Component-Specific Configurations

### CLI Configuration

```json
{
  "server": {
    "url": "http://localhost:3000",
    "timeout": 30000
  },
  "logging": {
    "level": "info",
    "console": true,
    "format": "simple"
  },
  "defaults": {
    "priority": 5,
    "timeout": 300
  }
}
```

**Environment Variables:**
- `CLAUDECLUSTER_CLI_SERVER_URL`
- `CLAUDECLUSTER_CLI_SERVER_TIMEOUT`
- `CLAUDECLUSTER_CLI_LOGGING_LEVEL`
- `CLAUDECLUSTER_CLI_DEFAULTS_PRIORITY`

### MCP Server Configuration

```json
{
  "server": {
    "host": "localhost",
    "port": 3000,
    "cors": {
      "origin": "*",
      "credentials": true
    },
    "rateLimit": {
      "windowMs": 60000,
      "maxRequests": 100
    }
  },
  "workers": {
    "endpoints": ["http://localhost:3001"],
    "maxRetries": 3,
    "requestTimeoutMs": 30000,
    "selectionStrategy": "round-robin"
  },
  "logging": {
    "level": "info",
    "console": true,
    "format": "json"
  },
  "monitoring": {
    "enabled": true,
    "heartbeatInterval": 30000,
    "taskTimeout": 300000,
    "retryAttempts": 3
  }
}
```

**Environment Variables:**
- `CLAUDECLUSTER_MCP_SERVER_HOST`
- `CLAUDECLUSTER_MCP_SERVER_PORT`
- `CLAUDECLUSTER_MCP_WORKERS_ENDPOINTS`
- `CLAUDECLUSTER_MCP_LOGGING_LEVEL`

### Worker Configuration

```json
{
  "server": {
    "host": "localhost",
    "port": 3001,
    "cors": {
      "origin": "*",
      "credentials": true
    }
  },
  "worker": {
    "id": "worker-1",
    "capabilities": {
      "maxConcurrentTasks": 1,
      "supportedCommands": ["run"],
      "timeout": 300000
    }
  },
  "logging": {
    "level": "info",
    "console": true,
    "format": "json"
  }
}
```

**Environment Variables:**
- `CLAUDECLUSTER_WORKER_SERVER_HOST`
- `CLAUDECLUSTER_WORKER_SERVER_PORT`
- `CLAUDECLUSTER_WORKER_WORKER_ID`
- `CLAUDECLUSTER_WORKER_LOGGING_LEVEL`

## Environment-Specific Configuration

### Local Development
```json
{
  "dataDir": "./.claudecluster",
  "tempDir": "/tmp/claudecluster",
  "maxWorkers": 4
}
```

### Docker Configuration
```json
{
  "network": "claudecluster",
  "volumes": ["/app/data:/data"],
  "environment": {
    "NODE_ENV": "production"
  }
}
```

### Cloud Run Configuration
```json
{
  "project": "my-gcp-project",
  "region": "us-central1",
  "serviceAccount": "claudecluster@my-project.iam.gserviceaccount.com",
  "resources": {
    "cpu": "1000m",
    "memory": "512Mi"
  },
  "scaling": {
    "minInstances": 0,
    "maxInstances": 10
  }
}
```

## Security Best Practices

### Sensitive Values
- Never commit sensitive values to configuration files
- Use environment variables or secret management systems for:
  - API keys
  - Database credentials
  - Authentication tokens
  - Private endpoints

### Recommended Patterns
```bash
# Good - environment variables for secrets
export CLAUDECLUSTER_API_KEY=secret_key_here

# Good - config file for non-sensitive settings
{
  "server": { "port": 3000 },
  "logging": { "level": "info" }
}

# Bad - secrets in config files
{
  "apiKey": "secret_key_here"  # DON'T DO THIS
}
```

## Validation and Error Handling

All configuration is validated using Zod schemas. Common validation errors:

- **Missing required fields**: Ensure all required configuration is provided
- **Invalid types**: Check that numbers are numbers, strings are strings, etc.
- **Invalid values**: Ensure values are within acceptable ranges
- **Invalid URLs**: Ensure endpoint URLs are properly formatted

## Examples

### Override server URL via environment
```bash
export CLAUDECLUSTER_CLI_SERVER_URL=http://production-server:3000
claudecluster status
```

### Override log level via CLI flag
```bash
claudecluster run "my task" --verbose  # Sets log level to debug
```

### Complete configuration file example
```json
{
  "server": {
    "url": "http://mcp-server:3000",
    "timeout": 60000
  },
  "logging": {
    "level": "debug",
    "console": true,
    "format": "simple"
  },
  "defaults": {
    "priority": 7,
    "timeout": 600
  }
}
```

This configuration system ensures consistent behavior across all ClaudeCluster components while providing flexibility for different deployment scenarios.