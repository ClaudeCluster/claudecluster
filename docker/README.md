# ClaudeCluster Container Execution

This directory contains the container infrastructure for ClaudeCluster's agentic execution mode, where each task runs in an isolated Docker container with a pre-authenticated Claude Code instance.

## Overview

The agentic execution mode transforms the static process pool approach into dynamic, per-task container spawning. Each API request creates a new container with:

- Isolated workspace environment
- Pre-authenticated Claude Code instance
- Repository cloning capability
- Comprehensive logging and monitoring
- Automatic cleanup and resource management

## Components

### Container Wrapper Script

**File**: `scripts/claude-prototype-wrapper.sh`

The wrapper script runs inside each container and handles:
- Environment validation and setup
- Repository cloning (if `REPO_URL` provided)
- Claude Code authentication and configuration
- Task execution with timeout and resource limits
- Output capture and error handling
- Health checks and monitoring

### Container Image

**File**: `Dockerfile.claude-container`

Based on the official Anthropic Claude Code image with:
- Additional system tools (git, curl, jq, etc.)
- Non-root user execution for security
- Proper directory structure and permissions
- Health check configuration
- Resource limit awareness

### Build System

**File**: `build-claude-container.sh`

Automated build script with:
- Requirement validation
- Multi-stage build process
- Automated testing
- Image metadata and labeling
- Push to registry support

## Usage

### Building the Container

```bash
# Build with default settings
./docker/build-claude-container.sh

# Build with custom tag
./docker/build-claude-container.sh --image-tag v1.0.0

# Build without cache
./docker/build-claude-container.sh --no-cache

# Build and push to registry
DOCKER_REGISTRY=your-registry.com ./docker/build-claude-container.sh --push
```

### Running the Container

The container is designed to be spawned programmatically by the MCP Container Spawner Tool, but can also be run manually for testing:

```bash
# Basic task execution
docker run --rm \
    -e SESSION_ID="test-session-123" \
    -e TASK="Create a simple hello world function" \
    -e CLAUDE_API_KEY="your-api-key" \
    claudecluster/claude-agentic:latest

# With repository cloning
docker run --rm \
    -e SESSION_ID="test-session-123" \
    -e TASK="Analyze the codebase and suggest improvements" \
    -e REPO_URL="https://github.com/user/repo.git" \
    -e CLAUDE_API_KEY="your-api-key" \
    claudecluster/claude-agentic:latest

# With custom configuration
docker run --rm \
    -e SESSION_ID="test-session-123" \
    -e TASK="Refactor the authentication module" \
    -e CLAUDE_API_KEY="your-api-key" \
    -e LOG_LEVEL="DEBUG" \
    -e TIMEOUT="600" \
    claudecluster/claude-agentic:latest
```

### Testing the Container

```bash
# Run health check
docker run --rm claudecluster/claude-agentic:latest --health-check

# Show version
docker run --rm claudecluster/claude-agentic:latest --version

# Show help
docker run --rm claudecluster/claude-agentic:latest --help

# Test existing image
./docker/build-claude-container.sh test
```

## Environment Variables

### Required Variables

- `SESSION_ID`: Unique identifier for the container session
- `TASK`: Task description for Claude Code to execute
- `CLAUDE_API_KEY`: Authentication key for Claude API

### Optional Variables

- `REPO_URL`: Git repository URL to clone into workspace
- `WORKSPACE_DIR`: Workspace directory (default: `/workspace`)
- `LOG_LEVEL`: Logging level - DEBUG, INFO, WARN, ERROR (default: `INFO`)
- `TIMEOUT`: Execution timeout in seconds (default: `300`)
- `MAX_OUTPUT_SIZE`: Maximum output size in bytes (default: `10485760` / 10MB)
- `TASK_FILE`: Path to file containing task description (alternative to `TASK`)

## Security Features

The container implementation includes several security measures:

