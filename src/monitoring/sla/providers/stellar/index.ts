/**
 * Stellar Provider SLA Evaluator Module
 *
 * @see Issue #469 — Implement Stellar Provider SLA Evaluator
 */

export { StellarProviderSlaEvaluator } from './stellar-provider-sla-evaluator';

export type {
  ProviderId,
  SLATargets,
  UptimeCheck,
  UptimeWindow,
  ResponseTimeStats,
  ComplianceVerdict,
  SLABreakdown,
  SLAEvaluation,
  SLAProviderReport,
  SLAEvaluatorConfig,
} from './types';

export { DEFAULT_SLA_TARGETS } from './types';
