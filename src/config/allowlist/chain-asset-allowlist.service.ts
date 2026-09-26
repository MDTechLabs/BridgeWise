/**
 * Chain & Asset Allowlist Service
 * 
 * Enforces explicit security allowlists for supported blockchain networks,
 * ERC-20 / SEP-41 token contracts, bridge router smart contracts, and cross-chain routes.
 */

export interface ChainConfig {
  chainId: string;
  name: string;
  type: 'EVM' | 'STELLAR' | 'SOLANA' | 'OTHER';
  isMainnet: boolean;
  enabled: boolean;
}

export interface AssetConfig {
  symbol: string;
  addressOrIssuer: string;
  decimals: number;
  name?: string;
  enabled: boolean;
}

export interface ApprovedRoute {
  routeId: string;
  sourceChainId: string;
  targetChainId: string;
  sourceAssetSymbol: string;
  targetAssetSymbol: string;
  enabled: boolean;
}

export class ChainAssetAllowlistService {
  private supportedChains: Map<string, ChainConfig> = new Map();
  private supportedAssets: Map<string, Map<string, AssetConfig>> = new Map(); // chainId => (assetKey => AssetConfig)
  private approvedContracts: Map<string, Set<string>> = new Map(); // chainId => Set(contractAddress)
  private approvedRoutes: Map<string, ApprovedRoute> = new Map(); // routeId => ApprovedRoute

  constructor() {
    // Populate default production-approved chains & assets
    this.initDefaultAllowlists();
  }

  /**
   * Check if a blockchain network chainId is enabled and supported.
   */
  public isChainSupported(chainId: string | number): boolean {
    const key = String(chainId).toLowerCase();
    const chain = this.supportedChains.get(key);
    return !!chain && chain.enabled;
  }

  /**
   * Check if an asset is allowed on a specific chain.
   */
  public isAssetSupported(chainId: string | number, symbolOrAddress: string): boolean {
    const chainKey = String(chainId).toLowerCase();
    if (!this.isChainSupported(chainKey)) {
      return false;
    }

    const chainAssets = this.supportedAssets.get(chainKey);
    if (!chainAssets) {
      return false;
    }

    const assetKey = symbolOrAddress.toLowerCase();
    const asset = chainAssets.get(assetKey);
    return !!asset && asset.enabled;
  }

  /**
   * Check if a smart contract address is explicitly approved on a specific chain.
   */
  public isContractApproved(chainId: string | number, contractAddress: string): boolean {
    const chainKey = String(chainId).toLowerCase();
    if (!this.isChainSupported(chainKey)) {
      return false;
    }

    const contracts = this.approvedContracts.get(chainKey);
    if (!contracts) {
      return false;
    }

    return contracts.has(contractAddress.toLowerCase());
  }

  /**
   * Check if a cross-chain route is approved.
   */
  public isRouteApproved(
    sourceChainId: string | number,
    targetChainId: string | number,
    sourceAssetSymbol: string,
    targetAssetSymbol: string
  ): boolean {
    const srcKey = String(sourceChainId).toLowerCase();
    const tgtKey = String(targetChainId).toLowerCase();

    if (!this.isChainSupported(srcKey) || !this.isChainSupported(tgtKey)) {
      return false;
    }

    if (!this.isAssetSupported(srcKey, sourceAssetSymbol) || !this.isAssetSupported(tgtKey, targetAssetSymbol)) {
      return false;
    }

    const routeId = this.buildRouteId(srcKey, tgtKey, sourceAssetSymbol, targetAssetSymbol);
    const route = this.approvedRoutes.get(routeId);
    return !!route && route.enabled;
  }

  /**
   * Register or update a supported chain.
   */
  public addSupportedChain(config: ChainConfig): void {
    const key = config.chainId.toLowerCase();
    this.supportedChains.set(key, { ...config, chainId: key });
    if (!this.supportedAssets.has(key)) {
      this.supportedAssets.set(key, new Map());
    }
    if (!this.approvedContracts.has(key)) {
      this.approvedContracts.set(key, new Set());
    }
  }

