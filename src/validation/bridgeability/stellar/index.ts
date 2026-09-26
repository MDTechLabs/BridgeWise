/**
 * Stellar Bridgeability Validation Module
 *
 * Exports the main checker class and all related types for use throughout the application.
 * This module provides the capability to validate if an asset can be bridged between chains
 * before a transfer is attempted, preventing unsupported transfers.
 */

export {
  StellarAssetBridgeabilityChecker,
} from './stellar-asset-bridgeability-checker';

export type {
  BridgeabilityResult,
  BridgeabilityIssue,
  BridgeabilityWarning,
  BridgeabilityCheckerConfig,
} from './stellar-asset-bridgeability-checker';