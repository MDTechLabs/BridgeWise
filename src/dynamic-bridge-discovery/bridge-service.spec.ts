import { Test, TestingModule } from '@nestjs/testing';
import { BridgeService } from '../bridge.service';
import { BridgeRegistry } from '../registry/bridge.registry';
import { BridgeLoader } from '../loaders/bridge.loader';
import { BridgeAdapter } from '../interfaces/bridge-adapter.interface';
import { BridgeNotFoundException } from '../exceptions/bridge.exceptions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAdapter(name: string, healthy = true): BridgeAdapter {
  return {
    name,
    version: '1.0.0',
    capabilities: [{ name: 'test-cap', version: '1.0.0' }],
    initialize: jest.fn().mockResolvedValue(undefined),
    isHealthy: jest.fn().mockResolvedValue(healthy),
    shutdown: jest.fn().mockResolvedValue(undefined),
    execute: jest.fn().mockResolvedValue({ result: `${name}-ok` }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BridgeService', () => {
  let service: BridgeService;
  let registry: BridgeRegistry;
  let loader: BridgeLoader;

  beforeEach(async () => {
    const mockLoader = {
      registerAdapter: jest.fn().mockResolvedValue(undefined),
      loadAdapterFromFile: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgeService,
        BridgeRegistry,
        { provide: BridgeLoader, useValue: mockLoader },
      ],
    }).compile();

    service = module.get<BridgeService>(BridgeService);
    registry = module.get<BridgeRegistry>(BridgeRegistry);
    loader = module.get<BridgeLoader>(BridgeLoader);
  });

  afterEach(() => {
    registry.clear();
    jest.clearAllMocks();
  });

  // ── execute() ────────────────────────────────────────────────────────────────

  describe('execute()', () => {
    it('should execute operation on a registered bridge', async () => {
      const adapter = makeAdapter('http-bridge');
      registry.register(adapter);

      const result = await service.execute('http-bridge', 'GET', { url: '/api' });

      expect(adapter.execute).toHaveBeenCalledWith('GET', { url: '/api' });
      expect(result).toEqual({ result: 'http-bridge-ok' });
    });

    it('should throw BridgeNotFoundException for unknown bridge', async () => {
      await expect(service.execute('ghost', 'GET', {})).rejects.toThrow(BridgeNotFoundException);
    });
  });

  // ── executeByCapability() ─────────────────────────────────────────────────

  describe('executeByCapability()', () => {
    it('should execute operation on all bridges with matching capability', async () => {
      const a = makeAdapter('bridge-a');
      const b = makeAdapter('bridge-b');
      registry.register(a);
      registry.register(b);

      const results = await service.executeByCapability('test-cap', 'ping', {});

      expect(a.execute).toHaveBeenCalledWith('ping', {});
      expect(b.execute).toHaveBeenCalledWith('ping', {});
      expect(results).toHaveLength(2);
    });
  });

  // ── registerBridge() (runtime injection) ─────────────────────────────────

  describe('registerBridge()', () => {
    it('should delegate to loader.registerAdapter', async () => {
      const adapter = makeAdapter('runtime-bridge');
      await service.registerBridge(adapter, { plugin: true });

      expect(loader.registerAdapter).toHaveBeenCalledWith(adapter, { plugin: true });
    });
  });

  // ── loadBridgeFromFile() ──────────────────────────────────────────────────

  describe('loadBridgeFromFile()', () => {
    it('should delegate to loader.loadAdapterFromFile', async () => {
      await service.loadBridgeFromFile('/path/to/bridge.js');

      expect(loader.loadAdapterFromFile).toHaveBeenCalledWith('/path/to/bridge.js');
    });
  });

  // ── hasBridge / listBridges / getBridge ───────────────────────────────────

  describe('bridge querying', () => {
    beforeEach(() => {
      registry.register(makeAdapter('alpha'));
      registry.register(makeAdapter('beta'));
    });

    it('hasBridge() should return true for registered bridges', () => {
      expect(service.hasBridge('alpha')).toBe(true);
    });

    it('hasBridge() should return false for unregistered bridges', () => {
      expect(service.hasBridge('gamma')).toBe(false);
    });

    it('listBridges() should return all bridge names', () => {
      expect(service.listBridges()).toEqual(expect.arrayContaining(['alpha', 'beta']));
    });

    it('getBridge() should return the adapter', () => {
      const adapter = service.getBridge('alpha');
      expect(adapter.name).toBe('alpha');
    });

    it('tryGetBridge() should return undefined for unknown bridge', () => {
      expect(service.tryGetBridge('ghost')).toBeUndefined();
    });
  });

  // ── healthCheck() ─────────────────────────────────────────────────────────

  describe('healthCheck()', () => {
    it('should return health status for all bridges', async () => {
      registry.register(makeAdapter('healthy-bridge', true));
      registry.register(makeAdapter('sick-bridge', false));

      const result = await service.healthCheck();

      expect(result['healthy-bridge']).toBe(true);
      expect(result['sick-bridge']).toBe(false);
    });

    it('should mark bridge as false when isHealthy() throws', async () => {
      const adapter = makeAdapter('error-bridge');
      (adapter.isHealthy as jest.Mock).mockRejectedValue(new Error('Timeout'));
      registry.register(adapter);

      const result = await service.healthCheck();

      expect(result['error-bridge']).toBe(false);
    });
  });

  // ── shutdownAll() ──────────────────────────────────────────────────────────

  describe('shutdownAll()', () => {
    it('should call shutdown on all bridges', async () => {
      const a = makeAdapter('a');
      const b = makeAdapter('b');
      registry.register(a);
      registry.register(b);

      await service.shutdownAll();

      expect(a.shutdown).toHaveBeenCalled();
      expect(b.shutdown).toHaveBeenCalled();
    });

    it('should not throw even if one bridge shutdown fails', async () => {
      const a = makeAdapter('a');
      (a.shutdown as jest.Mock).mockRejectedValue(new Error('Shutdown error'));
      registry.register(a);

      await expect(service.shutdownAll()).resolves.not.toThrow();
    });
  });
});
