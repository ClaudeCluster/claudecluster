/**
 * @fileoverview Event handling system with EventEmitter2 for ClaudeCluster
 */

import { EventEmitter2 } from 'eventemitter2';
import type { Logger } from '../logger/index.js';
import type { Message, Event as ClusterEvent } from '@claudecluster/core';
import { MessageType } from '@claudecluster/core';

/**
 * EventEmitter2 options interface (local definition)
 */
export interface EventEmitter2Options {
  wildcard?: boolean;
  delimiter?: string;
  newListener?: boolean;
  removeListener?: boolean;
  maxListeners?: number;
  verboseMemoryLeak?: boolean;
  ignoreErrors?: boolean;
}

/**
 * Event listener function type
 */
export type EventListener<T = any> = (data: T, eventName: string, context?: EventContext) => void | Promise<void>;

/**
 * Event context information
 */
export interface EventContext {
  readonly emitterId: string;
  readonly timestamp: Date;
  readonly correlationId?: string;
  readonly source?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Event subscription options
 */
export interface EventSubscriptionOptions {
  readonly once?: boolean;
  readonly ttl?: number; // Time-to-live in milliseconds
  readonly priority?: number; // Higher numbers = higher priority
  readonly filter?: (data: any, context?: EventContext) => boolean;
  readonly transform?: (data: any) => any;
  readonly eventName?: string;
}

/**
 * Event emission options
 */
export interface EventEmissionOptions {
  readonly correlationId?: string;
  readonly source?: string;
  readonly metadata?: Record<string, unknown>;
  readonly delay?: number; // Delay emission by milliseconds
}

/**
 * Event subscription handle for managing subscriptions
 */
export class EventSubscription {
  private isActive = true;

  constructor(
    private emitter: EventEmitter2,
    private eventName: string,
    private listener: EventListener,
    private options?: EventSubscriptionOptions
  ) {}

  /**
   * Unsubscribe from the event
   */
  unsubscribe(): void {
    if (this.isActive) {
      this.emitter.removeListener(this.eventName, this.listener);
      this.isActive = false;
    }
  }

  /**
   * Check if subscription is still active
   */
  isSubscribed(): boolean {
    return this.isActive;
  }

  /**
   * Get event name
   */
  getEventName(): string {
    return this.eventName;
  }
}

/**
 * Enhanced event manager with ClaudeCluster-specific features
 */
export class EventManager extends EventEmitter2 {
  private logger?: Logger;
  private subscriptions = new Map<string, Set<EventSubscription>>();
  private eventMetrics = new Map<string, { count: number; lastEmitted: Date }>();
  private readonly managerId: string;

  constructor(
    managerId: string,
    options: EventEmitter2Options = {},
    logger?: Logger
  ) {
    super({
      wildcard: true,
      delimiter: '.',
      maxListeners: 100,
      verboseMemoryLeak: true,
      ignoreErrors: false,
      ...options
    });

    this.managerId = managerId;
    this.logger = logger;

    // Set up error handling
    this.on('error', (error: Error) => {
      if (this.logger) {
        this.logger.error(error, 'Event manager error', {
          component: 'event-manager',
          managerId: this.managerId
        });
      } else {
        console.error('Event manager error:', error);
      }
    });
  }

  /**
   * Subscribe to an event with enhanced options
   */
  subscribe<T = any>(
    eventName: string,
    listener: EventListener<T>,
    options?: EventSubscriptionOptions
  ): EventSubscription {
    // Wrap the listener with additional functionality
    const wrappedListener = this.wrapListener(listener, options);
    
    // Register the listener
    if (options?.once) {
      this.once(eventName, wrappedListener);
    } else {
      this.on(eventName, wrappedListener);
    }

    // Create subscription handle
    const subscription = new EventSubscription(this, eventName, wrappedListener, options);
    
    // Track subscription
    if (!this.subscriptions.has(eventName)) {
      this.subscriptions.set(eventName, new Set());
    }
    this.subscriptions.get(eventName)!.add(subscription);

    this.logger?.debug('Event subscription created', {
      component: 'event-manager',
      eventName,
      managerId: this.managerId,
      options
    });

    return subscription;
  }

