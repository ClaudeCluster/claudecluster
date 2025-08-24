# End-to-End Cloud Testing Scenarios

This document defines comprehensive test scenarios for validating ClaudeCluster deployment on Google Cloud Run.

## Test Overview

### Scope

The end-to-end tests validate:

- **Complete User Flows** - From CLI submission to task completion
- **Real-time Streaming** - SSE event delivery and output streaming  
- **Error Handling** - Failure scenarios and recovery mechanisms
- **Resource Management** - Session lifecycle and cleanup
- **Performance** - Response times and throughput under load
- **Resilience** - Network failures and container restarts

### Test Environment

- **MCP Server**: Deployed on Google Cloud Run
- **Workers**: One or more workers on Google Cloud Run
- **CLI Client**: Local machine or CI/CD environment
- **Network**: Public internet with simulated failure conditions

### Prerequisites

1. Cloud services deployed and healthy
2. CLI configured with cloud MCP server URL
3. Test environment variables set
4. Monitoring tools available

## Test Categories

### 1. Smoke Tests (Critical)

These tests verify basic functionality and run on every deployment.

#### 1.1 Service Health Verification

**Scenario**: Verify all cloud services are healthy and reachable

**Test Steps**:
1. Check MCP server health endpoint
2. Verify worker health endpoints
3. Confirm MCP can reach workers
4. Validate configuration is loaded correctly

**Expected Results**:
- MCP `/health` returns `200` with `status: "healthy"`
- All workers return `200` with `status: "available"`
- MCP reports all workers as available
- No configuration errors in logs

**Automation**: `tests/e2e/smoke/health.test.js`

#### 1.2 Basic Task Submission

**Scenario**: Submit simple task and verify completion

**Test Steps**:
1. Submit echo task via CLI
2. Verify task is accepted and assigned to worker
3. Confirm task completes successfully
4. Validate output matches expected result

**CLI Command**:
```bash
pnpm run cli run "echo 'Hello Cloud Run'" --server $MCP_URL --json
```

**Expected Results**:
- Task submitted successfully (`200` response)
- Task assigned to available worker
- Output contains "Hello Cloud Run"
- No errors in task execution

**Automation**: `tests/e2e/smoke/basic-task.test.js`

### 2. User Flow Tests (High Priority)

#### 2.1 Simple Coding Task Flow

**Scenario**: End-to-end coding task execution

**Test Steps**:
1. Submit coding task: "Create a Python function to calculate factorial"
2. Monitor task progress via streaming
3. Verify code generation completes
4. Validate generated code syntax
5. Confirm proper task cleanup

**CLI Command**:
```bash
pnpm run cli run "Create a Python function to calculate factorial" --server $MCP_URL --verbose
```

**Expected Results**:
- Task accepted and queued
- Real-time progress updates received
- Generated Python code is syntactically valid
- Function correctly calculates factorial
- Resources cleaned up after completion

**Automation**: `tests/e2e/user-flows/coding-task.test.js`

#### 2.2 Multi-Step Task Flow

**Scenario**: Complex task requiring multiple steps

**Test Steps**:
1. Submit multi-step task: "Create a REST API with authentication and data validation"
2. Monitor extended execution time
3. Verify intermediate progress updates
4. Confirm all components are generated
5. Validate proper error handling

**Expected Results**:
- Task handles extended execution (>5 minutes)
- Progress updates throughout execution
- All API components generated
- Error handling code included
- Complete within timeout limits

**Automation**: `tests/e2e/user-flows/multi-step-task.test.js`

#### 2.3 File Operation Task Flow

**Scenario**: Task involving file creation and manipulation

**Test Steps**:
1. Submit file-based task: "Create a README.md and package.json for a Node.js project"
2. Verify file creation operations
3. Confirm file content quality
4. Validate project structure
5. Check workspace cleanup

**Expected Results**:
- Files created with correct names
- Content meets requirements
- Project structure is valid
- Workspace properly cleaned up

**Automation**: `tests/e2e/user-flows/file-operations.test.js`

### 3. Streaming and Real-time Tests

