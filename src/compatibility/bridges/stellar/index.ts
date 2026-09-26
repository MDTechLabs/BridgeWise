/**
 * File: src/compatibility/bridges/stellar/index.ts
 *
 * Module barrel for the Soroban Bridge Compatibility Matrix.
 *
 * Re-exports the runtime class plus every public type so consumers
 * can import everything they need from a single path.
 */
export { SorobanBridgeCompatibilityMatrix } from './soroban-bridge-compatibility-matrix';
export type {
  SorobanApplication,
  SorobanApplicationType,
  BridgeProviderRecord,
  CompatibilityRecord,
  CompatibilityQuery,
  CompatibilityStatus,
  CompatibilityReport,
  ApplicationCompatSummary,
  ProviderCompatSummary,
} from './soroban-bridge-compatibility-matrix.types';
