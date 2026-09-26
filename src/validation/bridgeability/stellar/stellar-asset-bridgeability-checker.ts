/**
 * Stellar Asset Bridgeability Checker
 * Validates whether an asset can be bridged between selected chains.
 */

import {
  SorobanCompatibilityMatrix,
} from '../../../../compatibility/matrix/stellar/soroban-compatibility-matrix';
import {
  CompatibilityQuery,
  CompatibilityQueryResult,
} from '../../../../compatibility/matrix/stellar/soroban-compatibility-matrix.types';
import {
  StellarAsset,
} from '../../../../scanning/assets/compatibility/stellar/asset-compatibility-scanner.types';
import {
  isNativeStellarAsset,
  isSameStellarAsset,
  parseStellarAsset,
} from '../../../../scanning/assets/compatibility/stellar/asset-compatibility-scanner';

/**
 * Bridgeability check result structure following the same pattern
 * as existing validation classes in the codebase.
 */
export interface BridgeabilityResult {
  bridgeable: boolean;
  sourceChain: string;
  targetChain: string;
  asset: StellarAsset | null;
  assetIdentifier: string;
  issues: BridgeabilityIssue[];
  warnings: BridgeabilityWarning[];
  metadata: {
    checkedAt: number;
    matrixEntryFound: boolean;
    assetSupportedInEntry: boolean;
  };
}

export interface BridgeabilityIssue {
  severity: 'error' | 'critical';
  code: string;
  message: string;
  field?: string;
}

export interface BridgeabilityWarning {
  code: string;
  message: string;
  field?: string;
}

/**
 * Configuration options for the StellarAssetBridgeabilityChecker.
 */
export interface BridgeabilityCheckerConfig {
  /** Whether to allow unidirectional transfers even if not explicitly bidirectional */
  allowUnidirectional: boolean;
  /** Whether to perform strict asset format validation */
  strictAssetValidation: boolean;
  /** List of chains that are considered valid sources for Stellar */
  validSourceChains: string[];
  /** List of chains that are considered valid destinations for Stellar */
  validTargetChains: string[];
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: BridgeabilityCheckerConfig = {
  allowUnidirectional: true,
  strictAssetValidation: true,
  validSourceChains: ['stellar', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'base'],
  validTargetChains: ['stellar', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'base'],
};

/**
 * StellarAssetBridgeabilityChecker
 *
 * Core implementation that checks if a given asset can be bridged between
 * a source and target chain. Integrates with the existing SorobanCompatibilityMatrix
 * and leverages asset validation utilities from the asset compatibility scanner.
 */
export class StellarAssetBridgeabilityChecker {
  private readonly compatibilityMatrix: SorobanCompatibilityMatrix;
  private readonly config: BridgeabilityCheckerConfig;

