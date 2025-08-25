/**
 * @fileoverview Tests for execution configuration schema and validation
 */

import {
  ExecutionMode,
  ContainerOrchestrator,
  ExecutionConfigSchema,
  ProcessPoolConfigSchema,
  ContainerConfigSchema,
  ResourceLimitsSchema,
  createExecutionConfigFromEnv,
  validateExecutionConfig,
  mergeExecutionConfigs,
  defaultProcessPoolExecutionConfig,
  defaultContainerExecutionConfig,
  defaultResourceLimits
} from '../execution';

describe('ExecutionConfig', () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.EXECUTION_MODE;
    delete process.env.CLAUDE_API_KEY;
    delete process.env.MAX_CONCURRENT_TASKS;
  });

  describe('Schema Validation', () => {
    it('should validate a complete execution config', () => {
      const config = {
        mode: ExecutionMode.CONTAINER_AGENTIC,
        fallbackMode: ExecutionMode.PROCESS_POOL,
        container: {
          orchestrator: ContainerOrchestrator.DOCKER,
          image: 'ghcr.io/anthropics/claude-code:latest',
          registry: 'ghcr.io',
          resourceLimits: {
            memory: 2147483648,
            cpu: 1024,
            timeout: 300
          },
          networkMode: 'bridge',
          securityOptions: ['no-new-privileges:true'],
          environmentVariables: {
            NODE_ENV: 'production'
          },
          sessionTimeout: 3600000,
          autoRemove: true,
          readOnlyRootfs: false,
          enableHealthChecks: true,
          wrapperScriptPath: '/usr/local/bin/claude-prototype-wrapper.sh'
        },
        processPool: {
          maxProcesses: 5,
          minProcesses: 1,
          processTimeout: 300000,
          claudeCodePath: '/usr/local/bin/claude-code',
          idleTimeout: 600000,
          healthCheckInterval: 30000,
          workspaceDir: './workspace',
          tempDir: './temp'
        },
        featureFlags: {
          enableContainerMode: true,
          enableProcessPoolMode: true,
          allowModeOverride: true,
          enableSessionPersistence: false,
          enableResourceMonitoring: true,
          enablePerformanceMetrics: true,
          supportedProviders: ['docker'],
          experimentalFeatures: []
        },
        auth: {
          claudeApiKey: 'test-key',
          apiKeySource: 'environment' as const,
          refreshTokens: true,
          tokenExpirationBuffer: 300
        },
        monitoring: {
          enableMetrics: true,
          enableTracing: false,
          enableHealthChecks: true,
          metricsInterval: 60000,
          healthCheckInterval: 30000,
          logLevel: 'info' as const,
          enableStructuredLogging: true,
          enableAuditLogging: false
        },
        security: {
          enableSandboxing: true,
          isolationLevel: 'container' as const,
          allowNetworkAccess: true,
          allowFileSystemAccess: true,
          restrictedPaths: ['/etc', '/sys'],
          allowedDomains: [],
          enableDataRedaction: true,
          auditSensitiveOperations: true
        },
        performance: {
          maxConcurrentTasks: 10,
          taskQueueSize: 100,
          executionTimeout: 300000,
          idleTimeout: 600000,
          resourcePollingInterval: 5000,
          enableCaching: true,
          cacheSize: 1000,
          cacheTtl: 3600000
        }
      };

      const result = ExecutionConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should fail validation when required config is missing for selected mode', () => {
      const config = {
        mode: ExecutionMode.CONTAINER_AGENTIC,
        // Missing container config
        featureFlags: {
          enableContainerMode: true,
          enableProcessPoolMode: true,
          allowModeOverride: true,
          enableSessionPersistence: false,
          enableResourceMonitoring: true,
          enablePerformanceMetrics: true,
          supportedProviders: ['docker'],
          experimentalFeatures: []
        },
        auth: {
          claudeApiKey: 'test-key',
          apiKeySource: 'environment' as const,
          refreshTokens: true,
          tokenExpirationBuffer: 300
        },
        monitoring: {
          enableMetrics: true,
          enableTracing: false,
          enableHealthChecks: true,
          metricsInterval: 60000,
          healthCheckInterval: 30000,
          logLevel: 'info' as const,
          enableStructuredLogging: true,
          enableAuditLogging: false
        },
        security: {
          enableSandboxing: true,
          isolationLevel: 'container' as const,
          allowNetworkAccess: true,
          allowFileSystemAccess: true,
          restrictedPaths: [],
          allowedDomains: [],
          enableDataRedaction: true,
          auditSensitiveOperations: true
        },
        performance: {
          maxConcurrentTasks: 10,
          taskQueueSize: 100,
          executionTimeout: 300000,
          idleTimeout: 600000,
          resourcePollingInterval: 5000,
          enableCaching: true,
          cacheSize: 1000,
          cacheTtl: 3600000
        }
      };

      const result = ExecutionConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('Resource Limits Schema', () => {
    it('should validate resource limits', () => {
      const limits = {
        memory: 2147483648,
        cpu: 1024,
        timeout: 300,
        diskSize: 10737418240
      };

      const result = ResourceLimitsSchema.safeParse(limits);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(limits);
    });

    it('should fail validation for negative values', () => {
      const limits = {
        memory: -1,
        cpu: 1024,
        timeout: 300
      };

      const result = ResourceLimitsSchema.safeParse(limits);
      expect(result.success).toBe(false);
    });
  });

  describe('Process Pool Config Schema', () => {
    it('should validate process pool configuration', () => {
      const config = {
        maxProcesses: 5,
        minProcesses: 2,
        processTimeout: 300000,
        claudeCodePath: '/usr/local/bin/claude-code',
        idleTimeout: 600000,
        healthCheckInterval: 30000,
        workspaceDir: './workspace',
        tempDir: './temp'
      };

      const result = ProcessPoolConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should fail when minProcesses > maxProcesses', () => {
      const config = {
        maxProcesses: 3,
        minProcesses: 5, // Invalid: greater than max
        processTimeout: 300000,
        claudeCodePath: '/usr/local/bin/claude-code',
        idleTimeout: 600000,
        healthCheckInterval: 30000,
        workspaceDir: './workspace',
        tempDir: './temp'
      };

      const result = ProcessPoolConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('Container Config Schema', () => {
    it('should validate container configuration', () => {
      const config = {
        orchestrator: ContainerOrchestrator.DOCKER,
        image: 'ghcr.io/anthropics/claude-code:latest',
        registry: 'ghcr.io',
        resourceLimits: defaultResourceLimits,
        networkMode: 'bridge',
        securityOptions: ['no-new-privileges:true'],
        environmentVariables: { NODE_ENV: 'production' },
        sessionTimeout: 3600000,
        autoRemove: true,
        readOnlyRootfs: false,
        enableHealthChecks: true,
        wrapperScriptPath: '/usr/local/bin/claude-prototype-wrapper.sh'
      };

      const result = ContainerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should use defaults for optional fields', () => {
      const config = {
        orchestrator: ContainerOrchestrator.DOCKER,
        image: 'test-image',
        registry: 'test-registry',
        resourceLimits: defaultResourceLimits,
        securityOptions: [],
        environmentVariables: {},
        sessionTimeout: 3600000
      };

      const result = ContainerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      expect(result.data?.networkMode).toBe('bridge');
      expect(result.data?.autoRemove).toBe(true);
      expect(result.data?.enableHealthChecks).toBe(true);
    });
  });

  describe('Environment Configuration', () => {
    it('should create config from environment variables', () => {
      process.env.EXECUTION_MODE = 'container_agentic';
      process.env.CLAUDE_API_KEY = 'env-test-key';
      process.env.MAX_CONCURRENT_TASKS = '15';

      const config = createExecutionConfigFromEnv();

      expect(config.mode).toBe(ExecutionMode.CONTAINER_AGENTIC);
      expect(config.auth.claudeApiKey).toBe('env-test-key');
      expect(config.performance.maxConcurrentTasks).toBe(15);
    });

    it('should use defaults when environment variables are not set', () => {
      const config = createExecutionConfigFromEnv();

      expect(config.mode).toBe(ExecutionMode.PROCESS_POOL);
      expect(config.auth.claudeApiKey).toBe('');
      expect(config.performance.maxConcurrentTasks).toBe(10); // Default from defaultPerformanceConfig
    });
  });

  describe('Configuration Validation', () => {
    it('should validate valid configuration', () => {
      const config = defaultProcessPoolExecutionConfig;
      const result = validateExecutionConfig(config);
      expect(result).toEqual(config);
    });

    it('should throw error for invalid configuration', () => {
      const invalidConfig = { mode: 'invalid_mode' };
      expect(() => validateExecutionConfig(invalidConfig)).toThrow();
    });
  });

  describe('Configuration Merging', () => {
    it('should merge configurations correctly', () => {
      const base = defaultProcessPoolExecutionConfig;
      const override = {
        mode: ExecutionMode.CONTAINER_AGENTIC,
        container: defaultContainerExecutionConfig.container,
        performance: {
          maxConcurrentTasks: 20
        }
      };

      const merged = mergeExecutionConfigs(base, override);

      expect(merged.mode).toBe(ExecutionMode.CONTAINER_AGENTIC);
      expect(merged.performance.maxConcurrentTasks).toBe(20);
      expect(merged.auth).toEqual(base.auth); // Should preserve base config
      expect(merged.container).toEqual(override.container); // Should use override
    });

    it('should preserve nested objects when not overridden', () => {
      const base = defaultContainerExecutionConfig;
      const override = {
        performance: {
          maxConcurrentTasks: 25
        }
      };

      const merged = mergeExecutionConfigs(base, override);

      expect(merged.performance.maxConcurrentTasks).toBe(25);
      expect(merged.performance.enableCaching).toBe(base.performance.enableCaching);
      expect(merged.container).toEqual(base.container);
    });
  });

  describe('Default Configurations', () => {
    it('should have valid default process pool configuration', () => {
      const result = ExecutionConfigSchema.safeParse(defaultProcessPoolExecutionConfig);
      expect(result.success).toBe(true);
    });

    it('should have valid default container configuration', () => {
      const result = ExecutionConfigSchema.safeParse(defaultContainerExecutionConfig);
      expect(result.success).toBe(true);
    });

    it('should have different max concurrent tasks for different modes', () => {
      expect(defaultContainerExecutionConfig.performance.maxConcurrentTasks).toBeGreaterThan(
        defaultProcessPoolExecutionConfig.performance.maxConcurrentTasks
      );
    });
  });
});