import { StellarWalletCompatibilityScanner } from '../scanner';
import type { WalletAdapter, WalletAccount } from '../../../../../packages/wallet/src';
import type { StellarRoute } from '../../../../bridges/stellar/routes/stellar-route-validator';

class MockAdapter implements Partial<WalletAdapter> {
  id = 'mock-wallet';
  name = 'Mock Wallet';
  type = 'freighter' as any;
  networkType = 'stellar' as any;
  isAvailable = true;

  constructor(
    private overrides: {
      signTransaction?: boolean;
      sign?: boolean;
      isConnected?: boolean;
      sorobanRpc?: boolean;
      getFreighterNetwork?: boolean;
    } = {}
  ) {}

  async getAccount(): Promise<WalletAccount | null> {
    return this.overrides.isConnected !== false
      ? ({ address: 'GABC', publicKey: 'GABC', chainId: 'stellar:public', network: 'stellar' } as any)
      : null;
  }

  sendTransaction = this.overrides.signTransaction !== false ? (async () => 'txhash') : (undefined as any);
  sign = this.overrides.sign !== false ? (async () => 'signed') : (undefined as any);
  getFreighterNetwork = this.overrides.getFreighterNetwork ? (async () => 'public') : (undefined as any);

  freighterOptions = this.overrides.sorobanRpc ? { rpcUrl: 'https://soroban-rpc.com' } : undefined;
}

describe('StellarWalletCompatibilityScanner', () => {
  let scanner: StellarWalletCompatibilityScanner;

  beforeEach(() => {
    scanner = new StellarWalletCompatibilityScanner();
  });

  const mockRoutes: StellarRoute[] = [
    {
      routeId: 'route-1',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      bridgeId: 'standard-bridge',
    },
    {
      routeId: 'route-2',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      bridgeId: 'soroban-bridge',
    },
  ];

  it('detects a fully compatible wallet', async () => {
    const adapter = new MockAdapter({ sorobanRpc: true });
    const report = await scanner.scan(adapter as unknown as WalletAdapter, mockRoutes);

    expect(report.overallCompatible).toBe(true);
    expect(report.routeCompatibility['route-1'].compatible).toBe(true);
    expect(report.routeCompatibility['route-2'].compatible).toBe(true);
  });

  it('detects incompatibility when signing is missing', async () => {
    const adapter = new MockAdapter({ signTransaction: false });
    const report = await scanner.scan(adapter as unknown as WalletAdapter, mockRoutes);

    expect(report.overallCompatible).toBe(false);
    expect(report.routeCompatibility['route-1'].compatible).toBe(false);
    expect(report.routeCompatibility['route-1'].reasons).toContain('Wallet does not support signing transactions.');
  });

  it('detects incompatibility for Soroban routes when RPC support is missing', async () => {
    const adapter = new MockAdapter({ sorobanRpc: false });
    const report = await scanner.scan(adapter as unknown as WalletAdapter, mockRoutes);

    expect(report.overallCompatible).toBe(false);
    expect(report.routeCompatibility['route-1'].compatible).toBe(true);
    expect(report.routeCompatibility['route-2'].compatible).toBe(false);
    expect(report.routeCompatibility['route-2'].reasons).toContain('Route requires Soroban support, but wallet does not support Soroban RPC.');
  });

  it('detects incompatibility when wallet is not connected', async () => {
    const adapter = new MockAdapter({ isConnected: false });
    const report = await scanner.scan(adapter as unknown as WalletAdapter, mockRoutes);

    expect(report.overallCompatible).toBe(false);
    expect(report.routeCompatibility['route-1'].compatible).toBe(false);
    expect(report.routeCompatibility['route-1'].reasons).toContain('Wallet is not connected.');
  });

  it('includes warnings when network detection is missing', async () => {
    const adapter = new MockAdapter({ getFreighterNetwork: false });
    const report = await scanner.scan(adapter as unknown as WalletAdapter, [mockRoutes[0]]);

    expect(report.routeCompatibility['route-1'].warnings).toContain('Wallet does not support network detection; ensure you are on the correct network manually.');
  });
});
