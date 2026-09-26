import { RecommendationMetricsService } from './recommendation-metrics';
import type {
  RecommendationInput,
  RecommendationMetrics,
  UserPreference,
} from './recommendation-metrics.types';

function buildSample(): RecommendationInput[] {
  return [
    {
      id: 'rec-1',
      preference: 'cheapest',
      score: 92,
      confidence: 'high',
      bridgeName: 'StellarBridge',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      feeUsd: 0.5,
      estimatedTimeSeconds: 5,
      reliabilityScore: 97,
    },
    {
      id: 'rec-2',
      preference: 'cheapest',
      score: 78,
      confidence: 'medium',
      bridgeName: 'CheapBridge',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      feeUsd: 0.3,
      estimatedTimeSeconds: 12,
      reliabilityScore: 90,
    },
    {
      id: 'rec-3',
      preference: 'fastest',
      score: 88,
      confidence: 'high',
      bridgeName: 'FastBridge',
      sourceChain: 'stellar',
      destinationChain: 'polygon',
      feeUsd: 1.2,
      estimatedTimeSeconds: 3,
      reliabilityScore: 92,
    },
    {
      id: 'rec-4',
      preference: 'balanced',
      score: 85,
      confidence: 'high',
      bridgeName: 'StellarBridge',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      feeUsd: 0.6,
      estimatedTimeSeconds: 6,
      reliabilityScore: 95,
    },
    {
      id: 'rec-5',
      preference: 'reliable',
      score: 96,
      confidence: 'high',
      bridgeName: 'TrustedBridge',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      feeUsd: 0.9,
      estimatedTimeSeconds: 7,
      reliabilityScore: 99,
    },
  ];
}

function newService() {
  const svc = new RecommendationMetricsService();
  svc.ingest(buildSample());
  return svc;
}

describe('RecommendationMetricsService', () => {
  it('ingest + size reflects the number of stored rows', () => {
    const svc = new RecommendationMetricsService();
    expect(svc.size()).toBe(0);
    svc.ingest(buildSample());
    expect(svc.size()).toBe(5);
  });

  it('record appends a single row', () => {
    const svc = new RecommendationMetricsService();
    svc.record(buildSample()[0]);
    expect(svc.size()).toBe(1);
  });

  it('clear empties the store', () => {
    const svc = newService();
    svc.clear();
    expect(svc.size()).toBe(0);
  });

  it('listRecommendations supports preference filtering', () => {
    const svc = newService();
    const rows = svc.listRecommendations({ preference: 'cheapest' });
    expect(rows.every((r) => r.preference === 'cheapest')).toBe(true);
    expect(rows.length).toBe(2);
  });

  it('listRecommendations supports multi-preference filtering', () => {
    const svc = newService();
    const rows = svc.listRecommendations({ preference: ['cheapest', 'fastest'] });
    expect(rows.length).toBe(3);
  });

  it('listRecommendations honors limit', () => {
    const svc = newService();
    const rows = svc.listRecommendations({ limit: 2 });
    expect(rows).toHaveLength(2);
  });

  it('listRecommendations supports score/fee/reliability filters', () => {
    const svc = newService();
    const rows = svc.listRecommendations({ minScore: 90, minReliabilityScore: 95 });
    expect(rows.every((r) => r.score >= 90 && r.reliabilityScore >= 95)).toBe(true);
  });

  it('listRecommendations supports bridge and chain filters', () => {
    const svc = newService();
    const rows = svc.listRecommendations({
      bridgeName: 'StellarBridge',
      destinationChain: 'ethereum',
    });
    expect(rows.length).toBe(2);
  });

  it('rankingFor returns zeroed stats when no rows match', () => {
    const svc = new RecommendationMetricsService();
    const stats = svc.rankingFor('cheapest');
    expect(stats.count).toBe(0);
    expect(stats.averageScore).toBe(0);
  });

  it('rankingFor computes correct aggregates for a preference', () => {
    const svc = newService();
    const stats = svc.rankingFor('cheapest');
    expect(stats.count).toBe(2);
    expect(stats.topScore).toBe(92);
    expect(stats.minScore).toBe(78);
    expect(stats.maxScore).toBe(92);
    expect(stats.averageFeeUsd).toBeCloseTo(0.4, 2);
  });

  it('rankingStats returns one entry per preference', () => {
    const svc = newService();
    const stats = svc.rankingStats();
    expect(stats).toHaveLength(4);
    expect(stats.map((s) => s.preference).sort()).toEqual([
      'balanced',
      'cheapest',
      'fastest',
      'reliable',
    ]);
  });

  it('snapshot returns totals and score distribution', () => {
    const svc = newService();
    const snap: RecommendationMetrics = svc.snapshot();
    expect(snap.totalRecommendations).toBe(5);
    expect(snap.uniqueBridges).toBe(4);
    expect(snap.uniqueRoutePairs).toBe(2);
    expect(snap.scoreDistribution.low + snap.scoreDistribution.medium + snap.scoreDistribution.high).toBe(5);
  });

  it('snapshot returns a zeroed result on empty state', () => {
    const svc = new RecommendationMetricsService();
    const snap = svc.snapshot();
    expect(snap.totalRecommendations).toBe(0);
    expect(snap.averageScore).toBe(0);
    expect(snap.perPreference).toHaveLength(4);
  });

  it('getById returns the row or null', () => {
    const svc = newService();
    expect(svc.getById('rec-3')?.bridgeName).toBe('FastBridge');
    expect(svc.getById('does-not-exist')).toBeNull();
  });
});
