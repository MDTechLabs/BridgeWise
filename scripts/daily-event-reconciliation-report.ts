/**
 * Daily contract-event vs database reconciliation report (issue #1528).
 *
 * Deterministic, fail-closed model. All chain-specific parameters and pinned
 * heads come from the versioned configuration table or from the reviewed
 * report request; nothing is inferred from a live RPC or relayer response.
 * Amounts are compared as explicit integer minor units (no floating point).
 *
 * Normative prose: docs/DAILY_EVENT_RECONCILIATION_REPORT.md.
 */

import { createHash } from 'node:crypto';
import {
  ChainConfigEntry,
  CONFIG_CHAIN_PROFILES,
  CONFIG_PARAMETER_SET,
  canonicalJson,
  seededRandom,
} from './production-config-bundle';

export const REPORT_SCHEMA_VERSION = 1;
export const REPORT_DOMAIN = 'bridgewise-daily-event-reconciliation-v1';
export const DEFAULT_MAX_FEED_RECORDS = 512;
export const DEFAULT_MAX_DISCREPANCIES = 128;

export const RECONCILIATION_INVARIANTS = [
  'R-1',
  'R-2',
  'R-3',
  'R-4',
  'R-5',
  'R-6',
  'R-7',
  'R-8',
] as const;

export type TransferState = 'confirmed' | 'reverted';
export type TransferType = 'deposit' | 'delivery' | 'refund';

export type DiscrepancyCode =
  | 'missing-db-record'
  | 'missing-chain-event'
  | 'amount-mismatch'
  | 'status-mismatch'
  | 'token-mismatch'
  | 'type-mismatch'
  | 'duplicate-event'
  | 'duplicate-record'
  | 'unfinalized-event';

export interface ChainEvent {
  readonly transferId: string;
  readonly chainId: string;
  readonly token: string;
  readonly amountMinorUnits: string;
  readonly status: TransferState;
  readonly type: TransferType;
  readonly blockNumber: number;
  readonly logIndex: number;
  readonly txHash: string;
}

export interface DbRecord {
  readonly transferId: string;
  readonly chainId: string;
  readonly token: string;
  readonly amountMinorUnits: string;
  readonly status: TransferState;
  readonly type: TransferType;
}

export interface ReconciliationInput {
  /** UTC calendar day in YYYY-MM-DD form. */
  readonly day: string;
  /** Explicit, reviewed head per configured chain; never read from an RPC. */
  readonly heads: Readonly<Record<string, number>>;
  readonly events: readonly ChainEvent[];
  readonly records: readonly DbRecord[];
}

export interface Discrepancy {
  readonly code: DiscrepancyCode;
  readonly transferId: string;
  readonly chainId: string;
  readonly expected: string | null;
  readonly observed: string | null;
}

export interface ChainCoverage {
  readonly chainId: string;
  readonly finalityDepth: number;
  readonly head: number;
  readonly eventCount: number;
  readonly recordCount: number;
}

export interface DailyReconciliationReport {
  readonly schemaVersion: number;
  readonly reportId: string;
  readonly day: string;
  readonly generatedAt: number;
  readonly parameterSetVersion: string;
  readonly configDigest: string | null;
  readonly chains: readonly ChainCoverage[];
  readonly discrepancyCount: number;
  readonly discrepancies: readonly Discrepancy[];
  readonly status: 'pass' | 'fail';
  readonly integrityHash: string;
}

export interface ReconciliationOptions {
  readonly profiles?: readonly ChainConfigEntry[];
  readonly maxFeedRecords?: number;
  readonly maxDiscrepancies?: number;
  readonly generatedAt?: number;
  readonly configDigest?: string | null;
}

export interface ReconciliationSnapshot {
  generatedAt: number;
  reports: Array<{ day: string; reportId: string; status: 'pass' | 'fail' }>;
}

export class ReconciliationError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ReconciliationError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isMinorUnits(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{1,32}$/.test(value);
}

function isTransferState(value: unknown): value is TransferState {
  return value === 'confirmed' || value === 'reverted';
}

function isTransferType(value: unknown): value is TransferType {
  return value === 'deposit' || value === 'delivery' || value === 'refund';
}

function isTransferId(value: unknown): value is string {
  return (
    typeof value === 'string' && /^tx-[a-z0-9][a-z0-9-]{2,63}$/.test(value)
  );
}

