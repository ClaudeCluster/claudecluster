# ClaudeCluster End-to-End Testing

This directory contains comprehensive end-to-end (E2E) tests for the ClaudeCluster system, validating the complete workflow from CLI submission through MCP server orchestration to worker execution.

## Test Structure

### Test Categories

```
tests/e2e/
├── smoke/              # Critical functionality smoke tests
│   ├── health.test.js         # Service health verification
│   └── basic-task.test.js     # Basic task submission
├── integration/        # Full system integration tests
│   └── full-stack.test.js     # Complete workflow testing
├── resilience/         # System resilience and failure recovery
│   ├── failure-simulation.test.js  # Network failures, timeouts
│   └── chaos-testing.test.js       # Edge cases and chaos scenarios
├── performance/        # Performance benchmarking
│   └── benchmarking.test.js        # Throughput, latency, scaling
└── utils/              # Test utilities and helpers
    ├── test-client.js          # HTTP, CLI, and SSE test client
    ├── test-utils.js           # Common test utilities
    ├── setup.js                # Test environment setup
    ├── global-setup.js         # Jest global setup
    └── global-teardown.js      # Jest global teardown
```

### Test Execution Methods

1. **HTTP API Testing**: Direct REST API calls to MCP server
2. **CLI Testing**: Full command-line interface testing via spawned processes
3. **SSE Streaming**: Server-Sent Events for real-time task monitoring
4. **Health Checks**: Service availability and readiness validation

## Quick Start

### Local Testing

```bash
# Start local services
pnpm run docker:up

# Run smoke tests (fastest)
pnpm run test:e2e:smoke

# Run all test suites
pnpm run test:e2e:all
```

### Cloud Testing

```bash
# Test against deployed cloud services
pnpm run test:e2e:cloud --server-url=https://your-mcp-server.run.app
```

### CI/CD Testing

```bash
# Run with JUnit reports for CI
pnpm run test:e2e:ci
```

## Test Execution Script

The main test runner `scripts/test-e2e.sh` supports various execution modes:

```bash
# Basic usage
./scripts/test-e2e.sh [OPTIONS]

# Common examples
./scripts/test-e2e.sh --local --test-suite=smoke
./scripts/test-e2e.sh --cloud --server-url=https://... --test-suite=all
./scripts/test-e2e.sh --ci --junit --timeout=600
```

### Script Options

- `-s, --server-url`: MCP server URL
- `-w, --worker-urls`: Comma-separated worker URLs  
- `-t, --test-suite`: Test suite (smoke, integration, resilience, performance, all)
- `--local`: Test against local Docker services
- `--cloud`: Test against cloud deployment
- `--ci`: CI mode with JUnit reporting
- `--verbose`: Enable verbose logging
- `--timeout`: Test timeout in seconds
- `--parallel-workers`: Number of parallel Jest workers

## Environment Configuration

### Required Environment Variables

```bash
# MCP server endpoint
export TEST_MCP_SERVER_URL="http://localhost:3000"

# Worker endpoints (optional)
export TEST_WORKER_URLS="http://localhost:3001,http://localhost:3002"

# Test configuration
export TEST_VERBOSE="false"
export TEST_TIMEOUT="300"
```

### Local Docker Setup

The tests can automatically start and manage local Docker services:

```bash
# Auto-start services and run tests
pnpm run test:e2e:local

# Manual Docker management
pnpm run docker:up    # Start services
pnpm run docker:down  # Stop services
pnpm run docker:logs  # View logs
```

## Test Categories Deep Dive

### Smoke Tests (`smoke/`)

Critical functionality validation - these must pass for the system to be considered functional:

- **Health Checks**: MCP server and worker availability
- **Basic Task Submission**: Simple echo commands via HTTP and CLI
- **Response Validation**: Proper response structure and task ID generation
- **Worker Assignment**: Task distribution to available workers

### Integration Tests (`integration/`)

End-to-end workflow validation:

- **CLI-MCP-Worker Flow**: Complete task execution pipeline
- **Server-Sent Events**: Real-time task monitoring and streaming
- **Concurrent Tasks**: Multiple simultaneous task execution  
- **Data Integrity**: Input/output preservation through full pipeline
- **Error Propagation**: Error handling across system boundaries

### Resilience Tests (`resilience/`)

System robustness under adverse conditions:

- **Network Failures**: Connection timeouts, unreachable services
- **Service Degradation**: High load, partial worker failures
- **Error Recovery**: System stability after errors
- **Resource Cleanup**: Memory and connection management
- **Chaos Testing**: Random failures, edge cases, malformed inputs

### Performance Tests (`performance/`)

System performance characteristics:

- **Response Time Benchmarks**: Latency measurements and SLA validation
- **Throughput Testing**: Concurrent request handling capacity
- **Load Testing**: Sustained traffic and burst handling
- **Resource Utilization**: Memory usage monitoring
- **Scaling Validation**: Performance vs. worker count correlation

## Test Utilities

