import { StellarTransferLifecycleAnalyzer } from './lifecycle-analyzer';
import { TransferRecord } from './types';

const makeTransfer = (id: string, failed = false): TransferRecord => ({
  id,
  sourceChain: 'stellar',
  destinationChain: 'ethereum',
  asset: 'USDC',
  amount: '100',
  startedAt: 1000,
  completedAt: failed ? undefined : 6000,
  failed: failed || undefined,
  events: [
    { transferId: id, stage: 'initiated', timestamp: 1000 },
    { transferId: id, stage: 'validated', timestamp: 1500 },
    { transferId: id, stage: 'locked', timestamp: 2000 },
    { transferId: id, stage: 'bridging', timestamp: 3000 },
    { transferId: id, stage: 'completed', timestamp: 6000 },
  ],
});

describe('StellarTransferLifecycleAnalyzer', () => {
  const analyzer = new StellarTransferLifecycleAnalyzer();

  it('reports totals correctly', () => {
    const transfers = [makeTransfer('t1'), makeTransfer('t2'), makeTransfer('t3', true)];
    const report = analyzer.analyze(transfers);
    expect(report.totalTransfers).toBe(3);
    expect(report.successfulTransfers).toBe(2);
    expect(report.failedTransfers).toBe(1);
  });

  it('computes avg total duration', () => {
    const transfers = [makeTransfer('t1'), makeTransfer('t2')];
    const report = analyzer.analyze(transfers);
    expect(report.avgTotalDurationMs).toBe(5000);
  });

  it('identifies stage durations', () => {
    const report = analyzer.analyze([makeTransfer('t1')]);
    expect(report.stageDurations.length).toBeGreaterThan(0);
  });

  it('identifies bottlenecks', () => {
    const report = analyzer.analyze([makeTransfer('t1')]);
    expect(report.bottlenecks.length).toBeGreaterThan(0);
    const total = report.bottlenecks.reduce((s, b) => s + b.percentageOfTotal, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('returns empty report for no transfers', () => {
    const report = analyzer.analyze([]);
    expect(report.totalTransfers).toBe(0);
    expect(report.avgTotalDurationMs).toBe(0);
    expect(report.bottlenecks).toHaveLength(0);
  });
});
