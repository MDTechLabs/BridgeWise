/**
 * File: tests/resolvers/contracts/soroban-contract-resolver.spec.ts
 *
 * Unit tests for SorobanContractResolver.
 *
 * Coverage:
 *   ✓ Contract resolver implemented and instantiable
 *   ✓ Network-specific addresses returned correctly
 *   ✓ Unsupported networks are rejected (UnsupportedNetworkError)
 *   ✓ Environment-variable overrides are applied when set
 *   ✓ Env overrides can be bypassed with ignoreEnvOverride
 *   ✓ Missing contract raises ContractNotFoundError
 *   ✓ Duplicate registration raises DuplicateContractError
 *   ✓ Batch registration and rollback on conflict
 *   ✓ Update, deregister, has, listEntries, resolveAll
 *   ✓ Singleton sorobanContractResolver is pre-seeded
 */

import { SorobanContractResolver, sorobanContractResolver } from '../../../src/resolvers/contracts/soroban/soroban-contract-resolver.service';
import {
  ContractNotFoundError,
  DuplicateContractError,
  UnsupportedNetworkError,
} from '../../../src/resolvers/contracts/soroban/soroban-contract-resolver.types';
import { StellarNetwork } from '../../../src/config/networks/stellar-networks';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TESTNET_ADDR = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVLIHE';
const MAINNET_ADDR = 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBULIHE';
const ENV_ADDR = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCULIHE';

function freshResolver(): SorobanContractResolver {
  return new SorobanContractResolver();
}

// ─── Describe: instantiation ──────────────────────────────────────────────────

