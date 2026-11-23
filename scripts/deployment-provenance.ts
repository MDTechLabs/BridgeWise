import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

/**
 * Immutable, append-only record of what was deployed: the exact source commit
 * and compiler settings behind each deployed contract.
 *
 * Trust model:
 * - Commit, compiler settings and expected runtime-code hash come from the
 *   reviewed local build, never from RPC or relayer data.
 * - Only recorders named in the reviewed `authorizedRecorders` set may append.
 * - Entries are hash-chained, so editing, removing or reordering any earlier
 *   entry is detected by `verifyProvenanceChain`.
 * - Every rejected append leaves the ledger untouched.
 */

export const PROVENANCE_SCHEMA_VERSION = 1;

export interface CompilerSettings {
  solcVersion: string;
  evmVersion: string;
  optimizer: { enabled: boolean; runs: number };
  viaIR: boolean;
  metadataBytecodeHash: 'ipfs' | 'bzzr1' | 'none';
}

export interface ProvenanceInput {
  chainId: number;
  contractName: string;
  contractAddress: string;
  sourceCommit: string;
  compiler: CompilerSettings;
  runtimeCodeSha256: string;
  deployTxHash: string;
}

export interface ProvenanceRecord extends ProvenanceInput {
  schemaVersion: number;
  recordedBy: string;
}

export interface ProvenanceEntry {
  index: number;
  previousHash: string;
  record: ProvenanceRecord;
  entryHash: string;
}

export const GENESIS_HASH = '0'.repeat(64);

export class ProvenanceError extends Error {
  constructor(
    readonly code:
      | 'INVALID_INPUT'
      | 'UNAUTHORIZED_RECORDER'
      | 'DUPLICATE_RECORD'
      | 'TAMPERED_LEDGER'
      | 'DIRTY_WORKTREE'
      | 'INVALID_COMMIT',
    message: string,
  ) {
    super(message);
    this.name = 'ProvenanceError';
  }
}

export class DeploymentProvenanceLedger {
  private readonly entries: ProvenanceEntry[] = [];
  private readonly keys = new Set<string>();
  private readonly authorized: ReadonlySet<string>;

  constructor(
    authorizedRecorders: readonly string[],
    existing: readonly ProvenanceEntry[] = [],
  ) {
    if (authorizedRecorders.length === 0) {
      throw new ProvenanceError(
        'INVALID_INPUT',
        'At least one authorized recorder is required',
      );
    }
    this.authorized = new Set(
      authorizedRecorders.map((recorder) =>
        normalizeEvmAddress(recorder, 'authorizedRecorder'),
      ),
    );
    verifyProvenanceChain(existing);
    for (const entry of existing) {
      this.entries.push(deepFreeze(clone(entry)));
      this.keys.add(recordKey(entry.record));
    }
  }

  get length(): number {
    return this.entries.length;
  }

  get headHash(): string {
    return this.entries.length === 0
      ? GENESIS_HASH
      : this.entries[this.entries.length - 1].entryHash;
  }

  /**
   * Appends one record. Validation, authorization and duplicate checks all run
   * before any state changes, so a failed call cannot mutate the ledger.
   */
  append(recorder: string, input: unknown): ProvenanceEntry {
    let recorderAddress: string;
    try {
      recorderAddress = normalizeEvmAddress(recorder, 'recorder');
    } catch {
      throw new ProvenanceError(
        'UNAUTHORIZED_RECORDER',
        'Recorder is not authorized',
      );
    }
    if (!this.authorized.has(recorderAddress)) {
      throw new ProvenanceError(
        'UNAUTHORIZED_RECORDER',
        'Recorder is not authorized',
      );
    }

    const record = buildRecord(input, recorderAddress);
    const key = recordKey(record);
    if (this.keys.has(key)) {
      throw new ProvenanceError(
        'DUPLICATE_RECORD',
        `Provenance already recorded for chain ${record.chainId} address ${record.contractAddress}`,
      );
    }

    const base = {
      index: this.entries.length,
      previousHash: this.headHash,
      record,
    };
    const entry: ProvenanceEntry = {
      ...base,
      entryHash: hashEntry(base),
    };
    this.entries.push(deepFreeze(entry));
    this.keys.add(key);
    return clone(entry);
  }

  find(chainId: number, address: string): ProvenanceEntry | undefined {
    const key = `${chainId}:${normalizeEvmAddress(address, 'address')}`;
    const entry = this.entries.find((item) => recordKey(item.record) === key);
    return entry ? clone(entry) : undefined;
  }

  /** Deep copy; mutating it cannot affect the ledger. */
  snapshot(): ProvenanceEntry[] {
    return this.entries.map((entry) => clone(entry));
  }
}

