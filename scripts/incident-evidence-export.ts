/**
 * Signed incident evidence export for affected transfer identifiers
 * (issue #1527).
 *
 * This model complements (and does not replace) the Stellar audit-log export
 * in src/audit/transfers/stellar/audit.service.ts: it covers cross-chain
 * transfer identifiers, requires an independently reviewed signing quorum,
 * binds the export to the active signed production configuration digest, and
 * fails closed when evidence is missing, unfinalized or uncorroborated.
 *
 * Normative prose: docs/INCIDENT_EVIDENCE_EXPORT_CROSS_CHAIN.md. No RPC or
 * relayer value is trusted for authorization; evidence is supplied by an
 * injected source and validated against the active reviewed chain profile.
 */

import { createHash } from 'node:crypto';
import {
  ChainConfigEntry,
  ProductionConfigRegistry,
  ReviewerKey,
  canonicalJson,
  verifyConfigSignature,
} from './production-config-bundle';

export const EVIDENCE_SCHEMA_VERSION = 1;
export const EVIDENCE_REQUEST_DOMAIN =
  'bridgewise-incident-evidence-request-v1';
export const EVIDENCE_BUNDLE_DOMAIN = 'bridgewise-incident-evidence-bundle-v1';
export const DEFAULT_MAX_TRANSFER_IDS = 64;
export const DEFAULT_MAX_RECORDS = 128;

export const EVIDENCE_INVARIANTS = [
  'E-1',
  'E-2',
  'E-3',
  'E-4',
  'E-5',
  'E-6',
  'E-7',
  'E-8',
  'E-9',
] as const;

export type EvidenceStatus = 'confirmed' | 'refunded' | 'failed';

export interface EvidenceRequest {
  readonly incidentId: string;
  readonly requestedBy: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly transferIds: readonly string[];
}

export interface EvidenceRecord {
  readonly transferId: string;
  readonly chainId: string;
  readonly token: string;
  readonly amountMinorUnits: string;
  readonly status: EvidenceStatus;
  readonly observedBlock: number;
  readonly logIndex: number;
  readonly txHash: string;
  readonly head: number;
  readonly sources: readonly string[];
  readonly sender?: string;
  readonly recipient?: string;
}

export interface EvidenceApproval {
  readonly reviewerId: string;
  readonly signature: string;
}

export interface EvidenceSource {
  fetch(transferId: string): EvidenceRecord | undefined;
}

export interface EvidenceAuditEvent {
  readonly exportId: string;
  readonly incidentId: string;
  readonly requestedBy: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly recordCount: number;
  readonly configDigest: string;
  readonly integrityHash: string;
}

export interface RedactedEvidenceRecord {
  readonly transferId: string;
  readonly chainId: string;
  readonly token: string;
  readonly amountMinorUnits: string;
  readonly status: EvidenceStatus;
  readonly observedBlock: number;
  readonly logIndex: number;
  readonly txHashPrefix: string;
  readonly txHashFingerprint: string;
  readonly senderFingerprint: string | null;
  readonly recipientFingerprint: string | null;
  readonly independentSources: number;
}

export interface IncidentEvidenceBundle {
  readonly schemaVersion: number;
  readonly bundleId: string;
  readonly incidentId: string;
  readonly requestedBy: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly generatedAt: number;
  readonly configDigest: string;
  readonly parameterSetVersion: string;
  readonly recordCount: number;
  readonly records: readonly RedactedEvidenceRecord[];
  readonly integrityHash: string;
}

export interface EvidenceExportOptions {
  readonly config: ProductionConfigRegistry;
  readonly reviewers: readonly ReviewerKey[];
  readonly minApprovals?: number;
  readonly maxTransferIds?: number;
  readonly maxRecords?: number;
  readonly now?: number;
}

export interface EvidenceSnapshot {
  now: number;
  exports: Array<{ key: string; bundleId: string; incidentId: string }>;
  audits: EvidenceAuditEvent[];
}

export class EvidenceExportError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'EvidenceExportError';
  }
}

