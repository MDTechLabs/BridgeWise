import { defineConfig } from 'hardhat/config';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';

/**
 * Scoped Hardhat config for the signer policy destination/method allowlist and
 * simulation-gate evidence (issues #1513 and #1514).
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
    sources: ['./contracts/policy', './test/policy'],
    tests: './test/policy',
    cache: './cache/signer-policy',
    artifacts: './artifacts/signer-policy',
  },
});
