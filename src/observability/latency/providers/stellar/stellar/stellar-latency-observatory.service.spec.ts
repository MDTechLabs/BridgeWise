import { describe, beforeEach, it, expect } from 'vitest';
import { StellarLatencyObservatoryService } from './stellar-latency-observatory.service';

describe('StellarLatencyObservatoryService', () => {
  let observatory: StellarLatencyObservatoryService;

  beforeEach(() => {
    observatory = new StellarLatencyObservatoryService({
      latencyDegradedThresholdMs: 500,
      errorRateThresholdPercent: 20,
      sampleWindowSize: 10,
    });
  });

  it('should measure execution time of a provider action', async () => {
    const mockAction = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'ok';
    };

    const result = await observatory.measure('horizon-mainnet', mockAction);
    expect(result).toBe('ok');

    const report = observatory.generateReport('horizon-mainnet');
    expect(report).not.toBeNull();
    expect(report?.sampleCount).toBe(1);
    expect(report?.averageLatencyMs).toBeGreaterThanOrEqual(45);
  });

  it('should detect degraded status when P95 exceeds threshold', () => {
    const providerId = 'soroban-rpc';

    // Record fast samples
    for (let i = 0; i < 9; i++) {
      observatory.recordSample({
        providerId,
        latencyMs: 100,
        timestamp: new Date(),
        success: true,
      });
    }

    // Record slow sample exceeding 500ms threshold
    observatory.recordSample({
      providerId,
      latencyMs: 800,
      timestamp: new Date(),
      success: true,
    });

    const report = observatory.generateReport(providerId);
    expect(report?.isDegraded).toBe(true);
    expect(report?.p95LatencyMs).toBe(800);
  });

  it('should detect degraded status when error rate exceeds threshold', () => {
    const providerId = 'horizon-testnet';

    observatory.recordSample({
      providerId,
      latencyMs: 100,
      timestamp: new Date(),
      success: false,
    });

    observatory.recordSample({
      providerId,
      latencyMs: 100,
      timestamp: new Date(),
      success: false,
    });

    observatory.recordSample({
      providerId,
      latencyMs: 100,
      timestamp: new Date(),
      success: true,
    });

    const report = observatory.generateReport(providerId);
    expect(report?.errorRate).toBeGreaterThan(20);
    expect(report?.isDegraded).toBe(true);
  });
});