  /**
   * Register or update a supported asset for a chain.
   */
  public addSupportedAsset(chainId: string | number, config: AssetConfig): void {
    const chainKey = String(chainId).toLowerCase();
    if (!this.supportedAssets.has(chainKey)) {
      this.supportedAssets.set(chainKey, new Map());
    }

    const chainMap = this.supportedAssets.get(chainKey)!;
    chainMap.set(config.symbol.toLowerCase(), config);
    chainMap.set(config.addressOrIssuer.toLowerCase(), config);
  }

  /**
   * Approve a smart contract address on a chain.
   */
  public addApprovedContract(chainId: string | number, contractAddress: string): void {
    const chainKey = String(chainId).toLowerCase();
    if (!this.approvedContracts.has(chainKey)) {
      this.approvedContracts.set(chainKey, new Set());
    }

    this.approvedContracts.get(chainKey)!.add(contractAddress.toLowerCase());
  }

  /**
   * Approve a cross-chain transfer route.
   */
  public addApprovedRoute(route: ApprovedRoute): void {
    const routeId = this.buildRouteId(
      route.sourceChainId,
      route.targetChainId,
      route.sourceAssetSymbol,
      route.targetAssetSymbol
    );
    this.approvedRoutes.set(routeId, { ...route, routeId });
  }

  /**
   * Disable a chain.
   */
  public disableChain(chainId: string | number): void {
    const key = String(chainId).toLowerCase();
    const chain = this.supportedChains.get(key);
    if (chain) {
      chain.enabled = false;
    }
  }

  /**
   * Get all enabled chains.
   */
  public getEnabledChains(): ChainConfig[] {
    return Array.from(this.supportedChains.values()).filter((c) => c.enabled);
  }

  private buildRouteId(srcChain: string, tgtChain: string, srcAsset: string, tgtAsset: string): string {
    return `${srcChain.toLowerCase()}:${srcAsset.toLowerCase()}->${tgtChain.toLowerCase()}:${tgtAsset.toLowerCase()}`;
  }

  private initDefaultAllowlists(): void {
    // Ethereum Mainnet (1)
    this.addSupportedChain({ chainId: '1', name: 'Ethereum Mainnet', type: 'EVM', isMainnet: true, enabled: true });
    this.addSupportedAsset('1', { symbol: 'USDC', addressOrIssuer: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, enabled: true });
    this.addSupportedAsset('1', { symbol: 'USDT', addressOrIssuer: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6, enabled: true });
    this.addApprovedContract('1', '0x1111111111111111111111111111111111111111');

    // Arbitrum One (42161)
    this.addSupportedChain({ chainId: '42161', name: 'Arbitrum One', type: 'EVM', isMainnet: true, enabled: true });
    this.addSupportedAsset('42161', { symbol: 'USDC', addressOrIssuer: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6, enabled: true });

    // Stellar Mainnet (stellar-mainnet)
    this.addSupportedChain({ chainId: 'stellar-mainnet', name: 'Stellar Mainnet', type: 'STELLAR', isMainnet: true, enabled: true });
    this.addSupportedAsset('stellar-mainnet', { symbol: 'USDC', addressOrIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', decimals: 7, enabled: true });

    // Approve default USDC cross-chain routes
    this.addApprovedRoute({
      routeId: '',
      sourceChainId: '1',
      targetChainId: '42161',
      sourceAssetSymbol: 'USDC',
      targetAssetSymbol: 'USDC',
      enabled: true,
    });
    this.addApprovedRoute({
      routeId: '',
      sourceChainId: '1',
      targetChainId: 'stellar-mainnet',
      sourceAssetSymbol: 'USDC',
      targetAssetSymbol: 'USDC',
      enabled: true,
    });
  }
}
