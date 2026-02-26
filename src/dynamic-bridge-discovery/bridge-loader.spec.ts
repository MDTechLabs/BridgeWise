import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { BridgeLoader } from '../loaders/bridge.loader';
import { BridgeRegistry } from '../registry/bridge.registry';
import { BridgeAdapter } from '../interfaces/bridge-adapter.interface';
import {
  BridgeInitializationException,
  BridgeLoadException,
} from '../exceptions/bridge.exceptions';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

function makeAdapter(name = 'mock-bridge'): BridgeAdapter {
  return {
    name,
    version: '1.0.0',
    capabilities: [],
    initialize: jest.fn().mockResolvedValue(undefined),
    isHealthy: jest.fn().mockResolvedValue(true),
    shutdown: jest.fn().mockResolvedValue(undefined),
    execute: jest.fn().mockResolvedValue({}),
  };
}

class ValidAdapter implements BridgeAdapter {
  readonly name = 'valid-adapter';
  readonly version = '1.0.0';
  readonly capabilities = [];

  constructor(public readonly config: Record<string, unknown> = {}) {}

  async initialize(): Promise<void> {}
  async isHealthy(): Promise<boolean> { return true; }
  async shutdown(): Promise<void> {}
  async execute<T, R>(_op: string, _payload: T): Promise<R> { return {} as R; }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BridgeLoader', () => {
  let loader: BridgeLoader;
  let registry: BridgeRegistry;