export function reportHash(
  report: Omit<DailyReconciliationReport, 'integrityHash'>,
): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        domain: REPORT_DOMAIN,
        schemaVersion: report.schemaVersion,
        reportId: report.reportId,
        day: report.day,
        generatedAt: report.generatedAt,
        parameterSetVersion: report.parameterSetVersion,
        configDigest: report.configDigest,
        chains: report.chains,
        discrepancyCount: report.discrepancyCount,
        discrepancies: report.discrepancies,
        status: report.status,
      }),
      'utf8',
    )
    .digest('hex');
}

export function verifyDailyReport(value: unknown): boolean {
  if (!isPlainObject(value) || value.schemaVersion !== REPORT_SCHEMA_VERSION)
    return false;
  if (
    typeof value.integrityHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.integrityHash)
  )
    return false;
  if (!Array.isArray(value.discrepancies) || !Array.isArray(value.chains))
    return false;
  if (value.discrepancyCount !== value.discrepancies.length) return false;
  if (value.status !== (value.discrepancies.length === 0 ? 'pass' : 'fail'))
    return false;
  if (
    typeof value.reportId !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.reportId)
  )
    return false;
  const { integrityHash, ...rest } =
    value as unknown as DailyReconciliationReport;
  return reportHash(rest) === integrityHash;
}

export class DailyReconciliationService {
  private currentTime: number;
  private readonly profiles: readonly ChainConfigEntry[];
  private readonly maxFeedRecords: number;
  private readonly maxDiscrepancies: number;
  private readonly configDigest: string | null;
  private readonly reports = new Map<string, DailyReconciliationReport>();

  constructor(readonly options: ReconciliationOptions = {}) {
    const profiles = options.profiles ?? CONFIG_CHAIN_PROFILES;
    if (
      !profiles.length ||
      new Set(profiles.map((p) => p.chainId)).size !== profiles.length
    ) {
      throw new ReconciliationError('invalid-profiles');
    }
    this.profiles = profiles;
    this.maxFeedRecords = options.maxFeedRecords ?? DEFAULT_MAX_FEED_RECORDS;
    this.maxDiscrepancies =
      options.maxDiscrepancies ?? DEFAULT_MAX_DISCREPANCIES;
    if (this.maxFeedRecords < 1 || this.maxDiscrepancies < 1) {
      throw new ReconciliationError('invalid-bounds');
    }
    if (
      !Number.isSafeInteger(options.generatedAt ?? 0) ||
      (options.generatedAt ?? 0) < 0
    ) {
      throw new ReconciliationError('invalid-time');
    }
    this.currentTime = options.generatedAt ?? 1_700_000_000_000;
    this.configDigest = options.configDigest ?? null;
    if (
      this.configDigest !== null &&
      !/^[0-9a-f]{64}$/.test(this.configDigest)
    ) {
      throw new ReconciliationError('invalid-config-digest');
    }
  }

  get now(): number {
    return this.currentTime;
  }

  setNow(value: number): void {
    if (!Number.isSafeInteger(value) || value < this.currentTime) {
      throw new ReconciliationError('clock-must-not-go-backwards');
    }
    this.currentTime = value;
  }

