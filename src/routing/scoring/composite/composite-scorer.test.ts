import {
  calculateCompositeScore,
  scoreRoutes,
  type RoutingScoringMetrics,
} from '../../../../src/routing/scoring';

interface TestRoute {
  id: string;
  fee: number;
  speed: number;
  reliability: number;
  confidence: number;
}

function getMetrics(route: TestRoute): RoutingScoringMetrics {
  return {
    fee: route.fee,
    speed: route.speed,
    reliability: route.reliability,
    confidence: route.confidence,
  };
}

describe('scoreRoutes', () => {
  it('returns an empty array when there are no routes', () => {
    expect(scoreRoutes([], getMetrics)).toEqual([]);
  });

  it('normalises dimensions and ranks routes', () => {
    const routes: TestRoute[] = [
      {
        id: 'slow-expensive',
        fee: 100,
        speed: 100,
        reliability: 0.7,
        confidence: 0.7,
      },
      {
        id: 'fast-cheap',
        fee: 10,
        speed: 10,
        reliability: 0.95,
        confidence: 0.95,
      },
      {
        id: 'balanced',
        fee: 50,
        speed: 50,
        reliability: 0.85,
        confidence: 0.85,
      },
    ];

    const result = scoreRoutes(routes, getMetrics);

    expect(result).toHaveLength(3);

    expect(result[0].route.id).toBe('fast-cheap');
    expect(result[0].rank).toBe(1);

    expect(result[1].rank).toBe(2);
    expect(result[2].rank).toBe(3);
  });

  it('treats lower fees as better', () => {
    const routes: TestRoute[] = [
      {
        id: 'expensive',
        fee: 100,
        speed: 50,
        reliability: 0.8,
        confidence: 0.8,
      },
      {
        id: 'cheap',
        fee: 10,
        speed: 50,
        reliability: 0.8,
        confidence: 0.8,
      },
    ];

    const result = scoreRoutes(routes, getMetrics);

    expect(result[0].route.id).toBe('cheap');

    expect(result[0].dimensionScores.feeScore).toBe(1);
    expect(result[1].dimensionScores.feeScore).toBe(0);
  });

  it('treats lower speed values as better', () => {
    const routes: TestRoute[] = [
      {
        id: 'slow',
        fee: 50,
        speed: 100,
        reliability: 0.8,
        confidence: 0.8,
      },
      {
        id: 'fast',
        fee: 50,
        speed: 10,
        reliability: 0.8,
        confidence: 0.8,
      },
    ];

    const result = scoreRoutes(routes, getMetrics);

    expect(result[0].route.id).toBe('fast');

    expect(result[0].dimensionScores.speedScore).toBe(1);
    expect(result[1].dimensionScores.speedScore).toBe(0);
  });

  it('treats higher reliability as better', () => {
    const routes: TestRoute[] = [
      {
        id: 'unreliable',
        fee: 50,
        speed: 50,
        reliability: 0.5,
        confidence: 0.8,
      },
      {
        id: 'reliable',
        fee: 50,
        speed: 50,
        reliability: 0.95,
        confidence: 0.8,
      },
    ];

    const result = scoreRoutes(routes, getMetrics);

    expect(result[0].route.id).toBe('reliable');

    expect(result[0].dimensionScores.reliabilityScore).toBe(1);
    expect(result[1].dimensionScores.reliabilityScore).toBe(0);
  });

  it('treats higher confidence as better', () => {
    const routes: TestRoute[] = [
      {
        id: 'uncertain',
        fee: 50,
        speed: 50,
        reliability: 0.8,
        confidence: 0.4,
      },
      {
        id: 'confident',
        fee: 50,
        speed: 50,
        reliability: 0.8,
        confidence: 0.95,
      },
    ];

    const result = scoreRoutes(routes, getMetrics);

    expect(result[0].route.id).toBe('confident');

    expect(result[0].dimensionScores.confidenceScore).toBe(1);
    expect(result[1].dimensionScores.confidenceScore).toBe(0);
  });

  it('respects configurable weights', () => {
    const routes: TestRoute[] = [
      {
        id: 'cheap',
        fee: 10,
        speed: 100,
        reliability: 0.5,
        confidence: 0.5,
      },
      {
        id: 'fast',
        fee: 100,
        speed: 10,
        reliability: 0.5,
        confidence: 0.5,
      },
    ];

    const feeFocused = scoreRoutes(routes, getMetrics, {
      feeWeight: 1,
      speedWeight: 0,
      reliabilityWeight: 0,
      confidenceWeight: 0,
    });

    expect(feeFocused[0].route.id).toBe('cheap');

    const speedFocused = scoreRoutes(routes, getMetrics, {
      feeWeight: 0,
      speedWeight: 1,
      reliabilityWeight: 0,
      confidenceWeight: 0,
    });

    expect(speedFocused[0].route.id).toBe('fast');
  });

  it('normalises weights before calculating the composite score', () => {
    const routes: TestRoute[] = [
      {
        id: 'route-a',
        fee: 10,
        speed: 100,
        reliability: 0.5,
        confidence: 0.5,
      },
      {
        id: 'route-b',
        fee: 100,
        speed: 10,
        reliability: 0.5,
        confidence: 0.5,
      },
    ];

    const result = scoreRoutes(routes, getMetrics, {
      feeWeight: 1,
      speedWeight: 0.5,
      reliabilityWeight: 0,
      confidenceWeight: 0,
    });

    expect(result).toHaveLength(2);

    expect(result[0].compositeScore).toBeGreaterThanOrEqual(0);
    expect(result[0].compositeScore).toBeLessThanOrEqual(1);

    expect(result[1].compositeScore).toBeGreaterThanOrEqual(0);
    expect(result[1].compositeScore).toBeLessThanOrEqual(1);

    expect(result[0].compositeScore).not.toBe(result[1].compositeScore);
  });

  it('assigns a score of 1 when all values in a dimension are equal', () => {
    const routes: TestRoute[] = [
      {
        id: 'route-a',
        fee: 50,
        speed: 50,
        reliability: 0.8,
        confidence: 0.8,
      },
      {
        id: 'route-b',
        fee: 50,
        speed: 50,
        reliability: 0.8,
        confidence: 0.8,
      },
    ];

    const result = scoreRoutes(routes, getMetrics);

    expect(result[0].dimensionScores.feeScore).toBe(1);
    expect(result[0].dimensionScores.speedScore).toBe(1);
    expect(result[0].dimensionScores.reliabilityScore).toBe(1);
    expect(result[0].dimensionScores.confidenceScore).toBe(1);

    expect(result[0].compositeScore).toBe(1);
    expect(result[1].compositeScore).toBe(1);
  });

  it('preserves original order when composite scores are tied', () => {
    const routes: TestRoute[] = [
      {
        id: 'first',
        fee: 10,
        speed: 10,
        reliability: 0.9,
        confidence: 0.9,
      },
      {
        id: 'second',
        fee: 10,
        speed: 10,
        reliability: 0.9,
        confidence: 0.9,
      },
    ];

    const result = scoreRoutes(routes, getMetrics);

    expect(result.map((entry) => entry.route.id)).toEqual(['first', 'second']);

    expect(result.map((entry) => entry.rank)).toEqual([1, 2]);
  });

  it('throws when a route contains a non-finite metric', () => {
    const routes: TestRoute[] = [
      {
        id: 'invalid',
        fee: Number.NaN,
        speed: 10,
        reliability: 0.9,
        confidence: 0.9,
      },
    ];

    expect(() => scoreRoutes(routes, getMetrics)).toThrow('invalid fee value');
  });

  it('throws when a weight is outside the valid range', () => {
    const routes: TestRoute[] = [
      {
        id: 'route',
        fee: 10,
        speed: 10,
        reliability: 0.9,
        confidence: 0.9,
      },
    ];

    expect(() =>
      scoreRoutes(routes, getMetrics, {
        feeWeight: 2,
        speedWeight: 0,
        reliabilityWeight: 0,
        confidenceWeight: 0,
      }),
    ).toThrow('feeWeight must be between 0 and 1');
  });
});

