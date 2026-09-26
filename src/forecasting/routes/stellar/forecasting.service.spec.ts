import {
  RouteMetricSample,
  StellarRouteForecastingService,
} from './forecasting.service';

const makeSample = (
  routeId: string,
  durationMs: number,
  success: boolean,
  offsetMs = 0,
): RouteMetricSample => ({
  routeId,
  durationMs,
  success,
  timestamp: new Date(Date.now() - 1000 * 60 * 60 + offsetMs),
});

const makeTrend = (
  routeId: string,
  start: number,
  end: number,
  step: number,
  success = true,
): RouteMetricSample[] => {
  const samples: RouteMetricSample[] = [];
  const direction = end >= start ? 1 : -1;
  const signedStep = Math.abs(step) * direction;
  const span = Math.abs(end - start);
  const total = Math.max(2, Math.floor(span / Math.abs(step)) + 1);
  for (let i = 0; i < total; i += 1) {
    samples.push({
      routeId,
      durationMs: start + signedStep * i,
      success,
      timestamp: new Date(Date.now() - 1000 * 60 * (total - i)),
    });
  }
  return samples;
};

describe('StellarRouteForecastingService', () => {
  let service: StellarRouteForecastingService;

  beforeEach(() => {
    service = new StellarRouteForecastingService();
  });

  describe('constructor validation', () => {
    it('throws on invalid emaAlpha', () => {
      expect(() => new StellarRouteForecastingService({ emaAlpha: 0 })).toThrow();
      expect(() => new StellarRouteForecastingService({ emaAlpha: 1.5 })).toThrow();
    });

    it('throws on invalid trendThreshold', () => {
      expect(
        () => new StellarRouteForecastingService({ trendThreshold: -0.1 }),
      ).toThrow();
    });

    it('throws on invalid recentWindowRatio', () => {
      expect(
        () => new StellarRouteForecastingService({ recentWindowRatio: 0 }),
      ).toThrow();
      expect(
        () => new StellarRouteForecastingService({ recentWindowRatio: 1 }),
      ).toThrow();
    });
  });

  describe('analyzeHistoricalMetrics', () => {
    it('stores samples and returns aggregate analysis', () => {
      const samples = makeTrend('route-1', 200, 400, 50);
      const analysis = service.analyzeHistoricalMetrics('route-1', samples);

      expect(analysis.routeId).toBe('route-1');
      expect(analysis.sampleSize).toBe(samples.length);
      expect(analysis.averageLatencyMs).toBeGreaterThan(200);
      expect(analysis.successRate).toBeGreaterThanOrEqual(0);
      expect(analysis.p95LatencyMs).toBeGreaterThan(0);
      expect(analysis.standardDeviationMs).toBeGreaterThanOrEqual(0);
      expect(analysis.oldestSampleAt).toBeInstanceOf(Date);
      expect(analysis.newestSampleAt).toBeInstanceOf(Date);
    });

    it('drops invalid samples (NaN, negative duration, bad timestamp)', () => {
      const good = makeTrend('route-1', 300, 500, 50);
      const dirty: RouteMetricSample[] = [
        ...good,
        {
          routeId: 'route-1',
          durationMs: Number.NaN,
          success: true,
          timestamp: new Date(),
        },
        {
          routeId: 'route-1',
          durationMs: -50,
          success: true,
          timestamp: new Date(),
        },
        {
          routeId: 'route-1',
          durationMs: 200,
          success: true,
          timestamp: new Date('not-a-date'),
        },
        null as unknown as RouteMetricSample,
      ];

      const analysis = service.analyzeHistoricalMetrics('route-1', dirty);
      expect(analysis.sampleSize).toBe(good.length);
    });

    it('sorts samples chronologically regardless of input order', () => {
      const reversed = makeTrend('route-1', 100, 500, 100).reverse();
      service.analyzeHistoricalMetrics('route-1', reversed);
      const stored = service.getStoredSamples('route-1');
      for (let i = 1; i < stored.length; i += 1) {
        expect(stored[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          stored[i - 1].timestamp.getTime(),
        );
      }
    });

    it('rejects empty routeId', () => {
      expect(() =>
        service.analyzeHistoricalMetrics('', [makeSample('r1', 100, true)]),
      ).toThrow();
    });

    it('rejects non-array metrics', () => {
      expect(() =>
        service.analyzeHistoricalMetrics('r1', null as unknown as RouteMetricSample[]),
      ).toThrow();
    });

    it('returns null when all samples are invalid', () => {
      const analysis = service.analyzeHistoricalMetrics('r1', [
        { routeId: 'r1', durationMs: Number.NaN, success: true, timestamp: new Date() },
      ]);
      expect(analysis).toBeNull();
      expect(service.getStoredSamples('r1')).toEqual([]);
    });
  });

  describe('predictLatencyTrends', () => {
    it('rejects empty routeId', () => {
      expect(() => service.predictLatencyTrends('')).toThrow();
    });

    it('returns null when no metrics have been recorded', () => {
      expect(service.predictLatencyTrends('unknown-route')).toBeNull();
    });

    it('classifies a downward latency trend as improving', () => {
      // Latency going from 1000ms down to 200ms over time
      service.analyzeHistoricalMetrics('r1', makeTrend('r1', 1000, 200, 100));
      const forecast = service.predictLatencyTrends('r1');

      expect(forecast).not.toBeNull();
      expect(forecast!.trend).toBe('improving');
      expect(forecast!.trendDelta).toBeGreaterThan(0);
      expect(forecast!.recentAverageLatencyMs).toBeLessThan(
        forecast!.historicalAverageLatencyMs,
      );
      expect(forecast!.predictedLatencyMs).toBeGreaterThanOrEqual(0);
      expect(forecast!.sampleSize).toBeGreaterThan(2);
    });

    it('classifies an upward latency trend as declining', () => {
      service.analyzeHistoricalMetrics('r1', makeTrend('r1', 100, 1000, 100));
      const forecast = service.predictLatencyTrends('r1');

      expect(forecast).not.toBeNull();
      expect(forecast!.trend).toBe('declining');
      expect(forecast!.trendDelta).toBeLessThan(0);
      expect(forecast!.recentAverageLatencyMs).toBeGreaterThan(
        forecast!.historicalAverageLatencyMs,
      );
    });

    it('classifies a flat latency trend as stable', () => {
      const flat = Array.from({ length: 20 }, (_, i) =>
        makeSample('r1', 300, true, i * 1000),
      );
      service.analyzeHistoricalMetrics('r1', flat);
      const forecast = service.predictLatencyTrends('r1');

      expect(forecast).not.toBeNull();
      expect(forecast!.trend).toBe('stable');
    });

    it('produces a 95% confidence interval around the prediction', () => {
      const noisy = Array.from({ length: 30 }, (_, i) =>
        makeSample('r1', 200 + (i % 5) * 30, true, i * 1000),
      );
      service.analyzeHistoricalMetrics('r1', noisy);
      const forecast = service.predictLatencyTrends('r1');

      expect(forecast).not.toBeNull();
      const [low, high] = forecast!.confidenceIntervalMs;
      expect(low).toBeLessThanOrEqual(forecast!.predictedLatencyMs);
      expect(high).toBeGreaterThanOrEqual(forecast!.predictedLatencyMs);
    });
  });

  describe('predictReliabilityTrends', () => {
    it('rejects empty routeId', () => {
      expect(() => service.predictReliabilityTrends('')).toThrow();
    });

    it('returns null when no metrics have been recorded', () => {
      expect(service.predictReliabilityTrends('unknown-route')).toBeNull();
    });

    it('classifies a rising success rate as improving', () => {
      const old = Array.from({ length: 20 }, (_, i) =>
        makeSample('r1', 200, false, i * 1000),
      );
      const recent = Array.from({ length: 20 }, (_, i) =>
        makeSample('r1', 200, true, (i + 100) * 1000),
      );
      service.analyzeHistoricalMetrics('r1', [...old, ...recent]);
      const forecast = service.predictReliabilityTrends('r1');

      expect(forecast).not.toBeNull();
      expect(forecast!.trend).toBe('improving');
      expect(forecast!.trendDelta).toBeGreaterThan(0);
      expect(forecast!.recentSuccessRate).toBeGreaterThan(
        forecast!.historicalSuccessRate,
      );
      expect(forecast!.predictedReliability).toBeGreaterThan(0);
      expect(forecast!.predictedReliability).toBeLessThanOrEqual(1);
    });

    it('classifies a falling success rate as declining', () => {
      const old = Array.from({ length: 20 }, (_, i) =>
        makeSample('r1', 200, true, i * 1000),
      );
      const recent = Array.from({ length: 20 }, (_, i) =>
        makeSample('r1', 200, false, (i + 100) * 1000),
      );
      service.analyzeHistoricalMetrics('r1', [...old, ...recent]);
      const forecast = service.predictReliabilityTrends('r1');

      expect(forecast).not.toBeNull();
      expect(forecast!.trend).toBe('declining');
      expect(forecast!.trendDelta).toBeLessThan(0);
    });

    it('classifies a constant success rate as stable', () => {
      const allGood = Array.from({ length: 20 }, (_, i) =>
        makeSample('r1', 200, true, i * 1000),
      );
      service.analyzeHistoricalMetrics('r1', allGood);
      const forecast = service.predictReliabilityTrends('r1');
      expect(forecast).not.toBeNull();
      expect(forecast!.trend).toBe('stable');
      expect(forecast!.predictedReliability).toBeCloseTo(1, 2);
    });

    it('clamps the confidence interval to the unit interval', () => {
      const allGood = Array.from({ length: 100 }, (_, i) =>
        makeSample('r1', 200, true, i * 1000),
      );
      service.analyzeHistoricalMetrics('r1', allGood);
      const forecast = service.predictReliabilityTrends('r1');
      expect(forecast).not.toBeNull();
      const [low, high] = forecast!.confidenceInterval;
      expect(low).toBeGreaterThanOrEqual(0);
      expect(high).toBeLessThanOrEqual(1);
      expect(low).toBeLessThanOrEqual(high);
    });
  });

  describe('generateForecast', () => {
    it('rejects empty routeId', () => {
      expect(() => service.generateForecast('')).toThrow();
    });

    it('returns zero-confidence forecast when no data is recorded', () => {
      const forecast = service.generateForecast('unknown-route');
      expect(forecast.routeId).toBe('unknown-route');
      expect(forecast.predictedLatency).toBe(0);
      expect(forecast.predictedReliability).toBe(0);
      expect(forecast.confidenceScore).toBe(0);
      expect(forecast.latency).toBeNull();
      expect(forecast.reliability).toBeNull();
      expect(forecast.historical).toBeNull();
      expect(forecast.generatedAt).toBeInstanceOf(Date);
    });

    it('produces a complete forecast when historical data is available', () => {
      // Generate samples with a clean downward latency trend and high
      // success so the engine should report an "improving" trend on
      // both latency and reliability.
      const latencySamples = makeTrend('r1', 800, 200, 100);
      const reliabilitySamples = Array.from(
        { length: latencySamples.length },
        () => makeSample('r1', 200, true, 1000),
      );
      const samples = latencySamples.map((s, i) => ({
        ...s,
        success: reliabilitySamples[i].success,
      }));

      const emptyForecast = service.generateForecast('r1');
      expect(emptyForecast.confidenceScore).toBe(0);
      expect(emptyForecast.latency).toBeNull();

      service.analyzeHistoricalMetrics('r1', samples);
      const withData = service.generateForecast('r1');

      expect(withData.routeId).toBe('r1');
      expect(withData.latency).not.toBeNull();
      expect(withData.reliability).not.toBeNull();
      expect(withData.historical).not.toBeNull();
      expect(withData.predictedLatency).toBeGreaterThan(0);
      expect(withData.predictedReliability).toBeGreaterThan(0);
      expect(withData.confidenceScore).toBeGreaterThan(0);
      expect(withData.confidenceScore).toBeLessThanOrEqual(100);
      expect(withData.latency!.trend).toBe('improving');
      expect(withData.reliability!.trend).toBe('stable');
    });

    it('confidence score increases with sample size and tighter intervals', () => {
      // Few samples, mostly identical outcomes
      const fewSamples = Array.from({ length: 4 }, (_, i) =>
        makeSample('r1', 200, true, i * 1000),
      );
      service.analyzeHistoricalMetrics('r1', fewSamples);
      const lowConfidence = service.generateForecast('r1').confidenceScore;

      service.reset();

      // Many samples, all identical success -> tighter interval, higher confidence
      const manySamples = Array.from({ length: 200 }, (_, i) =>
        makeSample('r1', 200, true, i * 1000),
      );
      service.analyzeHistoricalMetrics('r1', manySamples);
      const highConfidence = service.generateForecast('r1').confidenceScore;

      expect(highConfidence).toBeGreaterThan(lowConfidence);
    });
  });

  describe('utility methods', () => {
    it('reset clears stored samples', () => {
      service.analyzeHistoricalMetrics('r1', makeTrend('r1', 200, 400, 50));
      expect(service.getStoredSamples('r1').length).toBeGreaterThan(0);
      service.reset();
      expect(service.getStoredSamples('r1').length).toBe(0);
    });

    it('getStoredSamples returns a defensive copy', () => {
      const samples = makeTrend('r1', 200, 400, 50);
      service.analyzeHistoricalMetrics('r1', samples);
      const snapshot = service.getStoredSamples('r1');
      snapshot[0].durationMs = 99999;
      expect(service.getStoredSamples('r1')[0].durationMs).not.toBe(99999);
    });

    it('respects custom emaAlpha', () => {
      const series = makeTrend('r1', 100, 500, 50);
      const lowAlpha = new StellarRouteForecastingService({ emaAlpha: 0.05 });
      const highAlpha = new StellarRouteForecastingService({ emaAlpha: 0.95 });

      lowAlpha.analyzeHistoricalMetrics('r1', series);
      highAlpha.analyzeHistoricalMetrics('r1', series);

      // High alpha weighs recent (larger) values more -> higher EMA prediction
      expect(
        highAlpha.predictLatencyTrends('r1')!.predictedLatencyMs,
      ).toBeGreaterThan(
        lowAlpha.predictLatencyTrends('r1')!.predictedLatencyMs,
      );
    });
  });
});
