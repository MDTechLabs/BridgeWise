import {
  evaluateCriticalIncident,
  evaluateServiceObjectives,
  ServiceRequestObservation,
} from './service-objectives';

const NOW = 1_800_000_000_000;

function request(
  endpoint: ServiceRequestObservation['endpoint'],
  statusCode: number,
  latencyMs = 100,
  offsetMs = 0,
): ServiceRequestObservation {
  return { endpoint, statusCode, latencyMs, timestampMs: NOW - offsetMs };
}

describe('service objectives', () => {
  it('marks objectives met at the exact availability and p95 latency targets', () => {
    const observations: ServiceRequestObservation[] = [
      ...Array.from({ length: 899 }, () => request('api', 200)),
      request('api', 500),
      ...Array.from({ length: 94 }, () => request('quotes', 200, 1_000)),
      ...Array.from({ length: 6 }, () => request('quotes', 200, 1_500)),
    ];

    const result = evaluateServiceObjectives(observations, NOW);

    expect(result.availability).toMatchObject({
      state: 'met',
      actualPercent: 99.9,
      eligibleRequests: 1_000,
      successfulRequests: 999,
    });
    expect(result.quoteLatency).toMatchObject({
      state: 'met',
      p95Ms: 1_500,
      successfulQuoteRequests: 100,
    });
  });

  it('marks objective breaches and emits critical availability and quote latency reasons', () => {
    const observations: ServiceRequestObservation[] = [
      ...Array.from({ length: 97 }, () => request('api', 200)),
      ...Array.from({ length: 3 }, () => request('api', 503)),
      ...Array.from({ length: 100 }, () => request('quotes', 200, 3_001)),
    ];

    const objective = evaluateServiceObjectives(observations, NOW);
    const incident = evaluateCriticalIncident(observations, NOW);

    expect(objective.availability.state).toBe('breached');
    expect(objective.quoteLatency.state).toBe('breached');
    expect(incident).toMatchObject({
      triggered: true,
      reasons: [
        { code: 'AVAILABILITY_CRITICAL' },
        { code: 'QUOTE_LATENCY_CRITICAL' },
      ],
    });
  });

  it('does not page on low-volume windows or when values are exactly on critical thresholds', () => {
    const lowVolume = [request('api', 500), request('quotes', 200, 4_000)];
    expect(evaluateCriticalIncident(lowVolume, NOW)).toEqual({
      triggered: false,
      reasons: [],
    });

    const atBoundary = [
      ...Array.from({ length: 98 }, () => request('api', 200)),
      ...Array.from({ length: 2 }, () => request('api', 500)),
      ...Array.from({ length: 100 }, () => request('quotes', 200, 3_000)),
    ];
    expect(evaluateCriticalIncident(atBoundary, NOW)).toEqual({
      triggered: false,
      reasons: [],
    });
  });

  it('excludes ordinary 4xx input errors but counts rate limits and timeouts as failures', () => {
    const observations: ServiceRequestObservation[] = [
      ...Array.from({ length: 96 }, () => request('api', 200)),
      request('api', 400),
      request('api', 401),
      request('api', 429),
      { endpoint: 'api', timedOut: true, timestampMs: NOW },
    ];

    const result = evaluateServiceObjectives(observations, NOW);

    expect(result.availability).toMatchObject({
      actualPercent: (96 / 98) * 100,
      eligibleRequests: 98,
      successfulRequests: 96,
      state: 'insufficient-data',
    });
  });

  it('uses only the rolling window and reports malformed observations without counting them', () => {
    const observations: ServiceRequestObservation[] = [
      ...Array.from({ length: 100 }, () => request('api', 200)),
      request('api', 500, 100, 31 * 24 * 60 * 60 * 1000),
      { endpoint: 'api', timestampMs: NOW },
      {
        endpoint: 'quotes',
        statusCode: 200,
        latencyMs: Number.NaN,
        timestampMs: NOW,
      },
    ];

    const result = evaluateServiceObjectives(observations, NOW);

    expect(result.availability).toMatchObject({
      eligibleRequests: 101,
      successfulRequests: 101,
      state: 'met',
    });
    expect(result.invalidObservations).toBe(2);
  });

  it('rejects non-finite evaluation timestamps', () => {
    expect(() => evaluateServiceObjectives([], Number.NaN)).toThrow(RangeError);
    expect(() =>
      evaluateCriticalIncident([], Number.POSITIVE_INFINITY),
    ).toThrow(RangeError);
  });
});
