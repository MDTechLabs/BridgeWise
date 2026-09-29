export type ServiceEndpoint = 'api' | 'quotes';

export interface ServiceRequestObservation {
  /** Completion time in Unix milliseconds. */
  timestampMs: number;
  endpoint: ServiceEndpoint;
  /** HTTP status. Omit only when the request timed out. */
  statusCode?: number;
  /** End-to-end response duration in milliseconds. */
  latencyMs?: number;
  timedOut?: boolean;
}

export const SERVICE_OBJECTIVES = Object.freeze({
  reportingWindowMs: 30 * 24 * 60 * 60 * 1000,
  minimumSamples: 100,
  availabilityPercent: 99.9,
  quoteLatencyP95Ms: 1_500,
});

export const CRITICAL_INCIDENT_THRESHOLDS = Object.freeze({
  reportingWindowMs: 5 * 60 * 1000,
  minimumSamples: 100,
  availabilityPercent: 99,
  quoteLatencyP95Ms: 3_000,
});

export type ObjectiveState = 'met' | 'breached' | 'insufficient-data';

export interface ServiceObjectiveEvaluation {
  windowStartMs: number;
  windowEndMs: number;
  availability: {
    state: ObjectiveState;
    actualPercent: number | null;
    targetPercent: number;
    eligibleRequests: number;
    successfulRequests: number;
  };
  quoteLatency: {
    state: ObjectiveState;
    p95Ms: number | null;
    targetP95Ms: number;
    successfulQuoteRequests: number;
  };
  invalidObservations: number;
}

export type CriticalIncidentCode =
  'AVAILABILITY_CRITICAL' | 'QUOTE_LATENCY_CRITICAL';

export interface CriticalIncidentEvaluation {
  triggered: boolean;
  reasons: Array<{
    code: CriticalIncidentCode;
    actual: number;
    threshold: number;
    samples: number;
  }>;
}

/**
 * Evaluate request observations in the rolling SLO window. Client input errors
 * (4xx except 429) are excluded from availability; rate limits, timeouts, and
 * server errors count as failed requests.
 */
export function evaluateServiceObjectives(
  observations: readonly ServiceRequestObservation[],
  windowEndMs = Date.now(),
): ServiceObjectiveEvaluation {
  return evaluateWindow(observations, windowEndMs, SERVICE_OBJECTIVES);
}

/** Return page-worthy signals for one critical incident window. */
export function evaluateCriticalIncident(
  observations: readonly ServiceRequestObservation[],
  windowEndMs = Date.now(),
): CriticalIncidentEvaluation {
  const result = evaluateWindow(
    observations,
    windowEndMs,
    CRITICAL_INCIDENT_THRESHOLDS,
  );
  const reasons: CriticalIncidentEvaluation['reasons'] = [];

  if (
    result.availability.eligibleRequests >=
      CRITICAL_INCIDENT_THRESHOLDS.minimumSamples &&
    result.availability.actualPercent !== null &&
    result.availability.actualPercent <
      CRITICAL_INCIDENT_THRESHOLDS.availabilityPercent
  ) {
    reasons.push({
      code: 'AVAILABILITY_CRITICAL',
      actual: result.availability.actualPercent,
      threshold: CRITICAL_INCIDENT_THRESHOLDS.availabilityPercent,
      samples: result.availability.eligibleRequests,
    });
  }

  if (
    result.quoteLatency.successfulQuoteRequests >=
      CRITICAL_INCIDENT_THRESHOLDS.minimumSamples &&
    result.quoteLatency.p95Ms !== null &&
    result.quoteLatency.p95Ms > CRITICAL_INCIDENT_THRESHOLDS.quoteLatencyP95Ms
  ) {
    reasons.push({
      code: 'QUOTE_LATENCY_CRITICAL',
      actual: result.quoteLatency.p95Ms,
      threshold: CRITICAL_INCIDENT_THRESHOLDS.quoteLatencyP95Ms,
      samples: result.quoteLatency.successfulQuoteRequests,
    });
  }

  return { triggered: reasons.length > 0, reasons };
}

function evaluateWindow(
  observations: readonly ServiceRequestObservation[],
  windowEndMs: number,
  targets: {
    reportingWindowMs: number;
    minimumSamples: number;
    availabilityPercent: number;
    quoteLatencyP95Ms: number;
  },
): ServiceObjectiveEvaluation {
  if (!Number.isFinite(windowEndMs)) {
    throw new RangeError('windowEndMs must be a finite Unix timestamp');
  }

  const windowStartMs = windowEndMs - targets.reportingWindowMs;
  const latencies: number[] = [];
  let eligibleRequests = 0;
  let successfulRequests = 0;
  let successfulQuoteRequests = 0;
  let invalidObservations = 0;

  for (const observation of observations) {
    if (!Number.isFinite(observation.timestampMs)) {
      invalidObservations++;
      continue;
    }
    if (
      observation.timestampMs < windowStartMs ||
      observation.timestampMs > windowEndMs
    )
      continue;
    if (observation.endpoint !== 'api' && observation.endpoint !== 'quotes') {
      invalidObservations++;
      continue;
    }

    if (observation.timedOut) {
      eligibleRequests++;
      continue;
    }
    if (
      !Number.isInteger(observation.statusCode) ||
      observation.statusCode < 100 ||
      observation.statusCode > 599
    ) {
      invalidObservations++;
      continue;
    }

    const statusCode = observation.statusCode;
    // Invalid client requests do not indicate service unavailability. 429 is
    // counted because capacity-based request rejection is service degradation.
    if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) continue;

    eligibleRequests++;
    const successful = statusCode >= 200 && statusCode < 400;
    if (successful) successfulRequests++;

    if (
      observation.endpoint === 'quotes' &&
      statusCode >= 200 &&
      statusCode < 300
    ) {
      if (
        !Number.isFinite(observation.latencyMs) ||
        observation.latencyMs < 0
      ) {
        invalidObservations++;
        continue;
      }
      successfulQuoteRequests++;
      latencies.push(observation.latencyMs);
    }
  }

  latencies.sort((a, b) => a - b);
  const actualPercent =
    eligibleRequests > 0 ? (successfulRequests / eligibleRequests) * 100 : null;
  const p95Ms =
    latencies.length > 0
      ? latencies[Math.ceil(latencies.length * 0.95) - 1]
      : null;

  return {
    windowStartMs,
    windowEndMs,
    availability: {
      state: objectiveState(
        eligibleRequests,
        targets.minimumSamples,
        actualPercent !== null && actualPercent >= targets.availabilityPercent,
      ),
      actualPercent,
      targetPercent: targets.availabilityPercent,
      eligibleRequests,
      successfulRequests,
    },
    quoteLatency: {
      state: objectiveState(
        successfulQuoteRequests,
        targets.minimumSamples,
        p95Ms !== null && p95Ms <= targets.quoteLatencyP95Ms,
      ),
      p95Ms,
      targetP95Ms: targets.quoteLatencyP95Ms,
      successfulQuoteRequests,
    },
    invalidObservations,
  };
}

function objectiveState(
  sampleCount: number,
  minimumSamples: number,
  targetMet: boolean,
): ObjectiveState {
  if (sampleCount < minimumSamples) return 'insufficient-data';
  return targetMet ? 'met' : 'breached';
}
