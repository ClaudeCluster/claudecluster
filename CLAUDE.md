# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClaudeCluster is an open-source orchestration framework that transforms Claude Code into a scalable coding cluster. The system uses a Driver-Worker architecture where a single Driver coordinates multiple Worker instances running in parallel, distributing coding tasks and aggregating results.

**Current Status**: Pre-release (design + prototyping phase). No code implementation exists yet.

## Architecture

### Core Components
- **Driver**: Receives high-level goals, plans task graphs, and orchestrates execution
- **Worker**: Runs isolated Claude Code sessions to execute specific tasks  
- **Task**: Well-scoped unit of work (scaffolding, refactoring, testing, documentation)
- **Artifacts**: Outputs from tasks (diffs, files, logs, test results) captured by Driver

### Planned Runners
- Local process-based runner
- Docker runner  
- Kubernetes runner

## Development Status

This repository is in early design phase with:
- Core documentation (README.md, CONTRIBUTING.md)
- Apache 2.0 license (LICENSE, NOTICE)
- Multi-language .gitignore prepared for future implementations
- MCP (Model Context Protocol) configuration for development tooling

## Key Files

- `README.md`: Project overview, architecture diagrams, roadmap
- `CONTRIBUTING.md`: Contribution guidelines with DCO requirements, conventional commits
- `.mcp.json`: Extensive MCP server configuration for development tooling
- `.env.mcp`: Environment variables for MCP servers (contains sensitive data)

## Contributing Guidelines

From CONTRIBUTING.md:
- Use Developer Certificate of Origin (DCO) - sign commits with `git commit -s`
- Follow conventional commit format: `feat(scope):`, `fix(scope):`, `docs(scope):`, etc.
- Open Issues for discussion before major changes
- Use RFC Issues for significant design decisions

## Planned Technology Stack

Based on README roadmap:
- CLI tool: `claudecluster`
- SDKs: TypeScript and Python planned
- Observability: OpenTelemetry integration
- Git integrations: PR creation, review summaries
- Artifact storage: Files, diffs, test reports
- Web dashboard: Live logs, task graphs, artifacts

## Development Environment

The project includes comprehensive MCP server configuration for:
- File system operations
- Git operations  
- GitHub integration
- Code analysis (Semgrep)
- Documentation access
- Memory banking
- Sequential thinking tools

## Current Limitations

- No source code implementation yet
- No build/test commands available
- No package managers (npm, pip, cargo, etc.) configured
- Primary development currently focused on design and documentation