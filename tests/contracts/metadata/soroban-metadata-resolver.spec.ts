import {
  SorobanContractMetadataResolver,
  SorobanContractMetadataCache,
  ContractInterfaceMetadata,
  ContractFunctionSpec,
  MetadataNetwork,
  MetadataStatus,
} from '../../../src/contracts/metadata/soroban';

// ---- helpers ----

function makeMetadata(
  overrides: Partial<ContractInterfaceMetadata> & { contractAddress: string },
): ContractInterfaceMetadata {
  return {
    network: MetadataNetwork.TESTNET,
    resolvedAt: Date.now(),
    status: MetadataStatus.RESOLVED,
    functions: [
      {
        name: 'transfer',
        parameters: [
          { name: 'to', type: 'Address' },
          { name: 'amount', type: 'i128' },
        ],
        returnType: 'Result<void, Error>',
      },
    ],
    events: [],
    errors: [],
    ...overrides,
  };
}

function makeMetadataWithFunctions(
  address: string,
  fnCount: number,
): ContractInterfaceMetadata {
  const functions: ContractFunctionSpec[] = Array.from({ length: fnCount }, (_, i) => ({
    name: `fn_${i}`,
    parameters: [{ name: `p${i}`, type: 'u32' }],
    returnType: 'void',
  }));
  return makeMetadata({ contractAddress: address, functions });
}

// ---- tests ----

