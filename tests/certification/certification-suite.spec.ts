import { CertificationRegistry } from '../../src/certification/providers/stellar/certification-registry';
import { ProviderCertificationInput } from '../../src/certification/providers/stellar/types';
import * as fs from 'fs';
import * as path from 'path';

describe('Stellar Bridge Provider Certification Suite', () => {
  let registry: CertificationRegistry;
  const mockNow = () => new Date('2026-08-26T12:00:00.000Z').getTime();

  beforeEach(() => {
    registry = new CertificationRegistry({
      now: mockNow,
      engineConfig: {
        now: mockNow,
        validityDurationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    });
  });

  it('should certify a platinum provider successfully', () => {
    const input: ProviderCertificationInput = {
      providerId: 'allbridge-platinum',
      usesHttps: true,
      hasValidMetadata: true,
      uptime: 99.9,
      successRate: 0.99,
      avgLatencyMs: 120,
      versionIsSemver: true,
      networkIsSupported: true,
      supportedAssetCount: 25,
      registeredAt: mockNow() - 100 * 24 * 60 * 60 * 1000, // 100 days ago
      historicalOperationCount: 15000,
    };

    const result = registry.certify(input);
    expect(result.level).toBe('platinum');
    expect(result.score).toBeGreaterThanOrEqual(95);
  });

  it('should certify a gold provider with minor latency/ops gaps', () => {
    const input: ProviderCertificationInput = {
      providerId: 'allbridge-gold',
      usesHttps: true,
      hasValidMetadata: true,
      uptime: 98.5,
      successRate: 0.96,
      avgLatencyMs: 450, // higher latency
      versionIsSemver: true,
      networkIsSupported: true,
      supportedAssetCount: 12,
      registeredAt: mockNow() - 40 * 24 * 60 * 60 * 1000,
      historicalOperationCount: 5000,
    };

    const result = registry.certify(input);
    expect(result.level).toBe('gold');
    expect(result.score).toBeLessThan(95);
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it('should flag a provider as uncertified if security criteria fail', () => {
    const input: ProviderCertificationInput = {
      providerId: 'untrusted-bridge',
      usesHttps: false, // insecure
      hasValidMetadata: false,
      uptime: 90.0,
      successRate: 0.85,
      avgLatencyMs: 1200,
      versionIsSemver: false,
      networkIsSupported: true,
      supportedAssetCount: 2,
      registeredAt: mockNow() - 2 * 24 * 60 * 60 * 1000,
      historicalOperationCount: 50,
    };

    const result = registry.certify(input);
    expect(result.level).toBe('uncertified');
    expect(result.score).toBeLessThan(50);
  });

  it('should support certification revocation', () => {
    const input: ProviderCertificationInput = {
      providerId: 'allbridge-temp',
      usesHttps: true,
      hasValidMetadata: true,
      uptime: 99.5,
      successRate: 0.98,
      avgLatencyMs: 180,
      versionIsSemver: true,
      networkIsSupported: true,
      supportedAssetCount: 10,
      registeredAt: mockNow() - 30 * 24 * 60 * 60 * 1000,
      historicalOperationCount: 2000,
    };

    registry.certify(input);
    const queryBefore = registry.query({ status: 'active' });
    expect(queryBefore.some((r) => r.providerId === 'allbridge-temp')).toBe(true);

    const revoked = registry.revoke('allbridge-temp', 'Security breach detected');
    expect(revoked).toBe(true);

    const queryAfter = registry.query({ status: 'active' });
    expect(queryAfter.some((r) => r.providerId === 'allbridge-temp')).toBe(false);
  });

  afterAll(() => {
    // Generate and write report
    const platinumInput: ProviderCertificationInput = {
      providerId: 'allbridge-platinum',
      usesHttps: true,
      hasValidMetadata: true,
      uptime: 99.9,
      successRate: 0.99,
      avgLatencyMs: 120,
      versionIsSemver: true,
      networkIsSupported: true,
      supportedAssetCount: 25,
      registeredAt: mockNow() - 100 * 24 * 60 * 60 * 1000,
      historicalOperationCount: 15000,
    };

    const goldInput: ProviderCertificationInput = {
      providerId: 'allbridge-gold',
      usesHttps: true,
      hasValidMetadata: true,
      uptime: 98.5,
      successRate: 0.96,
      avgLatencyMs: 450,
      versionIsSemver: true,
      networkIsSupported: true,
      supportedAssetCount: 12,
      registeredAt: mockNow() - 40 * 24 * 60 * 60 * 1000,
      historicalOperationCount: 5000,
    };

    const uncertifiedInput: ProviderCertificationInput = {
      providerId: 'untrusted-bridge',
      usesHttps: false,
      hasValidMetadata: false,
      uptime: 90.0,
      successRate: 0.85,
      avgLatencyMs: 1200,
      versionIsSemver: false,
      networkIsSupported: true,
      supportedAssetCount: 2,
      registeredAt: mockNow() - 2 * 24 * 60 * 60 * 1000,
      historicalOperationCount: 50,
    };

    const results = [
      registry.certify(platinumInput),
      registry.certify(goldInput),
      registry.certify(uncertifiedInput),
    ];

    const report = {
      timestamp: mockNow(),
      runDate: new Date(mockNow()).toISOString(),
      summary: {
        totalEvaluated: results.length,
        certified: results.filter((r) => r.level !== 'uncertified').length,
        uncertified: results.filter((r) => r.level === 'uncertified').length,
      },
      providers: results.map((r) => ({
        providerId: r.providerId,
        level: r.level,
        score: r.score,
        status: r.status,
        criteria: r.criteria.map((c) => ({
          name: c.criterion,
          score: c.score,
          rationale: c.rationale,
        })),
      })),
    };

    const reportsDir = path.join(__dirname, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(reportsDir, 'certification-report.json'),
      JSON.stringify(report, null, 2),
      'utf8',
    );
  });
});
