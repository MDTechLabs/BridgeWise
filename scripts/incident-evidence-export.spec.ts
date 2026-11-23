import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ConfigSigningIdentity,
  ProductionConfigRegistry,
  createTestSigningIdentity,
  productionConfigDigest,
  publicReviewerKey,
  seededRandom,
  signConfigDigest,
  testBundle,
} from './production-config-bundle';
import {
  DEFAULT_MAX_TRANSFER_IDS,
  EVIDENCE_INVARIANTS,
  EvidenceApproval,
  EvidenceAuditEvent,
  EvidenceExportError,
  EvidenceRecord,
  EvidenceSource,
  IncidentEvidenceBundle,
  IncidentEvidenceExporter,
  evidenceRequestDigest,
  fingerprint,
  testRecord,
  testRequest,
  validateEvidenceRequest,
  verifyEvidenceBundle,
} from './incident-evidence-export';

const SPEC_DOC = join(__dirname, '..', 'docs', 'INCIDENT_EVIDENCE_EXPORT_CROSS_CHAIN.md');
const NOW = 3_000;

function keys(count = 3): ConfigSigningIdentity[] {
  return Array.from({ length: count }, (_, index) => createTestSigningIdentity(`evidence-key-${index}`));
}

function activeConfig(signers: ConfigSigningIdentity[]): ProductionConfigRegistry {
  const registry = new ProductionConfigRegistry({
    reviewers: signers.map(publicReviewerKey),
    operators: ['operator'],
    minApprovals: 2,
    now: 1_700_000_000_000,
  });
  const bundle = testBundle();
  for (const signer of signers) {
    registry.approve(signer.reviewerId, bundle, signConfigDigest(signer, productionConfigDigest(bundle)));
  }
  registry.activate('operator', bundle);
  return registry;
}

function exporter(
  signers: ConfigSigningIdentity[],
  overrides: Record<string, unknown> = {},
): IncidentEvidenceExporter {
  return new IncidentEvidenceExporter({
    config: activeConfig(signers),
    reviewers: signers.map(publicReviewerKey),
    minApprovals: 2,
    now: NOW,
    ...overrides,
  } as never);
}

function approvals(signers: ConfigSigningIdentity[], request: unknown): EvidenceApproval[] {
  const digest = evidenceRequestDigest(request as never);
  return signers.map((signer) => ({
    reviewerId: signer.reviewerId,
    signature: signConfigDigest(signer, digest),
  }));
}

function source(records: readonly EvidenceRecord[] = []): EvidenceSource {
  const byId = new Map(records.map((record) => [record.transferId, record]));
  return { fetch: (id) => byId.get(id) };
}

function defaultRecords(): EvidenceRecord[] {
  return testRequest().transferIds.map((transferId) => testRecord({
    transferId,
    txHash: `0x${transferId === 'tx-alpha' ? 'a' : 'b'}`.padEnd(66, 'a'),
  }));
}

function expectError(fn: () => unknown, code: string): EvidenceExportError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(EvidenceExportError);
    expect((error as EvidenceExportError).code).toBe(code);
    return error as EvidenceExportError;
  }
  throw new Error(`expected EvidenceExportError ${code}`);
}

function expectAtomic(
  model: IncidentEvidenceExporter,
  fn: () => unknown,
  code: string,
): void {
  const before = JSON.stringify(model.snapshot());
  expectError(fn, code);
  expect(JSON.stringify(model.snapshot())).toBe(before);
  expect(model.invariantViolations()).toEqual([]);
}