  /**
   * Emit an event with enhanced context
   */
  emitEvent<T = any>(
    eventName: string,
    data: T,
    options?: EventEmissionOptions
  ): boolean {
    const context: EventContext = {
      emitterId: this.managerId,
      timestamp: new Date(),
      correlationId: options?.correlationId,
      source: options?.source,
      metadata: options?.metadata
    };

    // Update metrics
    const current = this.eventMetrics.get(eventName) || { count: 0, lastEmitted: new Date(0) };
    this.eventMetrics.set(eventName, {
      count: current.count + 1,
      lastEmitted: new Date()
    });

    this.logger?.trace('Emitting event', {
      component: 'event-manager',
      eventName,
      managerId: this.managerId,
      dataType: typeof data,
      context
    });

    // Emit with or without delay
    if (options?.delay) {
      setTimeout(() => {
        this.emit(eventName, data, context);
      }, options.delay);
      return true;
    } else {
      return this.emit(eventName, data, context);
    }
  }

  /**
   * Wrap listener with additional functionality
   */
  private wrapListener<T>(
    listener: EventListener<T>,
    options?: EventSubscriptionOptions
  ): EventListener<T> {
    return async (data: T, eventName: string, context?: EventContext) => {
      try {
        // Apply filter if provided
        if (options?.filter && !options.filter(data, context)) {
          return;
        }

        // Apply transform if provided
        const transformedData = options?.transform ? options.transform(data) : data;

        // Execute listener
        const result = listener(transformedData, eventName, context);
        if (result instanceof Promise) {
          await result;
        }

        this.logger?.trace('Event listener executed successfully', {
          component: 'event-manager',
          managerId: this.managerId,
          context
        });
      } catch (error) {
        this.logger?.error(
          error instanceof Error ? error : new Error(String(error)),
          'Event listener error',
          {
            component: 'event-manager',
            managerId: this.managerId,
            context
          }
        );
        
        // Re-emit as error event
        this.emitEvent('listener.error', {
          error,
          originalData: data,
          context
        });
      }
    };
  }

  /**
   * Subscribe to task events
   */
  onTaskEvent(
    taskId: string,
    eventType: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled',
    listener: EventListener,
    options?: EventSubscriptionOptions
  ): EventSubscription {
    return this.subscribe(`task.${taskId}.${eventType}`, listener, options);
  }

  /**
   * Emit task event
   */
  emitTaskEvent(
    taskId: string,
    eventType: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled',
    data: any,
    options?: EventEmissionOptions
  ): boolean {
    return this.emitEvent(`task.${taskId}.${eventType}`, data, {
      ...options,
      source: 'task-engine'
    });
  }

  /**
   * Subscribe to worker events
   */
  onWorkerEvent(
    workerId: string,
    eventType: 'connected' | 'disconnected' | 'idle' | 'busy' | 'error',
    listener: EventListener,
    options?: EventSubscriptionOptions
  ): EventSubscription {
    return this.subscribe(`worker.${workerId}.${eventType}`, listener, options);
  }

  /**
   * Emit worker event
   */
  emitWorkerEvent(
    workerId: string,
    eventType: 'connected' | 'disconnected' | 'idle' | 'busy' | 'error',
    data: any,
    options?: EventEmissionOptions
  ): boolean {
    return this.emitEvent(`worker.${workerId}.${eventType}`, data, {
      ...options,
      source: 'worker-manager'
    });
  }

  /**
   * Subscribe to driver events
   */
  onDriverEvent(
    eventType: 'started' | 'stopped' | 'task-assigned' | 'execution-completed',
    listener: EventListener,
    options?: EventSubscriptionOptions
  ): EventSubscription {
    return this.subscribe(`driver.${eventType}`, listener, options);
  }

