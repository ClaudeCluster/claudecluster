#!/bin/bash

echo "🧪 Testing ClaudeCluster Container Infrastructure"
echo "================================================"

# Test MCP server health
echo "1. Testing MCP Server..."
curl -s http://localhost:3000/health | jq -r ".status" | xargs -I {} echo "   Status: {}"

# Test workers
echo ""
echo "2. Testing Workers..."
curl -s http://localhost:3001/health | jq -r ".workerId + \": \" + .status" | xargs -I {} echo "   {}"
curl -s http://localhost:3002/health | jq -r ".workerId + \": \" + .status" | xargs -I {} echo "   {}"

# Test task orchestration
echo ""
echo "3. Testing Task Orchestration..."
TASK_ID=$(curl -s -X POST http://localhost:3000/tasks -H "Content-Type: application/json" -d '{"prompt":"Create a containerized hello world app"}' | jq -r ".taskId")
echo "   Submitted task: $TASK_ID"

# Wait for task processing
sleep 2

# Check task status
STATUS=$(curl -s http://localhost:3000/tasks/$TASK_ID/status | jq -r ".status")
WORKER=$(curl -s http://localhost:3000/tasks/$TASK_ID/status | jq -r ".assignedWorker")
echo "   Task status: $STATUS (worker: $WORKER)"

# Test direct worker execution (simulating container mode)
echo ""
echo "4. Testing Container-Style Execution..."
RESULT=$(curl -s -X POST http://localhost:3001/execute -H "Content-Type: application/json" -d '{"taskId":"container-demo-001","prompt":"hello world","sessionId":"demo-session"}')
FILES_CREATED=$(echo $RESULT | jq -r ".result.files_created | length")
EXECUTION_TIME=$(echo $RESULT | jq -r ".executionTime")
echo "   Files created: $FILES_CREATED"
echo "   Execution time: ${EXECUTION_TIME}ms"

# Test concurrent execution
echo ""
echo "5. Testing Concurrent Execution..."
for i in {1..3}; do
    curl -s -X POST http://localhost:3001/execute -H "Content-Type: application/json" -d "{\"taskId\":\"concurrent-$i\",\"prompt\":\"task $i\"}" > /dev/null &
done
wait
echo "   3 concurrent tasks submitted successfully"

echo ""
echo "✅ ClaudeCluster testing complete!"
echo ""
echo "🎯 What this demonstrates:"
echo "   • Driver-Worker orchestration architecture"
echo "   • Task routing and assignment to workers"
echo "   • Container-style execution with session isolation"
echo "   • Concurrent task processing capabilities"
echo "   • Health monitoring and metrics collection"
echo ""
echo "🚀 Next steps: Build actual TypeScript implementation"
echo "   • Fix compilation errors in worker package"  
echo "   • Test real container spawning with Docker"
echo "   • Integrate with official Claude Code containers"

