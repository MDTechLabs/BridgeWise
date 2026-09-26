import { Injectable } from '@nestjs/common';
import { Asset, CoverageReport, Route } from './asset-coverage.types';

@Injectable()
export class AssetCoverageService {
  async getCoverageReport(): Promise<CoverageReport> {
    const allAssets = await this.getAllAssets();
    const allRoutes = await this.getAllRoutes();

    const supportedAssets = new Set<Asset>();
    allRoutes.forEach((route) => {
      supportedAssets.add(route.sourceAsset);
      supportedAssets.add(route.destinationAsset);
    });

    const supportedAssetsArray = Array.from(supportedAssets);
    const unsupportedAssets = allAssets.filter(
      (asset) =>
        !supportedAssetsArray.find(
          (supportedAsset) => supportedAsset.id === asset.id,
        ),
    );

    const coveragePercentage =
      (supportedAssetsArray.length / allAssets.length) * 100;

    return {
      supportedAssets: supportedAssetsArray,
      unsupportedAssets,
      coveragePercentage,
    };
  }

  private async getAllAssets(): Promise<Asset[]> {
    // In a real application, this would fetch data from a database or API
    return [
      { id: 'XLM', name: 'Stellar Lumens' },
      { id: 'USDC', name: 'USD Coin' },
      { id: 'ARST', name: 'Argentine Peso' },
      { id: 'BRLT', name: 'Brazilian Real' },
    ];
  }

  private async getAllRoutes(): Promise<Route[]> {
    // In a real application, this would fetch data from a database or API
    const xlm: Asset = { id: 'XLM', name: 'Stellar Lumens' };
    const usdc: Asset = { id: 'USDC', name: 'USD Coin' };
    const arst: Asset = { id: 'ARST', name: 'Argentine Peso' };

    return [
      { sourceAsset: xlm, destinationAsset: usdc },
      { sourceAsset: usdc, destinationAsset: xlm },
      { sourceAsset: xlm, destinationAsset: arst },
      { sourceAsset: arst, destinationAsset: xlm },
    ];
  }
}