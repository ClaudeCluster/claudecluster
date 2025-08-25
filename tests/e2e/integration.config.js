module.exports = {
  displayName: 'E2E Integration Tests',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/e2e/integration/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/utils/setup-e2e.js'],
  testTimeout: 300000, // 5 minutes
  maxConcurrency: 2,
  verbose: true,
  collectCoverage: false,
  globalSetup: '<rootDir>/tests/utils/global-setup.js',
  globalTeardown: '<rootDir>/tests/utils/global-teardown.js'
};