  generate(value: unknown): DailyReconciliationReport {
    const input = this.validateInput(value);
    if (this.reports.has(input.day))
      throw new ReconciliationError('duplicate-report');

    const chains: ChainCoverage[] = this.profiles.map((profile) => ({
      chainId: profile.chainId,
      finalityDepth: profile.finalityDepth,
      head: input.heads[profile.chainId],
      eventCount: input.events.filter(
        (event) => event.chainId === profile.chainId,
      ).length,
      recordCount: input.records.filter(
        (record) => record.chainId === profile.chainId,
      ).length,
    }));
    const discrepancies: Discrepancy[] = [];
    const seenEvents = new Set<string>();
    const seenRecords = new Set<string>();
    const eventByKey = new Map<string, ChainEvent>();

    for (const event of input.events) {
      const eventKey = `${event.chainId}:${event.transferId}:${event.blockNumber}:${event.logIndex}`;
      if (seenEvents.has(eventKey)) {
        discrepancies.push({
          code: 'duplicate-event',
          transferId: event.transferId,
          chainId: event.chainId,
          expected: null,
          observed: eventKey,
        });
        continue;
      }
      seenEvents.add(eventKey);
      const profile = this.profiles.find(
        (item) => item.chainId === event.chainId,
      );
      const depth = input.heads[event.chainId] - event.blockNumber + 1;
      if (depth < profile.finalityDepth) {
        discrepancies.push({
          code: 'unfinalized-event',
          transferId: event.transferId,
          chainId: event.chainId,
          expected: String(profile.finalityDepth),
          observed: String(depth),
        });
        continue;
      }
      eventByKey.set(`${event.chainId}:${event.transferId}`, event);
    }

    for (const record of input.records) {
      const recordKey = `${record.chainId}:${record.transferId}`;
      if (seenRecords.has(recordKey)) {
        discrepancies.push({
          code: 'duplicate-record',
          transferId: record.transferId,
          chainId: record.chainId,
          expected: null,
          observed: recordKey,
        });
        continue;
      }
      seenRecords.add(recordKey);
      const event = eventByKey.get(recordKey);
      if (!event) {
        discrepancies.push({
          code: 'missing-chain-event',
          transferId: record.transferId,
          chainId: record.chainId,
          expected: null,
          observed: record.status,
        });
        continue;
      }
      if (event.amountMinorUnits !== record.amountMinorUnits) {
        discrepancies.push({
          code: 'amount-mismatch',
          transferId: record.transferId,
          chainId: record.chainId,
          expected: event.amountMinorUnits,
          observed: record.amountMinorUnits,
        });
      }
      if (event.status !== record.status) {
        discrepancies.push({
          code: 'status-mismatch',
          transferId: record.transferId,
          chainId: record.chainId,
          expected: event.status,
          observed: record.status,
        });
      }
      if (event.token !== record.token) {
        discrepancies.push({
          code: 'token-mismatch',
          transferId: record.transferId,
          chainId: record.chainId,
          expected: event.token,
          observed: record.token,
        });
      }
      if (event.type !== record.type) {
        discrepancies.push({
          code: 'type-mismatch',
          transferId: record.transferId,
          chainId: record.chainId,
          expected: event.type,
          observed: record.type,
        });
      }
    }
    for (const [key, event] of eventByKey) {
      if (!seenRecords.has(key)) {
        discrepancies.push({
          code: 'missing-db-record',
          transferId: event.transferId,
          chainId: event.chainId,
          expected: event.status,
          observed: null,
        });
      }
    }
    discrepancies.sort((a, b) =>
      `${a.chainId}|${a.transferId}|${a.code}`.localeCompare(
        `${b.chainId}|${b.transferId}|${b.code}`,
      ),
    );
    if (discrepancies.length > this.maxDiscrepancies) {
      throw new ReconciliationError('too-many-discrepancies');
    }

    const base = {
      schemaVersion: REPORT_SCHEMA_VERSION,
      reportId: createHash('sha256')
        .update(
          canonicalJson({
            domain: REPORT_DOMAIN,
            day: input.day,
            generatedAt: this.currentTime,
            heads: input.heads,
            events: input.events,
            records: input.records,
            configDigest: this.configDigest,
          }),
          'utf8',
        )
        .digest('hex'),
      day: input.day,
      generatedAt: this.currentTime,
      parameterSetVersion: CONFIG_PARAMETER_SET,
      configDigest: this.configDigest,
      chains,
      discrepancyCount: discrepancies.length,
      discrepancies: Object.freeze(discrepancies),
      status:
        discrepancies.length === 0 ? ('pass' as const) : ('fail' as const),
    };
    const report: DailyReconciliationReport = Object.freeze({
      ...base,
      integrityHash: reportHash(base),
    });
    if (!verifyDailyReport(report))
      throw new ReconciliationError('invalid-report');
    this.reports.set(input.day, report);
    return report;
  }

  snapshot(): ReconciliationSnapshot {
    return {
      generatedAt: this.currentTime,
      reports: [...this.reports.values()].map((report) => ({
        day: report.day,
        reportId: report.reportId,
        status: report.status,
      })),
    };
  }

  invariantViolations(): string[] {
    const violations: string[] = [];
    for (const report of this.reports.values()) {
      if (!verifyDailyReport(report)) violations.push('R-1');
      if (report.chains.length !== this.profiles.length) violations.push('R-2');
      if (report.discrepancyCount > this.maxDiscrepancies)
        violations.push('R-5');
      if (report.status !== (report.discrepancyCount === 0 ? 'pass' : 'fail'))
        violations.push('R-7');
      if (report.generatedAt < 0) violations.push('R-8');
    }
    return [...new Set(violations)];
  }

