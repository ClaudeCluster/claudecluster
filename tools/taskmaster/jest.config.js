module.exports = {
  testEnvironment: 'node',
  passWithNoTests: true,
  collectCoverageFrom: [
    '*.js',
    '!jest.config.js',
    '!taskmaster.config.js'
  ]
};