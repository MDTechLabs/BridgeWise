import { Test, TestingModule } from '@nestjs/testing';
import { BridgeRegistry } from '../registry/bridge.registry';
import { BridgeAdapter } from '../interfaces/bridge-adapter.interface';
import {
  BridgeCapabilityNotFoundException,
  BridgeDuplicateException,
  BridgeNotFoundException,
} from '../exceptions/bridge.exceptions';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAdapter(
  name: string,
  capabilities: { name: string; version: string }[] = [],
): BridgeAdapter {
  return {
    name,
    version: '1.0.0',
    capabilities,
    initialize: jest.fn().mockResolvedValue(undefined),
    isHealthy: jest.fn().mockResolvedValue(true),
    shutdown: jest.fn().mockResolvedValue(undefined),
    execute: jest.fn().mockResolvedValue({ ok: true }),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BridgeRegistry', () => {
  let registry: BridgeRegistry;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BridgeRegistry],
    }).compile();

    registry = module.get<BridgeRegistry>(BridgeRegistry);
  });

  afterEach(() => {
    registry.clear();
  });

  // ── Registration ────────────────────────────────────────────────────────

  describe('register()', () => {
    it('should register a bridge adapter successfully', () => {
      const adapter = makeAdapter('test-bridge');
      registry.register(adapter);

      expect(registry.has('test-bridge')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should store metadata alongside the adapter', () => {
      const adapter = makeAdapter('meta-bridge');
      registry.register(adapter, { source: '/some/path' });

      const entries = registry.listEntries();
      expect(entries[0].metadata).toEqual({ source: '/some/path' });
    });

    it('should set registeredAt timestamp on registration', () => {
      const before = new Date();
      const adapter = makeAdapter('ts-bridge');
      registry.register(adapter);
      const after = new Date();

      const entry = registry.listEntries()[0];
      expect(entry.registeredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry.registeredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should register multiple different adapters', () => {
      registry.register(makeAdapter('bridge-a'));
      registry.register(makeAdapter('bridge-b'));
      registry.register(makeAdapter('bridge-c'));

      expect(registry.size).toBe(3);
      expect(registry.list()).toEqual(expect.arrayContaining(['bridge-a', 'bridge-b', 'bridge-c']));
    });
  });

  // ── Duplicate prevention ─────────────────────────────────────────────────

  describe('duplicate registration', () => {
    it('should throw BridgeDuplicateException on duplicate registration (default mode)', () => {
      registry.register(makeAdapter('dupe-bridge'));

      expect(() => registry.register(makeAdapter('dupe-bridge'))).toThrow(
        BridgeDuplicateException,
      );
    });

    it('should throw error with correct message on duplicate', () => {
      registry.register(makeAdapter('dupe-bridge'));

      expect(() => registry.register(makeAdapter('dupe-bridge'))).toThrow(
        'Bridge adapter "dupe-bridge" is already registered.',
      );
    });

    it('should allow overwrite when allowOverwrite mode is set', () => {
      registry.setOverwriteMode(true);

      const first = makeAdapter('overwrite-bridge');
      const second = makeAdapter('overwrite-bridge');

      registry.register(first);
      registry.register(second); // should not throw

      expect(registry.get('overwrite-bridge')).toBe(second);
    });

    it('should keep exactly one entry after overwrite', () => {
      registry.setOverwriteMode(true);
      registry.register(makeAdapter('overwrite-bridge'));
      registry.register(makeAdapter('overwrite-bridge'));

      expect(registry.size).toBe(1);
    });
  });

  // ── Retrieval ─────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('should return the registered adapter by name', () => {
      const adapter = makeAdapter('my-bridge');
      registry.register(adapter);

      expect(registry.get('my-bridge')).toBe(adapter);
    });

    it('should throw BridgeNotFoundException for unknown bridge', () => {
      expect(() => registry.get('unknown')).toThrow(BridgeNotFoundException);
    });

    it('should throw with correct message for unknown bridge', () => {
      expect(() => registry.get('ghost-bridge')).toThrow(
        'Bridge adapter "ghost-bridge" not found in registry.',
      );
    });
  });

  describe('tryGet()', () => {
    it('should return adapter when found', () => {
      const adapter = makeAdapter('safe-bridge');
      registry.register(adapter);

      expect(registry.tryGet('safe-bridge')).toBe(adapter);
    });

    it('should return undefined (not throw) when bridge not found', () => {
      expect(registry.tryGet('missing')).toBeUndefined();
    });
  });

  // ── Capability resolution ─────────────────────────────────────────────────

  describe('getByCapability()', () => {
    it('should return adapters matching a capability', () => {
      const httpAdapter = makeAdapter('http-bridge', [{ name: 'http', version: '1.0.0' }]);
      const wsAdapter = makeAdapter('ws-bridge', [{ name: 'websocket', version: '1.0.0' }]);
      registry.register(httpAdapter);
      registry.register(wsAdapter);

      const result = registry.getByCapability('http');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('http-bridge');
    });

    it('should return multiple adapters sharing a capability', () => {
      const a = makeAdapter('bridge-a', [{ name: 'rest', version: '1.0.0' }]);
      const b = makeAdapter('bridge-b', [{ name: 'rest', version: '2.0.0' }]);
      registry.register(a);
      registry.register(b);

      const result = registry.getByCapability('rest');
      expect(result).toHaveLength(2);
    });

    it('should throw BridgeCapabilityNotFoundException when no match', () => {
      registry.register(makeAdapter('bridge-x', [{ name: 'grpc', version: '1.0.0' }]));

      expect(() => registry.getByCapability('graphql')).toThrow(
        BridgeCapabilityNotFoundException,
      );
    });
  });

  // ── List & metadata ───────────────────────────────────────────────────────

  describe('list()', () => {
    it('should return empty array when no bridges registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should return all bridge names', () => {
      registry.register(makeAdapter('a'));
      registry.register(makeAdapter('b'));

      expect(registry.list()).toEqual(expect.arrayContaining(['a', 'b']));
    });
  });

  // ── Unregister ─────────────────────────────────────────────────────────────

  describe('unregister()', () => {
    it('should remove a registered adapter', () => {
      registry.register(makeAdapter('remove-me'));
      registry.unregister('remove-me');

      expect(registry.has('remove-me')).toBe(false);
    });

    it('should return true when successfully unregistered', () => {
      registry.register(makeAdapter('remove-me'));
      expect(registry.unregister('remove-me')).toBe(true);
    });

    it('should return false when unregistering non-existent bridge', () => {
      expect(registry.unregister('phantom')).toBe(false);
    });
  });

  // ── Clear ──────────────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('should remove all registered adapters', () => {
      registry.register(makeAdapter('x'));
      registry.register(makeAdapter('y'));
      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.list()).toEqual([]);
    });
  });
});
