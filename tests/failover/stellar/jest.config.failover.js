/**
 * Local Jest config for failover simulator tests.
 *
 * Avoids the repo's default jest-environment-jsdom dependency issues
 * by running in the Node environment.
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/provider-outage-simulator*.spec.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },
};


