import type { HarnessRunResult } from './route-test-harness';
import type { ExpectedOutcome } from '../fixtures/transfer-scenarios';

/**
 * Assertion helpers for `HarnessRunResult`.
 *
 * Each method throws a descriptive `Error` on violation rather than relying on
 * a specific test framework, so the helpers work with Jest, Vitest, or plain
 * Node test runners alike.
 */
export class RouteValidator {
  // ─── Composite assertion ──────────────────────────────────────────────────

  /**
   * Validate all fields of `expected` that are defined against `result`.
   * Convenient for full-scenario assertions in one call.
   */
  static assertOutcome(result: HarnessRunResult, expected: ExpectedOutcome): void {
    if (expected.noRouteFound !== undefined) {
      RouteValidator.assertNoRoute(result, expected.noRouteFound);
    }
    if (expected.bestProvider !== undefined) {
      RouteValidator.assertBestProvider(result, expected.bestProvider);
    }
    if (expected.bestRouteId !== undefined) {
      RouteValidator.assertBestRouteId(result, expected.bestRouteId);
    }
    if (expected.fallbackTriggered !== undefined) {
      RouteValidator.assertFallbackTriggered(result, expected.fallbackTriggered);
    }
    if (expected.fallbackReason !== undefined) {
      RouteValidator.assertFallbackReason(result, expected.fallbackReason);
    }
    if (expected.maxFee !== undefined) {
      RouteValidator.assertFeeAtMost(result, expected.maxFee);
    }
    if (expected.maxLatencyMs !== undefined) {
      RouteValidator.assertLatencyAtMost(result, expected.maxLatencyMs);
    }
  }

  // ─── Route selection ──────────────────────────────────────────────────────

  static assertBestProvider(result: HarnessRunResult, expectedProvider: string): void {
    const actual = RouteValidator._bestProvider(result);
    if (actual !== expectedProvider) {
      throw new Error(
        `[${result.scenarioId}] Expected best provider "${expectedProvider}" but got "${actual ?? 'none'}".`,
      );
    }
  }

  static assertBestRouteId(result: HarnessRunResult, expectedRouteId: string): void {
    const actual = RouteValidator._bestRouteId(result);
    if (actual !== expectedRouteId) {
      throw new Error(
        `[${result.scenarioId}] Expected best route id "${expectedRouteId}" but got "${actual ?? 'none'}".`,
      );
    }
  }

  static assertNoRoute(result: HarnessRunResult, expectNone = true): void {
    const hasRoute = RouteValidator._hasRoute(result);
    if (expectNone && hasRoute) {
      const provider = RouteValidator._bestProvider(result);
      throw new Error(
        `[${result.scenarioId}] Expected no route but one was selected (provider: "${provider}").`,
      );
    }
    if (!expectNone && !hasRoute) {
      throw new Error(
        `[${result.scenarioId}] Expected a route to be selected but none was found.`,
      );
    }
  }

  // ─── Fee & latency ────────────────────────────────────────────────────────

  static assertFeeAtMost(result: HarnessRunResult, maxFee: number): void {
    const fee = RouteValidator._bestFee(result);
    if (fee === null) {
      throw new Error(`[${result.scenarioId}] Cannot assert fee — no route was selected.`);
    }
    if (fee > maxFee) {
      throw new Error(
        `[${result.scenarioId}] Best route fee ${fee} exceeds maximum ${maxFee}.`,
      );
    }
  }

  static assertFeeAtLeast(result: HarnessRunResult, minFee: number): void {
    const fee = RouteValidator._bestFee(result);
    if (fee === null) {
      throw new Error(`[${result.scenarioId}] Cannot assert fee — no route was selected.`);
    }
    if (fee < minFee) {
      throw new Error(
        `[${result.scenarioId}] Best route fee ${fee} is below expected minimum ${minFee}.`,
      );
    }
  }

  static assertLatencyAtMost(result: HarnessRunResult, maxMs: number): void {
    const latency = RouteValidator._bestLatency(result);
    if (latency === null) {
      throw new Error(`[${result.scenarioId}] Cannot assert latency — no route was selected.`);
    }
    if (latency > maxMs) {
      throw new Error(
        `[${result.scenarioId}] Best route latency ${latency}ms exceeds maximum ${maxMs}ms.`,
      );
    }
  }

