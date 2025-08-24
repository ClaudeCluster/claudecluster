/** @type {import('jest').Config} */
module.exports = {
  displayName: 'ClaudeCluster E2E Tests',
  testMatch: [
    '<rootDir>/tests/e2e/**/*.test.js',
    '<rootDir>/tests/e2e/**/*.test.ts'
  ],
  testEnvironment: 'node',
  
  // Test execution settings
  testTimeout: 300000, // 5 minutes default timeout
  maxConcurrency: 1,   // Run tests sequentially to avoid conflicts
  
  // Setup and teardown
  setupFilesAfterEnv: ['<rootDir>/tests/e2e/utils/setup.js'],
  globalSetup: '<rootDir>/tests/e2e/utils/global-setup.js',
  globalTeardown: '<rootDir>/tests/e2e/utils/global-teardown.js',
  
  // Coverage (disabled for E2E tests)
  collectCoverage: false,
  
  // Module resolution
  moduleNameMapping: {
    '^@e2e-utils/(.*)$': '<rootDir>/tests/e2e/utils/$1',
    '^@fixtures/(.*)$': '<rootDir>/tests/e2e/fixtures/$1'
  },
  
  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'tests/e2e/results',
        outputName: 'junit.xml',
        suiteName: 'ClaudeCluster E2E Tests'
      }
    ],
    [
      'jest-html-reporters',
      {
        publicPath: 'tests/e2e/results',
        filename: 'report.html',
        expand: true,
        hideIcon: true
      }
    ]
  ],
  
  // Error handling
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
  
  // Environment variables
  testEnvironmentOptions: {
    url: 'http://localhost'
  }
};