### TestClient (`utils/test-client.js`)

Comprehensive client for all testing scenarios:

```javascript
const { TestClient } = require('./utils/test-client');

const client = new TestClient({
  mcpServerUrl: 'http://localhost:3000',
  workerUrls: ['http://localhost:3001'],
  timeout: 30000
});

// HTTP API testing
const result = await client.submitTaskHTTP('echo hello');

// CLI testing  
const cliResult = await client.submitTaskCLI('echo hello', { json: true });

// SSE streaming
const streamResult = await client.submitTaskWithSSE('echo hello');

// Health checks
const health = await client.testMCPHealth();
const workerHealth = await client.testAllWorkersHealth();
```

### Skip Conditions

Tests automatically skip when required services aren't available:

```javascript
// Skip if MCP server not available
skipIfNoMCP(test)('should test MCP functionality', async () => {
  // Test code here
});

// Skip if no workers configured
skipIfNoWorkers(test)('should test worker functionality', async () => {
  // Test code here  
});
```

### Custom Jest Matchers

Extended Jest matchers for ClaudeCluster-specific assertions:

```javascript
expect(result).toBeSuccessfulTask();
expect(response).toBeHealthyResponse();
expect(result).toHaveValidSSEEvents();
```

## CI/CD Integration

### GitHub Actions

The `.github/workflows/e2e-tests.yml` workflow provides comprehensive CI testing:

- **Local Testing**: Docker-based testing on pull requests
- **Cloud Testing**: Testing against deployed cloud services
- **Matrix Testing**: Multiple Node.js versions and environments  
- **Scheduled Testing**: Daily smoke tests across all environments
- **Manual Triggers**: On-demand testing with configurable parameters

### Workflow Triggers

- **Pull Requests**: Smoke tests on `main` and `develop` branches
- **Pushes**: Full integration tests on protected branches  
- **Schedule**: Daily comprehensive testing
- **Manual**: Configurable test suite and deployment target

### Artifacts and Reporting

- **JUnit XML**: Test results in standard format
- **Test Logs**: Detailed execution logs for debugging
- **Coverage Reports**: Code coverage from test execution
- **Performance Metrics**: Benchmark results and timing data

## Local Development

### Running Individual Test Suites

```bash
# Smoke tests only (fastest feedback)
npm run test:e2e:smoke

# Integration tests
npm run test:e2e:integration  

# Resilience tests
npm run test:e2e:resilience

# Performance benchmarks
npm run test:e2e:performance
```

### Debug Mode

```bash
# Run with verbose logging
TEST_VERBOSE=true npm run test:e2e:smoke

# Run specific test file
npx jest tests/e2e/smoke/health.test.js --verbose

# Debug with Node debugger
node --inspect-brk node_modules/.bin/jest tests/e2e/smoke/
```

### Test Development

When adding new tests:

1. Use appropriate test category directory
2. Follow existing naming conventions  
3. Include skip conditions for missing services
4. Add timeout configurations for async operations
5. Use TestClient utilities for consistency
6. Include proper cleanup in test teardown

### Test Configuration

Jest configuration in `tests/e2e/jest.config.js`:

```javascript
module.exports = {
  testTimeout: 120000,           // 2 minute default timeout
  maxWorkers: 4,                 // Parallel execution
  testMatch: ['**/*.test.js'],   // Test file pattern
  globalSetup: './utils/global-setup.js',
  globalTeardown: './utils/global-teardown.js',
  reporters: ['default', 'jest-junit']
};
```

## Troubleshooting

### Common Issues

1. **Service Not Available**: Ensure Docker services are running or cloud URLs are correct
2. **Timeout Errors**: Increase timeout values for slower environments
3. **Port Conflicts**: Check for conflicting services on default ports (3000, 3001, 3002)
4. **Network Issues**: Verify firewall and network connectivity to test targets

### Debug Commands

```bash
# Check service health manually
curl -f http://localhost:3000/health

# View Docker service logs
docker compose logs mcp-server
docker compose logs claudecluster-worker-1

# Test CLI directly
node packages/cli/dist/index.js --server-url=http://localhost:3000 "echo test"

# Run minimal test
npx jest tests/e2e/smoke/health.test.js --verbose
```

### Performance Considerations

- Tests run in parallel by default (4 workers)
- Some tests include intentional delays for realistic timing
- Performance tests may take longer and consume more resources
- Cloud tests have higher timeouts due to network latency

## Contributing

When contributing to the E2E test suite:

1. **Test Coverage**: Ensure new features have corresponding E2E tests
2. **Test Categories**: Place tests in appropriate category directories
3. **Documentation**: Update this README for new test patterns or utilities
4. **CI Compatibility**: Ensure tests work in both local and CI environments
5. **Performance**: Consider test execution time and resource usage

### Test Standards

- Use descriptive test names explaining what's being validated
- Include both positive and negative test cases
- Add appropriate error handling and cleanup
- Follow existing patterns for consistency
- Include performance assertions where relevant