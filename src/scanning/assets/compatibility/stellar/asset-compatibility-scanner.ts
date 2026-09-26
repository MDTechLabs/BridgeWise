import { Keypair } from 'stellar-sdk';
import {
  AssetCompatibilityResult,
  AssetCompatibilityScannerConfig,
  StellarAsset,
} from './asset-compatibility-scanner.types';

export const DEFAULT_SOURCE_ASSETS: StellarAsset[] = [
  { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGCS3GGUPK5R47ASZAWD4D' },
  { code: 'EURC', issuer: 'GAP5LETOV6YIE62YAM56STDANXDO5TGXG3J4ZZ2JZSNUS4T3ZFGJ65FI' },
  { code: 'XLM' },
];

export const DEFAULT_DESTINATION_ASSETS: string[] = [
  'USDC',
  'EURC',
  'XLM',
  'USDT',
];

const DEFAULT_CONFIG: AssetCompatibilityScannerConfig = {
  supportedSourceAssets: DEFAULT_SOURCE_ASSETS,
  supportedDestinationAssets: DEFAULT_DESTINATION_ASSETS,
};

export function isNativeStellarAsset(asset: StellarAsset | string): boolean {
  const code = typeof asset === 'string' ? asset : asset.code;
  return code === 'XLM' || code === 'native';
}

export function isSameStellarAsset(a: StellarAsset, b: StellarAsset): boolean {
  if (a.code !== b.code) return false;
  if (isNativeStellarAsset(a)) return true;
  return (a.issuer ?? '') === (b.issuer ?? '');
}

export function validateStellarAssetCode(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  const len = trimmed.length;
  return len >= 1 && len <= 12 && /^[a-zA-Z0-9]+$/.test(trimmed);
}

export function validateStellarIssuer(issuer: string): boolean {
  const trimmed = (issuer || '').trim();
  if (!trimmed) return true;
  if (!trimmed.startsWith('G') || trimmed.length !== 56) return false;
  try {
    Keypair.fromPublicKey(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function parseStellarAsset(assetString: string): StellarAsset | null {
  if (!assetString || !assetString.trim()) return null;
  if (isNativeStellarAsset(assetString)) {
    return { code: 'XLM' };
  }
  const parts = assetString.split(':');
  if (parts.length === 2) {
    const [code, issuer] = parts;
    if (!validateStellarAssetCode(code)) return null;
    if (!validateStellarIssuer(issuer)) return null;
    return { code: code.trim(), issuer: issuer.trim() };
  }
  if (validateStellarAssetCode(assetString)) {
    return { code: assetString.trim() };
  }
  return null;
}

export class StellarAssetCompatibilityScanner {
  private supportedSource: Map<string, StellarAsset>;
  private supportedDestination: Set<string>;

  constructor(private config: AssetCompatibilityScannerConfig = DEFAULT_CONFIG) {
    this.supportedSource = new Map(
      (config.supportedSourceAssets ?? DEFAULT_SOURCE_ASSETS).map((a) =>
        isNativeStellarAsset(a) ? ['XLM', a] : [assetKey(a), a],
      ),
    );
    this.supportedDestination = new Set(
      config.supportedDestinationAssets ?? DEFAULT_DESTINATION_ASSETS,
    );
  }

  scan(routes: { routeId: string; asset?: string }[]): AssetCompatibilityResult[] {
    return routes.map((route) => this.scanRoute(route));
  }

  scanRoute(route: { routeId: string; asset?: string }): AssetCompatibilityResult {
    const issues: string[] = [];
    const asset = route.asset?.trim();

    if (!asset) {
      return {
        routeId: route.routeId,
        compatible: true,
        sourceAsset: null,
        sourceAssetValid: false,
        destinationAsset: null,
        destinationAssetValid: false,
        issues,
        scannedAt: new Date(),
      };
    }

    const parsed = parseStellarAsset(asset);
    if (!parsed) {
      issues.push(`Unable to parse asset: "${asset}"`);
      return {
        routeId: route.routeId,
        compatible: false,
        sourceAsset: null,
        sourceAssetValid: false,
        destinationAsset: asset,
        destinationAssetValid: false,
        issues,
        scannedAt: new Date(),
      };
    }

    const sourceAssetValid =
      isNativeStellarAsset(parsed) ||
      (this.supportedSource.size === 0 &&
        validateStellarAssetCode(parsed.code) &&
        validateStellarIssuer(parsed.issuer ?? '')) ||
      this.supportedSource.has(assetKey(parsed));

    if (!sourceAssetValid) {
      if (isNativeStellarAsset(parsed)) {
        issues.push(`Native asset XLM not supported by scanner configuration`);
      } else if (!validateStellarAssetCode(parsed.code)) {
        issues.push(`Invalid asset code: "${parsed.code}"`);
      } else if (!validateStellarIssuer(parsed.issuer ?? '')) {
        issues.push(`Invalid issuer for asset "${parsed.code}"`);
      } else {
        issues.push(`Asset "${parsed.code}:${parsed.issuer}" is not in supported source assets`);
      }
    }

    const destinationAssetValid =
      this.supportedDestination.size === 0 || this.supportedDestination.has(parsed.code);

    if (sourceAssetValid && !destinationAssetValid) {
      issues.push(
        `Destination asset "${parsed.code}" is not in supported destination assets`,
      );
    }

    return {
      routeId: route.routeId,
      compatible: sourceAssetValid && destinationAssetValid,
      sourceAsset: parsed,
      sourceAssetValid,
      destinationAsset: parsed.code,
      destinationAssetValid,
      issues,
      scannedAt: new Date(),
    };
  }

  filterIncompatibleRoutes(routes: { routeId: string; asset?: string }[]): { routeId: string; asset?: string }[] {
    const results = this.scan(routes);
    const invalidIds = new Set(
      results.filter((r) => !r.compatible).map((r) => r.routeId),
    );
    return routes.filter((r) => !invalidIds.has(r.routeId));
  }
}

function assetKey(asset: StellarAsset): string {
  if (isNativeStellarAsset(asset)) return 'XLM';
  return `${asset.code}:${asset.issuer}`;
}