describe('calculateCompositeScore', () => {
  it('calculates a weighted composite score', () => {
    const score = calculateCompositeScore(
      {
        feeScore: 1,
        speedScore: 0,
        reliabilityScore: 1,
        confidenceScore: 0,
      },
      {
        feeWeight: 0.5,
        speedWeight: 0,
        reliabilityWeight: 0.5,
        confidenceWeight: 0,
      },
    );

    expect(score).toBe(1);
  });

  it('calculates the expected weighted score for multiple dimensions', () => {
    const score = calculateCompositeScore(
      {
        feeScore: 1,
        speedScore: 0.5,
        reliabilityScore: 0.8,
        confidenceScore: 0.6,
      },
      {
        feeWeight: 0.4,
        speedWeight: 0.3,
        reliabilityWeight: 0.2,
        confidenceWeight: 0.1,
      },
    );

    const expected = 1 * 0.4 + 0.5 * 0.3 + 0.8 * 0.2 + 0.6 * 0.1;

    expect(score).toBeCloseTo(expected);
  });

  it('normalises weights before calculating the score', () => {
    const score = calculateCompositeScore(
      {
        feeScore: 1,
        speedScore: 0,
        reliabilityScore: 0,
        confidenceScore: 0,
      },
      {
        feeWeight: 0.8,
        speedWeight: 0.2,
        reliabilityWeight: 0,
        confidenceWeight: 0,
      },
    );

    expect(score).toBe(0.8);
  });

  it('returns a value between 0 and 1', () => {
    const score = calculateCompositeScore({
      feeScore: 0.8,
      speedScore: 0.6,
      reliabilityScore: 0.9,
      confidenceScore: 0.7,
    });

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('throws when composite scoring weights are invalid', () => {
    expect(() =>
      calculateCompositeScore(
        {
          feeScore: 1,
          speedScore: 0,
          reliabilityScore: 0,
          confidenceScore: 0,
        },
        {
          feeWeight: -1,
          speedWeight: 0,
          reliabilityWeight: 0,
          confidenceWeight: 0,
        },
      ),
    ).toThrow('feeWeight must be between 0 and 1');
  });
});
