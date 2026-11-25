import { defineConfig } from 'hardhat/config';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';

/**
 * Scoped Hardhat config for independent verification of relayer-supplied
 * message metadata (RelayerMetadataVerifier).
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
    sources: ['./test/bridge/relayer-metadata'],
    tests: './test/bridge/relayer-metadata',
    cache: './cache/relayer-metadata',
    artifacts: './artifacts/relayer-metadata',
  },
});
