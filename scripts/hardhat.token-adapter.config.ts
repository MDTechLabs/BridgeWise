import { defineConfig } from 'hardhat/config';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';

/**
 * Scoped Hardhat config for the Token Adapter Risk, Approval Guard,
 * Malicious Callback Isolation, and Fee/Rebasing Asset Reconciliation evidence.
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
    sources: ['./contracts/tokens', './test/tokens'],
    tests: './test/tokens',
    cache: './cache/token-adapter',
    artifacts: './artifacts/token-adapter',
  },
});