describe('cross-chain incident evidence export specification', () => {
  it('documents every invariant and error code in the normative spec', () => {
    const doc = readFileSync(SPEC_DOC, 'utf8');
    for (const id of EVIDENCE_INVARIANTS) expect(doc).toContain(`\`${id}\``);
    expect(doc).toContain('incident-evidence/1.0.0');
    expect(doc).toContain('bridgewise-incident-evidence-request-v1');
    expect(doc).toContain('bridgewise-incident-evidence-bundle-v1');
  });

  it('builds a signed, redacted, integrity-checked bundle', () => {
    const signers = keys();
    const model = exporter(signers);
    const request = testRequest();
    const audits: EvidenceAuditEvent[] = [];
    const bundle = model.exportEvidence(
      request,
      approvals(signers, request),
      source(defaultRecords()),
      (event) => { audits.push(event); },
    );
    expect(bundle.recordCount).toBe(2);
    expect(bundle.records.map((record) => record.transferId)).toEqual(['tx-alpha', 'tx-beta']);
    expect(bundle.configDigest).toBe(model.options.config.digest);
    expect(bundle.parameterSetVersion).toBe('production-config/1.0.0');
    expect(bundle.bundleId).toBe(evidenceRequestDigest(request));
    expect(verifyEvidenceBundle(bundle)).toBe(true);

    const json = JSON.stringify(bundle);
    for (const record of defaultRecords()) {
      expect(json).not.toContain(record.txHash);
      expect(json).not.toContain(record.sender as string);
      expect(json).not.toContain(record.recipient as string);
    }
    expect(bundle.records[0].txHashPrefix).toHaveLength(10);
    expect(bundle.records[0].senderFingerprint).toBe(fingerprint(defaultRecords()[0].sender as string));
    expect(audits).toHaveLength(1);
    expect(audits[0].integrityHash).toBe(bundle.integrityHash);
    expect(model.snapshot().exports).toHaveLength(1);
    expect(model.invariantViolations()).toEqual([]);
  });

  it('detects modification of a retained bundle', () => {
    const signers = keys();
    const model = exporter(signers);
    const request = testRequest();
    const bundle = model.exportEvidence(request, approvals(signers, request), source(defaultRecords()), () => {});
    const tampered = {
      ...bundle,
      records: bundle.records.map((record, index) => index === 0
        ? { ...record, amountMinorUnits: '9999999' }
        : record),
    };
    expect(verifyEvidenceBundle(tampered)).toBe(false);
    expect(verifyEvidenceBundle({ ...bundle, incidentId: 'INC-2026-0099' })).toBe(false);
    expect(verifyEvidenceBundle({ ...bundle, recordCount: 1 })).toBe(false);
    expect(verifyEvidenceBundle(null)).toBe(false);
    expect(verifyEvidenceBundle({ ...bundle, integrityHash: '0'.repeat(64) })).toBe(false);
  });
});

describe('request and approval validation', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['bad incident id', { incidentId: 'oops' }, 'invalid-incident'],
    ['empty requester', { requestedBy: '' }, 'invalid-requester'],
    ['non-integer start', { startTime: 1.5 }, 'invalid-time'],
    ['inverted window', { endTime: 1_000 }, 'invalid-window'],
    ['empty transfer ids', { transferIds: [] }, 'invalid-transfer-ids'],
    ['duplicate transfer id', { transferIds: ['tx-alpha', 'tx-alpha'] }, 'duplicate-transfer-id'],
    ['bad transfer id', { transferIds: ['bad id'] }, 'invalid-transfer-id'],
    ['extra field', { unexpected: true }, 'invalid-request'],
    ['too many transfer ids', { transferIds: Array.from({ length: DEFAULT_MAX_TRANSFER_IDS + 1 }, (_, i) => `tx-${i}`) }, 'invalid-transfer-ids'],
  ])('rejects %s atomically', (_name, patch, code) => {
    const signers = keys();
    const model = exporter(signers);
    const request = { ...testRequest(), ...patch };
    expectError(() => validateEvidenceRequest(request, DEFAULT_MAX_TRANSFER_IDS), code);
    expectAtomic(model, () => model.exportEvidence(
      request,
      approvals(signers, testRequest()),
      source(defaultRecords()),
      () => {},
    ), code);
  });

  it('rejects an export before the incident window has closed', () => {
    const signers = keys();
    const model = exporter(signers);
    const request = testRequest({ endTime: NOW + 1 });
    expectAtomic(model, () => model.exportEvidence(
      request, approvals(signers, request), source(defaultRecords()), () => {},
    ), 'window-not-closed');
  });

  it('rejects unauthorized, duplicated, invalid and insufficient approvals', () => {
    const signers = keys();
    const outsider = createTestSigningIdentity('evidence-outsider');
    const model = exporter(signers);
    const request = testRequest();
    const valid = approvals(signers, request);
    expectAtomic(model, () => model.exportEvidence(
      request,
      [{ reviewerId: outsider.reviewerId, signature: signConfigDigest(outsider, evidenceRequestDigest(request)) }],
      source(defaultRecords()), () => {},
    ), 'invalid-signature');
    expectAtomic(model, () => model.exportEvidence(
      request,
      [{ ...valid[0], signature: '0'.repeat(128) }],
      source(defaultRecords()), () => {},
    ), 'invalid-signature');
    expectAtomic(model, () => model.exportEvidence(
      request,
      [{ ...valid[0], reviewerId: 'not-a-reviewer' }],
      source(defaultRecords()), () => {},
    ), 'invalid-signature');
    expectAtomic(model, () => model.exportEvidence(
      request,
      [valid[0], { ...valid[1], reviewerId: valid[0].reviewerId }],
      source(defaultRecords()), () => {},
    ), 'duplicate-approval');
    expectAtomic(model, () => model.exportEvidence(
      request,
      valid.slice(0, 1),
      source(defaultRecords()), () => {},
    ), 'quorum-not-met');
    expectAtomic(model, () => model.exportEvidence(
      request,
      approvals(signers, testRequest({ incidentId: 'INC-2026-0099' })),
      source(defaultRecords()), () => {},
    ), 'invalid-signature');
  });

  it('refuses to export without an active signed configuration', () => {
    const signers = keys();
    const config = new ProductionConfigRegistry({
      reviewers: signers.map(publicReviewerKey),
      minApprovals: 2,
    });
    const model = new IncidentEvidenceExporter({
      config,
      reviewers: signers.map(publicReviewerKey),
      now: NOW,
    });
    const request = testRequest();
    let failed = false;
    try {
      model.exportEvidence(request, approvals(signers, request), source(defaultRecords()), () => {});
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(model.snapshot().exports).toHaveLength(0);
  });
});

