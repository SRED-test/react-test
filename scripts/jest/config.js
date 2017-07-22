module.exports = {
  modulePathIgnorePatterns: [
    '/.module-cache/',
    '<rootDir>/build/',
    '<rootDir>/scripts/rollup/shims/',
    '<rootDir>/scripts/bench/',
  ],
  rootDir: '../../',
  transform: {
    '.*': './scripts/jest/preprocessor.js',
  },
  setupFiles: ['./scripts/jest/environment.js'],
  setupTestFrameworkScriptFile: './scripts/jest/test-framework-setup.js',
  testRegex: '/__tests__/.*(\\.js|coffee|ts)$',
  moduleFileExtensions: ['js', 'json', 'node', 'coffee', 'ts'],
  roots: [
    '<rootDir>/eslint-rules',
    '<rootDir>/mocks',
    '<rootDir>/scripts',
    '<rootDir>/src',
    'node_modules/fbjs',
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/__mocks__/vendor/third_party/*.js',
    '!src/test/*.js',
  ],
  timers: 'fake',
};
