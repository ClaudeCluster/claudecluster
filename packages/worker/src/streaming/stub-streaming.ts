import { IStreamingService, StreamHandler, StreamEvent } from '../interfaces';
import { logger } from '../logger';

/**
 * Stub streaming service for Phase 0
 * Prepares interface for future SSE integration
 */
export class StubStreamingService implements IStreamingService {
  private activeStreams: Map<string, StubStreamHandler> = new Map();

  async createStream(taskId: string): Promise<StreamHandler> {
    const handler = new StubStreamHandler(taskId);
    this.activeStreams.set(taskId, handler);
    
    logger.info(`Created stub stream for task ${taskId}`);
    return handler;
  }

  async closeStream(taskId: string): Promise<void> {
    const handler = this.activeStreams.get(taskId);
    if (handler) {
      await handler.close();
      this.activeStreams.delete(taskId);
      logger.info(`Closed stub stream for task ${taskId}`);
    }
  }

  async broadcastEvent(taskId: string, event: StreamEvent): Promise<void> {
    const handler = this.activeStreams.get(taskId);
    if (handler && !handler.isClosed()) {
      await handler.write(event);
    }
  }

  getActiveStreams(): string[] {
    return Array.from(this.activeStreams.keys());
  }

  async cleanup(): Promise<void> {
    const closedStreams: string[] = [];
    
    for (const [taskId, handler] of this.activeStreams) {
      if (handler.isClosed()) {
        closedStreams.push(taskId);
      }
    }
    
    for (const taskId of closedStreams) {
      this.activeStreams.delete(taskId);
    }
    
    logger.debug(`Cleaned up ${closedStreams.length} closed streams`);
  }
}

class StubStreamHandler implements StreamHandler {
  private closed = false;
  private events: StreamEvent[] = [];

  constructor(public readonly taskId: string) {}

  async write(event: StreamEvent): Promise<void> {
    if (this.closed) {
      throw new Error(`Stream for task ${this.taskId} is closed`);
    }
    
    this.events.push(event);
    
    // Log events for debugging in Phase 0
    logger.debug(`Stream event for task ${this.taskId}:`, {
      type: event.type,
      timestamp: event.timestamp,
      dataLength: JSON.stringify(event.data).length
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    logger.debug(`Stream handler closed for task ${this.taskId}`);
  }

  isClosed(): boolean {
    return this.closed;
  }

  // Helper method for debugging
  getEvents(): StreamEvent[] {
    return [...this.events];
  }
}