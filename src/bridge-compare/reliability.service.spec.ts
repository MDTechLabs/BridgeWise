import { Test, TestingModule } from '@nestjs/testing';
import { ReliabilityService } from '../src/bridge-compare/reliability.service';

describe('ReliabilityService', () => {
  let service: ReliabilityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReliabilityService],
    }).compile();

    service = module.get<ReliabilityService>(ReliabilityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateReliabilityScore', () => {
    it('returns a score between 0 and 100 for known bridges', () => {
      const bridges = ['stargate', 'squid', 'hop', 'cbridge', 'soroswap'];
      for (const bridge of bridges) {
        const score = service.calculateReliabilityScore(bridge);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });

    it('returns default score (70) for unknown bridge', () => {
      const score = service.calculateReliabilityScore('unknown-bridge');
      expect(score).toBe(70);
    });

    it('stargate scores higher than soroswap (better uptime/success)', () => {
      const stargate = service.calculateReliabilityScore('stargate');
      const soroswap = service.calculateReliabilityScore('soroswap');
      expect(stargate).toBeGreaterThan(soroswap);
    });

    it('is case-insensitive for bridge ID', () => {
      const lower = service.calculateReliabilityScore('stargate');
      const upper = service.calculateReliabilityScore('STARGATE');
      expect(lower).toBe(upper);
    });
  });

  describe('getMetrics', () => {
    it('returns full metrics for known bridge', () => {
      const metrics = service.getMetrics('stargate');
      expect(metrics.uptime24h).toBeGreaterThan(0);
      expect(metrics.successRate7d).toBeGreaterThan(0);
      expect(metrics.reliabilityScore).toBeGreaterThan(0);
    });

    it('returns zero-score metrics for unknown bridge', () => {
      const metrics = service.getMetrics('nonexistent');
      expect(metrics.uptime24h).toBe(0);
      expect(metrics.successRate7d).toBe(0);
    });
  });

  describe('batchCalculateScores', () => {
    it('returns a score for each bridge ID', () => {
      const ids = ['stargate', 'squid', 'hop'];
      const result = service.batchCalculateScores(ids);
      expect(result.size).toBe(3);
      for (const id of ids) {
        expect(result.has(id)).toBe(true);
        expect(result.get(id)).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns empty map for empty input', () => {
      const result = service.batchCalculateScores([]);
      expect(result.size).toBe(0);
    });
  });
});