  // ─── Fallback ─────────────────────────────────────────────────────────────

  static assertFallbackTriggered(result: HarnessRunResult, expected: boolean): void {
    const triggered = result.fallback !== null;
    if (triggered !== expected) {
      throw new Error(
        `[${result.scenarioId}] Expected fallback ${expected ? 'to be' : 'not to be'} triggered.`,
      );
    }
  }

  static assertFallbackReason(result: HarnessRunResult, expectedReason: string): void {
    if (!result.fallback) {
      throw new Error(
        `[${result.scenarioId}] Cannot assert fallback reason — no fallback was triggered.`,
      );
    }
    if (result.fallback.reason !== expectedReason) {
      throw new Error(
        `[${result.scenarioId}] Expected fallback reason "${expectedReason}" but got "${result.fallback.reason}".`,
      );
    }
  }

  static assertFallbackHasAlternatives(result: HarnessRunResult, minCount = 1): void {
    if (!result.fallback) {
      throw new Error(
        `[${result.scenarioId}] Cannot assert fallback alternatives — no fallback was triggered.`,
      );
    }
    const count = result.fallback.alternatives.length;
    if (count < minCount) {
      throw new Error(
        `[${result.scenarioId}] Expected at least ${minCount} fallback alternative(s) but got ${count}.`,
      );
    }
  }

  static assertFallbackBestProvider(result: HarnessRunResult, expectedProvider: string): void {
    if (!result.fallback) {
      throw new Error(
        `[${result.scenarioId}] Cannot assert fallback best provider — no fallback was triggered.`,
      );
    }
    const actual = result.fallback.best?.route.provider ?? null;
    if (actual !== expectedProvider) {
      throw new Error(
        `[${result.scenarioId}] Expected fallback best provider "${expectedProvider}" but got "${actual ?? 'none'}".`,
      );
    }
  }

  // ─── Ranking ──────────────────────────────────────────────────────────────

  static assertRankedCount(result: HarnessRunResult, expectedCount: number): void {
    if (result.ranked.length !== expectedCount) {
      throw new Error(
        `[${result.scenarioId}] Expected ${expectedCount} ranked route(s) but got ${result.ranked.length}.`,
      );
    }
  }

  static assertRankedAtLeast(result: HarnessRunResult, minCount: number): void {
    if (result.ranked.length < minCount) {
      throw new Error(
        `[${result.scenarioId}] Expected at least ${minCount} ranked route(s) but got ${result.ranked.length}.`,
      );
    }
  }

  static assertProviderInRanked(result: HarnessRunResult, providerId: string): void {
    const found = result.ranked.some((e) => e.route.provider === providerId);
    if (!found) {
      throw new Error(
        `[${result.scenarioId}] Expected provider "${providerId}" in ranked results but it was not present.`,
      );
    }
  }

  static assertProviderNotInRanked(result: HarnessRunResult, providerId: string): void {
    const found = result.ranked.some((e) => e.route.provider === providerId);
    if (found) {
      throw new Error(
        `[${result.scenarioId}] Expected provider "${providerId}" to be absent from ranked results but it was present.`,
      );
    }
  }

  // ─── Errors ───────────────────────────────────────────────────────────────

  static assertNoErrors(result: HarnessRunResult): void {
    if (result.errors.length > 0) {
      throw new Error(
        `[${result.scenarioId}] Unexpected errors during simulation:\n  ${result.errors.join('\n  ')}`,
      );
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private static _hasRoute(result: HarnessRunResult): boolean {
    return result.selected !== null || (result.fallback?.best !== null && result.fallback !== null);
  }

  private static _bestProvider(result: HarnessRunResult): string | null {
    if (result.selected) return result.selected.route.provider;
    return result.fallback?.best?.route.provider ?? null;
  }

  private static _bestRouteId(result: HarnessRunResult): string | null {
    if (result.selected) return result.selected.route.id;
    return result.fallback?.best?.route.id ?? null;
  }

  private static _bestFee(result: HarnessRunResult): number | null {
    if (result.selected) return result.selected.route.estimatedFee;
    return result.fallback?.best?.route.estimatedFee ?? null;
  }

  private static _bestLatency(result: HarnessRunResult): number | null {
    if (result.selected) return result.selected.route.estimatedTimeMs;
    return result.fallback?.best?.route.estimatedTimeMs ?? null;
  }
}
