module.exports = {
  displayName: 'E2E Performance Tests',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/e2e/performance/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/utils/setup-e2e.js'],
  testTimeout: 900000, // 15 minutes
  maxConcurrency: 1,
  verbose: true,
  collectCoverage: false,
  globalSetup: '<rootDir>/tests/utils/global-setup.js',
  globalTeardown: '<rootDir>/tests/utils/global-teardown.js'
};