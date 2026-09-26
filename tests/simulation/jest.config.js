/**
 * Local Jest config for multi-chain fraud proof simulation tests.
 *
 * Runs in the Node environment to avoid the repo's default
 * jest-environment-jsdom dependency issues.
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
};
