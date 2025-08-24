# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClaudeCluster is an open-source orchestration framework that transforms Claude Code into a scalable coding cluster. The system uses a Driver-Worker architecture where a single Driver coordinates multiple Worker instances running in parallel, distributing coding tasks and aggregating results.

**Current Status**: Active development with core implementation and comprehensive testing framework.

## Architecture

### Monorepo Structure
This is a TypeScript monorepo using pnpm workspaces, Turbo build system, and Nx for task execution:

```
packages/
├── core/           # Core types, interfaces, and base classes
├── driver/         # Driver orchestration and task management  
├── worker/         # Worker implementation for executing tasks
├── shared/         # Shared utilities and configurations
├── mcp/           # MCP server for Claude Code integration
└── cli/           # Command-line interface

tools/
├── taskmaster/    # Task management dashboard and MCP server
├── cli/           # CLI tools and utilities
└── setup/         # Project setup and configuration scripts

apps/ (planned)    # Future web and desktop applications
```

### Core Components

- **Driver**: Orchestrates task execution across multiple workers
- **Worker**: Executes isolated Claude Code sessions for specific tasks
- **Task**: Well-scoped unit of work with dependencies and artifacts
- **MCP Server**: Coordinates communication between Driver and Workers
- **Orchestrator**: Manages task scheduling and resource allocation

## Essential Commands

### Development Workflow
```bash
# Install dependencies (uses pnpm workspaces)
pnpm install

# Build all packages
pnpm build
# or with turbo directly
turbo build

# Start development mode (watch builds)
pnpm dev

# Run tests across all packages
pnpm test

# Run tests with coverage
pnpm test:coverage

# Lint and format code
pnpm lint
pnpm lint:fix
pnpm format

# Type checking
pnpm types:check
```

### Package-Specific Development
```bash
# Work on core package
pnpm --filter @claudecluster/core build
pnpm --filter @claudecluster/core test
pnpm --filter @claudecluster/core dev

# Work on worker package  
pnpm --filter @claudecluster/worker build
pnpm --filter @claudecluster/worker start
pnpm --filter @claudecluster/worker dev

# Work on driver package
pnpm --filter @claudecluster/driver dev
```

### Docker Development
```bash
# Start full ClaudeCluster stack
pnpm docker:up

# Build Docker images
pnpm docker:build

# View logs and status
pnpm docker:logs
pnpm docker:status

# Stop and clean up
pnpm docker:down
pnpm docker:clean

# Health checks
pnpm docker:health
pnpm docker:env-check
```

### Testing
```bash
# Unit tests
pnpm test

# E2E tests (multiple suites available)
pnpm test:e2e:smoke
pnpm test:e2e:integration  
pnpm test:e2e:resilience
pnpm test:e2e:performance
pnpm test:e2e:all

# Local vs Cloud testing
pnpm test:e2e:local
pnpm test:e2e:cloud
```

### Task Master AI Integration
```bash
# Start Task Master dashboard
pnpm taskmaster

# Task Master development mode
pnpm taskmaster:dev

# CLI interface
pnpm cli
```

## Architecture Details

### Build System
- **Turbo**: Handles build orchestration with intelligent caching and parallelization
- **TypeScript**: All packages use composite TypeScript projects with shared base config
- **Package Dependencies**: Uses workspace protocol (`workspace:*`) for internal dependencies
- **Build Pipeline**: Each package has `build`, `dev`, `test`, `lint`, `format` tasks

### Core Package Types
The `@claudecluster/core` package defines the foundational types:
- `Task`, `TaskStatus`, `TaskResult`, `TaskPriority`, `TaskCategory`
- `Worker`, `WorkerStatus`, `Driver`, `DriverStatus`
- `OrchestrationConfig` for system configuration

### Worker Implementation
Workers (`@claudecluster/worker`) use:
- **Fastify** for HTTP API
- **node-pty** for Claude Code process execution
- **Pino** for structured logging
- **Zod** for request validation
- Health check endpoints and task execution APIs

### Docker Architecture
Production deployment uses multi-service Docker Compose:
- **MCP Server**: Coordinates task routing (port 3000)
- **Workers**: Execute tasks in parallel (ports 3001, 3002)
- **Networks**: Isolated `claudecluster-network` for internal communication
- **Volumes**: Persistent storage for logs, auth, and workspaces

## Key Development Patterns

### TypeScript Configuration
- Base config in `tsconfig.base.json` with strict settings
- Composite projects for incremental compilation
- Shared build outputs in `dist/` directories

### Workspace Dependencies
```json
{
  "dependencies": {
    "@claudecluster/core": "workspace:*",
    "@claudecluster/shared": "workspace:*"
  }
}
```

### Testing Strategy
- **Jest** for unit testing with ts-jest
- **E2E testing** with multiple suites (smoke, integration, resilience, performance)
- **Docker testing** with health validation scripts
- **Coverage reporting** with Codecov integration

### Code Quality
- **ESLint** with TypeScript support and strict rules
- **Prettier** for consistent code formatting  
- **Husky** git hooks with lint-staged for pre-commit validation
- **Commitlint** enforcing conventional commit format

### Cloud Deployment
Scripts for Google Cloud Run deployment:
```bash
# Deploy worker instances
pnpm cloud:deploy-worker-dev
pnpm cloud:deploy-worker-staging  
pnpm cloud:deploy-worker-prod

# Deploy MCP server
pnpm cloud:deploy-mcp-dev
pnpm cloud:deploy-mcp-staging
pnpm cloud:deploy-mcp-prod
```

## Demo and Testing

The repository includes functional demo servers:
- `demo-mcp-server.js` - Mock MCP coordination server
- `demo-worker.js` - Mock worker with code generation simulation
- `demo-docker-compose.yml` - Simplified Docker setup for testing

These demonstrate the full ClaudeCluster workflow with task submission, worker assignment, parallel execution, and result aggregation.

## Development Requirements

- **Node.js**: >=18.0.0
- **pnpm**: >=8.0.0 (required, not npm/yarn)
- **Docker**: For containerized development and testing
- **TypeScript**: >=5.0.0

## Task Master AI Instructions

**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md