function assertSafeInt(
  value: unknown,
  field: string,
  min = 0,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min) {
    throw new EvidenceExportError('invalid-time', `invalid ${field}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    expected.every((key, index) => actual[index] === key)
  );
}

export function fingerprint(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32);
}

export function validateEvidenceRequest(
  value: unknown,
  maxTransferIds: number,
): EvidenceRequest {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      'incidentId',
      'requestedBy',
      'startTime',
      'endTime',
      'transferIds',
    ])
  )
    throw new EvidenceExportError('invalid-request');
  if (
    typeof value.incidentId !== 'string' ||
    !/^INC-\d{4}-\d{3,6}$/.test(value.incidentId)
  ) {
    throw new EvidenceExportError('invalid-incident');
  }
  if (
    typeof value.requestedBy !== 'string' ||
    !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(value.requestedBy)
  ) {
    throw new EvidenceExportError('invalid-requester');
  }
  assertSafeInt(value.startTime, 'startTime', 1);
  assertSafeInt(value.endTime, 'endTime', 1);
  if (value.endTime <= value.startTime)
    throw new EvidenceExportError('invalid-window');
  if (
    !Array.isArray(value.transferIds) ||
    value.transferIds.length === 0 ||
    value.transferIds.length > maxTransferIds
  ) {
    throw new EvidenceExportError('invalid-transfer-ids');
  }
  if (new Set(value.transferIds).size !== value.transferIds.length) {
    throw new EvidenceExportError('duplicate-transfer-id');
  }
  for (const id of value.transferIds) {
    if (typeof id !== 'string' || !/^tx-[a-z0-9][a-z0-9-]{2,63}$/.test(id)) {
      throw new EvidenceExportError('invalid-transfer-id');
    }
  }
  return value as unknown as EvidenceRequest;
}

export function evidenceRequestDigest(request: EvidenceRequest): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        domain: EVIDENCE_REQUEST_DOMAIN,
        incidentId: request.incidentId,
        requestedBy: request.requestedBy,
        startTime: request.startTime,
        endTime: request.endTime,
        transferIds: [...request.transferIds].sort(),
      }),
      'utf8',
    )
    .digest('hex');
}

export function evidenceBundleHash(
  bundle: Omit<IncidentEvidenceBundle, 'integrityHash'>,
): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        domain: EVIDENCE_BUNDLE_DOMAIN,
        schemaVersion: bundle.schemaVersion,
        bundleId: bundle.bundleId,
        incidentId: bundle.incidentId,
        requestedBy: bundle.requestedBy,
        startTime: bundle.startTime,
        endTime: bundle.endTime,
        generatedAt: bundle.generatedAt,
        configDigest: bundle.configDigest,
        parameterSetVersion: bundle.parameterSetVersion,
        recordCount: bundle.recordCount,
        records: bundle.records,
      }),
      'utf8',
    )
    .digest('hex');
}

export function verifyEvidenceBundle(value: unknown): boolean {
  if (!isPlainObject(value) || value.schemaVersion !== EVIDENCE_SCHEMA_VERSION)
    return false;
  if (
    typeof value.integrityHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.integrityHash)
  )
    return false;
  if (
    !Array.isArray(value.records) ||
    value.records.length !== value.recordCount
  )
    return false;
  if (
    typeof value.bundleId !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.bundleId)
  )
    return false;
  if (
    value.records.some(
      (record) =>
        !isPlainObject(record) ||
        !hasExactKeys(record, [
          'transferId',
          'chainId',
          'token',
          'amountMinorUnits',
          'status',
          'observedBlock',
          'logIndex',
          'txHashPrefix',
          'txHashFingerprint',
          'senderFingerprint',
          'recipientFingerprint',
          'independentSources',
        ]) ||
        typeof record.txHashPrefix !== 'string' ||
        record.txHashPrefix.length > 10 ||
        (typeof record.senderFingerprint !== 'string' &&
          record.senderFingerprint !== null) ||
        (typeof record.recipientFingerprint !== 'string' &&
          record.recipientFingerprint !== null),
    )
  ) {
    return false;
  }
  const { integrityHash, ...rest } = value as unknown as IncidentEvidenceBundle;
  if (evidenceBundleHash(rest) !== integrityHash) return false;
  if (
    createHash('sha256')
      .update(
        canonicalJson({
          domain: EVIDENCE_REQUEST_DOMAIN,
          incidentId: rest.incidentId,
          requestedBy: rest.requestedBy,
          startTime: rest.startTime,
          endTime: rest.endTime,
          transferIds: rest.records.map((record) => record.transferId).sort(),
        }),
        'utf8',
      )
      .digest('hex') !== rest.bundleId
  )
    return false;
  return true;
}

export class IncidentEvidenceExporter {
  private currentTime: number;
  private readonly reviewers = new Map<string, ReviewerKey>();
  private readonly minApprovals: number;
  private readonly maxTransferIds: number;
  private readonly maxRecords: number;
  private readonly exports = new Map<string, IncidentEvidenceBundle>();
  private readonly audits: EvidenceAuditEvent[] = [];

  constructor(readonly options: EvidenceExportOptions) {
    const { config, reviewers = [] } = options;
    if (!config || typeof config.verifyActive !== 'function')
      throw new EvidenceExportError('invalid-config');
    if (
      reviewers.length === 0 ||
      new Set(reviewers.map((r) => r.reviewerId)).size !== reviewers.length
    ) {
      throw new EvidenceExportError('invalid-reviewers');
    }
    for (const reviewer of reviewers)
      this.reviewers.set(reviewer.reviewerId, reviewer);
    this.minApprovals = options.minApprovals ?? 2;
    if (
      !Number.isSafeInteger(this.minApprovals) ||
      this.minApprovals < 1 ||
      this.minApprovals > this.reviewers.size
    ) {
      throw new EvidenceExportError('invalid-quorum');
    }
    this.maxTransferIds = options.maxTransferIds ?? DEFAULT_MAX_TRANSFER_IDS;
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
    if (this.maxTransferIds < 1 || this.maxRecords < this.maxTransferIds) {
      throw new EvidenceExportError('invalid-bounds');
    }
    if (!Number.isSafeInteger(options.now ?? 0) || (options.now ?? 0) < 0) {
      throw new EvidenceExportError('invalid-time');
    }
    this.currentTime = options.now ?? 1_700_000_000_000;
  }

  get now(): number {
    return this.currentTime;
  }

  setNow(value: number): void {
    if (!Number.isSafeInteger(value) || value < this.currentTime) {
      throw new EvidenceExportError('clock-must-not-go-backwards');
    }
    this.currentTime = value;
  }

  exportEvidence(
    value: unknown,
    approvals: readonly EvidenceApproval[],
    source: EvidenceSource,
    onAudit: (event: EvidenceAuditEvent) => void,
  ): IncidentEvidenceBundle {
    this.options.config.verifyActive(); // E-9: fail closed without active config
    const request = validateEvidenceRequest(value, this.maxTransferIds);
    if (this.currentTime < request.endTime)
      throw new EvidenceExportError('window-not-closed');
    const requestDigest = evidenceRequestDigest(request);
    const key = `${request.incidentId}:${requestDigest}`;
    if (this.exports.has(key))
      throw new EvidenceExportError('duplicate-export');
    if (
      !Array.isArray(approvals) ||
      approvals.length === 0 ||
      approvals.length > this.reviewers.size
    ) {
      throw new EvidenceExportError('invalid-approvals');
    }
    const seen = new Set<string>();
    for (const approval of approvals) {
      if (!approval || seen.has(approval.reviewerId))
        throw new EvidenceExportError('duplicate-approval');
      seen.add(approval.reviewerId);
      const reviewer = this.reviewers.get(approval.reviewerId);
      if (
        !reviewer ||
        !verifyConfigSignature(reviewer, requestDigest, approval.signature)
      ) {
        throw new EvidenceExportError('invalid-signature');
      }
    }
    if (seen.size < this.minApprovals)
      throw new EvidenceExportError('quorum-not-met');

    const active = this.options.config.active;
    if (!active) throw new EvidenceExportError('invalid-config');
    const profiles = new Map(
      active.chains.map((chain) => [chain.chainId, chain]),
    );
    const records: RedactedEvidenceRecord[] = [];
    for (const transferId of [...request.transferIds].sort()) {
      const raw = source.fetch(transferId);
      if (!raw || raw.transferId !== transferId)
        throw new EvidenceExportError('incomplete-evidence');
      const record = this.validateRecord(raw, profiles);
      records.push(record);
      if (records.length > this.maxRecords)
        throw new EvidenceExportError('input-too-large');
    }

    const configDigest = this.options.config.digest;
    const base = {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      bundleId: requestDigest,
      incidentId: request.incidentId,
      requestedBy: request.requestedBy,
      startTime: request.startTime,
      endTime: request.endTime,
      generatedAt: this.currentTime,
      configDigest,
      parameterSetVersion: active.parameterSetVersion,
      recordCount: records.length,
      records: Object.freeze(records),
    };
    const integrityHash = evidenceBundleHash(base);
    const bundle: IncidentEvidenceBundle = Object.freeze({
      ...base,
      integrityHash,
    });
    if (!verifyEvidenceBundle(bundle))
      throw new EvidenceExportError('invalid-bundle');
    const event: EvidenceAuditEvent = Object.freeze({
      exportId: bundle.bundleId,
      incidentId: bundle.incidentId,
      requestedBy: bundle.requestedBy,
      startTime: bundle.startTime,
      endTime: bundle.endTime,
      recordCount: bundle.recordCount,
      configDigest,
      integrityHash,
    });
    try {
      onAudit(event); // E-7: audit first; a failed sink prevents retention
    } catch {
      throw new EvidenceExportError('audit-sink-failed');
    }
    this.exports.set(key, bundle);
    this.audits.push(event);
    return bundle;
  }

  snapshot(): EvidenceSnapshot {
    return {
      now: this.currentTime,
      exports: [...this.exports.entries()].map(([key, bundle]) => ({
        key,
        bundleId: bundle.bundleId,
        incidentId: bundle.incidentId,
      })),
      audits: this.audits.map((event) => ({ ...event })),
    };
  }

  invariantViolations(): string[] {
    const violations: string[] = [];
    for (const bundle of this.exports.values()) {
      if (!verifyEvidenceBundle(bundle)) violations.push('E-5');
      if (bundle.recordCount > this.maxRecords) violations.push('E-8');
      if (!/^[0-9a-f]{64}$/.test(bundle.configDigest)) violations.push('E-1');
    }
    try {
      this.options.config.verifyActive();
    } catch {
      if (this.exports.size > 0) violations.push('E-9');
    }
    return [...new Set(violations)];
  }

  private validateRecord(
    raw: EvidenceRecord,
    profiles: Map<string, ChainConfigEntry>,
  ): RedactedEvidenceRecord {
    if (
      !isPlainObject(raw) ||
      (!hasExactKeys(raw, [
        'transferId',
        'chainId',
        'token',
        'amountMinorUnits',
        'status',
        'observedBlock',
        'logIndex',
        'txHash',
        'head',
        'sources',
        'sender',
        'recipient',
      ]) &&
        !hasExactKeys(raw, [
          'transferId',
          'chainId',
          'token',
          'amountMinorUnits',
          'status',
          'observedBlock',
          'logIndex',
          'txHash',
          'head',
          'sources',
        ]))
    )
      throw new EvidenceExportError('invalid-record');
    const profile = profiles.get(raw.chainId);
    if (!profile) throw new EvidenceExportError('unsupported-chain');
    if (
      typeof raw.txHash !== 'string' ||
      !/^0x[0-9a-f]{64}$/.test(raw.txHash)
    ) {
      throw new EvidenceExportError('invalid-tx-hash');
    }
    if (
      typeof raw.token !== 'string' ||
      !/^[A-Za-z0-9_-]{1,16}$/.test(raw.token)
    ) {
      throw new EvidenceExportError('invalid-token');
    }
    if (
      typeof raw.amountMinorUnits !== 'string' ||
      !/^[0-9]{1,32}$/.test(raw.amountMinorUnits)
    ) {
      throw new EvidenceExportError('invalid-amount');
    }
    if (!['confirmed', 'refunded', 'failed'].includes(raw.status)) {
      throw new EvidenceExportError('invalid-status');
    }
    assertSafeInt(raw.observedBlock, 'observedBlock', 1);
    assertSafeInt(raw.logIndex, 'logIndex');
    assertSafeInt(raw.head, 'head', raw.observedBlock);
    const depth = raw.head - raw.observedBlock + 1;
    if (depth < profile.finalityDepth)
      throw new EvidenceExportError('insufficient-finality');
    if (
      !Array.isArray(raw.sources) ||
      new Set(raw.sources).size < 2 ||
      raw.sources.some(
        (source) =>
          typeof source !== 'string' || !/^[a-z][a-z0-9_-]{2,31}$/.test(source),
      )
    ) {
      throw new EvidenceExportError('uncorroborated-evidence');
    }
    return {
      transferId: raw.transferId,
      chainId: raw.chainId,
      token: raw.token,
      amountMinorUnits: raw.amountMinorUnits,
      status: raw.status,
      observedBlock: raw.observedBlock,
      logIndex: raw.logIndex,
      txHashPrefix: raw.txHash.slice(0, 10),
      txHashFingerprint: fingerprint(raw.txHash),
      senderFingerprint:
        typeof raw.sender === 'string' ? fingerprint(raw.sender) : null,
      recipientFingerprint:
        typeof raw.recipient === 'string' ? fingerprint(raw.recipient) : null,
      independentSources: new Set(raw.sources).size,
    };
  }
}

export function testRequest(
  overrides: Partial<EvidenceRequest> = {},
): EvidenceRequest {
  return {
    incidentId: 'INC-2026-0042',
    requestedBy: 'operator-one',
    startTime: 1_000,
    endTime: 2_000,
    transferIds: ['tx-alpha', 'tx-beta'],
    ...overrides,
  };
}

export function testRecord(
  overrides: Partial<EvidenceRecord> = {},
): EvidenceRecord {
  return {
    transferId: 'tx-alpha',
    chainId: 'evm:1',
    token: 'USDC',
    amountMinorUnits: '1000000',
    status: 'confirmed',
    observedBlock: 1_000,
    logIndex: 3,
    txHash: `0x${'a'.repeat(64)}`,
    head: 1_100,
    sources: ['chain-read', 'independent-indexer'],
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    ...overrides,
  };
}