  private validateInput(value: unknown): ReconciliationInput {
    if (
      !isPlainObject(value) ||
      Object.keys(value).sort().join(',') !== 'day,events,heads,records'
    ) {
      throw new ReconciliationError('invalid-input');
    }
    const day = value.day;
    if (
      typeof day !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      new Date(`${day}T00:00:00.000Z`).toISOString().slice(0, 10) !== day
    ) {
      throw new ReconciliationError('invalid-day');
    }
    if (!isPlainObject(value.heads))
      throw new ReconciliationError('incomplete-feed');
    const heads = value.heads;
    for (const profile of this.profiles) {
      if (
        !Number.isSafeInteger(heads[profile.chainId]) ||
        (heads[profile.chainId] as number) < 1
      ) {
        throw new ReconciliationError('incomplete-feed');
      }
    }
    if (Object.keys(heads).length !== this.profiles.length)
      throw new ReconciliationError('invalid-heads');
    if (
      !Array.isArray(value.events) ||
      !Array.isArray(value.records) ||
      value.events.length > this.maxFeedRecords ||
      value.records.length > this.maxFeedRecords
    ) {
      throw new ReconciliationError('input-too-large');
    }
    for (const event of value.events) {
      if (
        !isPlainObject(event) ||
        Object.keys(event).sort().join(',') !==
          'amountMinorUnits,blockNumber,chainId,logIndex,status,token,transferId,txHash,type'
      ) {
        throw new ReconciliationError('invalid-event');
      }
      if (
        !isTransferId(event.transferId) ||
        typeof event.chainId !== 'string' ||
        !this.profiles.some((profile) => profile.chainId === event.chainId)
      ) {
        throw new ReconciliationError('invalid-event');
      }
      if (
        typeof event.token !== 'string' ||
        !/^[A-Za-z0-9_-]{1,16}$/.test(event.token) ||
        !isMinorUnits(event.amountMinorUnits) ||
        !isTransferState(event.status) ||
        !isTransferType(event.type)
      ) {
        throw new ReconciliationError('invalid-event');
      }
      if (
        !Number.isSafeInteger(event.blockNumber) ||
        (event.blockNumber as number) < 1 ||
        (event.blockNumber as number) > (heads[event.chainId] as number) ||
        !Number.isSafeInteger(event.logIndex) ||
        (event.logIndex as number) < 0 ||
        typeof event.txHash !== 'string' ||
        !/^0x[0-9a-f]{64}$/.test(event.txHash)
      ) {
        throw new ReconciliationError('invalid-event');
      }
    }
    for (const record of value.records) {
      if (
        !isPlainObject(record) ||
        Object.keys(record).sort().join(',') !==
          'amountMinorUnits,chainId,status,token,transferId,type'
      ) {
        throw new ReconciliationError('invalid-record');
      }
      if (
        !isTransferId(record.transferId) ||
        typeof record.chainId !== 'string' ||
        !this.profiles.some((profile) => profile.chainId === record.chainId) ||
        typeof record.token !== 'string' ||
        !/^[A-Za-z0-9_-]{1,16}$/.test(record.token) ||
        !isMinorUnits(record.amountMinorUnits) ||
        !isTransferState(record.status) ||
        !isTransferType(record.type)
      ) {
        throw new ReconciliationError('invalid-record');
      }
    }
    return value as unknown as ReconciliationInput;
  }
}

export function testEvent(overrides: Partial<ChainEvent> = {}): ChainEvent {
  return {
    transferId: 'tx-bridge-1',
    chainId: 'evm:1',
    token: 'USDC',
    amountMinorUnits: '1000000',
    status: 'confirmed',
    type: 'delivery',
    blockNumber: 100,
    logIndex: 2,
    txHash: `0x${'a'.repeat(64)}`,
    ...overrides,
  };
}

export function testDbRecord(overrides: Partial<DbRecord> = {}): DbRecord {
  return {
    transferId: 'tx-bridge-1',
    chainId: 'evm:1',
    token: 'USDC',
    amountMinorUnits: '1000000',
    status: 'confirmed',
    type: 'delivery',
    ...overrides,
  };
}

export function testInput(
  overrides: Partial<ReconciliationInput> = {},
): ReconciliationInput {
  const heads: Record<string, number> = {};
  for (const profile of CONFIG_CHAIN_PROFILES) heads[profile.chainId] = 200;
  return {
    day: '2026-11-23',
    heads,
    events: [testEvent()],
    records: [testDbRecord()],
    ...overrides,
  };
}

export { seededRandom };