export function verifyProvenanceChain(
  entries: readonly ProvenanceEntry[],
): void {
  let previousHash = GENESIS_HASH;
  const keys = new Set<string>();
  entries.forEach((entry, index) => {
    if (
      !entry ||
      entry.index !== index ||
      entry.previousHash !== previousHash ||
      !entry.record ||
      entry.entryHash !==
        hashEntry({
          index: entry.index,
          previousHash: entry.previousHash,
          record: entry.record,
        })
    ) {
      throw new ProvenanceError(
        'TAMPERED_LEDGER',
        `Provenance ledger failed integrity check at entry ${index}`,
      );
    }
    const key = recordKey(entry.record);
    if (keys.has(key)) {
      throw new ProvenanceError(
        'TAMPERED_LEDGER',
        `Provenance ledger contains a duplicate record at entry ${index}`,
      );
    }
    keys.add(key);
    previousHash = entry.entryHash;
  });
}

export interface ProvenanceVerificationCheck {
  id: string;
  status: 'passed' | 'failed';
  detail: string;
}

export interface ProvenanceVerificationReport {
  passed: boolean;
  checks: ProvenanceVerificationCheck[];
}

/**
 * Compares a recorded entry with values from the reviewed local build and the
 * code currently at the address. Any mismatch or RPC failure fails closed.
 */
export async function verifyDeployedProvenance(
  entry: ProvenanceEntry | undefined,
  expected: {
    sourceCommit: string;
    compiler: CompilerSettings;
    runtimeCodeSha256: string;
  },
  provider: { getCode(address: string): Promise<string> },
): Promise<ProvenanceVerificationReport> {
  const checks: ProvenanceVerificationCheck[] = [];
  const add = (id: string, passed: boolean, detail: string): void => {
    checks.push({ id, status: passed ? 'passed' : 'failed', detail });
  };

  if (!entry) {
    add('record-present', false, 'No provenance record exists for this contract');
    return { passed: false, checks };
  }

  add(
    'entry-hash',
    entry.entryHash ===
      hashEntry({
        index: entry.index,
        previousHash: entry.previousHash,
        record: entry.record,
      }),
    'Entry hash matches its contents',
  );

  let expectedCommit: string;
  let expectedHash: string;
  try {
    expectedCommit = normalizeCommit(expected.sourceCommit);
    expectedHash = normalizeSha256(expected.runtimeCodeSha256, 'runtime hash');
    validateCompiler(expected.compiler);
  } catch (error) {
    add(
      'expected-values',
      false,
      error instanceof Error ? error.message : 'Invalid expected values',
    );
    return { passed: false, checks };
  }

  add(
    'source-commit',
    entry.record.sourceCommit === expectedCommit,
    entry.record.sourceCommit === expectedCommit
      ? 'Recorded commit matches the reviewed commit'
      : 'Recorded commit differs from the reviewed commit',
  );
  const compilerMatches =
    canonicalJson(entry.record.compiler) === canonicalJson(expected.compiler);
  add(
    'compiler-settings',
    compilerMatches,
    compilerMatches
      ? 'Recorded compiler settings match the reviewed settings'
      : 'Recorded compiler settings differ from the reviewed settings',
  );
  add(
    'recorded-code-hash',
    entry.record.runtimeCodeSha256 === expectedHash,
    entry.record.runtimeCodeSha256 === expectedHash
      ? 'Recorded runtime code hash matches the reviewed build'
      : 'Recorded runtime code hash differs from the reviewed build',
  );

  try {
    const code = await provider.getCode(entry.record.contractAddress);
    const onChainHash = /^0x([0-9a-fA-F]{2})+$/.test(code)
      ? sha256Hex(Buffer.from(code.slice(2), 'hex'))
      : undefined;
    add(
      'onchain-code-hash',
      onChainHash === entry.record.runtimeCodeSha256,
      onChainHash === entry.record.runtimeCodeSha256
        ? 'On-chain runtime code matches the recorded hash'
        : 'On-chain runtime code does not match the recorded hash',
    );
  } catch {
    add(
      'onchain-code-hash',
      false,
      'Unable to query runtime code from the configured RPC',
    );
  }

  return { passed: checks.every((c) => c.status === 'passed'), checks };
}

export function runtimeCodeSha256(runtimeCode: string): string {
  if (!/^0x([0-9a-fA-F]{2})+$/.test(runtimeCode)) {
    throw new ProvenanceError('INVALID_INPUT', 'Runtime code must be hex bytes');
  }
  return sha256Hex(Buffer.from(runtimeCode.slice(2), 'hex'));
}

/**
 * Resolves the commit being deployed and refuses a dirty working tree, so the
 * recorded commit always describes the exact sources that were compiled.
 */
export function resolveCleanGitCommit(
  git: (args: string[]) => string,
): string {
  if (git(['status', '--porcelain']).trim() !== '') {
    throw new ProvenanceError(
      'DIRTY_WORKTREE',
      'Working tree has uncommitted changes; commit or stash before deploying',
    );
  }
  return normalizeCommit(git(['rev-parse', 'HEAD']).trim());
}

/**
 * File-backed ledger (JSON lines). Existing lines are verified on every call
 * and never rewritten; new entries are only appended.
 */
