module.exports = {
  displayName: 'E2E Resilience Tests',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/e2e/resilience/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/utils/setup-e2e.js'],
  testTimeout: 600000, // 10 minutes
  maxConcurrency: 1,
  verbose: true,
  collectCoverage: false,
  globalSetup: '<rootDir>/tests/utils/global-setup.js',
  globalTeardown: '<rootDir>/tests/utils/global-teardown.js'
};