describe('evidence quality, replay and bounded work', () => {
  it.each<[string, Partial<EvidenceRecord>, string]>([
    ['missing evidence', { transferId: 'tx-missing' }, 'incomplete-evidence'],
    ['unsupported chain', { chainId: 'evm:9999' }, 'unsupported-chain'],
    ['unfinalized evidence', { head: 1_005 }, 'insufficient-finality'],
    ['single source', { sources: ['chain-read'] }, 'uncorroborated-evidence'],
    ['duplicate sources', { sources: ['chain-read', 'chain-read'] }, 'uncorroborated-evidence'],
    ['bad tx hash', { txHash: '0x1234' }, 'invalid-tx-hash'],
    ['bad token', { token: 'bad token!' }, 'invalid-token'],
    ['negative amount', { amountMinorUnits: '-1' }, 'invalid-amount'],
    ['unknown status', { status: 'maybe' as EvidenceRecord['status'] }, 'invalid-status'],
    ['bad log index', { logIndex: -1 }, 'invalid-time'],
    ['malformed record shape', { unexpected: 1 } as never, 'invalid-record'],
  ])('rejects %s without retaining a bundle', (_name, patch, code) => {
    const signers = keys();
    const model = exporter(signers);
    const request = testRequest({ transferIds: ['tx-alpha'] });
    const record = { ...testRecord(), ...patch };
    expectAtomic(model, () => model.exportEvidence(
      request, approvals(signers, request), source([record]), () => {},
    ), code);
  });

  it('prevents replay of an approved request and rows back a failed audit sink', () => {
    const signers = keys();
    const model = exporter(signers);
    const request = testRequest();
    const approved = approvals(signers, request);
    const records = source(defaultRecords());
    model.exportEvidence(request, approved, records, () => {});
    expectAtomic(model, () => model.exportEvidence(request, approved, records, () => {}), 'duplicate-export');
    expectAtomic(model, () => model.exportEvidence(
      testRequest({ incidentId: 'INC-2026-0043' }),
      approvals(signers, testRequest({ incidentId: 'INC-2026-0043' })),
      records,
      () => { throw new Error('sink down'); },
    ), 'audit-sink-failed');
  });

  it('keeps invariants across randomized multi-step export sequences', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const random = seededRandom(seed);
      const signers = keys();
      const model = exporter(signers);
      let successful = 0;
      for (let step = 0; step < 24; step++) {
        const incidentId = `INC-2026-${String(100 + Math.floor(random() * 3)).padStart(4, '0')}`;
        const request = testRequest({
          incidentId,
          transferIds: random() < 0.3 ? ['tx-alpha', 'tx-alpha'] : ['tx-alpha'],
        });
        const badRecord = random() < 0.3 ? testRecord({ head: 1_001 }) : testRecord();
        const recordPatch = random() < 0.2 ? { sources: ['chain-read'] } : {};
        const before = JSON.stringify(model.snapshot());
        try {
          model.exportEvidence(
            request,
            approvals(signers, request),
            source([{ ...badRecord, ...recordPatch }]),
            () => {},
          );
          successful++;
        } catch (error) {
          expect(error).toBeInstanceOf(EvidenceExportError);
          expect(JSON.stringify(model.snapshot())).toBe(before);
        }
        expect(model.invariantViolations()).toEqual([]);
      }
      expect(successful).toBeGreaterThan(0);
      expect(model.snapshot().exports.length).toBe(successful);
    }
  });

  it('accepts the maximum bounded transfer id set and rejects one beyond it', () => {
    const signers = keys();
    const model = exporter(signers);
    const ids = Array.from({ length: DEFAULT_MAX_TRANSFER_IDS }, (_, i) => `tx-bound-${i}`);
    const request = testRequest({ transferIds: ids });
    const records = ids.map((transferId) => testRecord({ transferId }));
    const bundle: IncidentEvidenceBundle = model.exportEvidence(
      request, approvals(signers, request), source(records), () => {},
    );
    expect(bundle.recordCount).toBe(DEFAULT_MAX_TRANSFER_IDS);
    expect(verifyEvidenceBundle(bundle)).toBe(true);
  });
});
