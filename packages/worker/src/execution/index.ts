/**
 * @fileoverview Execution Provider Module
 * 
 * Exports all execution provider interfaces, types, and utilities
 */

export {
  // Core interfaces
  type ExecutionProvider,
  type Executor,
  type ExecutionProviderFactory,
  
  // Abstract base class
  BaseProvider,
  
  // Enums
  ExecutionMode,
  ExecutorState,
  
  // Types
  type ExecutorStatus,
  type ProviderStats,
  type ProviderConfig,
  
  // Error classes
  ExecutionProviderError,
  ExecutorError,
  ErrorCodes,
  type ErrorCode
} from './provider.js';

export {
  // Process Pool Provider
  ProcessPoolProvider,
  ProcessExecutor
} from './process-pool-provider.js';

export {
  // Container Provider
  ContainerProvider,
  ContainerExecutor
} from './container-provider.js';

export {
  // Unified Provider
  UnifiedExecutionProvider,
  type ExecutionFeatureFlags
} from './unified-provider.js';