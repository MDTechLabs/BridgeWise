import { defineConfig } from 'hardhat/config';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';

/**
 * Scoped Hardhat config for enforcing maximum payload size and canonical encoding
 * (CanonicalPayloadVerifier).
 */
export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: '0.8.24',
    settings: {
      evmVersion: 'cancun',
    },
  },
  paths: {
    sources: ['./test/bridge/canonical-payload'],
    tests: './test/bridge/canonical-payload',
    cache: './cache/canonical-payload',
    artifacts: './artifacts/canonical-payload',
  },
});
