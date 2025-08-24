# PTY and SSE Integration Guide

This document outlines the modular architecture prepared for PTY (pseudo-terminal) and SSE (Server-Sent Events) integration in future phases.

## Architecture Overview

The worker is structured with pluggable components to allow easy replacement of stub implementations with full PTY/SSE functionality:

```
TaskExecutionService
├── ITaskExecutor (pluggable execution strategy)
│   ├── StubTaskExecutor (Phase 0 - current)
│   └── PTYTaskExecutor (Phase 1 - future)
├── IStreamingService (pluggable streaming strategy)
│   ├── StubStreamingService (Phase 0 - current)
│   └── SSEStreamingService (Phase 1 - future)
└── IProcessManager (future - for PTY process management)
```

## Integration Points

### 1. Task Execution (PTY Integration)

**Current Implementation**: `StubTaskExecutor`
- Simulates task execution with progress updates
- Returns mock output for testing

**Future Implementation**: `PTYTaskExecutor`
- Spawn Claude Code CLI in pseudo-terminal
- Stream real-time output from PTY
- Handle process lifecycle (start, monitor, cleanup)

**Integration Steps**:
1. Create `PTYTaskExecutor` implementing `ITaskExecutor`
2. Use `node-pty` to spawn Claude CLI processes  
3. Replace stub executor: `service.setTaskExecutor(new PTYTaskExecutor())`

### 2. Streaming (SSE Integration)

**Current Implementation**: `StubStreamingService`
- Logs events to console for debugging
- Maintains event history for inspection

**Future Implementation**: `SSEStreamingService`
- Create Fastify SSE endpoints (`GET /stream/:taskId`)
- Stream real-time events to connected clients
- Handle client connection lifecycle

**Integration Steps**:
1. Add `fastify-sse-v2` plugin to server
2. Create `SSEStreamingService` implementing `IStreamingService`
3. Replace stub service: `service.setStreamingService(new SSEStreamingService())`
4. Add streaming endpoint to server routes

### 3. Process Management (Future)

**Interface**: `IProcessManager`
- Process spawning and lifecycle management
- Resource cleanup and monitoring
- Integration with health service

## Key Files and Interfaces

### Core Interfaces (`interfaces.ts`)
- `ITaskExecutor` - Pluggable task execution strategies
- `IStreamingService` - Pluggable streaming implementations  
- `IProcessManager` - Future process management interface
- Supporting types: `TaskResult`, `StreamEvent`, etc.

### Executor Implementations
- `executors/base-executor.ts` - Base class with common functionality
- `executors/stub-executor.ts` - Phase 0 stub implementation
- `executors/pty-executor.ts` - Future PTY implementation

### Streaming Implementations  
- `streaming/stub-streaming.ts` - Phase 0 stub implementation
- `streaming/sse-streaming.ts` - Future SSE implementation

### Main Service
- `execution.ts` - Orchestrates executor and streaming services
- Provides swap methods for changing implementations
- Handles task lifecycle and health integration

## Server Integration

The `WorkerServer` class is prepared for SSE endpoints:

```typescript
// Future SSE endpoint
this.app.get('/stream/:taskId', async (request, reply) => {
  const { taskId } = request.params;
  // Stream events for specific task
});
```

## Environment Variables

Prepare configuration for PTY/SSE features:

```bash
# PTY Configuration
CLAUDE_CLI_PATH=/path/to/claude-cli
PTY_TIMEOUT_MS=300000
PTY_MAX_PROCESSES=5

# SSE Configuration  
SSE_KEEPALIVE_INTERVAL=30000
SSE_MAX_CONNECTIONS=100
```

## Testing Strategy

### Phase 0 (Current)
- Stub implementations provide predictable behavior
- Events logged for verification
- Health metrics properly updated

### Phase 1 (PTY/SSE)
- Integration tests with real Claude CLI
- SSE connection handling tests
- Process cleanup and resource management tests
- Error handling and recovery tests

## Migration Path

1. **Phase 0 → Phase 1**: Replace stub implementations
   - No changes to TaskExecutionService interface
   - Server routes remain compatible
   - Health service integration preserved

2. **Testing**: Swap implementations for A/B testing
3. **Rollback**: Keep stub implementations as fallback

This modular design ensures smooth transition from stub to full implementation while maintaining API compatibility and system reliability.