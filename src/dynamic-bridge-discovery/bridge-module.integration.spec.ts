import { Test, TestingModule } from '@nestjs/testing';
import { BridgeModule } from '../module/bridge.module';
import { BridgeService } from '../bridge.service';
import { BridgeRegistry } from '../registry/bridge.registry';
import { BridgeLoader } from '../loaders/bridge.loader';
import { BridgeAdapter } from '../interfaces/bridge-adapter.interface';

function makeAdapter(name: string): BridgeAdapter {
  return {
    name,
    version: '1.0.0',
    capabilities: [{ name: 'greet', version: '1.0.0' }],
    initialize: jest.fn().mockResolvedValue(undefined),
    isHealthy: jest.fn().mockResolvedValue(true),
    shutdown: jest.fn().mockResolvedValue(undefined),
    execute: jest.fn().mockResolvedValue({ hello: name }),
  };
}

describe('BridgeModule (integration)', () => {
  let module: TestingModule;
  let service: BridgeService;
  let registry: BridgeRegistry;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        BridgeModule.forRoot({
          autoDiscover: false,
          allowOverwrite: false,
        }),
      ],
    }).compile();

    await module.init();

    service = module.get<BridgeService>(BridgeService);
    registry = module.get<BridgeRegistry>(BridgeRegistry);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should bootstrap BridgeService', () => {
    expect(service).toBeDefined();
  });

  it('should bootstrap BridgeRegistry', () => {
    expect(registry).toBeDefined();
  });

  it('should bootstrap BridgeLoader', () => {
    const loader = module.get<BridgeLoader>(BridgeLoader);
    expect(loader).toBeDefined();
  });

  // ── forRoot() scenario ─────────────────────────────────────────────────────

  describe('forRoot() - static config', () => {
    it('should start with empty registry', () => {
      expect(service.listBridges()).toHaveLength(0);
    });

    it('should allow runtime injection after module init', async () => {
      const adapter = makeAdapter('rt-bridge');
      const loader = module.get<BridgeLoader>(BridgeLoader);
      jest.spyOn(loader, 'registerAdapter').mockImplementation(async () => {
        registry.register(adapter);
      });

      await service.registerBridge(adapter);

      expect(service.hasBridge('rt-bridge')).toBe(true);
    });
  });

  // ── forRootAsync() scenario ────────────────────────────────────────────────

  describe('forRootAsync() - factory config', () => {
    it('should build module with async config factory', async () => {
      const asyncModule = await Test.createTestingModule({
        imports: [
          BridgeModule.forRootAsync({
            useFactory: () => ({
              autoDiscover: false,
              allowOverwrite: true,
            }),
          }),
        ],
      }).compile();

      await asyncModule.init();

      const asyncService = asyncModule.get<BridgeService>(BridgeService);
      expect(asyncService).toBeDefined();

      await asyncModule.close();
    });
  });

  // ── Runtime injection scenario ─────────────────────────────────────────────

  describe('runtime bridge injection', () => {
    it('should execute operation on a runtime-injected bridge', async () => {
      const adapter = makeAdapter('plugin-bridge');
      registry.register(adapter);

      const result = await service.execute('plugin-bridge', 'greet', { name: 'World' });

      expect(result).toEqual({ hello: 'plugin-bridge' });
    });

    it('should reflect runtime-injected bridge in health check', async () => {
      const adapter = makeAdapter('healthy-plugin');
      registry.register(adapter);

      const health = await service.healthCheck();

      expect(health['healthy-plugin']).toBe(true);
    });

    it('should allow multiple bridges to be injected independently', async () => {
      registry.register(makeAdapter('plugin-a'));
      registry.register(makeAdapter('plugin-b'));
      registry.register(makeAdapter('plugin-c'));

      expect(service.listBridges()).toHaveLength(3);
    });

    it('should execute operation on all capability-matching bridges', async () => {
      registry.register(makeAdapter('greet-1'));
      registry.register(makeAdapter('greet-2'));

      const results = await service.executeByCapability('greet', 'hello', {});

      expect(results).toHaveLength(2);
    });
  });

  // ── Fallback handling ─────────────────────────────────────────────────────

  describe('fallback handling', () => {
    it('tryGetBridge() returns undefined for unavailable bridge', () => {
      expect(service.tryGetBridge('nonexistent')).toBeUndefined();
    });

    it('hasBridge() returns false for unregistered bridge', () => {
      expect(service.hasBridge('nonexistent')).toBe(false);
    });

    it('execute() throws for unavailable bridge', async () => {
      await expect(service.execute('unavailable', 'op', {})).rejects.toThrow(
        'Bridge adapter "unavailable" not found',
      );
    });
  });
});
