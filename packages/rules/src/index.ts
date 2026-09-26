/**
 * @bridgewise/rules — Rule engine for relayer slashing risk and double-sign detection.
 *
 * @example
 * ```ts
 * import { DoubleSignChecker, SlashingMonitor } from '@bridgewise/rules';
 * import type { AttestationRecord, DoubleSignEvent } from '@bridgewise/rules';
 * ```
 */

export { DoubleSignChecker } from "./double-sign-checker";
export { SlashingMonitor } from "./slashing-monitor";
export type {
  AttestationRecord,
  AttestationVerdict,
  DoubleSignEvent,
  PreSignResult,
  SlashingMonitorOptions,
  SlashingRiskReport,
} from "./types";
