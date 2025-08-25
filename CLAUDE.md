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

## Real Implementation Plan - Production TypeScript System

**Phase Transition:** From Mock Implementation → Production-Ready System  
**See:** `docs/PRD.md` for complete detailed task breakdown

### Quick Start Implementation
```bash
# 1. Set up workspace dependencies
pnpm install

# 2. Start with core foundation
pnpm --filter @claudecluster/core dev

# 3. Build shared utilities in parallel  
pnpm --filter @claudecluster/shared dev

# 4. Progressive package development
pnpm build  # Build all completed packages
pnpm test   # Run all tests
```

### 8-Week Implementation Roadmap

#### **Phase 1: Core Foundation (Weeks 1-2)**
**Focus:** Types, interfaces, and shared utilities

**Week 1 - Core Types & Validation**
- `@claudecluster/core` - Foundational TypeScript types
  - Task system: `Task`, `TaskStatus`, `TaskResult`, `TaskPriority`, `TaskCategory`
  - Worker management: `Worker`, `WorkerStatus`, `WorkerCapabilities`
  - Driver orchestration: `Driver`, `DriverStatus`, `TaskGraph`
  - Communication: `Message`, `Command`, `Event` interfaces
  - Error handling with custom error classes and Zod schemas

- `@claudecluster/shared` - Essential utilities
  - Configuration management with environment validation
  - Pino structured logging framework
  - EventEmitter2 for typed event handling
  - Health check and monitoring utilities
  - Security and validation helpers

**Commands:**
```bash
pnpm --filter @claudecluster/core build test
pnpm --filter @claudecluster/shared build test
```

#### **Phase 2: Worker Implementation (Weeks 2-3)**
**Focus:** Claude Code process execution and task management

**Week 3 - Process Management**
- Claude Code process spawning with node-pty
- Task execution engine with isolation
- Stream-based progress reporting
- Resource monitoring and limits

**Week 4 - HTTP API & Security**
- Fastify server with REST endpoints
- WebSocket streaming for real-time updates
- Security sandboxing and audit logging
- Resource usage metrics and health checks

**Commands:**
```bash
pnpm --filter @claudecluster/worker build test start
```

#### **Phase 3: Driver Implementation (Weeks 3-4)**
**Focus:** Task orchestration and intelligent coordination

**Week 5 - Core Orchestration**
- Task planning with complexity analysis
- Worker pool management and load balancing
- Dependency resolution with topological sorting
- Progress aggregation and reporting

**Week 6 - Advanced Features**
- Result merging and conflict resolution
- WebSocket communication for real-time updates
- Persistence and crash recovery
- Performance optimization and caching

**Commands:**
```bash
pnpm --filter @claudecluster/driver build test dev
```

#### **Phase 4: MCP Server (Week 7)**
**Focus:** Production MCP protocol implementation

- Model Context Protocol compliance
- Claude API integration and authentication
- Request routing and load balancing
- WebSocket and HTTP endpoint implementation

**Commands:**
```bash
pnpm --filter @claudecluster/mcp build test start
```

#### **Phase 5: CLI Interface (Week 8)**
**Focus:** User interface and CI/CD integration

- Commander.js CLI framework
- Interactive prompts and progress visualization
- Configuration management and validation
- Export formats and CI/CD pipeline support

**Commands:**
```bash
pnpm --filter @claudecluster/cli build test
claudecluster --help
```

### Implementation Priority

**Immediate Next Steps (Start Week 1):**
1. **Dependencies Setup:** `pnpm install` - Initialize workspace
2. **Core Package:** Implement foundational types in `@claudecluster/core`
3. **Shared Utilities:** Build configuration and logging in `@claudecluster/shared`
4. **Integration Testing:** Verify packages work together

**Development Workflow:**
```bash
# Daily development cycle
pnpm build     # Build all packages
pnpm test      # Run comprehensive test suite
pnpm lint      # Code quality checks
pnpm types:check  # TypeScript validation
```

### Quality Standards & Validation

**Mandatory Requirements:**
- **TypeScript:** Strict mode with 100% type coverage
- **Testing:** >90% coverage with Jest + comprehensive E2E tests
- **Documentation:** Complete JSDoc + auto-generated API docs
- **Security:** OWASP compliance, dependency scanning, audit logging
- **Performance:** Benchmarking and load testing at scale

**Integration Checkpoints:**
- End of each week: Package integration tests
- End of each phase: Full system integration tests
- Continuous: Security scanning and performance monitoring

### Architecture Validation

**Current Foundation (Completed):**
✅ Mock implementation proving architecture viability
✅ Docker orchestration and deployment scripts
✅ TypeScript monorepo with pnpm workspaces
✅ Comprehensive development tooling

**Target Production System:**
🎯 Real Claude Code process execution
🎯 Intelligent task decomposition and scheduling
🎯 Enterprise-grade monitoring and observability
🎯 CLI and programmatic interfaces for all use cases

## Demo and Testing

The repository includes functional demo servers that validate the architecture:
- `demo-mcp-server.js` - Mock MCP coordination server
- `demo-worker.js` - Mock worker with code generation simulation
- `demo-docker-compose.yml` - Multi-service Docker orchestration

These demonstrate the full ClaudeCluster workflow and serve as integration targets for the real implementation.

## Development Requirements

- **Node.js**: >=18.0.0
- **pnpm**: >=8.0.0 (required, not npm/yarn)
- **Docker**: For containerized development and testing
- **TypeScript**: >=5.0.0

## Task Master AI Instructions

**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md