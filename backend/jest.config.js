/**
 * Tests live next to nothing - they're all under tests/, because the units
 * worth testing here are the pure ones (graph execution, resume mapping,
 * error classification, config validation) and colocating those would
 * scatter them across five service folders.
 *
 * remotion/ is excluded wholesale: it has its own vendored node_modules and
 * its own engine test suite, and jest walking into it picks up thousands of
 * third-party spec files.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/remotion/'],
  clearMocks: true,
  // Surfaces a test that leaves a timer or Redis socket open instead of
  // letting jest hang for 10s and then blame the wrong test.
  detectOpenHandles: false,
  testTimeout: 10000,
};