describe('SorobanContractMetadataCache (#916)', () => {
  let cache: SorobanContractMetadataCache;

  beforeEach(() => {
    cache = new SorobanContractMetadataCache({ maxSize: 5, defaultTtlMs: 10_000 });
  });

  it('should store and retrieve metadata', () => {
    const meta = makeMetadata({ contractAddress: 'CABC' });
    cache.set('CABC', 'testnet', meta);

    const hit = cache.get('CABC', 'testnet');
    expect(hit).not.toBeNull();
    expect(hit!.contractAddress).toBe('CABC');
  });

  it('should return null on cache miss', () => {
    expect(cache.get('CNONE', 'testnet')).toBeNull();
  });

  it('should distinguish between networks', () => {
    const metaTest = makeMetadata({ contractAddress: 'CABC', network: MetadataNetwork.TESTNET });
    const metaPub = makeMetadata({
      contractAddress: 'CABC',
      network: MetadataNetwork.PUBLIC,
    });

    cache.set('CABC', 'testnet', metaTest);
    cache.set('CABC', 'public', metaPub);

    expect(cache.get('CABC', 'testnet')!.network).toBe(MetadataNetwork.TESTNET);
    expect(cache.get('CABC', 'public')!.network).toBe(MetadataNetwork.PUBLIC);
  });

  it('should expire entries after TTL', async () => {
    cache = new SorobanContractMetadataCache({ defaultTtlMs: 50 });
    const meta = makeMetadata({ contractAddress: 'CABC' });
    cache.set('CABC', 'testnet', meta);

    expect(cache.get('CABC', 'testnet')).not.toBeNull();

    await sleep(70);

    expect(cache.get('CABC', 'testnet')).toBeNull();
  });

  it('should report has() correctly', () => {
    cache.set('CABC', 'testnet', makeMetadata({ contractAddress: 'CABC' }));
    expect(cache.has('CABC', 'testnet')).toBe(true);
    expect(cache.has('CNONE', 'testnet')).toBe(false);
  });

  it('should invalidate an entry', () => {
    cache.set('CABC', 'testnet', makeMetadata({ contractAddress: 'CABC' }));
    expect(cache.invalidate('CABC', 'testnet')).toBe(true);
    expect(cache.get('CABC', 'testnet')).toBeNull();
    expect(cache.invalidate('CNONE', 'testnet')).toBe(false);
  });

  it('should clear all entries', () => {
    cache.set('C1', 'testnet', makeMetadata({ contractAddress: 'C1' }));
    cache.set('C2', 'testnet', makeMetadata({ contractAddress: 'C2' }));
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('should evict least-used entries when full', () => {
    // Fill to capacity
    for (let i = 0; i < 5; i++) {
      cache.set(`C${i}`, 'testnet', makeMetadata({ contractAddress: `C${i}` }));
    }
    expect(cache.size).toBe(5);

    // Access C0 a few times so it has a higher score
    cache.get('C0', 'testnet');
    cache.get('C0', 'testnet');
    cache.get('C0', 'testnet');

    // Insert one more — should evict the least-valued entry
    cache.set('C_NEW', 'testnet', makeMetadata({ contractAddress: 'C_NEW' }));
    expect(cache.size).toBe(5);

    // C0 should survive (accessed frequently)
    expect(cache.get('C0', 'testnet')).not.toBeNull();
    // C_NEW should be present
    expect(cache.get('C_NEW', 'testnet')).not.toBeNull();
  });

  it('should track cache statistics', () => {
    cache.set('C1', 'testnet', makeMetadata({ contractAddress: 'C1' }));
    cache.get('C1', 'testnet'); // hit
    cache.get('CNONE', 'testnet'); // miss

    const stats = cache.getStats();
    expect(stats.totalEntries).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
  });

  it('should use custom TTL per entry', async () => {
    cache = new SorobanContractMetadataCache({ defaultTtlMs: 60_000 });
    cache.set('C_SHORT', 'testnet', makeMetadata({ contractAddress: 'C_SHORT' }), 50);
    cache.set('C_LONG', 'testnet', makeMetadata({ contractAddress: 'C_LONG' }));

    await sleep(70);

    expect(cache.get('C_SHORT', 'testnet')).toBeNull(); // expired
    expect(cache.get('C_LONG', 'testnet')).not.toBeNull(); // still valid
  });
});

describe('SorobanContractMetadataResolver (#916)', () => {
  let resolver: SorobanContractMetadataResolver;

  beforeEach(() => {
    resolver = new SorobanContractMetadataResolver({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      network: MetadataNetwork.TESTNET,
      cacheTtlMs: 60_000,
    });
  });

  describe('resolve()', () => {
    it('should return metadata from a fetcher', async () => {
      const meta = makeMetadata({ contractAddress: 'CABC' });
      const result = await resolver.resolve('CABC', {
        fetcher: async (addr, _net, _rpc) => {
          return { ...meta, contractAddress: addr };
        },
      });

      expect(result.metadata).not.toBeNull();
      expect(result.metadata!.contractAddress).toBe('CABC');
      expect(result.fromCache).toBe(false);
    });

    it('should serve from cache on subsequent calls', async () => {
      const meta = makeMetadata({ contractAddress: 'CABC' });

      // First call: fetcher
      const first = await resolver.resolve('CABC', {
        fetcher: async () => meta,
      });
      expect(first.fromCache).toBe(false);

      // Second call: cache hit
      const second = await resolver.resolve('CABC');
      expect(second.fromCache).toBe(true);
      expect(second.metadata!.contractAddress).toBe('CABC');
    });

    it('should return UNAVAILABLE when no fetcher is provided', async () => {
      const result = await resolver.resolve('CABC');
      expect(result.metadata).toBeNull();
      expect(result.error).toContain('Metadata unavailable');
    });

    it('should force-refresh when forceRefresh is set', async () => {
      const meta = makeMetadata({ contractAddress: 'CABC' });
      let fetchCount = 0;

      const fetcher = async () => {
        fetchCount++;
        return meta;
      };

      await resolver.resolve('CABC', { fetcher });
      expect(fetchCount).toBe(1);

      // Normal call → cache
      await resolver.resolve('CABC', { fetcher });
      expect(fetchCount).toBe(1);

      // Force refresh → fetch again
      await resolver.resolve('CABC', { fetcher, forceRefresh: true });
      expect(fetchCount).toBe(2);
    });

    it('should handle fetcher errors gracefully', async () => {
      const result = await resolver.resolve('CABC', {
        fetcher: async () => {
          throw new Error('Network timeout');
        },
      });

      // With retries exhausted, the error is surfaced
      expect(result.metadata).toBeNull();
      expect(result.error).toContain('Network timeout');
    });

    it('should retry on transient failures', async () => {
      let attempts = 0;
      const meta = makeMetadata({ contractAddress: 'CABC' });

      const result = await resolver.resolve('CABC', {
        fetcher: async () => {
          attempts++;
          if (attempts < 3) throw new Error('transient');
          return meta;
        },
      });

      expect(attempts).toBe(3);
      expect(result.metadata).not.toBeNull();
    });
  });

  describe('resolveBatch()', () => {
    it('should resolve multiple contracts in parallel', async () => {
      const addrs = ['C1', 'C2', 'C3'];
      const results = await resolver.resolveBatch(addrs, {
        fetcher: async (addr) => makeMetadata({ contractAddress: addr }),
      });

      expect(results).toHaveLength(3);
      for (const r of results) {
        expect(r.metadata).not.toBeNull();
        expect(addrs).toContain(r.contractAddress);
      }
    });

    it('should handle mixed success and failure', async () => {
      const addrs = ['C_OK', 'C_FAIL'];
      const results = await resolver.resolveBatch(addrs, {
        fetcher: async (addr) => {
          if (addr === 'C_FAIL') throw new Error('Not found');
          return makeMetadata({ contractAddress: addr });
        },
      });

      const ok = results.find((r) => r.contractAddress === 'C_OK');
      const fail = results.find((r) => r.contractAddress === 'C_FAIL');

      expect(ok!.metadata).not.toBeNull();
      expect(fail!.metadata).toBeNull();
    });
  });

  describe('cacheMetadata()', () => {
    it('should store metadata directly', () => {
      const meta = makeMetadata({ contractAddress: 'CDIRECT' });
      resolver.cacheMetadata(meta);

      const cached = resolver.getCached('CDIRECT');
      expect(cached).not.toBeNull();
      expect(cached!.contractAddress).toBe('CDIRECT');
    });
  });

  describe('detectChange()', () => {
    it('should return null when no previous metadata exists', async () => {
      const meta = makeMetadata({ contractAddress: 'CNEW' });
      const result = await resolver.detectChanges('CNEW', meta);
      expect(result).toBeNull();
    });

    it('should detect spec version changes', async () => {
      const v1 = makeMetadata({
        contractAddress: 'CCHANGE',
        specVersion: '1.0.0',
      });
      resolver.cacheMetadata(v1);

      const v2 = makeMetadata({
        contractAddress: 'CCHANGE',
        specVersion: '2.0.0',
      });

      const result = await resolver.detectChanges('CCHANGE', v2);
      expect(result).not.toBeNull();
      expect(result!.changed).toBe(true);
      expect(result!.previous!.specVersion).toBe('1.0.0');
      expect(result!.current.specVersion).toBe('2.0.0');
    });

    it('should detect function count changes', async () => {
      const v1 = makeMetadataWithFunctions('CFN', 3);
      resolver.cacheMetadata(v1);

      const v2 = makeMetadataWithFunctions('CFN', 5);
      const result = await resolver.detectChanges('CFN', v2);
      expect(result!.changed).toBe(true);
    });

    it('should detect no change when metadata is identical', async () => {
      const meta = makeMetadata({
        contractAddress: 'CSAME',
        specVersion: '1.0.0',
      });
      resolver.cacheMetadata(meta);

      const result = await resolver.detectChanges('CSAME', { ...meta, resolvedAt: Date.now() });
      expect(result!.changed).toBe(false);
    });
  });

  describe('invalidate()', () => {
    it('should remove a cached entry', async () => {
      const meta = makeMetadata({ contractAddress: 'CINV' });
      await resolver.resolve('CINV', { fetcher: async () => meta });
      expect(resolver.getCached('CINV')).not.toBeNull();

      resolver.invalidate('CINV');
      expect(resolver.getCached('CINV')).toBeNull();
    });
  });

  describe('getCacheStats()', () => {
    it('should report hit rate', async () => {
      const meta = makeMetadata({ contractAddress: 'CSTATS' });
      await resolver.resolve('CSTATS', { fetcher: async () => meta });
      await resolver.resolve('CSTATS'); // cache hit

      const stats = resolver.getCacheStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.hits).toBeGreaterThanOrEqual(1);
    });
  });

  describe('failure scenarios', () => {
    it('should handle null from fetcher as unavailable', async () => {
      const result = await resolver.resolve('CNULL', {
        fetcher: async () => null,
      });
      expect(result.metadata).toBeNull();
      expect(result.fromCache).toBe(false);
    });

    it('should handle undefined contract address gracefully', async () => {
      const result = await resolver.resolve('', {
        fetcher: async (addr) => makeMetadata({ contractAddress: addr }),
      });
      expect(result.metadata).not.toBeNull();
      expect(result.metadata!.contractAddress).toBe('');
    });

    it('should handle fetcher that always throws', async () => {
      const resolverRetry = new SorobanContractMetadataResolver({
        rpcUrl: 'https://test.stellar.org',
        maxRetries: 2,
        retryDelayMs: 10, // fast for tests
      });

      const result = await resolverRetry.resolve('CEternalFail', {
        fetcher: async () => {
          throw new Error('Always fails');
        },
      });

      expect(result.metadata).toBeNull();
      expect(result.error).toContain('Always fails');
    });
  });
});

// ---- util ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