export function loadProvenanceFile(
  path: string,
  authorizedRecorders: readonly string[],
): DeploymentProvenanceLedger {
  const file = resolve(path);
  const entries = existsSync(file)
    ? parseLines(readFileSync(file, 'utf8'))
    : [];
  return new DeploymentProvenanceLedger(authorizedRecorders, entries);
}

export function appendProvenanceToFile(
  path: string,
  authorizedRecorders: readonly string[],
  recorder: string,
  input: unknown,
): ProvenanceEntry {
  const file = resolve(path);
  const ledger = loadProvenanceFile(file, authorizedRecorders);
  const entry = ledger.append(recorder, input);
  if (!existsSync(file)) writeFileSync(file, '', { flag: 'wx', mode: 0o644 });
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
  return entry;
}

function parseLines(text: string): ProvenanceEntry[] {
  try {
    return text
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as ProvenanceEntry);
  } catch {
    throw new ProvenanceError(
      'TAMPERED_LEDGER',
      'Provenance file contains an unparsable line',
    );
  }
}

function buildRecord(value: unknown, recordedBy: string): ProvenanceRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProvenanceError('INVALID_INPUT', 'Provenance input must be an object');
  }
  const input = value as Partial<ProvenanceInput>;
  if (!Number.isSafeInteger(input.chainId) || input.chainId! < 1) {
    throw new ProvenanceError(
      'INVALID_INPUT',
      'chainId must be a positive safe integer',
    );
  }
  if (
    typeof input.contractName !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(input.contractName)
  ) {
    throw new ProvenanceError('INVALID_INPUT', 'contractName is invalid');
  }
  const compiler = validateCompiler(input.compiler);
  return {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    chainId: input.chainId!,
    contractName: input.contractName,
    contractAddress: normalizeEvmAddress(input.contractAddress, 'contractAddress'),
    sourceCommit: normalizeCommit(input.sourceCommit),
    compiler,
    runtimeCodeSha256: normalizeSha256(input.runtimeCodeSha256, 'runtimeCodeSha256'),
    deployTxHash: `0x${normalizeSha256(
      typeof input.deployTxHash === 'string'
        ? input.deployTxHash.replace(/^0x/i, '')
        : input.deployTxHash,
      'deployTxHash',
    )}`,
    recordedBy,
  };
}

function validateCompiler(value: unknown): CompilerSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProvenanceError('INVALID_INPUT', 'compiler settings are required');
  }
  const c = value as Partial<CompilerSettings>;
  if (typeof c.solcVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(c.solcVersion)) {
    throw new ProvenanceError(
      'INVALID_INPUT',
      'solcVersion must be an exact version such as 0.8.24',
    );
  }
  if (typeof c.evmVersion !== 'string' || !/^[a-z0-9]{3,32}$/.test(c.evmVersion)) {
    throw new ProvenanceError('INVALID_INPUT', 'evmVersion is invalid');
  }
  const optimizer = c.optimizer;
  if (
    !optimizer ||
    typeof optimizer.enabled !== 'boolean' ||
    !Number.isSafeInteger(optimizer.runs) ||
    optimizer.runs < 0 ||
    optimizer.runs > 2 ** 32 - 1
  ) {
    throw new ProvenanceError('INVALID_INPUT', 'optimizer settings are invalid');
  }
  if (typeof c.viaIR !== 'boolean') {
    throw new ProvenanceError('INVALID_INPUT', 'viaIR must be a boolean');
  }
  if (!['ipfs', 'bzzr1', 'none'].includes(c.metadataBytecodeHash as string)) {
    throw new ProvenanceError('INVALID_INPUT', 'metadataBytecodeHash is invalid');
  }
  return {
    solcVersion: c.solcVersion,
    evmVersion: c.evmVersion,
    optimizer: { enabled: optimizer.enabled, runs: optimizer.runs },
    viaIR: c.viaIR,
    metadataBytecodeHash: c.metadataBytecodeHash as CompilerSettings['metadataBytecodeHash'],
  };
}

function normalizeCommit(value: unknown): string {
  if (typeof value !== 'string' || !/^([0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/.test(value)) {
    throw new ProvenanceError(
      'INVALID_COMMIT',
      'sourceCommit must be a full 40 or 64 character hex commit id',
    );
  }
  return value.toLowerCase();
}

function normalizeSha256(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new ProvenanceError('INVALID_INPUT', `${field} must be 32 bytes of hex`);
  }
  return value.toLowerCase();
}

function normalizeEvmAddress(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(value) ||
    /^0x0{40}$/i.test(value)
  ) {
    throw new ProvenanceError(
      'INVALID_INPUT',
      `${field} must be a non-zero EVM address`,
    );
  }
  return value.toLowerCase();
}

function recordKey(record: ProvenanceRecord): string {
  return `${record.chainId}:${record.contractAddress}`;
}

function hashEntry(entry: {
  index: number;
  previousHash: string;
  record: ProvenanceRecord;
}): string {
  return sha256Hex(Buffer.from(canonicalJson(entry), 'utf8'));
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as object).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