describe('SorobanContractResolver', () => {
  describe('instantiation', () => {
    it('creates a fresh empty resolver', () => {
      const resolver = freshResolver();
      expect(resolver.listEntries()).toHaveLength(0);
    });
  });

  // ─── Describe: register ────────────────────────────────────────────────────

  describe('register()', () => {
    it('stores an entry and makes it retrievable via has()', () => {
      const resolver = freshResolver();
      resolver.register({
        contractName: 'my_contract',
        network: StellarNetwork.TESTNET,
        address: TESTNET_ADDR,
      });
      expect(resolver.has('my_contract', StellarNetwork.TESTNET)).toBe(true);
    });

    it('normalises contract names to lowercase', () => {
      const resolver = freshResolver();
      resolver.register({
        contractName: 'My_Contract',
        network: StellarNetwork.TESTNET,
        address: TESTNET_ADDR,
      });
      expect(resolver.has('my_contract', StellarNetwork.TESTNET)).toBe(true);
      expect(resolver.getEntry('MY_CONTRACT', StellarNetwork.TESTNET)).toBeDefined();
    });

    it('throws UnsupportedNetworkError for an unknown network string', () => {
      const resolver = freshResolver();
      expect(() =>
        resolver.register({
          contractName: 'x',
          network: 'zanzibar' as StellarNetwork,
          address: TESTNET_ADDR,
        }),
      ).toThrow(UnsupportedNetworkError);
    });

    it('throws DuplicateContractError on second registration for same name+network', () => {
      const resolver = freshResolver();
      resolver.register({
        contractName: 'vault',
        network: StellarNetwork.TESTNET,
        address: TESTNET_ADDR,
      });
      expect(() =>
        resolver.register({
          contractName: 'vault',
          network: StellarNetwork.TESTNET,
          address: MAINNET_ADDR,
        }),
      ).toThrow(DuplicateContractError);
    });

    it('allows the same name on different networks', () => {
      const resolver = freshResolver();
      resolver.register({ contractName: 'vault', network: StellarNetwork.TESTNET, address: TESTNET_ADDR });
      resolver.register({ contractName: 'vault', network: StellarNetwork.MAINNET, address: MAINNET_ADDR });
      expect(resolver.has('vault', StellarNetwork.TESTNET)).toBe(true);
      expect(resolver.has('vault', StellarNetwork.MAINNET)).toBe(true);
    });
  });

  // ─── Describe: registerBatch ──────────────────────────────────────────────

  describe('registerBatch()', () => {
    it('registers multiple entries at once', () => {
      const resolver = freshResolver();
      resolver.registerBatch([
        { contractName: 'a', network: StellarNetwork.TESTNET, address: TESTNET_ADDR },
        { contractName: 'b', network: StellarNetwork.MAINNET, address: MAINNET_ADDR },
      ]);
      expect(resolver.has('a', StellarNetwork.TESTNET)).toBe(true);
      expect(resolver.has('b', StellarNetwork.MAINNET)).toBe(true);
    });

    it('leaves the registry unchanged when any entry would be a duplicate', () => {
      const resolver = freshResolver();
      resolver.register({ contractName: 'a', network: StellarNetwork.TESTNET, address: TESTNET_ADDR });

      expect(() =>
        resolver.registerBatch([
          { contractName: 'new_one', network: StellarNetwork.TESTNET, address: TESTNET_ADDR },
          { contractName: 'a', network: StellarNetwork.TESTNET, address: MAINNET_ADDR }, // duplicate
        ]),
      ).toThrow(DuplicateContractError);

      // 'new_one' must NOT have been persisted despite being valid
      expect(resolver.has('new_one', StellarNetwork.TESTNET)).toBe(false);
    });
  });

  // ─── Describe: resolve – network-specific addresses ───────────────────────

  describe('resolve() – network-specific addresses', () => {
    it('returns the testnet address for StellarNetwork.TESTNET', () => {
      const resolver = freshResolver();
      resolver.register({ contractName: 'vault', network: StellarNetwork.TESTNET, address: TESTNET_ADDR });
      resolver.register({ contractName: 'vault', network: StellarNetwork.MAINNET, address: MAINNET_ADDR });

      const result = resolver.resolve('vault', StellarNetwork.TESTNET);
      expect(result.address).toBe(TESTNET_ADDR);
      expect(result.network).toBe(StellarNetwork.TESTNET);
      expect(result.resolvedFromEnv).toBe(false);
    });

    it('returns the mainnet address for StellarNetwork.MAINNET', () => {
      const resolver = freshResolver();
      resolver.register({ contractName: 'vault', network: StellarNetwork.TESTNET, address: TESTNET_ADDR });
      resolver.register({ contractName: 'vault', network: StellarNetwork.MAINNET, address: MAINNET_ADDR });

      const result = resolver.resolve('vault', StellarNetwork.MAINNET);
      expect(result.address).toBe(MAINNET_ADDR);
      expect(result.network).toBe(StellarNetwork.MAINNET);
    });

    it('returns the futurenet address for StellarNetwork.FUTURENET', () => {
      const resolver = freshResolver();
      const futurenetAddr = 'CDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
      resolver.register({ contractName: 'vault', network: StellarNetwork.FUTURENET, address: futurenetAddr });

      const result = resolver.resolve('vault', StellarNetwork.FUTURENET);
      expect(result.address).toBe(futurenetAddr);
      expect(result.network).toBe(StellarNetwork.FUTURENET);
    });

    it('returns the development address for StellarNetwork.DEVELOPMENT', () => {
      const resolver = freshResolver();
      const devAddr = 'CEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
      resolver.register({ contractName: 'vault', network: StellarNetwork.DEVELOPMENT, address: devAddr });

      const result = resolver.resolve('vault', StellarNetwork.DEVELOPMENT);
      expect(result.address).toBe(devAddr);
    });

    it('includes the full ContractEntry in the result', () => {
      const resolver = freshResolver();
      resolver.register({ contractName: 'vault', network: StellarNetwork.TESTNET, address: TESTNET_ADDR, description: 'test vault' });

      const result = resolver.resolve('vault', StellarNetwork.TESTNET);
      expect(result.entry.description).toBe('test vault');
      expect(result.contractName).toBe('vault');
    });

    it('is case-insensitive on contractName lookup', () => {
      const resolver = freshResolver();
      resolver.register({ contractName: 'Bridge_Vault', network: StellarNetwork.TESTNET, address: TESTNET_ADDR });

      const result = resolver.resolve('BRIDGE_VAULT', StellarNetwork.TESTNET);
      expect(result.address).toBe(TESTNET_ADDR);
    });
  });

  // ─── Describe: resolve – unsupported network rejection ────────────────────

  describe('resolve() – unsupported network rejection', () => {
    it('throws UnsupportedNetworkError for an invalid network string', () => {
      const resolver = freshResolver();
      expect(() =>
        resolver.resolve('vault', 'ethereum' as StellarNetwork),
      ).toThrow(UnsupportedNetworkError);
    });

    it('error message names the offending network', () => {
      const resolver = freshResolver();
      try {
        resolver.resolve('vault', 'not_a_network' as StellarNetwork);
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(UnsupportedNetworkError);
        expect((err as Error).message).toContain('not_a_network');
      }
    });

    it('throws UnsupportedNetworkError from register() for unsupported networks', () => {
      const resolver = freshResolver();
      expect(() =>
        resolver.register({ contractName: 'x', network: 'rinkeby' as StellarNetwork, address: 'CA...' }),
      ).toThrow(UnsupportedNetworkError);
    });
  });

  // ─── Describe: resolve – missing contract ─────────────────────────────────

  describe('resolve() – ContractNotFoundError', () => {
    it('throws when no entry exists for the name+network', () => {
      const resolver = freshResolver();
      expect(() =>
        resolver.resolve('nonexistent', StellarNetwork.TESTNET),
      ).toThrow(ContractNotFoundError);
    });

    it('throws when entry exists on a different network', () => {
      const resolver = freshResolver();
      resolver.register({ contractName: 'vault', network: StellarNetwork.TESTNET, address: TESTNET_ADDR });

      expect(() =>
        resolver.resolve('vault', StellarNetwork.MAINNET),
      ).toThrow(ContractNotFoundError);
    });

    it('error message includes contract name and network', () => {
      const resolver = freshResolver();
      try {
        resolver.resolve('my_contract', StellarNetwork.TESTNET);
      } catch (err) {
        expect((err as Error).message).toContain('my_contract');
        expect((err as Error).message).toContain(StellarNetwork.TESTNET);
      }
    });
  });

  // ─── Describe: environment-variable overrides ─────────────────────────────

  describe('resolve() – environment-variable overrides', () => {
    const ENV_KEY = 'TEST_CONTRACT_ADDRESS_OVERRIDE';

    afterEach(() => {
      delete process.env[ENV_KEY];
    });

    it('uses the env override address when the env var is set', () => {
      process.env[ENV_KEY] = ENV_ADDR;
      const resolver = freshResolver();
      resolver.register({
        contractName: 'vault',
        network: StellarNetwork.TESTNET,
        address: TESTNET_ADDR,
        envOverrideKey: ENV_KEY,
      });

      const result = resolver.resolve('vault', StellarNetwork.TESTNET);
      expect(result.address).toBe(ENV_ADDR);
      expect(result.resolvedFromEnv).toBe(true);
    });

    it('falls back to static address when env var is not set', () => {
      delete process.env[ENV_KEY]; // ensure unset
      const resolver = freshResolver();
      resolver.register({
        contractName: 'vault',
        network: StellarNetwork.TESTNET,
        address: TESTNET_ADDR,
        envOverrideKey: ENV_KEY,
      });

      const result = resolver.resolve('vault', StellarNetwork.TESTNET);
      expect(result.address).toBe(TESTNET_ADDR);
      expect(result.resolvedFromEnv).toBe(false);
    });

    it('ignores the env override when ignoreEnvOverride is true', () => {
      process.env[ENV_KEY] = ENV_ADDR;
      const resolver = freshResolver();
      resolver.register({
        contractName: 'vault',
        network: StellarNetwork.TESTNET,
        address: TESTNET_ADDR,
        envOverrideKey: ENV_KEY,
      });

      const result = resolver.resolve('vault', StellarNetwork.TESTNET, { ignoreEnvOverride: true });
      expect(result.address).toBe(TESTNET_ADDR);
      expect(result.resolvedFromEnv).toBe(false);
    });

    it('ignores whitespace-only env var values', () => {
      process.env[ENV_KEY] = '   ';
      const resolver = freshResolver();
      resolver.register({
        contractName: 'vault',
        network: StellarNetwork.TESTNET,
        address: TESTNET_ADDR,
        envOverrideKey: ENV_KEY,
      });

      const result = resolver.resolve('vault', StellarNetwork.TESTNET);
      expect(result.address).toBe(TESTNET_ADDR);
      expect(result.resolvedFromEnv).toBe(false);
    });

    it('trims whitespace from env var value', () => {
      process.env[ENV_KEY] = `  ${ENV_ADDR}  `;
      const resolver = freshResolver();
      resolver.register({
        contractName: 'vault',
        network: StellarNetwork.TESTNET,
        address: TESTNET_ADDR,
        envOverrideKey: ENV_KEY,
      });

      const result = resolver.resolve('vault', StellarNetwork.TESTNET);
      expect(result.address).toBe(ENV_ADDR);
      expect(result.resolvedFromEnv).toBe(true);
    });
  });

  // ─── Describe: update() ───────────────────────────────────────────────────

  describe('update()', () => {
    it('updates the address of an existing entry', () => {
      const resolver = freshResolver();
      resolver.register({ contractName: 'vault', network: StellarNetwork.TESTNET, address: TESTNET_ADDR });

      const updated = resolver.update('vault', StellarNetwork.TESTNET, { address: MAINNET_ADDR });
      expect(updated.address).toBe(MAINNET_ADDR);

      const resolved = resolver.resolve('vault', StellarNetwork.TESTNET);
      expect(resolved.address).toBe(MAINNET_ADDR);
    });

    it('throws ContractNotFoundError for non-existent entry', () => {
      const resolver = freshResolver();
      expect(() =>
        resolver.update('nonexistent', StellarNetwork.TESTNET, { address: TESTNET_ADDR }),
      ).toThrow(ContractNotFoundError);
    });
  });

  // ─── Describe: deregister() ───────────────────────────────────────────────

  describe('deregister()', () => {
    it('removes an existing entry and returns true', () => {
      const resolver = freshResolver();
      resolver.register({ contractName: 'vault', network: StellarNetwork.TESTNET, address: TESTNET_ADDR });

      expect(resolver.deregister('vault', StellarNetwork.TESTNET)).toBe(true);
      expect(resolver.has('vault', StellarNetwork.TESTNET)).toBe(false);
    });

    it('returns false when entry did not exist', () => {
      const resolver = freshResolver();
      expect(resolver.deregister('ghost', StellarNetwork.TESTNET)).toBe(false);
    });
  });

  // ─── Describe: resolveAll() ───────────────────────────────────────────────

  describe('resolveAll()', () => {
    it('returns all entries for a given network', () => {
      const resolver = freshResolver();
      resolver.register({ contractName: 'vault', network: StellarNetwork.TESTNET, address: TESTNET_ADDR });
      resolver.register({ contractName: 'swap', network: StellarNetwork.TESTNET, address: MAINNET_ADDR });
      resolver.register({ contractName: 'vault', network: StellarNetwork.MAINNET, address: MAINNET_ADDR });

      const results = resolver.resolveAll(StellarNetwork.TESTNET);
      expect(results).toHaveLength(2);
      const names = results.map((r) => r.contractName);
      expect(names).toContain('vault');
      expect(names).toContain('swap');
    });

    it('returns an empty array when no contracts are registered for the network', () => {
      const resolver = freshResolver();
      expect(resolver.resolveAll(StellarNetwork.TESTNET)).toHaveLength(0);
    });

    it('throws UnsupportedNetworkError for invalid network', () => {
      const resolver = freshResolver();
      expect(() =>
        resolver.resolveAll('badnet' as StellarNetwork),
      ).toThrow(UnsupportedNetworkError);
    });
  });

  // ─── Describe: listEntries() ──────────────────────────────────────────────

  describe('listEntries()', () => {
    it('lists all entries when no filter is given', () => {
      const resolver = freshResolver();
      resolver.register({ contractName: 'a', network: StellarNetwork.TESTNET, address: TESTNET_ADDR });
      resolver.register({ contractName: 'b', network: StellarNetwork.MAINNET, address: MAINNET_ADDR });

      expect(resolver.listEntries()).toHaveLength(2);
    });

    it('filters by network when a filter is provided', () => {
      const resolver = freshResolver();
      resolver.register({ contractName: 'a', network: StellarNetwork.TESTNET, address: TESTNET_ADDR });
      resolver.register({ contractName: 'b', network: StellarNetwork.MAINNET, address: MAINNET_ADDR });

      const testnet = resolver.listEntries(StellarNetwork.TESTNET);
      expect(testnet).toHaveLength(1);
      expect(testnet[0].contractName).toBe('a');
    });
  });

  // ─── Describe: clear() ───────────────────────────────────────────────────

  describe('clear()', () => {
    it('removes all registered entries', () => {
      const resolver = freshResolver();
      resolver.register({ contractName: 'vault', network: StellarNetwork.TESTNET, address: TESTNET_ADDR });
      resolver.clear();
      expect(resolver.listEntries()).toHaveLength(0);
    });
  });

  // ─── Describe: singleton sorobanContractResolver ─────────────────────────

  describe('sorobanContractResolver (singleton)', () => {
    it('is an instance of SorobanContractResolver', () => {
      expect(sorobanContractResolver).toBeInstanceOf(SorobanContractResolver);
    });

    it('is pre-seeded with bridge_vault entries for all networks', () => {
      for (const network of Object.values(StellarNetwork)) {
        expect(sorobanContractResolver.has('bridge_vault', network)).toBe(true);
      }
    });

    it('is pre-seeded with atomic_swap entries for all networks', () => {
      for (const network of Object.values(StellarNetwork)) {
        expect(sorobanContractResolver.has('atomic_swap', network)).toBe(true);
      }
    });

    it('resolves bridge_vault on testnet to a non-empty address', () => {
      const result = sorobanContractResolver.resolve('bridge_vault', StellarNetwork.TESTNET);
      expect(result.address).toBeTruthy();
      expect(result.network).toBe(StellarNetwork.TESTNET);
    });

    it('testnet and mainnet bridge_vault addresses are different', () => {
      const testnet = sorobanContractResolver.resolve('bridge_vault', StellarNetwork.TESTNET);
      const mainnet = sorobanContractResolver.resolve('bridge_vault', StellarNetwork.MAINNET);
      expect(testnet.address).not.toBe(mainnet.address);
    });
  });

  // ─── Describe: error type names ───────────────────────────────────────────

  describe('error type names', () => {
    it('UnsupportedNetworkError has correct name', () => {
      const err = new UnsupportedNetworkError('badnet');
      expect(err.name).toBe('UnsupportedNetworkError');
      expect(err).toBeInstanceOf(Error);
    });

    it('ContractNotFoundError has correct name', () => {
      const err = new ContractNotFoundError('vault', StellarNetwork.TESTNET);
      expect(err.name).toBe('ContractNotFoundError');
      expect(err).toBeInstanceOf(Error);
    });

    it('DuplicateContractError has correct name', () => {
      const err = new DuplicateContractError('vault', StellarNetwork.TESTNET);
      expect(err.name).toBe('DuplicateContractError');
      expect(err).toBeInstanceOf(Error);
    });
  });
});
