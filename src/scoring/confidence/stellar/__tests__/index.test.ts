/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import {
  calculateRouteConfidence,
  scoreRoutesConfidence,
  RouteConfidenceInput,
} from '../index';

describe('calculateRouteConfidence', () => {
  it('returns neutral 0.5 when no inputs provided', () => {
    const result = calculateRouteConfidence({});
    expect(result.confidence).toBe(0.5);
    expect(result.tier).toBe('medium');
  });

  it('assigns high tier for excellent metrics', () => {
    const result = calculateRouteConfidence({
      successRate: 0.99,
      sampleSize: 100,
      dataAgeSeconds: 10,
      consensusRatio: 0.95,
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    expect(result.tier).toBe('high');
  });

  it('assigns low tier for poor metrics', () => {
    const result = calculateRouteConfidence({
      successRate: 0.1,
      sampleSize: 1,
      dataAgeSeconds: 600,
      consensusRatio: 0.2,
    });
    expect(result.confidence).toBeLessThan(0.4);
    expect(result.tier).toBe('low');
  });

  it('scores partial inputs using only provided components', () => {
    const onlySuccess = calculateRouteConfidence({ successRate: 1.0 });
    expect(onlySuccess.confidence).toBe(1.0);
    expect(onlySuccess.tier).toBe('high');
  });

  it('clamps successRate and consensusRatio to [0, 1]', () => {
    const result = calculateRouteConfidence({
      successRate: 1.5,
      consensusRatio: -0.2,
    });
    // successRate clamped to 1, consensusRatio clamped to 0 → avg 0.5
    expect(result.confidence).toBe(0.5);
  });

  it('dataAgeSeconds beyond max results in 0 freshness contribution', () => {
    const result = calculateRouteConfidence({ dataAgeSeconds: 9999 });
    expect(result.confidence).toBe(0);
    expect(result.tier).toBe('low');
  });

  it('sampleSize caps at 1.0 beyond MIN_SAMPLE', () => {
    const result = calculateRouteConfidence({ sampleSize: 1000 });
    expect(result.confidence).toBe(1.0);
  });

  it('attaches metadata passthrough', () => {
    const input: RouteConfidenceInput = { successRate: 0.8, sampleSize: 20 };
    const result = calculateRouteConfidence(input);
    expect(result.metadata).toEqual(input);
  });
});

describe('scoreRoutesConfidence', () => {
  it('returns an empty array for empty input', () => {
    expect(scoreRoutesConfidence([])).toEqual([]);
  });

  it('scores multiple routes independently', () => {
    const results = scoreRoutesConfidence([
      { successRate: 0.95, sampleSize: 50 },
      { successRate: 0.3, sampleSize: 2 },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].confidence).toBeGreaterThan(results[1].confidence);
  });
});