### Process Isolation
- Runs as non-root user (`claudecluster`)
- Dropped capabilities (`CAP_DROP: ALL`)
- No new privileges (`no-new-privileges:true`)
- Read-only root filesystem option available

### Resource Limits
- Memory limit (default: 2GB)
- CPU share limits (default: 1024 shares)
- Execution timeout (default: 5 minutes)
- Output size limits (default: 10MB)

### Network Security
- Isolated bridge network by default
- No host network access
- No Docker socket access
- Minimal attack surface

### Workspace Isolation
- Dedicated workspace per session
- Temporary directory cleanup
- No persistent data by default
- Automatic container removal

## Integration with ClaudeCluster

The container system integrates with ClaudeCluster through:

### MCP Container Spawner Tool
Located in `packages/mcp/src/tools/container-spawner.ts`, this tool:
- Manages container lifecycle (create, start, monitor, cleanup)
- Handles Docker API communication
- Implements resource management
- Provides session tracking and monitoring

### Worker Server
The Worker Server (`packages/worker/src/server/index.ts`) includes:
- Session management endpoints
- Container-aware task routing
- Health monitoring for both modes
- Metrics collection for container execution

### Unified Execution Engine
The engine (`packages/worker/src/engine/unified-engine.ts`) provides:
- Mode-specific execution routing
- Container session management
- Resource monitoring and cleanup
- Error handling and recovery

## Monitoring and Observability

### Health Checks
- Container health endpoint (`--health-check`)
- Docker health check configuration
- Resource usage monitoring
- Process state validation

### Logging
- Structured logging with timestamps
- Color-coded log levels
- Error output separation
- Debug mode support

### Metrics Collection
- Execution duration tracking
- Resource usage monitoring
- Success/failure rates
- Container lifecycle events

## Troubleshooting

### Common Issues

#### Container Build Failures
```bash
# Check Docker daemon
docker info

# Clean build cache
docker builder prune

# Build with verbose output
./docker/build-claude-container.sh --no-cache
```

#### Runtime Failures
```bash
# Check container logs
docker logs <container-id>

# Test wrapper script
docker run --rm -e SESSION_ID=test -e TASK="test" -e CLAUDE_API_KEY=test claudecluster/claude-agentic:latest --health-check

# Debug mode
docker run --rm -e LOG_LEVEL=DEBUG -e SESSION_ID=test -e TASK="test" -e CLAUDE_API_KEY=test claudecluster/claude-agentic:latest
```

#### Authentication Issues
```bash
# Verify API key
echo $CLAUDE_API_KEY

# Test Claude Code directly
docker run --rm -e CLAUDE_API_KEY=your-key ghcr.io/anthropics/claude-code:latest --version
```

### Performance Optimization

#### Container Caching
- Pre-pull base images
- Use multi-stage builds
- Layer optimization
- Registry caching

#### Resource Tuning
- Adjust memory limits based on task complexity
- Configure CPU shares for performance
- Optimize timeout values
- Monitor container metrics

#### Network Optimization
- Use dedicated networks for container isolation
- Configure DNS resolution
- Optimize registry access
- Monitor network latency

## Development

### Local Development
```bash
# Build development image
./docker/build-claude-container.sh --image-tag dev

# Test changes
./docker/build-claude-container.sh test

# Clean up
./docker/build-claude-container.sh clean
```

### Testing
```bash
# Unit tests for wrapper script
./docker/test-wrapper.sh

# Integration tests
./docker/test-integration.sh

# Performance tests
./docker/test-performance.sh
```

### Contributing

When modifying the container system:

1. Update wrapper script functionality in `scripts/claude-prototype-wrapper.sh`
2. Rebuild container with `./docker/build-claude-container.sh --no-cache`
3. Run full test suite
4. Update documentation as needed
5. Test integration with MCP spawner tool

## License

This container system is part of ClaudeCluster and is licensed under the MIT License.