  constructor(
    compatibilityMatrix: SorobanCompatibilityMatrix,
    config: Partial<BridgeabilityCheckerConfig> = {},
  ) {
    this.compatibilityMatrix = compatibilityMatrix;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main check method - evaluates if an asset can be bridged between chains.
   *
   * @param sourceChain - Origin chain for the transfer
   * @param targetChain - Destination chain for the transfer
   * @param assetIdentifier - String representation of the asset (e.g. "USDC", "XLM", "USDC:GA5ZSEJYB37...")
   * @returns Complete bridgeability result with any issues or warnings
   */
  check(
    sourceChain: string,
    targetChain: string,
    assetIdentifier: string,
  ): BridgeabilityResult {
    const issues: BridgeabilityIssue[] = [];
    const warnings: BridgeabilityWarning[] = [];
    const checkedAt = Date.now();

    // Parse the asset identifier into a structured StellarAsset
    const parsedAsset = parseStellarAsset(assetIdentifier);
    let matrixEntryFound = false;
    let assetSupportedInEntry = false;

    // Step 1: Validate chain formats and that they're in supported chain lists
    const chainValidation = this.validateChains(sourceChain, targetChain);
    issues.push(...chainValidation.issues);
    warnings.push(...chainValidation.warnings);

    // Step 2: Validate asset format and that it's properly structured
    const assetValidation = this.validateAssetFormat(assetIdentifier, parsedAsset);
    issues.push(...assetValidation.issues);
    warnings.push(...assetValidation.warnings);

    // If we already have critical errors, return early with bridgeable: false
    if (issues.some(i => i.severity === 'critical' || i.severity === 'error')) {
      return {
        bridgeable: false,
        sourceChain,
        targetChain,
        asset: parsedAsset,
        assetIdentifier,
        issues,
        warnings,
        metadata: {
          checkedAt,
          matrixEntryFound: false,
          assetSupportedInEntry: false,
        },
      };
    }

    // Step 3: Query the compatibility matrix to check if the chain pair is supported
    const query: CompatibilityQuery = {
      sourceChain,
      targetChain,
      asset: parsedAsset?.code,
    };

    const matrixResult: CompatibilityQueryResult = this.compatibilityMatrix.query(query);
    matrixEntryFound = matrixResult.entry !== null;

    if (!matrixResult.supported) {
      if (!matrixEntryFound) {
        issues.push({
          severity: 'error',
          code: 'CHAIN_PAIR_UNSUPPORTED',
          message: `Transfer from ${sourceChain} to ${targetChain} is not supported by the bridge`,
          field: 'chainPair',
        });
      } else if (parsedAsset && matrixResult.entry?.supportedAssets) {
        // Chain pair exists but asset isn't in the supported list
        assetSupportedInEntry = false;
        issues.push({
          severity: 'error',
          code: 'ASSET_UNSUPPORTED_FOR_CHAIN_PAIR',
          message: `Asset "${assetIdentifier}" is not supported for transfers between ${sourceChain} and ${targetChain}. Supported assets: ${matrixResult.entry.supportedAssets.join(', ')}`,
          field: 'asset',
        });
      }
    } else {
      // Chain pair is supported and asset is in the list
      assetSupportedInEntry = true;
    }

    // Determine final bridgeability status
    const isBridgeable = issues.length === 0;

    return {
      bridgeable: isBridgeable,
      sourceChain,
      targetChain,
      asset: parsedAsset,
      assetIdentifier,
      issues,
      warnings,
      metadata: {
        checkedAt,
        matrixEntryFound,
        assetSupportedInEntry,
      },
    };
  }

  /**
   * Batch check multiple transfer routes at once.
   * Useful for scanning multiple potential transfers in one call.
   *
   * @param routes - Array of routes to check with source, target, and asset
   * @returns Array of bridgeability results in the same order
   */
  checkRoutes(
    routes: Array<{
      routeId: string;
      sourceChain: string;
      targetChain: string;
      assetIdentifier: string;
    }>,
  ): Array<{ routeId: string } & BridgeabilityResult> {
    return routes.map(route => ({
      routeId: route.routeId,
      ...this.check(route.sourceChain, route.targetChain, route.assetIdentifier),
    }));
  }

  /**
   * Validates that the source and target chains are in the supported lists.
   * Also prevents transferring to the same chain.
   */
  private validateChains(sourceChain: string, targetChain: string): {
    issues: BridgeabilityIssue[];
    warnings: BridgeabilityWarning[];
  } {
    const issues: BridgeabilityIssue[] = [];
    const warnings: BridgeabilityWarning[] = [];

    // Can't transfer to the same chain
    if (sourceChain === targetChain) {
      issues.push({
        severity: 'critical',
        code: 'SAME_CHAIN_TRANSFER',
        message: 'Cannot bridge to the same chain',
        field: 'chainPair',
      });
      return { issues, warnings };
    }

    // Validate source chain is supported
    if (!this.config.validSourceChains.includes(sourceChain)) {
      issues.push({
        severity: 'error',
        code: 'INVALID_SOURCE_CHAIN',
        message: `Source chain "${sourceChain}" is not a valid supported chain`,
        field: 'sourceChain',
      });
    }

    // Validate target chain is supported
    if (!this.config.validTargetChains.includes(targetChain)) {
      issues.push({
        severity: 'error',
        code: 'INVALID_TARGET_CHAIN',
        message: `Target chain "${targetChain}" is not a valid supported chain`,
        field: 'targetChain',
      });
    }

    return { issues, warnings };
  }

  /**
   * Validates the asset identifier format using existing scanner utilities.
   */
  private validateAssetFormat(
    assetIdentifier: string,
    parsedAsset: StellarAsset | null,
  ): {
    issues: BridgeabilityIssue[];
    warnings: BridgeabilityWarning[];
  } {
    const issues: BridgeabilityIssue[] = [];
    const warnings: BridgeabilityWarning[] = [];

    if (!parsedAsset) {
      issues.push({
        severity: 'critical',
        code: 'INVALID_ASSET_FORMAT',
        message: `Failed to parse asset identifier "${assetIdentifier}". Expected format: "CODE" or "CODE:ISSUER_ADDRESS"`,
        field: 'assetIdentifier',
      });
      return { issues, warnings };
    }

    if (this.config.strictAssetValidation && !parsedAsset.issuer && !isNativeStellarAsset(parsedAsset)) {
      warnings.push({
        code: 'ASSET_MISSING_ISSUER',
        message: `Asset "${assetIdentifier}" is not native but missing an issuer address. This may cause validation issues on chain.`,
        field: 'assetIdentifier',
      });
    }

    return { issues, warnings };
  }

  /**
   * Helper method to quickly check if a transfer is possible without full result.
   */
  isBridgeable(sourceChain: string, targetChain: string, assetIdentifier: string): boolean {
    const result = this.check(sourceChain, targetChain, assetIdentifier);
    return result.bridgeable;
  }
}