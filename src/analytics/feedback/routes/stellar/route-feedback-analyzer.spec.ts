import {
  StellarRouteFeedbackAnalyzer,
  type RouteFeedbackInput,
} from './route-feedback-analyzer';

function feedback(overrides: Partial<RouteFeedbackInput> = {}): RouteFeedbackInput {
  return {
    routeId: 'XLM->USDC',
    rating: 5,
    accepted: true,
    submittedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('StellarRouteFeedbackAnalyzer', () => {
  describe('recordFeedback', () => {
    it('stores and normalizes a feedback entry', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      const entry = analyzer.recordFeedback(
        feedback({ routeId: '  XLM->USDC  ', comment: '  great  ' }),
      );
      expect(entry.routeId).toBe('XLM->USDC');
      expect(entry.comment).toBe('great');
      expect(analyzer.getFeedback()).toHaveLength(1);
    });

    it('defaults submittedAt to now when omitted', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      const before = Date.now();
      const entry = analyzer.recordFeedback(feedback({ submittedAt: undefined }));
      expect(entry.submittedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('rejects empty routeId', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      expect(() => analyzer.recordFeedback(feedback({ routeId: '  ' }))).toThrow(
        /routeId/,
      );
    });

    it('rejects out-of-range ratings', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      expect(() => analyzer.recordFeedback(feedback({ rating: 0 }))).toThrow(
        /rating/,
      );
      expect(() => analyzer.recordFeedback(feedback({ rating: 6 }))).toThrow(
        /rating/,
      );
      expect(() => analyzer.recordFeedback(feedback({ rating: NaN }))).toThrow(
        /rating/,
      );
    });

    it('drops empty comments to undefined', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      const entry = analyzer.recordFeedback(feedback({ comment: '   ' }));
      expect(entry.comment).toBeUndefined();
    });

    it('evicts oldest entries beyond keepMaxEntries', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer({ keepMaxEntries: 2 });
      analyzer.recordFeedback(feedback({ rating: 1 }));
      analyzer.recordFeedback(feedback({ rating: 2 }));
      analyzer.recordFeedback(feedback({ rating: 3 }));
      const ratings = analyzer.getFeedback().map((e) => e.rating);
      expect(ratings).toEqual([2, 3]);
    });
  });

  describe('aggregateRoute', () => {
    it('returns null when no feedback in range', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      expect(analyzer.aggregateRoute('missing')).toBeNull();
    });

    it('aggregates ratings, acceptance and sentiment', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      analyzer.recordFeedback(feedback({ rating: 5, accepted: true }));
      analyzer.recordFeedback(feedback({ rating: 3, accepted: false, comment: 'meh' }));
      analyzer.recordFeedback(feedback({ rating: 1, accepted: false }));

      const agg = analyzer.aggregateRoute('XLM->USDC');
      expect(agg).not.toBeNull();
      expect(agg!.totalFeedback).toBe(3);
      expect(agg!.averageRating).toBeCloseTo(3);
      expect(agg!.acceptanceRate).toBeCloseTo(1 / 3);
      expect(agg!.sentimentDistribution).toEqual({
        positive: 1,
        neutral: 1,
        negative: 1,
      });
      expect(agg!.commentCount).toBe(1);
      expect(agg!.lastFeedbackAt).toBeInstanceOf(Date);
    });

    it('respects date-range filtering', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      analyzer.recordFeedback(
        feedback({ submittedAt: new Date('2026-01-01T00:00:00Z') }),
      );
      analyzer.recordFeedback(
        feedback({ submittedAt: new Date('2026-02-01T00:00:00Z') }),
      );
      const agg = analyzer.aggregateRoute('XLM->USDC', {
        from: new Date('2026-01-15T00:00:00Z'),
      });
      expect(agg!.totalFeedback).toBe(1);
    });
  });

  describe('generateInsights', () => {
    const build = () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      // Route A: loved + accepted.
      for (let i = 0; i < 4; i++) {
        analyzer.recordFeedback(feedback({ routeId: 'A', rating: 5, accepted: true }));
      }
      // Route B: disliked + skipped.
      for (let i = 0; i < 4; i++) {
        analyzer.recordFeedback(feedback({ routeId: 'B', rating: 1, accepted: false }));
      }
      // Route C: rated well but rarely accepted.
      for (let i = 0; i < 4; i++) {
        analyzer.recordFeedback(feedback({ routeId: 'C', rating: 4, accepted: false }));
      }
      return analyzer;
    };

    it('identifies top and underperforming routes', () => {
      const insights = build().generateInsights();
      expect(insights.topRoutes[0].routeId).toBe('A');
      expect(insights.underperformingRoutes[0].routeId).toBe('B');
    });

    it('flags routes needing attention', () => {
      const insights = build().generateInsights();
      const flagged = insights.routesNeedingAttention.map((r) => r.routeId).sort();
      // B is negative; C has low acceptance.
      expect(flagged).toEqual(['B', 'C']);
    });

    it('computes feedback-weighted overall metrics', () => {
      const insights = build().generateInsights();
      expect(insights.totalFeedback).toBe(12);
      expect(insights.overallAverageRating).toBeCloseTo((5 + 1 + 4) / 3);
      expect(insights.overallAcceptanceRate).toBeCloseTo(4 / 12);
    });

    it('returns empty insights when there is no feedback', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      const insights = analyzer.generateInsights();
      expect(insights.totalFeedback).toBe(0);
      expect(insights.topRoutes).toHaveLength(0);
      expect(insights.overallAverageRating).toBe(0);
    });
  });

  describe('generateTrendReport', () => {
    it('buckets feedback by the configured window', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      analyzer.recordFeedback(
        feedback({ rating: 2, accepted: false, submittedAt: new Date('2026-01-01T00:00:00Z') }),
      );
      analyzer.recordFeedback(
        feedback({ rating: 2, accepted: false, submittedAt: new Date('2026-01-01T06:00:00Z') }),
      );
      analyzer.recordFeedback(
        feedback({ rating: 5, accepted: true, submittedAt: new Date('2026-01-03T00:00:00Z') }),
      );

      const report = analyzer.generateTrendReport({
        routeId: 'XLM->USDC',
        bucketSizeMs: 24 * 60 * 60 * 1000,
      });

      expect(report.routeId).toBe('XLM->USDC');
      expect(report.buckets).toHaveLength(3);
      expect(report.buckets[0].totalFeedback).toBe(2);
      expect(report.buckets[0].averageRating).toBeCloseTo(2);
      expect(report.buckets[1].totalFeedback).toBe(0);
      expect(report.buckets[2].totalFeedback).toBe(1);
    });

    it('detects an improving rating trend', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      const days = [1, 2, 3, 4];
      const ratings = [1, 2, 4, 5];
      days.forEach((day, i) =>
        analyzer.recordFeedback(
          feedback({
            rating: ratings[i],
            accepted: ratings[i] >= 4,
            submittedAt: new Date(`2026-01-0${day}T00:00:00Z`),
          }),
        ),
      );
      const report = analyzer.generateTrendReport({
        bucketSizeMs: 24 * 60 * 60 * 1000,
      });
      expect(report.ratingTrend).toBe('improving');
      expect(report.acceptanceTrend).toBe('improving');
    });

    it('rejects a non-positive bucket size', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      expect(() => analyzer.generateTrendReport({ bucketSizeMs: 0 })).toThrow(
        /bucketSizeMs/,
      );
    });

    it('returns an empty report when there is no feedback', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      const report = analyzer.generateTrendReport();
      expect(report.buckets).toHaveLength(0);
      expect(report.ratingTrend).toBe('stable');
    });
  });

  describe('clearing', () => {
    it('clears feedback for a single route', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      analyzer.recordFeedback(feedback({ routeId: 'A' }));
      analyzer.recordFeedback(feedback({ routeId: 'B' }));
      expect(analyzer.clearRoute('A')).toBe(1);
      expect(analyzer.getRoutesWithFeedback()).toEqual(['B']);
    });

    it('clears all feedback', () => {
      const analyzer = new StellarRouteFeedbackAnalyzer();
      analyzer.recordFeedback(feedback());
      analyzer.clear();
      expect(analyzer.getFeedback()).toHaveLength(0);
    });
  });
});
