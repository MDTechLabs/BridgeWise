import { describe, it, expect, beforeEach } from '@jest/globals';
import { SorobanTransferAnalyticsExporter, TransferRecord } from './index';

describe('SorobanTransferAnalyticsExporter', () => {
  let exporter: SorobanTransferAnalyticsExporter;

  beforeEach(() => {
    exporter = new SorobanTransferAnalyticsExporter();
  });

  const record1: TransferRecord = {
    transferId: 't1',
    sender: 'GB1',
    receiver: 'GB2',
    amount: 100,
    asset: 'USDC',
    status: 'completed',
    gasUsed: 500,
    txHash: '0x123',
    timestamp: new Date('2026-06-29T10:00:00.000Z'),
  };

  const record2: TransferRecord = {
    transferId: 't2',
    sender: 'GB2',
    receiver: 'GB3',
    amount: 50,
    asset: 'XLM',
    status: 'failed',
    gasUsed: 200,
    txHash: '0x456',
    timestamp: new Date('2026-06-29T10:05:00.000Z'),
  };

  it('should collect transfer records correctly', () => {
    exporter.recordTransfer(record1);
    exporter.recordTransfer(record2);

    expect(exporter.getRecords()).toHaveLength(2);
    expect(exporter.getRecords()[0]).toEqual(record1);
  });

  it('should export clean JSON format', () => {
    exporter.recordTransfer(record1);
    const jsonStr = exporter.export('json');
    const parsed = JSON.parse(jsonStr);

    expect(parsed.totalTransfers).toBe(1);
    expect(parsed.totalVolume.USDC).toBe(100);
  });

  it('should export clean CSV format', () => {
    exporter.recordTransfer(record1);
    const csvStr = exporter.export('csv');

    expect(csvStr).toContain('transferId,sender,receiver,amount,asset,status,gasUsed,txHash,timestamp');
    expect(csvStr).toContain('t1,GB1,GB2,100,USDC,completed,500,0x123');
  });

  it('should export clean Prometheus exposition format', () => {
    exporter.recordTransfer(record1);
    exporter.recordTransfer(record2);

    const prometheusStr = exporter.export('prometheus');

    expect(prometheusStr).toContain('soroban_transfers_total 2');
    expect(prometheusStr).toContain('soroban_transfers_by_status_total{status="completed"} 1');
    expect(prometheusStr).toContain('soroban_transfers_by_status_total{status="failed"} 1');
    expect(prometheusStr).toContain('soroban_transfer_volume_total{asset="USDC"} 100');
    expect(prometheusStr).toContain('soroban_transfer_gas_used_total{asset="USDC"} 500');
    expect(prometheusStr).toContain('soroban_transfer_gas_used_total{asset="XLM"} 200');
  });
});