#### 3.1 SSE Event Delivery

**Scenario**: Validate Server-Sent Events streaming

**Test Steps**:
1. Submit long-running task
2. Connect to SSE stream endpoint
3. Verify event delivery sequence
4. Confirm event format and timing
5. Test connection resilience

**SSE Events to Validate**:
- `task-started` - Task execution begins
- `progress` - Progress updates during execution  
- `output` - Incremental output chunks
- `task-completed` - Task execution completes
- `heartbeat` - Keep-alive signals

**Expected Results**:
- All events received in correct order
- No missing or duplicate events
- Proper JSON formatting
- Timestamps are accurate
- Connection remains stable

**Automation**: `tests/e2e/streaming/sse-events.test.js`

#### 3.2 Output Streaming Validation

**Scenario**: Verify real-time output streaming

**Test Steps**:
1. Submit task with incremental output: "Count from 1 to 100 with 1-second delays"
2. Monitor output streaming
3. Verify output chunks arrive in real-time
4. Confirm correct ordering
5. Test stream completion

**Expected Results**:
- Output chunks received as generated
- No buffering delays (< 2 second latency)
- Correct numerical sequence
- Stream properly terminated
- No data loss or corruption

**Automation**: `tests/e2e/streaming/output-streaming.test.js`

### 4. Error Handling Tests

#### 4.1 Invalid Task Submission

**Scenario**: Handle malformed or invalid task requests

**Test Cases**:
- Empty prompt
- Extremely long prompt (>1MB)
- Invalid JSON format
- Missing required fields
- Invalid priority values

**Expected Results**:
- Appropriate HTTP error codes (`400`, `413`, etc.)
- Descriptive error messages
- No server crashes or hangs
- Proper error logging
- Client receives actionable feedback

**Automation**: `tests/e2e/errors/invalid-requests.test.js`

#### 4.2 Worker Unavailability

**Scenario**: Handle scenarios when no workers are available

**Test Steps**:
1. Stop all worker services temporarily
2. Submit task to MCP server
3. Verify appropriate error handling
4. Restart workers
5. Confirm system recovery

**Expected Results**:
- MCP returns `503 Service Unavailable`
- Clear error message about worker availability
- Task not lost (queued if possible)
- System recovers when workers return
- No memory leaks during outage

**Automation**: `tests/e2e/errors/worker-unavailable.test.js`

#### 4.3 Task Timeout Handling

**Scenario**: Validate timeout mechanisms

**Test Steps**:
1. Submit task that exceeds timeout: "Sleep for 2 hours"
2. Wait for timeout period
3. Verify task is terminated
4. Confirm resources are cleaned up
5. Check worker becomes available again

**Expected Results**:
- Task terminated at timeout limit
- Client receives timeout error
- Worker resources released
- Worker returns to available state
- No zombie processes remain

**Automation**: `tests/e2e/errors/task-timeout.test.js`

### 5. Performance Tests

#### 5.1 Cold Start Performance

**Scenario**: Measure Cloud Run cold start impact

**Test Steps**:
1. Ensure all services are scaled to zero
2. Submit task to trigger cold start
3. Measure response times
4. Submit subsequent tasks
5. Compare warm vs cold performance

**Performance Targets**:
- Cold start < 30 seconds
- Warm requests < 5 seconds
- 95th percentile < 10 seconds
- No timeouts during cold start
- Consistent performance after warmup

**Automation**: `tests/e2e/performance/cold-start.test.js`

#### 5.2 Concurrent Task Handling

**Scenario**: Validate concurrent task processing

**Test Steps**:
1. Submit 10 tasks simultaneously
2. Monitor task distribution across workers
3. Verify concurrent processing
4. Check for resource contention
5. Confirm all tasks complete

**Expected Results**:
- Tasks distributed across available workers
- No significant performance degradation
- All tasks complete successfully
- No resource contention issues
- Proper load balancing

**Automation**: `tests/e2e/performance/concurrent-tasks.test.js`

### 6. Resilience Tests

#### 6.1 Network Failure Simulation

**Scenario**: Test behavior during network disruptions

