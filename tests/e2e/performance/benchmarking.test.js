/**
 * Performance test: System Benchmarking
 * Measures system performance under various load conditions
 */

describe('Performance Benchmarking', () => {
  describe('Response Time Benchmarks', () => {
    skipIfNoMCP(test)('should meet response time SLAs for basic operations', async () => {
      const measurements = [];
      const testCount = 10;
      
      console.log('📊 Running response time benchmark...');
      
      for (let i = 0; i < testCount; i++) {
        const prompt = testUtils.generateTestPrompt(`benchmark-${i}`);
        const startTime = Date.now();
        
        const result = await testClient.submitTaskHTTP(prompt);
        const responseTime = Date.now() - startTime;
        
        expect(result.success).toBe(true);
        measurements.push(responseTime);
        
        // Small delay between measurements
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Calculate statistics
      const avgResponseTime = measurements.reduce((sum, time) => sum + time, 0) / measurements.length;
      const minResponseTime = Math.min(...measurements);
      const maxResponseTime = Math.max(...measurements);
      const p95ResponseTime = measurements.sort((a, b) => a - b)[Math.floor(measurements.length * 0.95)];
      
      console.log(`📈 Response Time Metrics:`);
      console.log(`   Average: ${avgResponseTime.toFixed(0)}ms`);
      console.log(`   Min: ${minResponseTime}ms`);
      console.log(`   Max: ${maxResponseTime}ms`);
      console.log(`   P95: ${p95ResponseTime}ms`);
      
      // SLA assertions
      expect(avgResponseTime).toBeLessThan(5000);  // 5 second average
      expect(p95ResponseTime).toBeLessThan(10000); // 10 second P95
      expect(maxResponseTime).toBeLessThan(30000); // 30 second max
    });

    skipIfNoMCP(test)('should maintain performance under sustained load', async () => {
      const sustainedDuration = 30000; // 30 seconds
      const requestInterval = 1000; // 1 request per second
      const startTime = Date.now();
      const measurements = [];
      
      console.log('⏱️  Running sustained load test for 30 seconds...');
      
      let requestCount = 0;
      while (Date.now() - startTime < sustainedDuration) {
        const prompt = testUtils.generateTestPrompt(`sustained-${requestCount++}`);
        const requestStart = Date.now();
        
        try {
          const result = await testClient.submitTaskHTTP(prompt);
          const responseTime = Date.now() - requestStart;
          
          if (result.success) {
            measurements.push(responseTime);
          }
        } catch (error) {
          // Track failures but continue test
          console.warn(`Request ${requestCount} failed: ${error.message}`);
        }
        
        // Wait for next interval
        await new Promise(resolve => setTimeout(resolve, requestInterval));
      }
      
      const totalDuration = Date.now() - startTime;
      const successRate = (measurements.length / requestCount) * 100;
      const avgResponseTime = measurements.reduce((sum, time) => sum + time, 0) / measurements.length;
      
      console.log(`📊 Sustained Load Results:`);
      console.log(`   Duration: ${Math.round(totalDuration / 1000)}s`);
      console.log(`   Requests: ${requestCount}`);
      console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
      console.log(`   Avg Response: ${avgResponseTime.toFixed(0)}ms`);
      
      // Performance should remain reasonable under sustained load
      expect(successRate).toBeGreaterThan(80); // 80% success rate
      expect(avgResponseTime).toBeLessThan(8000); // 8 second average under load
    });
  });

  describe('Throughput Benchmarks', () => {
    skipIfNoMCP(test)('should handle concurrent request bursts', async () => {
      const burstSizes = [5, 10, 15];
      const results = [];
      
      for (const burstSize of burstSizes) {
        console.log(`🚀 Testing burst of ${burstSize} concurrent requests...`);
        
        const startTime = Date.now();
        const promises = [];
        
        // Create burst of concurrent requests
        for (let i = 0; i < burstSize; i++) {
          const prompt = testUtils.generateTestPrompt(`burst-${burstSize}-${i}`);
          promises.push(
            testClient.submitTaskHTTP(prompt).catch(error => ({
              success: false,
              error: error.message
            }))
          );
        }
        
        const burstResults = await Promise.all(promises);
        const duration = Date.now() - startTime;
        const successCount = burstResults.filter(r => r.success).length;
        const throughput = (successCount / duration) * 1000; // requests per second
        
        results.push({
          burstSize,
          duration,
          successCount,
          successRate: (successCount / burstSize) * 100,
          throughput
        });
        
        console.log(`   Success: ${successCount}/${burstSize} (${((successCount/burstSize)*100).toFixed(1)}%)`);
        console.log(`   Duration: ${duration}ms`);
        console.log(`   Throughput: ${throughput.toFixed(2)} req/s`);
        
        // Brief cooldown between bursts
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Validate throughput characteristics
      results.forEach(result => {
        expect(result.successRate).toBeGreaterThan(60); // At least 60% should succeed
        expect(result.throughput).toBeGreaterThan(0.1); // Minimum throughput
      });
      
      // System should still be responsive after all bursts
      const healthCheck = await testClient.testMCPHealth();
      expect(healthCheck.success).toBe(true);
    });

    skipIfNoMCP(test)('should scale performance with available workers', async () => {
      // Get worker information
      const workersResponse = await testClient.http.get(`${testClient.mcpServerUrl}/workers`);
      const workerCount = workersResponse.data.totalWorkers || 1;
      
      console.log(`👥 Testing performance scaling with ${workerCount} workers...`);
      
      // Test with different concurrency levels
      const concurrencyLevels = [1, Math.min(workerCount, 3), Math.min(workerCount * 2, 6)];
      const scalingResults = [];
      
      for (const concurrency of concurrencyLevels) {
        console.log(`🔄 Testing ${concurrency} concurrent requests...`);
        
        const startTime = Date.now();
        const promises = [];
        
        for (let i = 0; i < concurrency; i++) {
          const prompt = testUtils.generateTestPrompt(`scaling-${concurrency}-${i}`);
          promises.push(testClient.submitTaskHTTP(prompt));
        }
        
        const results = await Promise.all(promises);
        const duration = Date.now() - startTime;
        const successCount = results.filter(r => r.success).length;
        
        scalingResults.push({
          concurrency,
          duration,
          successCount,
          throughput: (successCount / duration) * 1000
        });
        
        console.log(`   Duration: ${duration}ms, Throughput: ${((successCount/duration)*1000).toFixed(2)} req/s`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Performance should generally improve or remain stable with more workers
      // (allowing for some variance due to system overhead)
      scalingResults.forEach(result => {
        expect(result.successCount).toBe(result.concurrency); // All should succeed
        expect(result.throughput).toBeGreaterThan(0.5); // Reasonable minimum throughput
      });
    });
  });

  describe('Resource Utilization', () => {
    skipIfNoMCP(test)('should track memory usage during load', async () => {
      // Get baseline memory usage
      const baselineHealth = await testClient.testMCPHealth();
      expect(baselineHealth.success).toBe(true);
      
      const baselineMemory = baselineHealth.data.systemInfo?.memoryUsage;
      if (!baselineMemory) {
        console.log('⚠️  Memory usage not available from health endpoint');
        return;
      }
      
      console.log(`📊 Baseline memory usage: ${JSON.stringify(baselineMemory)}`);
      
      // Generate load
      const loadTasks = [];
      for (let i = 0; i < 10; i++) {
        const prompt = testUtils.generateTestPrompt(`memory-load-${i}`);
        loadTasks.push(testClient.submitTaskHTTP(prompt));
      }
      
      await Promise.all(loadTasks);
      
      // Check memory usage after load
      await new Promise(resolve => setTimeout(resolve, 2000)); // Allow some settling time
      
      const loadHealth = await testClient.testMCPHealth();
      expect(loadHealth.success).toBe(true);
      
      const loadMemory = loadHealth.data.systemInfo?.memoryUsage;
      if (loadMemory && baselineMemory) {
        console.log(`📊 Load memory usage: ${JSON.stringify(loadMemory)}`);
        
        // Memory usage increase should be reasonable
        const heapUsedIncrease = loadMemory.heapUsed - baselineMemory.heapUsed;
        const heapUsedIncreasePercent = (heapUsedIncrease / baselineMemory.heapUsed) * 100;
        
        console.log(`📈 Heap usage increase: ${(heapUsedIncrease / 1024 / 1024).toFixed(2)}MB (${heapUsedIncreasePercent.toFixed(1)}%)`);
        
        // Should not have massive memory increase (indicating leaks)
        expect(heapUsedIncreasePercent).toBeLessThan(200); // Less than 200% increase
      }
    });

    skipIfNoWorkers(test)('should monitor worker resource usage', async () => {
      const initialWorkerHealth = await testClient.testAllWorkersHealth();
      const healthyWorkers = initialWorkerHealth.filter(w => w.success);
      
      if (healthyWorkers.length === 0) {
        console.log('⚠️  No healthy workers available for resource monitoring');
        return;
      }
      
      console.log(`📊 Monitoring ${healthyWorkers.length} workers...`);
      
      // Generate some load
      const loadPromises = [];
      for (let i = 0; i < 5; i++) {
        const prompt = testUtils.generateTestPrompt(`worker-load-${i}`);
        loadPromises.push(testClient.submitTaskHTTP(prompt));
      }
      
      await Promise.all(loadPromises);
      
      // Check worker health after load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const finalWorkerHealth = await testClient.testAllWorkersHealth();
      const finalHealthyWorkers = finalWorkerHealth.filter(w => w.success);
      
      // Workers should still be healthy
      expect(finalHealthyWorkers.length).toBeGreaterThanOrEqual(healthyWorkers.length);
      
      // Check task execution counts
      finalHealthyWorkers.forEach(worker => {
        expect(worker.data).toHaveProperty('totalTasksExecuted');
        expect(typeof worker.data.totalTasksExecuted).toBe('number');
        expect(worker.data.totalTasksExecuted).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Latency Analysis', () => {
    skipIfNoMCP(test)('should analyze latency distribution', async () => {
      const measurements = [];
      const sampleSize = 20;
      
      console.log('📊 Collecting latency samples...');
      
      for (let i = 0; i < sampleSize; i++) {
        const prompt = testUtils.generateTestPrompt(`latency-${i}`);
        const startTime = Date.now();
        
        const result = await testClient.submitTaskHTTP(prompt);
        const latency = Date.now() - startTime;
        
        expect(result.success).toBe(true);
        measurements.push(latency);
        
        await new Promise(resolve => setTimeout(resolve, 200)); // Consistent spacing
      }
      
      // Statistical analysis
      const sorted = measurements.sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const median = sorted[Math.floor(sorted.length / 2)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      const avg = measurements.reduce((sum, val) => sum + val, 0) / measurements.length;
      
      console.log('📈 Latency Distribution:');
      console.log(`   Min: ${min}ms`);
      console.log(`   Avg: ${avg.toFixed(0)}ms`);
      console.log(`   Median: ${median}ms`);
      console.log(`   P95: ${p95}ms`);
      console.log(`   P99: ${p99}ms`);
      console.log(`   Max: ${max}ms`);
      
      // Latency validation
      expect(min).toBeGreaterThan(0);
      expect(avg).toBeLessThan(15000); // 15 second average
      expect(p95).toBeLessThan(20000); // 20 second P95
      expect(max).toBeLessThan(60000); // 1 minute max
      
      // Distribution should be reasonable (P95 shouldn't be too far from average)
      const p95ToAvgRatio = p95 / avg;
      expect(p95ToAvgRatio).toBeLessThan(5); // P95 should be less than 5x average
    });

    skipIfNoMCP(test)('should measure end-to-end latency with SSE', async () => {
      const prompt = testUtils.generateTestPrompt('sse-latency');
      const startTime = Date.now();
      
      // Measure full end-to-end latency including streaming
      const result = await testClient.submitTaskWithSSE(prompt, {
        timeout: 30000
      });
      
      const totalLatency = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(result.streaming.events.length).toBeGreaterThan(0);
      
      console.log(`🔄 End-to-end SSE latency: ${totalLatency}ms`);
      console.log(`📡 SSE events received: ${result.streaming.events.length}`);
      
      // End-to-end latency should be reasonable
      expect(totalLatency).toBeLessThan(45000); // 45 seconds max for SSE flow
      
      // Should have received some streaming events
      const eventTypes = result.streaming.events.map(e => e.type);
      expect(eventTypes).toContain('status');
    });
  });

  describe('Stress Testing', () => {
    skipIfNoMCP(test)('should handle peak load gracefully', async () => {
      const peakLoad = 25; // High concurrent load
      const stressStart = Date.now();
      
      console.log(`🔥 Applying peak load: ${peakLoad} concurrent requests...`);
      
      const promises = [];
      for (let i = 0; i < peakLoad; i++) {
        const prompt = testUtils.generateTestPrompt(`peak-load-${i}`);
        promises.push(
          testClient.submitTaskHTTP(prompt, { 
            priority: Math.ceil(Math.random() * 10) 
          }).catch(error => ({
            success: false,
            error: error.message,
            statusCode: error.response?.status
          }))
        );
      }
      
      const results = await Promise.all(promises);
      const stressDuration = Date.now() - stressStart;
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      const rateLimitedCount = results.filter(r => r.statusCode === 429).length;
      
      console.log(`📊 Peak Load Results:`);
      console.log(`   Duration: ${stressDuration}ms`);
      console.log(`   Success: ${successCount}/${peakLoad} (${((successCount/peakLoad)*100).toFixed(1)}%)`);
      console.log(`   Failed: ${failureCount}`);
      console.log(`   Rate Limited: ${rateLimitedCount}`);
      
      // Under peak load, system should either handle requests or rate limit gracefully
      expect(successCount + rateLimitedCount).toBeGreaterThan(peakLoad * 0.3); // At least 30% handled
      
      // System should recover quickly after stress
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const recoveryTest = await testClient.submitTaskHTTP(testUtils.generateTestPrompt('recovery-test'));
      expect(recoveryTest.success).toBe(true);
      
      const healthCheck = await testClient.testMCPHealth();
      expect(healthCheck.success).toBe(true);
    });
  });
});