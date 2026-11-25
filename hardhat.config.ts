import { configVariable, defineConfig } from 'hardhat/config';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: '0.8.24',
    settings: {
      evmVersion: 'cancun',
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
  },
  networks: {
    ethereum: {
      type: 'http',
      chainId: 1,
      url: configVariable('RPC_ETHEREUM'),
      accounts: [configVariable('DEPLOYER_PRIVATE_KEY')],
    },
    polygon: {
      type: 'http',
      chainId: 137,
      url: configVariable('RPC_POLYGON'),
      accounts: [configVariable('DEPLOYER_PRIVATE_KEY')],
    },
    bsc: {
      type: 'http',
      chainId: 56,
      url: configVariable('RPC_BSC'),
      accounts: [configVariable('DEPLOYER_PRIVATE_KEY')],
    },
    arbitrum: {
      type: 'http',
      chainId: 42161,
      url: configVariable('RPC_ARBITRUM'),
      accounts: [configVariable('DEPLOYER_PRIVATE_KEY')],
    },
    optimism: {
      type: 'http',
      chainId: 10,
      url: configVariable('RPC_OPTIMISM'),
      accounts: [configVariable('DEPLOYER_PRIVATE_KEY')],
    },
    base: {
      type: 'http',
      chainId: 8453,
      url: configVariable('RPC_BASE'),
      accounts: [configVariable('DEPLOYER_PRIVATE_KEY')],
    },
  },
});