  /**
   * Emit driver event
   */
  emitDriverEvent(
    eventType: 'started' | 'stopped' | 'task-assigned' | 'execution-completed',
    data: any,
    options?: EventEmissionOptions
  ): boolean {
    return this.emitEvent(`driver.${eventType}`, data, {
      ...options,
      source: 'driver'
    });
  }

  /**
   * Subscribe to system events
   */
  onSystemEvent(
    eventType: 'health-check' | 'metrics' | 'error' | 'shutdown',
    listener: EventListener,
    options?: EventSubscriptionOptions
  ): EventSubscription {
    return this.subscribe(`system.${eventType}`, listener, options);
  }

  /**
   * Emit system event
   */
  emitSystemEvent(
    eventType: 'health-check' | 'metrics' | 'error' | 'shutdown',
    data: any,
    options?: EventEmissionOptions
  ): boolean {
    return this.emitEvent(`system.${eventType}`, data, {
      ...options,
      source: 'system'
    });
  }

  /**
   * Get event metrics
   */
  getEventMetrics(): ReadonlyMap<string, { count: number; lastEmitted: Date }> {
    return new Map(this.eventMetrics);
  }

  /**
   * Get subscription count for an event
   */
  getSubscriptionCount(eventName: string): number {
    return this.subscriptions.get(eventName)?.size || 0;
  }

  /**
   * Get all active event names
   */
  getActiveEventNames(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListenersForEvent(eventName: string): void {
    const subscriptions = this.subscriptions.get(eventName);
    if (subscriptions) {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
      subscriptions.clear();
    }
    this.removeAllListeners(eventName);
  }

  /**
   * Clear all subscriptions and listeners
   */
  removeAllSubscriptions(): void {
    for (const subscriptions of this.subscriptions.values()) {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    }
    this.subscriptions.clear();
    this.removeAllListeners();
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    eventNames: number;
    totalSubscriptions: number;
    metrics: number;
  } {
    const totalSubscriptions = Array.from(this.subscriptions.values())
      .reduce((total, set) => total + set.size, 0);

    return {
      eventNames: this.subscriptions.size,
      totalSubscriptions,
      metrics: this.eventMetrics.size
    };
  }

  /**
   * Wait for an event to be emitted
   */
  waitForEvent<T = any>(
    eventName: string,
    timeout?: number,
    filter?: (data: T, context?: EventContext) => boolean
  ): Promise<{ data: T; context?: EventContext }> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;
      
      const subscription = this.subscribe<T>(
        eventName,
        (data: T, eventName: string, context?: EventContext) => {
          if (!filter || filter(data, context)) {
            if (timeoutId) clearTimeout(timeoutId);
            subscription.unsubscribe();
            resolve({ data, context });
          }
        },
        { once: true }
      );

      if (timeout) {
        timeoutId = setTimeout(() => {
          subscription.unsubscribe();
          reject(new Error(`Timeout waiting for event: ${eventName}`));
        }, timeout);
      }
    });
  }
}

/**
 * Event manager factory for creating service-specific event managers
 */
export class EventManagerFactory {
  private static managers = new Map<string, EventManager>();

  /**
   * Create or get an event manager for a specific service
   */
  static createEventManager(
    managerId: string,
    options?: EventEmitter2Options,
    logger?: Logger
  ): EventManager {
    if (!this.managers.has(managerId)) {
      const manager = new EventManager(managerId, options, logger);
      this.managers.set(managerId, manager);
    }
    return this.managers.get(managerId)!;
  }

  /**
   * Get all active event managers
   */
  static getAllManagers(): ReadonlyMap<string, EventManager> {
    return new Map(this.managers);
  }

  /**
   * Remove an event manager
   */
  static removeEventManager(managerId: string): boolean {
    const manager = this.managers.get(managerId);
    if (manager) {
      manager.removeAllSubscriptions();
      return this.managers.delete(managerId);
    }
    return false;
  }

  /**
   * Clear all event managers
   */
  static clearAll(): void {
    for (const manager of this.managers.values()) {
      manager.removeAllSubscriptions();
    }
    this.managers.clear();
  }
}