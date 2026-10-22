import {
  ContractInterfaceMetadata,
  MetadataNetwork,
  MetadataStatus,
  SorobanContractMetadataResolver,
} from '../../../src/contracts/metadata/soroban';
import {
  DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES,
  ExpectedMethodCapability,
} from '../../../src/contracts/metadata';
import { SorobanContractCompatibilityChecker } from '../../../src/soroban/compatibility';

const CONTRACT_ADDRESS =
  'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

function toFunctionSpec(method: ExpectedMethodCapability) {
  return {
    name: method.name,
    parameters: method.arguments.map((argument) => ({ ...argument })),
    returnType: method.returnType,
  };
}

function metadata(
  overrides: Partial<ContractInterfaceMetadata> = {},
): ContractInterfaceMetadata {
  return {
    contractAddress: CONTRACT_ADDRESS,
    network: MetadataNetwork.TESTNET,
    specVersion: '1.0',
    resolvedAt: Date.now(),
    status: MetadataStatus.RESOLVED,
    functions:
      DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES.methods.map(toFunctionSpec),
    events: [],
    errors: [],
    ...overrides,
  };
}

describe('Soroban contract interface compatibility integration (#1335)', () => {
  it('resolves metadata over the RPC boundary, caches it, and verifies the interface', async () => {
    const resolver = new SorobanContractMetadataResolver({
      rpcUrl: 'https://soroban-testnet.example.org',
      network: MetadataNetwork.TESTNET,
      maxRetries: 2,
      retryDelayMs: 1,
    });
    const checker = new SorobanContractCompatibilityChecker();
    const fetcher = jest.fn().mockResolvedValue(metadata());

    const first = await resolver.resolve(CONTRACT_ADDRESS, { fetcher });
    expect(first.fromCache).toBe(false);
    expect(first.error).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      CONTRACT_ADDRESS,
      MetadataNetwork.TESTNET,
      'https://soroban-testnet.example.org',
    );

    const verdict = checker.check(first.metadata);
    expect(verdict.compatible).toBe(true);
    expect(verdict.missingMethods).toEqual([]);

    const second = await resolver.resolve(CONTRACT_ADDRESS, { fetcher });
    expect(second.fromCache).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const refreshed = await resolver.resolve(CONTRACT_ADDRESS, {
      fetcher,
      forceRefresh: true,
    });
    expect(refreshed.fromCache).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps metadata caches isolated by network boundary', async () => {
    const resolver = new SorobanContractMetadataResolver({
      rpcUrl: 'https://soroban-testnet.example.org',
      network: MetadataNetwork.TESTNET,
      maxRetries: 1,
      retryDelayMs: 1,
    });
    const testnetFetcher = jest
      .fn()
      .mockResolvedValue(
        metadata({ network: MetadataNetwork.TESTNET, specVersion: '1.0' }),
      );
    const publicFetcher = jest
      .fn()
      .mockResolvedValue(
        metadata({ network: MetadataNetwork.PUBLIC, specVersion: '1.1' }),
      );

    const testnet = await resolver.resolve(CONTRACT_ADDRESS, {
      network: MetadataNetwork.TESTNET,
      fetcher: testnetFetcher,
    });
    const publicResult = await resolver.resolve(CONTRACT_ADDRESS, {
      network: MetadataNetwork.PUBLIC,
      fetcher: publicFetcher,
    });

    expect(testnet.fromCache).toBe(false);
    expect(publicResult.fromCache).toBe(false);
    expect(testnet.metadata?.network).toBe(MetadataNetwork.TESTNET);
    expect(publicResult.metadata?.network).toBe(MetadataNetwork.PUBLIC);
    expect(testnetFetcher).toHaveBeenCalledTimes(1);
    expect(publicFetcher).toHaveBeenCalledTimes(1);

    const cachedTestnet = await resolver.resolve(CONTRACT_ADDRESS, {
      network: MetadataNetwork.TESTNET,
      fetcher: publicFetcher,
    });
    expect(cachedTestnet.fromCache).toBe(true);
    expect(cachedTestnet.metadata?.specVersion).toBe('1.0');
    expect(publicFetcher).toHaveBeenCalledTimes(1);
  });

  it('surfaces RPC failures without treating the contract as compatible', async () => {
    const resolver = new SorobanContractMetadataResolver({
      rpcUrl: 'https://soroban-testnet.example.org',
      network: MetadataNetwork.TESTNET,
      maxRetries: 2,
      retryDelayMs: 1,
    });
    const checker = new SorobanContractCompatibilityChecker();
    const fetcher = jest
      .fn()
      .mockRejectedValue(new Error('RPC unavailable at https://rpc.internal'));

    const resolved = await resolver.resolve(CONTRACT_ADDRESS, { fetcher });
    expect(resolved.metadata).toBeNull();
    expect(resolved.error).toContain('RPC unavailable');
    expect(fetcher).toHaveBeenCalledTimes(2);

    const verdict = checker.check(resolved.metadata);
    expect(verdict.compatible).toBe(false);
    expect(verdict.issues[0].code).toBe('METADATA_MISSING');
  });

  it('caches malformed RPC metadata but rejects it during compatibility checks', async () => {
    const resolver = new SorobanContractMetadataResolver({
      rpcUrl: 'https://soroban-testnet.example.org',
      network: MetadataNetwork.TESTNET,
      maxRetries: 1,
      retryDelayMs: 1,
    });
    const checker = new SorobanContractCompatibilityChecker();
    const malformed = metadata({
      functions: [
        toFunctionSpec(DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES.methods[0]),
      ],
    });
    const fetcher = jest.fn().mockResolvedValue(malformed);

    const first = await resolver.resolve(CONTRACT_ADDRESS, { fetcher });
    const verdict = checker.check(first.metadata);

    expect(first.fromCache).toBe(false);
    expect(verdict.compatible).toBe(false);
    expect(verdict.missingMethods).toEqual(['quote', 'cancel']);

    const second = await resolver.resolve(CONTRACT_ADDRESS, {
      fetcher: jest.fn(),
    });
    expect(second.fromCache).toBe(true);
  });
});