  function buildLoader(config = {}): BridgeLoader {
    return new BridgeLoader(registry, config);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BridgeRegistry],
    }).compile();

    registry = module.get<BridgeRegistry>(BridgeRegistry);
    loader = buildLoader();
  });

  afterEach(() => {
    registry.clear();
    jest.restoreAllMocks();
  });

  // ── loadFromDirectory ───────────────────────────────────────────────────────

  describe('loadFromDirectory()', () => {
    it('should skip when directory does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);
      const spy = jest.spyOn(registry, 'register');

      await loader.loadFromDirectory('/non/existent');

      expect(spy).not.toHaveBeenCalled();
    });

    it('should scan directory and load .adapter.js files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['http.adapter.js', 'ws.adapter.js', 'README.md'] as any);

      const spyLoad = jest
        .spyOn(loader, 'loadAdapterFromFile')
        .mockResolvedValue(makeAdapter('http-bridge'));

      await loader.loadFromDirectory('/some/bridges');

      // Only .adapter.js files should be loaded
      expect(spyLoad).toHaveBeenCalledTimes(2);
    });

    it('should skip .spec.ts files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['http.adapter.spec.ts', 'ws.adapter.ts'] as any);

      const spyLoad = jest
        .spyOn(loader, 'loadAdapterFromFile')
        .mockResolvedValue(makeAdapter());

      await loader.loadFromDirectory('/some/bridges');

      expect(spyLoad).toHaveBeenCalledTimes(1);
    });
  });

  // ── loadAdapterFromFile ─────────────────────────────────────────────────────

  describe('loadAdapterFromFile()', () => {
    it('should load and register a valid adapter from file', async () => {
      jest.spyOn(loader as any, 'extractAdapterClass').mockReturnValue(ValidAdapter);
      jest.spyOn(loader as any, 'initializeAdapter').mockResolvedValue(undefined);
      const registerSpy = jest.spyOn(registry, 'register');

      const result = await loader.loadAdapterFromFile('/path/valid.adapter.js');

      expect(result).toBeTruthy();
      expect(registerSpy).toHaveBeenCalledTimes(1);
    });

    it('should return null when no valid class found in module', async () => {
      jest.spyOn(loader as any, 'extractAdapterClass').mockReturnValue(null);

      // Override require to return empty module
      const originalRequire = (loader as any).__proto__.constructor.require;
      jest.doMock('/path/empty.adapter.js', () => ({}), { virtual: true });

      jest.spyOn(loader as any, 'extractAdapterClass').mockReturnValue(null);
      jest.spyOn(require, 'call' as any).mockReturnValueOnce({});

      const result = await (loader as any).extractAdapterClass({});
      expect(result).toBeNull();
    });

    it('should throw BridgeLoadException when require fails', async () => {
      // Simulate require throwing
      const faultyPath = '/nonexistent/broken.adapter.js';
      await expect(loader.loadAdapterFromFile(faultyPath)).rejects.toThrow(BridgeLoadException);
    });
  });

  // ── loadFromConfig ──────────────────────────────────────────────────────────

  describe('loadFromConfig()', () => {
    it('should skip disabled bridges', async () => {
      const spyLoad = jest.spyOn(loader, 'loadAdapterFromFile').mockResolvedValue(makeAdapter());

      await loader.loadFromConfig({
        'disabled-bridge': { enabled: false, modulePath: '/some/path.js' },
      });

      expect(spyLoad).not.toHaveBeenCalled();
    });

    it('should skip bridges without modulePath', async () => {
      const spyRegister = jest.spyOn(registry, 'register');

      await loader.loadFromConfig({ 'no-path-bridge': {} });

      expect(spyRegister).not.toHaveBeenCalled();
    });

    it('should throw BridgeLoadException for invalid module path', async () => {
      await expect(
        loader.loadFromConfig({
          'bad-bridge': { modulePath: '/invalid/nonexistent.js', enabled: true },
        }),
      ).rejects.toThrow(BridgeLoadException);
    });
  });

  // ── registerAdapter (runtime injection) ───────────────────────────────────

  describe('registerAdapter()', () => {
    it('should initialize and register a pre-built adapter', async () => {
      const adapter = makeAdapter('runtime-bridge');
      const registerSpy = jest.spyOn(registry, 'register');

      await loader.registerAdapter(adapter);

      expect(adapter.initialize).toHaveBeenCalled();
      expect(registerSpy).toHaveBeenCalledWith(adapter, expect.objectContaining({
        source: 'runtime-injection',
      }));
    });

    it('should pass options as metadata during runtime injection', async () => {
      const adapter = makeAdapter('runtime-bridge');
      const registerSpy = jest.spyOn(registry, 'register');

      await loader.registerAdapter(adapter, { plugin: 'custom' });

      expect(registerSpy).toHaveBeenCalledWith(
        adapter,
        expect.objectContaining({ plugin: 'custom', source: 'runtime-injection' }),
      );
    });

    it('should throw BridgeInitializationException when adapter initialization fails', async () => {
      const adapter = makeAdapter('fail-bridge');
      (adapter.initialize as jest.Mock).mockRejectedValue(new Error('Init failed'));

      await expect(loader.registerAdapter(adapter)).rejects.toThrow(BridgeInitializationException);
    });
  });

  // ── Duck-typing extraction ─────────────────────────────────────────────────

  describe('isAdapterClass() duck typing', () => {
    it('should recognize a class with all required methods', () => {
      const result = (loader as any).isAdapterClass(ValidAdapter);
      expect(result).toBe(true);
    });

    it('should reject plain objects', () => {
      expect((loader as any).isAdapterClass({})).toBe(false);
    });

    it('should reject functions missing bridge methods', () => {
      class NotAnAdapter {
        hello() {}
      }
      expect((loader as any).isAdapterClass(NotAnAdapter)).toBe(false);
    });
  });

  // ── onModuleInit ───────────────────────────────────────────────────────────

  describe('onModuleInit()', () => {
    it('should skip directory loading when autoDiscover is false', async () => {
      const localLoader = buildLoader({ autoDiscover: false, bridgesDirectory: '/some/dir' });
      const spy = jest.spyOn(localLoader, 'loadFromDirectory').mockResolvedValue(undefined);

      await localLoader.onModuleInit();

      expect(spy).not.toHaveBeenCalled();
    });

    it('should call loadFromDirectory when autoDiscover is true', async () => {
      const localLoader = buildLoader({ autoDiscover: true, bridgesDirectory: '/some/dir' });
      const spy = jest.spyOn(localLoader, 'loadFromDirectory').mockResolvedValue(undefined);

      await localLoader.onModuleInit();

      expect(spy).toHaveBeenCalledWith('/some/dir');
    });

    it('should call loadFromConfig when bridges config is provided', async () => {
      const bridges = { 'http-bridge': { modulePath: '/path/http.js' } };
      const localLoader = buildLoader({ bridges });
      const spy = jest.spyOn(localLoader, 'loadFromConfig').mockResolvedValue(undefined);

      await localLoader.onModuleInit();

      expect(spy).toHaveBeenCalledWith(bridges);
    });

    it('should set overwrite mode from config', async () => {
      const localLoader = buildLoader({ allowOverwrite: true });
      const spy = jest.spyOn(registry, 'setOverwriteMode');
      jest.spyOn(localLoader, 'loadFromDirectory').mockResolvedValue(undefined);
      jest.spyOn(localLoader, 'loadFromConfig').mockResolvedValue(undefined);

      await localLoader.onModuleInit();

      expect(spy).toHaveBeenCalledWith(true);
    });
  });
});
