import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_CHAIN_PROFILES, CONFIG_PARAMETER_SET, seededRandom } from './production-config-bundle';
import {
  DEFAULT_MAX_FEED_RECORDS,
  DailyReconciliationService,
  ReconciliationError,
  RECONCILIATION_INVARIANTS,
  REPORT_SCHEMA_VERSION,
  testDbRecord,
  testEvent,
  testInput,
  verifyDailyReport,
} from './daily-event-reconciliation-report';

const SPEC_DOC = join(__dirname, '..', 'docs', 'DAILY_EVENT_RECONCILIATION_REPORT.md');

function service(overrides: ConstructorParameters<typeof DailyReconciliationService>[0] = {}) {
  return new DailyReconciliationService({
    generatedAt: 1_800_000_000_000,
    configDigest: 'f'.repeat(64),
    ...overrides,
  });
}

function expectError(fn: () => unknown, code: string): ReconciliationError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ReconciliationError);
    expect((error as ReconciliationError).code).toBe(code);
    return error as ReconciliationError;
  }
  throw new Error(`expected ReconciliationError ${code}`);
}

function expectAtomic(model: DailyReconciliationService, fn: () => unknown, code: string): void {
  const before = JSON.stringify(model.snapshot());
  expectError(fn, code);
  expect(JSON.stringify(model.snapshot())).toBe(before);
  expect(model.invariantViolations()).toEqual([]);
}

describe('daily reconciliation specification', () => {
  it('documents every invariant and error code in the normative spec', () => {
    const doc = readFileSync(SPEC_DOC, 'utf8');
    for (const id of RECONCILIATION_INVARIANTS) expect(doc).toContain(`\`${id}\``);
    for (const profile of CONFIG_CHAIN_PROFILES) expect(doc).toContain(`\`${profile.chainId}\``);
    expect(doc).toContain(CONFIG_PARAMETER_SET);
    expect(doc).toContain('bridgewise-daily-event-reconciliation-v1');
  });

  it('generates a deterministic passing report for matching feeds', () => {
    const model = service();
    const input = testInput();
    const report = model.generate(input);
    expect(report.status).toBe('pass');
    expect(report.discrepancyCount).toBe(0);
    expect(report.chains).toHaveLength(CONFIG_CHAIN_PROFILES.length);
    expect(report.parameterSetVersion).toBe(CONFIG_PARAMETER_SET);
    expect(report.configDigest).toBe('f'.repeat(64));
    expect(report.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    expect(verifyDailyReport(report)).toBe(true);
    expect(JSON.stringify(service().generate(input))).toBe(JSON.stringify(report));
    expect(model.invariantViolations()).toEqual([]);
  });

  it('rejects invalid service configuration', () => {
    expectError(() => service({ profiles: [] }), 'invalid-profiles');
    expectError(() => service({ maxFeedRecords: 0 }), 'invalid-bounds');
    expectError(() => service({ generatedAt: -1 }), 'invalid-time');
    expectError(() => service({ configDigest: 'short' }), 'invalid-config-digest');
  });
});

describe('input validation (valid, invalid, boundary and adversarial)', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['extra input field', { unexpected: true }, 'invalid-input'],
    ['non-UTC day', { day: '2026-11-23T00:00:00Z' }, 'invalid-day'],
    ['impossible day', { day: '2026-02-30' }, 'invalid-day'],
    ['missing chain head', { heads: { 'evm:1': 200 } }, 'incomplete-feed'],
    ['zero head', { heads: { ...testInput().heads, 'evm:1': 0 } }, 'incomplete-feed'],
    ['extra chain head', { heads: { ...testInput().heads, 'evm:9999': 200 } }, 'invalid-heads'],
    ['oversized event feed', { events: Array.from({ length: DEFAULT_MAX_FEED_RECORDS + 1 }, () => testEvent()) }, 'input-too-large'],
    ['oversized record feed', { records: Array.from({ length: DEFAULT_MAX_FEED_RECORDS + 1 }, () => testDbRecord()) }, 'input-too-large'],
  ])('rejects %s atomically', (_name, patch, code) => {
    const model = service();
    expectAtomic(model, () => model.generate({ ...testInput(), ...patch }), code);
  });

  it('rejects malformed events and records', () => {
    const model = service();
    const eventPatches: Array<[string, Record<string, unknown>, string]> = [
      ['unknown chain', { chainId: 'evm:9999' }, 'invalid-event'],
      ['bad transfer id', { transferId: 'bad id' }, 'invalid-event'],
      ['bad token', { token: 'bad token' }, 'invalid-event'],
      ['negative amount', { amountMinorUnits: '-1' }, 'invalid-event'],
      ['block above head', { blockNumber: 999 }, 'invalid-event'],
      ['negative log index', { logIndex: -1 }, 'invalid-event'],
      ['short tx hash', { txHash: '0x12' }, 'invalid-event'],
      ['unknown status', { status: 'pending' }, 'invalid-event'],
      ['unknown type', { type: 'mint' }, 'invalid-event'],
      ['extra field', { unexpected: 1 }, 'invalid-event'],
    ];
    for (const [, patch, code] of eventPatches) {
      expectAtomic(model, () => model.generate(testInput({ events: [{ ...testEvent(), ...patch }] })), code);
    }
    expectAtomic(model, () => model.generate(testInput({
      records: [{ ...testDbRecord(), amountMinorUnits: '-1' }],
    })), 'invalid-record');
    expectAtomic(model, () => model.generate(testInput({
      records: [{ ...testDbRecord(), unexpected: true } ],
    })), 'invalid-record');
  });

  it('accepts the exact feed-size boundary', () => {
    const model = service();
    const events = Array.from({ length: DEFAULT_MAX_FEED_RECORDS }, (_, i) => testEvent({
      transferId: `tx-bound-${i}`,
      chainId: 'evm:1',
      blockNumber: 10 + (i % 90),
    }));
    const records = events.map((event) => testDbRecord({ transferId: event.transferId }));
    const report = model.generate(testInput({ events, records }));
    expect(report.chains[0].eventCount).toBe(DEFAULT_MAX_FEED_RECORDS);
    expect(report.status).toBe('pass');
    expect(verifyDailyReport(report)).toBe(true);
  });
});

