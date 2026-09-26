import { Injectable } from '@nestjs/common';
import { StellarAsset } from './asset-discovery.types';

@Injectable()
export class AssetDiscoveryService {
  private readonly assets: StellarAsset[] = [
    {
      symbol: 'XLM',
      name: 'Stellar Lumens',
      issuer: null,
      decimals: 7,
      isNative: true,
      supportedChains: ['stellar', 'ethereum'],
      logoUrl: 'https://assets.coingecko.com/coins/images/100/small/Stellar_symbol_black_RGB.png',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      decimals: 7,
      isNative: false,
      supportedChains: ['stellar', 'ethereum', 'polygon'],
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      symbol: 'yXLM',
      name: 'Yield XLM',
      issuer: 'GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55',
      decimals: 7,
      isNative: false,
      supportedChains: ['stellar', 'ethereum'],
      logoUrl: null,
    },
  ];

  list(): StellarAsset[] {
    return this.assets;
  }

  search(query: string): StellarAsset[] {
    const q = query.toLowerCase();
    return this.assets.filter(
      (a) =>
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.issuer?.toLowerCase().includes(q),
    );
  }
}
