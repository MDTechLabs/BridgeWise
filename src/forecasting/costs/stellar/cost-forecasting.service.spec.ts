import { CostSample, StellarCostForecastingService } from './cost-forecasting.service';

const makeSample = (routeId: string, feeStroops: number, success = true, offsetMs = 0): CostSample => ({
  routeId,
  feeStroops,
  success,
  timestamp: new Date(Date.now() - 1000 * 60 * 60 + offsetMs),
});

const makeTrend = (routeId: string, start: number, end: number, step: number): CostSample[] => {
  const samples: CostSample[] = [];
  const direction = end >= start ? 1 : -1;
  const signedStep = Math.abs(step) * direction;
  const total = Math.max(2, Math.floor(Math.abs(end - start) / Math.abs(step)) + 1);
  for (let i = 0; i < total; i++) {
    samples.push({
      routeId,
      feeStroops: start + signedStep * i,
      success: true,
      timestamp: new Date(Date.now() - 1000 * 60 * (total - i)),
    });
  }
  return samples;
};

describe('StellarCostForecastingService', () => {
  let service: StellarCostForecastingService;

  beforeEach(() => {
    service = new StellarCostForecastingService();
  });

  describe('constructor validation', () => {
    it('throws on invalid emaAlpha', () => {
      expect(() => new StellarCostForecastingService({ emaAlpha: 0 })).toThrow();
      expect(() => new StellarCostForecastingService({ emaAlpha: 1.5 })).toThrow();
    });

    it('throws on invalid trendThreshold', () => {
      expect(() => new StellarCostForecastingService({ trendThreshold: -0.1 })).toThrow();
    });

    it('throws on invalid recentWindowRatio', () => {
      expect(() => new StellarCostForecastingService({ recentWindowRatio: 0 })).toThrow();
      expect(() => new StellarCostForecastingService({ recentWindowRatio: 1 })).toThrow();
    });
  });

  describe('analyzeFeeTrends', () => {
    it('stores samples and returns aggregate analysis', () => {
      const samples = makeTrend('r1', 200, 600, 50);
      const analysis = service.analyzeFeeTrends('r1', samples);

      expect(analysis).not.toBeNull();
      expect(analysis!.routeId).toBe('r1');
      expect(analysis!.sampleSize).toBe(samples.length);
      expect(analysis!.averageFeeStroops).toBeGreaterThan(0);
      expect(analysis!.p95FeeStroops).toBeGreaterThan(0);
      expect(analysis!.standardDeviationStroops).toBeGreaterThanOrEqual(0);
    });

    it('returns null when all samples are invalid', () => {
      const bad = [{ routeId: 'r1', feeStroops: -1, success: true, timestamp: new Date() }];
      expect(service.analyzeFeeTrends('r1', bad)).toBeNull();
    });

    it('drops invalid samples silently', () => {
      const samples: CostSample[] = [
        makeSample('r1', 100),
        { routeId: 'r1', feeStroops: NaN, success: true, timestamp: new Date() },
        { routeId: 'r1', feeStroops: -50, success: true, timestamp: new Date() },
        { routeId: 'r1', feeStroops: 200, success: true, timestamp: new Date('invalid') },
      ];
      const result = service.analyzeFeeTrends('r1', samples);
      expect(result!.sampleSize).toBe(1);
    });

    it('throws on empty routeId', () => {
      expect(() => service.analyzeFeeTrends('', [])).toThrow();
    });

    it('throws on non-array metrics', () => {
      expect(() => service.analyzeFeeTrends('r1', null as any)).toThrow();
    });

    it('caps samples at maxSamples', () => {
      const small = new StellarCostForecastingService({ maxSamples: 3 });
      const samples = [1, 2, 3, 4, 5].map((i) => makeSample('r1', i * 100, true, i * 1000));
      small.analyzeFeeTrends('r1', samples);
      expect(small.getStoredSamples('r1').length).toBe(3);
    });
  });

  describe('predictCostTrends', () => {
    it('returns null when no samples exist', () => {
      expect(service.predictCostTrends('unknown')).toBeNull();
    });

    it('returns a trend forecast after ingesting samples', () => {
      const samples = makeTrend('r1', 500, 300, 50);
      service.analyzeFeeTrends('r1', samples);
      const forecast = service.predictCostTrends('r1');

      expect(forecast).not.toBeNull();
      expect(forecast!.routeId).toBe('r1');
      expect(forecast!.predictedFeeStroops).toBeGreaterThan(0);
      expect(forecast!.sampleSize).toBe(samples.length);
      expect(['improving', 'stable', 'declining']).toContain(forecast!.trend);
    });

    it('classifies a declining fee trend as improving', () => {
      const samples = makeTrend('r1', 1000, 200, 100);
      service.analyzeFeeTrends('r1', samples);
      const forecast = service.predictCostTrends('r1');
      expect(forecast!.trend).toBe('improving');
    });

    it('classifies an increasing fee trend as declining', () => {
      const samples = makeTrend('r1', 200, 1000, 100);
      service.analyzeFeeTrends('r1', samples);
      const forecast = service.predictCostTrends('r1');
      expect(forecast!.trend).toBe('declining');
    });

    it('confidence interval lower bound is non-negative', () => {
      service.analyzeFeeTrends('r1', [makeSample('r1', 100)]);
      const forecast = service.predictCostTrends('r1');
      expect(forecast!.confidenceIntervalStroops[0]).toBeGreaterThanOrEqual(0);
    });

    it('confidence interval lower <= upper', () => {
      const samples = makeTrend('r1', 100, 500, 50);
      service.analyzeFeeTrends('r1', samples);
      const f = service.predictCostTrends('r1')!;
      expect(f.confidenceIntervalStroops[0]).toBeLessThanOrEqual(f.confidenceIntervalStroops[1]);
    });
  });

  describe('generateForecast', () => {
    it('returns zero-confidence forecast with no data', () => {
      const f = service.generateForecast('r1');
      expect(f.predictedFeeStroops).toBe(0);
      expect(f.confidenceScore).toBe(0);
      expect(f.trend).toBeNull();
      expect(f.historical).toBeNull();
    });

    it('returns a valid composite forecast after ingesting samples', () => {
      const samples = makeTrend('r1', 300, 600, 50);
      service.analyzeFeeTrends('r1', samples);
      const f = service.generateForecast('r1');

      expect(f.routeId).toBe('r1');
      expect(f.predictedFeeStroops).toBeGreaterThan(0);
      expect(f.confidenceScore).toBeGreaterThan(0);
      expect(f.confidenceScore).toBeLessThanOrEqual(100);
      expect(f.trend).not.toBeNull();
      expect(f.historical).not.toBeNull();
    });

    it('confidence score increases with more samples', () => {
      const few = makeTrend('r1', 100, 200, 20);
      const many = [...makeTrend('r2', 100, 200, 5)];

      service.analyzeFeeTrends('r1', few);
      service.analyzeFeeTrends('r2', many);

      const f1 = service.generateForecast('r1');
      const f2 = service.generateForecast('r2');
      expect(f2.confidenceScore).toBeGreaterThanOrEqual(f1.confidenceScore);
    });
  });

  describe('reset and getStoredSamples', () => {
    it('clears all samples on reset', () => {
      service.analyzeFeeTrends('r1', [makeSample('r1', 100)]);
      service.reset();
      expect(service.getStoredSamples('r1')).toHaveLength(0);
    });

    it('returns a copy, not a reference', () => {
      service.analyzeFeeTrends('r1', [makeSample('r1', 100)]);
      const copy = service.getStoredSamples('r1');
      copy[0].feeStroops = 999;
      expect(service.getStoredSamples('r1')[0].feeStroops).toBe(100);
    });
  });
});
