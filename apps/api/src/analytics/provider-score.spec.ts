import { computeProviderScore, computeSuccessRate } from './provider-score';

describe('provider-score', () => {
  describe('computeSuccessRate', () => {
    it('returns 0 when there are no attempts', () => {
      expect(
        computeSuccessRate({ successfulTransfers: 0, failedTransfers: 0 }),
      ).toBe(0);
    });

    it('computes success rate as a percentage', () => {
      expect(
        computeSuccessRate({ successfulTransfers: 3, failedTransfers: 1 }),
      ).toBe(75);
    });

    it('returns a two-decimal percentage', () => {
      expect(
        computeSuccessRate({ successfulTransfers: 5, failedTransfers: 3 }),
      ).toBe(62.5);
    });
  });

  describe('computeProviderScore', () => {
    it('returns 0 score when there are too few attempts', () => {
      expect(
        computeProviderScore({ successfulTransfers: 2, failedTransfers: 1 }),
      ).toEqual({ successRate: 66.67, score: 0 });
    });

    it('returns score equal to success rate when there are enough attempts', () => {
      expect(
        computeProviderScore({ successfulTransfers: 8, failedTransfers: 2 }),
      ).toEqual({ successRate: 80, score: 80 });
    });

    it('penalizes score slightly for timeouts', () => {
      expect(
        computeProviderScore({
          successfulTransfers: 8,
          failedTransfers: 2,
          timeoutCount: 2,
        }),
      ).toEqual({ successRate: 80, score: 77 });
    });

    it('never returns a negative score', () => {
      expect(
        computeProviderScore({
          successfulTransfers: 1,
          failedTransfers: 20,
          timeoutCount: 5,
        }),
      ).toEqual({ successRate: 4.55, score: 0 });
    });
  });
});