**Test Steps**:
1. Start long-running task
2. Simulate network interruption using `tc` or proxy
3. Restore network connectivity
4. Verify task recovery or appropriate failure
5. Check system stability

**Network Simulation**:
```bash
# Simulate 5-second network outage
sudo tc qdisc add dev eth0 root netem loss 100%
sleep 5
sudo tc qdisc del dev eth0 root
```

**Expected Results**:
- Graceful handling of network failures
- Appropriate retry mechanisms
- Task recovery when possible
- Clean failure reporting when not recoverable
- No resource leaks after failure

**Automation**: `tests/e2e/resilience/network-failure.test.js`

#### 6.2 Container Restart Simulation

**Scenario**: Validate behavior during container restarts

**Test Steps**:
1. Submit task to specific worker
2. Restart worker container during execution
3. Verify task failure handling
4. Confirm MCP detects worker restart
5. Validate system recovery

**Container Restart Commands**:
```bash
# Restart specific worker
gcloud run services update claudecluster-worker-dev \
    --region=$REGION --project=$PROJECT_ID

# Monitor service restart
gcloud run revisions list --service=claudecluster-worker-dev
```

**Expected Results**:
- MCP detects worker unavailability
- Task failure reported appropriately
- Worker re-registration after restart
- No system-wide impact
- Health checks detect recovery

**Automation**: `tests/e2e/resilience/container-restart.test.js`

### 7. Resource Management Tests

#### 7.1 Session Lifecycle Validation

**Scenario**: Verify proper session management

**Test Steps**:
1. Submit task and track session creation
2. Monitor session state throughout execution
3. Verify session cleanup after completion
4. Check for session leaks with multiple tasks
5. Validate connection pooling

**Session Tracking**:
- Connection establishment logs
- Session ID assignment
- Resource allocation
- Cleanup timestamps
- Memory usage patterns

**Expected Results**:
- Sessions created and tracked properly
- Resources allocated as needed
- Clean session termination
- No session leaks over time
- Efficient connection reuse

**Automation**: `tests/e2e/resources/session-lifecycle.test.js`

#### 7.2 Memory and Resource Cleanup

**Scenario**: Ensure proper resource deallocation

**Test Steps**:
1. Baseline memory usage measurements
2. Execute multiple tasks sequentially
3. Monitor memory usage throughout
4. Verify garbage collection effectiveness
5. Check for resource leaks

**Resource Monitoring**:
```bash
# Monitor Cloud Run metrics
gcloud monitoring metrics list --project=$PROJECT_ID
gcloud monitoring metrics list --filter="metric.type:run.googleapis.com/container/*"
```

**Expected Results**:
- Memory usage returns to baseline
- No persistent memory leaks
- File handles properly closed
- Process cleanup after tasks
- CPU usage drops when idle

**Automation**: `tests/e2e/resources/memory-cleanup.test.js`

### 8. Configuration and Deployment Tests

#### 8.1 Environment Configuration Validation

**Scenario**: Verify configuration across environments

**Test Cases**:
- Development environment settings
- Staging environment configuration
- Production environment validation
- Cross-environment compatibility

**Configuration Aspects**:
- Worker endpoint discovery
- Timeout settings
- Resource limits
- Logging configuration
- Security settings

**Expected Results**:
- Each environment has correct configuration
- No hardcoded values in wrong environments
- Proper secret management
- Appropriate resource allocation
- Correct logging levels

**Automation**: `tests/e2e/config/environment-validation.test.js`

### 9. Integration Tests

#### 9.1 CLI-MCP-Worker Integration

**Scenario**: Full integration across all components

**Test Steps**:
1. CLI submits task to MCP server
2. MCP routes task to worker
3. Worker processes task with Claude CLI
4. Results streamed back through MCP to CLI
5. Verify end-to-end data flow

**Data Flow Validation**:
- Request/response headers
- JSON payload integrity
- Authentication tokens
- Error propagation
- Performance metrics

**Expected Results**:
- Complete data flow integrity
- Proper authentication throughout
- No data corruption or loss
- Appropriate error handling
- Performance within targets

