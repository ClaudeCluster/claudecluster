module.exports = {
  displayName: 'E2E Smoke Tests',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/e2e/smoke/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/utils/setup-e2e.js'],
  testTimeout: 60000,
  maxConcurrency: 1,
  verbose: true,
  collectCoverage: false,
  globalSetup: '<rootDir>/tests/utils/global-setup.js',
  globalTeardown: '<rootDir>/tests/utils/global-teardown.js'
};