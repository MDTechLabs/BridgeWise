import {
  SorobanFeeEstimatorService,
  SorobanResourceUsage,
  FeeEstimationError,
} from './soroban-fee-estimator.service';

const usage: SorobanResourceUsage = {
  cpuInstructions: 1_000_000,
  readBytes: 2000,
  writeBytes: 500,
  readEntries: 4,
  writeEntries: 2,
  transactionSizeBytes: 400,
};

describe('SorobanFeeEstimatorService', () => {
  it('returns structured fee data with a resource + inclusion breakdown', () => {
    const svc = new SorobanFeeEstimatorService({ feeBuffer: 1, baseInclusionFee: 100 });
    const est = svc.estimate(usage);
    expect(est.resourceFee).toBeGreaterThan(0);
    expect(est.inclusionFee).toBe(100);
    expect(est.rawFee).toBe(est.resourceFee + est.inclusionFee);
    expect(est.totalFee).toBe(est.rawFee); // buffer 1 => no change
  });

  it('applies the configured fee buffer', () => {
    const svc = new SorobanFeeEstimatorService({ feeBuffer: 1.2, baseInclusionFee: 100 });
    const est = svc.estimate(usage);
    expect(est.feeBuffer).toBe(1.2);
    expect(est.totalFee).toBe(Math.ceil(est.rawFee * 1.2));
    expect(est.totalFee).toBeGreaterThan(est.rawFee);
  });

  it('allows per-call buffer overrides', () => {
    const svc = new SorobanFeeEstimatorService({ feeBuffer: 1.1 });
    const est = svc.estimate(usage, { feeBuffer: 2 });
    expect(est.feeBuffer).toBe(2);
  });

  it('rejects a buffer below 1', () => {
    const svc = new SorobanFeeEstimatorService();
    expect(() => svc.estimate(usage, { feeBuffer: 0.5 })).toThrow(FeeEstimationError);
  });

  it('handles invalid resource usage safely', () => {
    const svc = new SorobanFeeEstimatorService();
    expect(() => svc.estimate({ ...usage, cpuInstructions: -1 })).toThrow(FeeEstimationError);
    expect(() => svc.estimate({ ...usage, readBytes: NaN })).toThrow(FeeEstimationError);
  });
});
