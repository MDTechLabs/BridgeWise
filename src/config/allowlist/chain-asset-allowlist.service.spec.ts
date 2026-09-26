import { ChainAssetAllowlistService } from './chain-asset-allowlist.service';

describe('ChainAssetAllowlistService', () => {
  let service: ChainAssetAllowlistService;

  beforeEach(() => {
    service = new ChainAssetAllowlistService();
  });

  it('should validate default supported chains', () => {
    expect(service.isChainSupported('1')).toBe(true); // Ethereum
    expect(service.isChainSupported('42161')).toBe(true); // Arbitrum
    expect(service.isChainSupported('stellar-mainnet')).toBe(true);
    expect(service.isChainSupported('999999')).toBe(false); // Unknown chain
  });

  it('should validate default supported assets by symbol and address', () => {
    expect(service.isAssetSupported('1', 'USDC')).toBe(true);
    expect(service.isAssetSupported('1', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).toBe(true);
    expect(service.isAssetSupported('1', 'UNKN')).toBe(false);
  });

  it('should validate contract address approval', () => {
    expect(service.isContractApproved('1', '0x1111111111111111111111111111111111111111')).toBe(true);
    expect(service.isContractApproved('1', '0x9999999999999999999999999999999999999999')).toBe(false);
  });

  it('should validate approved cross-chain routes', () => {
    expect(service.isRouteApproved('1', '42161', 'USDC', 'USDC')).toBe(true);
    expect(service.isRouteApproved('1', 'stellar-mainnet', 'USDC', 'USDC')).toBe(true);
    expect(service.isRouteApproved('1', '42161', 'USDT', 'USDC')).toBe(false); // Unapproved pair
  });

  it('should dynamically add and manage new chains and assets', () => {
    service.addSupportedChain({
      chainId: '8453',
      name: 'Base Mainnet',
      type: 'EVM',
      isMainnet: true,
      enabled: true,
    });

    service.addSupportedAsset('8453', {
      symbol: 'USDC',
      addressOrIssuer: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      decimals: 6,
      enabled: true,
    });

    expect(service.isChainSupported('8453')).toBe(true);
    expect(service.isAssetSupported('8453', 'USDC')).toBe(true);

    // Disable chain
    service.disableChain('8453');
    expect(service.isChainSupported('8453')).toBe(false);
    expect(service.isAssetSupported('8453', 'USDC')).toBe(false);
  });
});
