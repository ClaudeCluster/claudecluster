import * as dotenv from 'dotenv';
import * as Joi from 'joi';

// Load environment variables
dotenv.config();

// Configuration schema
const configSchema = Joi.object({
  // Server configuration
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  
  // Database configuration
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().default('claudecluster'),
  DB_USER: Joi.string().default('postgres'),
  DB_PASSWORD: Joi.string().allow('').default(''),
  
  // External APIs
  CLAUDE_API_KEY: Joi.string().required(),
  SLACK_WEBHOOK_URL: Joi.string().uri().allow(''),
  GITHUB_TOKEN: Joi.string().allow(''),
  
  // Security
  JWT_SECRET: Joi.string().min(32).required(),
  SESSION_SECRET: Joi.string().min(32).required(),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FILE: Joi.string().default('logs/claudecluster.log'),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  
  // ClaudeCluster specific
  MAX_WORKERS: Joi.number().default(10),
  TASK_TIMEOUT: Joi.number().default(300000), // 5 minutes
  HEARTBEAT_INTERVAL: Joi.number().default(30000), // 30 seconds
  RETRY_ATTEMPTS: Joi.number().default(3)
});

// Validate and export configuration
const { error, value: config } = configSchema.validate(process.env, { allowUnknown: true });

if (error) {
  throw new Error(`Configuration validation error: ${error.message}`);
}

export default {
  // Server
  nodeEnv: config.NODE_ENV,
  port: config.PORT,
  
  // Database
  database: {
    host: config.DB_HOST,
    port: config.DB_PORT,
    name: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD
  },
  
  // External APIs
  claude: {
    apiKey: config.CLAUDE_API_KEY
  },
  slack: {
    webhookUrl: config.SLACK_WEBHOOK_URL
  },
  github: {
    token: config.GITHUB_TOKEN
  },
  
  // Security
  jwt: {
    secret: config.JWT_SECRET
  },
  session: {
    secret: config.SESSION_SECRET
  },
  
  // Logging
  logging: {
    level: config.LOG_LEVEL,
    file: config.LOG_FILE
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    maxRequests: config.RATE_LIMIT_MAX_REQUESTS
  },
  
  // ClaudeCluster
  claudecluster: {
    maxWorkers: config.MAX_WORKERS,
    taskTimeout: config.TASK_TIMEOUT,
    heartbeatInterval: config.HEARTBEAT_INTERVAL,
    retryAttempts: config.RETRY_ATTEMPTS
  }
};
