import pino from 'pino';
import { config } from './config';

// Create logger with configuration
export const logger = pino({
  level: config.logLevel,
  name: '@claudecluster/mcp',
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'localhost'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  ...(config.nodeEnv === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  })
});