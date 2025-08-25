# ClaudeCluster Project Overview

## Purpose
ClaudeCluster is an open-source orchestration framework that transforms Claude Code into a scalable coding cluster. It uses a Driver-Worker architecture where a single Driver coordinates multiple Worker instances running in parallel, distributing coding tasks and aggregating results.

## Tech Stack
- **Language**: TypeScript (strict mode)
- **Package Manager**: pnpm (>=8.0.0) with workspaces
- **Build System**: Turbo for build orchestration
- **Testing**: Jest with ts-jest
- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier
- **Git Hooks**: Husky with lint-staged
- **Containerization**: Docker with Docker Compose
- **Cloud**: Google Cloud Run deployment scripts

## Architecture
Monorepo structure with packages:
- `packages/core` - Core types, interfaces, base classes
- `packages/driver` - Driver orchestration and task management
- `packages/worker` - Worker implementation for executing tasks
- `packages/shared` - Shared utilities and configurations
- `packages/mcp` - MCP server for Claude Code integration
- `packages/cli` - Command-line interface

## Current Status
Active development with core implementation and comprehensive testing framework. The project is in pre-release status with APIs evolving.