describe('discrepancy classification and integrity', () => {
  it.each<[string, () => ReturnType<typeof testInput>, string]>([
    ['missing database record', () => testInput({ records: [] }), 'missing-db-record'],
    ['missing chain event', () => testInput({ events: [] }), 'missing-chain-event'],
    ['amount mismatch', () => testInput({ records: [testDbRecord({ amountMinorUnits: '2' })] }), 'amount-mismatch'],
    ['status mismatch', () => testInput({ records: [testDbRecord({ status: 'reverted' })] }), 'status-mismatch'],
    ['token mismatch', () => testInput({ records: [testDbRecord({ token: 'DAI' })] }), 'token-mismatch'],
    ['type mismatch', () => testInput({ records: [testDbRecord({ type: 'refund' })] }), 'type-mismatch'],
    ['duplicate event', () => testInput({ events: [testEvent(), testEvent()] }), 'duplicate-event'],
    ['duplicate record', () => testInput({ records: [testDbRecord(), testDbRecord()] }), 'duplicate-record'],
    ['unfinalized event', () => testInput({ events: [testEvent({ chainId: 'evm:137', blockNumber: 100 })] }), 'unfinalized-event'],
  ])('reports %s and fails closed', (_name, input, code) => {
    const model = service();
    const report = model.generate(input());
    expect(report.status).toBe('fail');
    expect(report.discrepancies.map((item) => item.code)).toContain(code);
    expect(verifyDailyReport(report)).toBe(true);
    expect(model.invariantViolations()).toEqual([]);
  });

  it('detects tampering with a retained report', () => {
    const model = service();
    const report = model.generate(testInput());
    expect(verifyDailyReport({ ...report, day: '2026-11-24' })).toBe(false);
    expect(verifyDailyReport({ ...report, status: 'fail' })).toBe(false);
    expect(verifyDailyReport({ ...report, discrepancyCount: 1 })).toBe(false);
    expect(verifyDailyReport({ ...report, integrityHash: '0'.repeat(64) })).toBe(false);
    expect(verifyDailyReport(null)).toBe(false);
  });

  it('rejects replayed days and oversized discrepancy sets', () => {
    const model = service();
    const input = testInput();
    model.generate(input);
    expectAtomic(model, () => model.generate(input), 'duplicate-report');

    const overflow = service({ maxDiscrepancies: 2 });
    const events = Array.from({ length: 6 }, (_, i) => testEvent({
      transferId: `tx-overflow-${i}`,
      blockNumber: 10 + i,
    }));
    expectError(() => overflow.generate(testInput({ events, records: [] })), 'too-many-discrepancies');
    expect(overflow.snapshot().reports).toHaveLength(0);
  });

  it('keeps invariants across randomized multi-step report sequences', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const random = seededRandom(seed);
      const model = service();
      let generated = 0;
      for (let step = 0; step < 16; step++) {
        const day = `2026-11-${String(1 + Math.floor(random() * 20)).padStart(2, '0')}`;
        const mismatch = random() < 0.4;
        const input = testInput({
          day,
          records: [testDbRecord({
            amountMinorUnits: mismatch ? '999' : '1000000',
            status: random() < 0.2 ? 'reverted' : 'confirmed',
          })],
        });
        const before = JSON.stringify(model.snapshot());
        try {
          const report = model.generate(input);
          generated++;
          expect(verifyDailyReport(report)).toBe(true);
        } catch (error) {
          expect(error).toBeInstanceOf(ReconciliationError);
          expect(JSON.stringify(model.snapshot())).toBe(before);
        }
        expect(model.invariantViolations()).toEqual([]);
      }
      expect(generated).toBeGreaterThan(0);
      expect(model.snapshot().reports).toHaveLength(generated);
    }
  });
});

export type { DailyReconciliationReport };
