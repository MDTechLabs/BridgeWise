import { StellarAssetAvailabilityMonitor } from '../stellar-asset-availability-monitor';
import { StellarProviderDiscoveryService } from '../../../../providers/discovery/stellar/stellar-provider-discovery.service';
import type { StellarProviderMetadata } from '../../../../providers/discovery/stellar/stellar-provider-discovery.types';

type ProviderStatus = StellarProviderMetadata['status'];

const makeProvider = (
  id: string,
  supportedAssets: string[],
  status: ProviderStatus = 'active',
): Omit<StellarProviderMetadata, 'registeredAt'> => ({
  id,
  name: `Provider ${id}`,
  endpoint: `https://${id}.example.com`, 
  status,
  supportedAssets,
});

describe('StellarAssetAvailabilityMonitor', () => {
  let discovery: StellarProviderDiscoveryService;
  let monitor: StellarAssetAvailabilityMonitor;

  beforeEach(() => {
    discovery = new StellarProviderDiscoveryService();
    monitor = new StellarAssetAvailabilityMonitor({ discovery });
  });

  afterEach(() => {
    monitor.stopMonitoring();
  });

  it('tracks asset availability across providers', async () => {
    discovery.register(makeProvider('p1', ['XLM', 'USDC']));
    discovery.register(makeProvider('p2', ['USDC']));

    const stateChanges: string[] = [];
    monitor.on('status-change', (event) => {
      stateChanges.push(`${event.asset}:${event.currentStatus}`);
    });

    await monitor.checkAll();

    expect(monitor.getSupportedAssets()).toEqual(['USDC', 'XLM']);
    expect(stateChanges).toContain('XLM:available');
    expect(stateChanges).toContain('USDC:available');
  });

  it('emits a removal alert when an asset is no longer supported by any active provider', async () => {
    discovery.register(makeProvider('p1', ['XLM']));
    discovery.register(makeProvider('p2', ['USDC']));

    await monitor.checkAll();
    expect(monitor.getSupportedAssets()).toEqual(['USDC', 'XLM']);

    const alerts: string[] = [];
    monitor.on('alert', (event) => {
      alerts.push(`${event.asset}:${event.currentStatus}`);
    });

    discovery.deregister('p1');
    await monitor.checkAll();

    expect(alerts).toEqual(['XLM:removed']);
    expect(monitor.getSupportedAssets()).toEqual(['USDC']);
    expect(monitor.getRemovedAssets()).toEqual(['XLM']);
  });

  it('re-emits available when an asset returns after a removal', async () => {
    discovery.register(makeProvider('p1', ['XLM']));
    await monitor.checkAll();

    discovery.deregister('p1');
    await monitor.checkAll();

    const recovered: string[] = [];
    monitor.on('available', (event) => recovered.push(`${event.asset}:${event.currentStatus}`));

    discovery.register(makeProvider('p2', ['XLM']));
    await monitor.checkAll();

    expect(recovered).toEqual(['XLM:available']);
    expect(monitor.getSupportedAssets()).toEqual(['XLM']);
  });
});