**Automation**: `tests/e2e/integration/full-stack.test.js`

## Test Data and Scenarios

### Test Prompt Categories

#### Simple Tasks
- "echo 'hello world'"
- "date"
- "whoami"
- "pwd"

#### Coding Tasks
- "Create a Python function to sort a list"
- "Write a JavaScript async/await example"
- "Generate a SQL query to find top customers"

#### Complex Tasks
- "Create a REST API with authentication"
- "Build a React component with state management"
- "Design a database schema for an e-commerce site"

#### Error-Inducing Tasks
- "run_non_existent_command"
- "access_forbidden_file"
- "infinite_loop_without_timeout"

### Expected Response Patterns

#### Success Response
```json
{
  "success": true,
  "taskId": "task-12345",
  "status": "completed",
  "output": "expected output content",
  "duration": 5000,
  "worker": "worker-1"
}
```

#### Error Response
```json
{
  "success": false,
  "taskId": "task-12345",
  "error": "error type",
  "message": "descriptive error message",
  "details": "additional error context"
}
```

## Test Automation Framework

### Tools and Technologies

- **Jest** - Test runner and assertion framework
- **Puppeteer** - Browser automation (if needed)
- **Axios** - HTTP client for API testing
- **EventSource** - SSE client for streaming tests
- **Docker** - Container manipulation for resilience tests
- **gcloud CLI** - Cloud Run service management

### Test Structure

```
tests/
├── e2e/
│   ├── smoke/              # Critical smoke tests
│   ├── user-flows/         # End-to-end user scenarios
│   ├── streaming/          # Real-time streaming tests
│   ├── errors/             # Error handling tests
│   ├── performance/        # Performance benchmarks
│   ├── resilience/         # Failure simulation tests
│   ├── resources/          # Resource management tests
│   ├── config/             # Configuration tests
│   ├── integration/        # Cross-component integration
│   ├── utils/              # Test utilities and helpers
│   └── fixtures/           # Test data and mocks
```

### Test Configuration

#### Environment Variables
```bash
# Test configuration
export TEST_MCP_SERVER_URL="https://mcp-server-url"
export TEST_WORKER_URLS="https://worker1,https://worker2"
export TEST_TIMEOUT_MS=300000
export TEST_ENVIRONMENT="dev|staging|prod"
export GOOGLE_CLOUD_PROJECT="test-project"
export GOOGLE_CLOUD_REGION="us-central1"
```

#### Test Timeouts
- Smoke tests: 30 seconds
- User flows: 5 minutes
- Performance tests: 10 minutes
- Resilience tests: 15 minutes

## Success Criteria

### Pass/Fail Thresholds

#### Functional Tests
- **Pass Rate**: ≥95% of functional tests pass
- **No Critical Failures**: Zero failures in smoke tests
- **Error Handling**: All error scenarios handled gracefully

#### Performance Tests
- **Response Time**: 95th percentile <10 seconds
- **Cold Start**: <30 seconds
- **Throughput**: ≥10 concurrent tasks
- **Resource Usage**: Memory growth <10% per hour

#### Resilience Tests
- **Recovery Time**: <60 seconds after failure
- **Data Integrity**: No data loss during failures
- **Graceful Degradation**: System remains stable during partial outages

## Test Execution Schedule

### Pre-Deployment (CI/CD)
- Smoke tests only (fast feedback)
- Duration: <5 minutes

### Post-Deployment
- Full test suite execution
- Duration: 30-60 minutes

### Nightly
- Extended performance tests
- Resilience testing
- Duration: 2-4 hours

### Weekly
- Comprehensive integration tests
- Load testing
- Security validation
- Duration: 4-8 hours

## Reporting and Documentation

### Test Results Format
- JUnit XML for CI/CD integration
- HTML reports for human review
- JSON data for metric collection
- Screenshots/videos for failures

### Metrics Collection
- Test execution time trends
- Failure rate analysis
- Performance regression detection
- Resource usage patterns

### Issue Tracking
- Link test failures to bug reports
- Track resolution status
- Regression testing requirements
- Documentation of workarounds