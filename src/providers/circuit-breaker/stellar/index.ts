/**
 * Stellar Provider Circuit Breaker (issue #966).
 *
 * Temporarily disables unhealthy bridge providers after repeated failures
 * and supports half-open recovery checks.
 */

export * from './stellar-provider-circuit-breaker';
