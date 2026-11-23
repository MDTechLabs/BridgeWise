import { defineConfig } from 'hardhat/config';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';

/**
 * Scoped Hardhat config for the bridge escrow conservation evidence.
 *
 * The root project compiles every contract in `contracts/`; several legacy
 * upgradeable contracts use OpenZeppelin v4 initializer names while the
 * declared dependency is v5, so a full build fails independently of this
 * work. This config compiles only the two contracts needed for the escrow
 * conservation integration suite, keeping the evidence reproducible without
 * changing production bytecode or unrelated dependencies.
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
    sources: ['./contracts/execution', './test/execution'],
    tests: './test/execution',
    cache: './cache/escrow-conservation',
    artifacts: './artifacts/escrow-conservation',
  },
});
