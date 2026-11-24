/**
 * Executable reference model for the signed and reviewed production
 * configuration bundle (issues #1526-#1529).
 *
 * Normative prose: docs/PRODUCTION_CONFIGURATION_BUNDLE.md. Keep the invariant
 * ids, error codes, chain ids and parameter-set version in that document in
 * sync with this file; the spec test fails if the document stops mentioning
 * one of them.
 *
 * Trust model: every security-critical value comes from the checked-in,
 * versioned `CONFIG_CHAIN_PROFILES` table or from a reviewed bundle. No RPC,
 * indexer or relayer response is read here. Approval material is generated
 * locally from isolated secp256k1 keys; production reviewers must keep the
 * private half in KMS/HSM and publish only the public key in the reviewer
 * registry. This model is verification evidence, not a contract audit.
 */

import {
  createHash,
  createSign,
  createVerify,
  generateKeyPairSync,
} from 'node:crypto';

export const CONFIG_SCHEMA_VERSION = 1;
export const CONFIG_PARAMETER_SET = 'production-config/1.0.0';
export const CONFIG_DIGEST_DOMAIN = 'bridgewise-production-config-bundle-v1';
export const MAX_CONFIG_CHAINS = 8;
export const MAX_CONFIG_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
export const GENESIS_RECEIPT = '0'.repeat(64);

export const CONFIG_INVARIANTS = [
  'B-1',
  'B-2',
  'B-3',
  'B-4',
  'B-5',
  'B-6',
  'B-7',
  'B-8',
  'B-9',
  'B-10',
] as const;
export type ConfigInvariantId = (typeof CONFIG_INVARIANTS)[number];

export interface ChainConfigEntry {
  readonly chainId: string;
  readonly parameterSetVersion: string;
  readonly finalityDepth: number;
  readonly reorgWindow: number;
  readonly bridgeAddress: string;
  readonly validatorSetVersion: string;
  readonly minValidatorQuorum: number;
  readonly maxMessageBytes: number;
  readonly maxAmountMinorUnits: string;
  readonly tokenDecimals: number;
  readonly parameterSource: string;
}

/**
 * Reviewed baseline profiles mirrored from the finality configuration and the
 * escrow-conservation baseline. Addresses are explicit non-production
 * placeholders: a production release MUST publish a new parameter-set version
 * with addresses from the restricted deployment inventory before activation.
 */
export const CONFIG_CHAIN_PROFILES: readonly ChainConfigEntry[] = [
  {
    chainId: 'evm:1',
    parameterSetVersion: CONFIG_PARAMETER_SET,
    finalityDepth: 12,
    reorgWindow: 64,
    bridgeAddress: '0x1111111111111111111111111111111111111111',
    validatorSetVersion: 'validator-set/1',
    minValidatorQuorum: 5,
    maxMessageBytes: 4096,
    maxAmountMinorUnits: '1000000000000000000000000000000',
    tokenDecimals: 18,
    parameterSource: 'finality-config:1',
  },
  {
    chainId: 'evm:10',
    parameterSetVersion: CONFIG_PARAMETER_SET,
    finalityDepth: 1,
    reorgWindow: 10,
    bridgeAddress: '0x2222222222222222222222222222222222222222',
    validatorSetVersion: 'validator-set/1',
    minValidatorQuorum: 5,
    maxMessageBytes: 4096,
    maxAmountMinorUnits: '1000000000000000000000000000000',
    tokenDecimals: 18,
    parameterSource: 'finality-config:10',
  },
  {
    chainId: 'evm:137',
    parameterSetVersion: CONFIG_PARAMETER_SET,
    finalityDepth: 128,
    reorgWindow: 256,
    bridgeAddress: '0x4444444444444444444444444444444444444444',
    validatorSetVersion: 'validator-set/1',
    minValidatorQuorum: 5,
    maxMessageBytes: 4096,
    maxAmountMinorUnits: '1000000000000000000000000000000',
    tokenDecimals: 18,
    parameterSource: 'finality-config:137',
  },
  {
    chainId: 'evm:42161',
    parameterSetVersion: CONFIG_PARAMETER_SET,
    finalityDepth: 1,
    reorgWindow: 10,
    bridgeAddress: '0x6666666666666666666666666666666666666666',
    validatorSetVersion: 'validator-set/1',
    minValidatorQuorum: 5,
    maxMessageBytes: 4096,
    maxAmountMinorUnits: '1000000000000000000000000000000',
    tokenDecimals: 18,
    parameterSource: 'finality-config:42161',
  },
  {
    chainId: 'evm:56',
    parameterSetVersion: CONFIG_PARAMETER_SET,
    finalityDepth: 15,
    reorgWindow: 50,
    bridgeAddress: '0x3333333333333333333333333333333333333333',
    validatorSetVersion: 'validator-set/1',
    minValidatorQuorum: 5,
    maxMessageBytes: 4096,
    maxAmountMinorUnits: '1000000000000000000000000000000',
    tokenDecimals: 18,
    parameterSource: 'deployment-inventory-baseline:56',
  },
  {
    chainId: 'evm:8453',
    parameterSetVersion: CONFIG_PARAMETER_SET,
    finalityDepth: 6,
    reorgWindow: 20,
    bridgeAddress: '0x5555555555555555555555555555555555555555',
    validatorSetVersion: 'validator-set/1',
    minValidatorQuorum: 5,
    maxMessageBytes: 4096,
    maxAmountMinorUnits: '1000000000000000000000000000000',
    tokenDecimals: 18,
    parameterSource: 'deployment-inventory-baseline:8453',
  },
  {
    chainId: 'soroban:stellar',
    parameterSetVersion: CONFIG_PARAMETER_SET,
    finalityDepth: 1,
    reorgWindow: 1,
    bridgeAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    validatorSetVersion: 'validator-set/1',
    minValidatorQuorum: 5,
    maxMessageBytes: 2048,
    maxAmountMinorUnits: '9223372036854775807',
    tokenDecimals: 7,
    parameterSource: 'finality-policy:stellar',
  },
];

export interface ProductionConfigBundle {
  readonly schemaVersion: number;
  readonly parameterSetVersion: string;
  readonly releaseId: string;
  readonly releaseSequence: number;
  readonly sourceCommit: string;
  readonly effectiveFrom: number;
  readonly expiresAt: number;
  readonly chains: readonly ChainConfigEntry[];
}

export interface ReviewerKey {
  /** SHA-256-derived identifier; the private key is never part of the config. */
  readonly reviewerId: string;
  /** PEM SPKI public key. */
  readonly publicKey: string;
}

export interface ConfigSigningIdentity extends ReviewerKey {
  /** PEM PKCS#8 private key, held only in the isolated signing process. */
  readonly privateKey: string;
}

export interface ActivationReceipt {
  readonly receiptId: string;
  readonly digest: string;
  readonly releaseId: string;
  readonly releaseSequence: number;
  readonly approvals: readonly string[];
  readonly activatedAt: number;
  readonly activatedBy: string;
}

export interface ConfigBundleSnapshot {
  now: number;
  active: {
    digest: string;
    releaseId: string;
    releaseSequence: number;
    activatedAt: number;
    activatedBy: string;
    bundle: ProductionConfigBundle;
  } | null;
  approvals: Array<{ digest: string; reviewerId: string }>;
  receipts: ActivationReceipt[];
}

export class ConfigBundleError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ConfigBundleError';
  }
}

export interface ConfigBundleOptions {
  readonly chainProfiles?: readonly ChainConfigEntry[];
  readonly reviewers?: readonly ReviewerKey[];
  readonly operators?: readonly string[];
  /** Default 2-of-N; independent reviewers with distinct keys are required. */
  readonly minApprovals?: number;
  readonly now?: number;
}

const BUNDLE_KEYS: readonly (keyof ProductionConfigBundle)[] = [
  'schemaVersion',
  'parameterSetVersion',
  'releaseId',
  'releaseSequence',
  'sourceCommit',
  'effectiveFrom',
  'expiresAt',
  'chains',
];
const CHAIN_KEYS: readonly (keyof ChainConfigEntry)[] = [
  'chainId',
  'parameterSetVersion',
  'finalityDepth',
  'reorgWindow',
  'bridgeAddress',
  'validatorSetVersion',
  'minValidatorQuorum',
  'maxMessageBytes',
  'maxAmountMinorUnits',
  'tokenDecimals',
  'parameterSource',
];

/** Deterministic, key-sorted serialization; no float or implicit conversion. */
export function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value))
      throw new ConfigBundleError('invalid-input');
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`)
      .join(',')}}`;
  }
  throw new ConfigBundleError('invalid-input');
}

/** SHA-256 over a domain-separated, canonical bundle. Reproducible by design. */
export function productionConfigDigest(bundle: ProductionConfigBundle): string {
  const preimage = canonicalJson({
    domain: CONFIG_DIGEST_DOMAIN,
    schemaVersion: bundle.schemaVersion,
    parameterSetVersion: bundle.parameterSetVersion,
    releaseId: bundle.releaseId,
    releaseSequence: bundle.releaseSequence,
    sourceCommit: bundle.sourceCommit,
    effectiveFrom: bundle.effectiveFrom,
    expiresAt: bundle.expiresAt,
    chains: bundle.chains,
  });
  return createHash('sha256').update(preimage, 'utf8').digest('hex');
}

/** Test-only identity factory: local, disposable, never a production key. */
export function createTestSigningIdentity(
  label: string,
): ConfigSigningIdentity {
  if (!/^[a-z0-9-]{3,32}$/.test(label))
    throw new ConfigBundleError('invalid-reviewer');
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'secp256k1',
  });
  const publicKeyPem = publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString();
  const reviewerId = `0x${createHash('sha256').update(publicKeyPem, 'utf8').digest('hex').slice(0, 40)}`;
  return {
    reviewerId,
    publicKey: publicKeyPem,
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function publicReviewerKey(
  identity: ConfigSigningIdentity,
): ReviewerKey {
  return { reviewerId: identity.reviewerId, publicKey: identity.publicKey };
}

/** secp256k1 ECDSA/SHA-256 in IEEE-P1363 form over the digest bytes. */
export function signConfigDigest(
  identity: ConfigSigningIdentity,
  digest: string,
): string {
  if (!isHex(digest, 32)) throw new ConfigBundleError('invalid-digest');
  return createSign('sha256')
    .update(Buffer.from(digest, 'hex'))
    .sign({ key: identity.privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('hex');
}

export function verifyConfigSignature(
  reviewer: ReviewerKey,
  digest: string,
  signature: string,
): boolean {
  if (
    !isHex(digest, 32) ||
    !isHex(signature, 64) ||
    !reviewer.publicKey.includes('BEGIN PUBLIC KEY')
  ) {
    return false;
  }
  try {
    return createVerify('sha256')
      .update(Buffer.from(digest, 'hex'))
      .verify(
        { key: reviewer.publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'hex'),
      );
  } catch {
    return false;
  }
}

function isHex(value: unknown, bytes: number): value is string {
  return (
    typeof value === 'string' &&
    new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
  );
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    expected.every((key, index) => actual[index] === key)
  );
}

function assertSafeTime(
  value: unknown,
  field: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ConfigBundleError('invalid-time', `invalid ${field}`);
  }
}

export function validateConfigBundle(
  value: unknown,
  profiles: readonly ChainConfigEntry[],
  parameterSetVersion: string,
): ProductionConfigBundle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigBundleError('invalid-bundle', 'Bundle must be an object');
  }
  const bundle = value as Record<string, unknown>;
  if (!hasExactKeys(bundle, BUNDLE_KEYS)) {
    throw new ConfigBundleError(
      'untrusted-field',
      'Bundle has missing or extra fields',
    );
  }
  if (bundle.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    throw new ConfigBundleError('unsupported-schema');
  }
  if (bundle.parameterSetVersion !== parameterSetVersion) {
    throw new ConfigBundleError('unsupported-parameter-set');
  }
  if (
    typeof bundle.releaseId !== 'string' ||
    !/^rel-[a-z0-9][a-z0-9-]{2,39}$/.test(bundle.releaseId)
  ) {
    throw new ConfigBundleError('invalid-release');
  }
  if (
    typeof bundle.releaseSequence !== 'number' ||
    !Number.isSafeInteger(bundle.releaseSequence) ||
    bundle.releaseSequence < 1
  ) {
    throw new ConfigBundleError('invalid-release');
  }
  if (
    typeof bundle.sourceCommit !== 'string' ||
    !isHex(bundle.sourceCommit, 20)
  ) {
    throw new ConfigBundleError('invalid-commit');
  }
  assertSafeTime(bundle.effectiveFrom, 'effectiveFrom');
  assertSafeTime(bundle.expiresAt, 'expiresAt');
  if (
    bundle.expiresAt <= bundle.effectiveFrom ||
    bundle.expiresAt - bundle.effectiveFrom > MAX_CONFIG_LIFETIME_MS
  ) {
    throw new ConfigBundleError('invalid-validity-window');
  }
  if (
    !Array.isArray(bundle.chains) ||
    bundle.chains.length === 0 ||
    bundle.chains.length > Math.min(MAX_CONFIG_CHAINS, profiles.length)
  ) {
    throw new ConfigBundleError('invalid-chains');
  }
  if (bundle.chains.length !== profiles.length) {
    throw new ConfigBundleError('incomplete-chain-coverage');
  }
  const expected = new Map(
    profiles.map((profile) => [profile.chainId, profile]),
  );
  let previous = '';
  for (const raw of bundle.chains) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      !hasExactKeys(raw as object, CHAIN_KEYS)
    ) {
      throw new ConfigBundleError(
        'untrusted-field',
        'Chain entry has missing or extra fields',
      );
    }
    const chain = raw as unknown as Record<string, unknown>;
    if (typeof chain.chainId !== 'string' || chain.chainId <= previous) {
      throw new ConfigBundleError(
        'invalid-chains',
        'Chain ids must be unique and sorted',
      );
    }
    previous = chain.chainId;
    const profile = expected.get(chain.chainId);
    if (!profile) throw new ConfigBundleError('unsupported-chain');
    if (
      typeof chain.bridgeAddress !== 'string' ||
      !(
        /^0x[0-9a-f]{40}$/.test(chain.bridgeAddress) ||
        /^G[A-Z2-7]{55}$/.test(chain.bridgeAddress)
      )
    ) {
      throw new ConfigBundleError('invalid-address');
    }
    if (
      !Number.isSafeInteger(chain.finalityDepth) ||
      (chain.finalityDepth as number) < 1 ||
      !Number.isSafeInteger(chain.reorgWindow) ||
      (chain.reorgWindow as number) < (chain.finalityDepth as number)
    ) {
      throw new ConfigBundleError('invalid-profile-bounds');
    }
    if (
      !Number.isSafeInteger(chain.minValidatorQuorum) ||
      (chain.minValidatorQuorum as number) < 2 ||
      (chain.minValidatorQuorum as number) > 256
    ) {
      throw new ConfigBundleError('invalid-quorum');
    }
    if (
      !Number.isSafeInteger(chain.maxMessageBytes) ||
      (chain.maxMessageBytes as number) < 256 ||
      (chain.maxMessageBytes as number) > 65536
    ) {
      throw new ConfigBundleError('invalid-profile-bounds');
    }
    if (
      typeof chain.maxAmountMinorUnits !== 'string' ||
      !/^[1-9][0-9]{0,77}$/.test(chain.maxAmountMinorUnits)
    ) {
      throw new ConfigBundleError('invalid-amount');
    }
    if (
      !Number.isSafeInteger(chain.tokenDecimals) ||
      (chain.tokenDecimals as number) < 0 ||
      (chain.tokenDecimals as number) > 36
    ) {
      throw new ConfigBundleError('invalid-decimals');
    }
    for (const key of CHAIN_KEYS) {
      if (chain[key] !== profile[key])
        throw new ConfigBundleError(
          'parameter-mismatch',
          `${key} must match the reviewed profile`,
        );
    }
  }
  return bundle as unknown as ProductionConfigBundle;
}

export class ProductionConfigRegistry {
  private currentTime: number;
  private readonly profiles: readonly ChainConfigEntry[];
  private readonly reviewers = new Map<string, ReviewerKey>();
  private readonly operators = new Set<string>();
  private readonly minApprovals: number;
  private readonly approvals = new Map<string, Map<string, string>>();
  private readonly activatedDigests = new Set<string>();
  private readonly receipts: ActivationReceipt[] = [];
  private activeBundle: ProductionConfigBundle | null = null;
  private activeDigest: string = GENESIS_RECEIPT;
  private activeActivatedAt = 0;
  private activeActivatedBy = '';

  constructor(options: ConfigBundleOptions = {}) {
    const profiles = options.chainProfiles ?? CONFIG_CHAIN_PROFILES;
    if (
      !profiles.length ||
      new Set(profiles.map((p) => p.chainId)).size !== profiles.length
    ) {
      throw new ConfigBundleError('invalid-profiles');
    }
    this.profiles = [...profiles].sort((a, b) =>
      a.chainId.localeCompare(b.chainId),
    );
    const reviewers = options.reviewers ?? [];
    if (
      reviewers.length === 0 ||
      new Set(reviewers.map((r) => r.reviewerId)).size !== reviewers.length
    ) {
      throw new ConfigBundleError('invalid-reviewers');
    }
    for (const reviewer of reviewers) {
      if (
        !/^0x[0-9a-f]{40}$/.test(reviewer.reviewerId) ||
        typeof reviewer.publicKey !== 'string'
      ) {
        throw new ConfigBundleError('invalid-reviewers');
      }
      this.reviewers.set(reviewer.reviewerId, reviewer);
    }
    const operators = options.operators ?? ['operator'];
    if (operators.length === 0)
      throw new ConfigBundleError('invalid-operators');
    operators.forEach((operator) => this.operators.add(operator));
    this.minApprovals = options.minApprovals ?? 2;
    if (
      !Number.isSafeInteger(this.minApprovals) ||
      this.minApprovals < 1 ||
      this.minApprovals > this.reviewers.size
    ) {
      throw new ConfigBundleError('invalid-quorum');
    }
    if (!Number.isSafeInteger(options.now ?? 0) || (options.now ?? 0) < 0) {
      throw new ConfigBundleError('invalid-time');
    }
    this.currentTime = options.now ?? 1_700_000_000_000;
  }

  get now(): number {
    return this.currentTime;
  }
  get active(): ProductionConfigBundle | null {
    return this.activeBundle;
  }
  get digest(): string {
    return this.activeDigest;
  }

  setNow(value: number): void {
    if (!Number.isSafeInteger(value) || value < this.currentTime) {
      throw new ConfigBundleError('clock-must-not-go-backwards');
    }
    this.currentTime = value;
  }

  validate(value: unknown): ProductionConfigBundle {
    return validateConfigBundle(value, this.profiles, CONFIG_PARAMETER_SET);
  }

  /** Records one cryptographic approval for the exact reviewed bundle digest. */
  approve(reviewerId: string, value: unknown, signature: string): string {
    const bundle = this.validate(value);
    const digest = productionConfigDigest(bundle);
    if (this.activatedDigests.has(digest))
      throw new ConfigBundleError('replay');
    const reviewer = this.reviewers.get(reviewerId);
    if (!reviewer) throw new ConfigBundleError('unauthorized-reviewer');
    if (!verifyConfigSignature(reviewer, digest, signature)) {
      throw new ConfigBundleError('invalid-signature');
    }
    let forDigest = this.approvals.get(digest);
    if (!forDigest) {
      forDigest = new Map();
      this.approvals.set(digest, forDigest);
    }
    if (forDigest.has(reviewerId))
      throw new ConfigBundleError('duplicate-approval');
    forDigest.set(reviewerId, signature);
    return digest;
  }

  /** Activates only a fully approved, unexpired, strictly newer bundle. */
  activate(operator: string, value: unknown): ActivationReceipt {
    if (!this.operators.has(operator))
      throw new ConfigBundleError('unauthorized-operator');
    const bundle = this.validate(value);
    const digest = productionConfigDigest(bundle);
    if (this.activatedDigests.has(digest))
      throw new ConfigBundleError('replay');
    if (this.currentTime < bundle.effectiveFrom)
      throw new ConfigBundleError('not-effective');
    if (this.currentTime >= bundle.expiresAt)
      throw new ConfigBundleError('expired');
    if (
      this.activeBundle &&
      bundle.releaseSequence <= this.activeBundle.releaseSequence
    ) {
      throw new ConfigBundleError('stale-release');
    }
    const approvals = this.approvals.get(digest);
    if (!approvals || approvals.size < this.minApprovals) {
      throw new ConfigBundleError('quorum-not-met');
    }
    const receipt: ActivationReceipt = Object.freeze({
      receiptId: digest,
      digest,
      releaseId: bundle.releaseId,
      releaseSequence: bundle.releaseSequence,
      approvals: Object.freeze([...approvals.keys()].sort()),
      activatedAt: this.currentTime,
      activatedBy: operator,
    });
    this.activeBundle = bundle;
    this.activeDigest = digest;
    this.activeActivatedAt = receipt.activatedAt;
    this.activeActivatedBy = receipt.activatedBy;
    this.activatedDigests.add(digest);
    this.receipts.push(receipt);
    return { ...receipt, approvals: [...receipt.approvals] };
  }

  /** Re-validates the immutable active snapshot without consulting any RPC. */
  verifyActive(): void {
    if (!this.activeBundle) throw new ConfigBundleError('no-active-bundle');
    this.validate(this.activeBundle);
    if (productionConfigDigest(this.activeBundle) !== this.activeDigest) {
      throw new ConfigBundleError('tampered-bundle');
    }
    if (this.currentTime >= this.activeBundle.expiresAt)
      throw new ConfigBundleError('expired');
    if (this.activeActivatedAt < this.activeBundle.effectiveFrom) {
      throw new ConfigBundleError('not-effective');
    }
    if (!this.operators.has(this.activeActivatedBy))
      throw new ConfigBundleError('unauthorized-operator');
    const approvals = this.approvals.get(this.activeDigest);
    if (!approvals || approvals.size < this.minApprovals)
      throw new ConfigBundleError('quorum-not-met');
  }

  snapshot(): ConfigBundleSnapshot {
    return {
      now: this.currentTime,
      active: this.activeBundle
        ? {
            digest: this.activeDigest,
            releaseId: this.activeBundle.releaseId,
            releaseSequence: this.activeBundle.releaseSequence,
            activatedAt: this.activeActivatedAt,
            activatedBy: this.activeActivatedBy,
            bundle: JSON.parse(canonicalJson(this.activeBundle)),
          }
        : null,
      approvals: [...this.approvals.entries()].flatMap(([digest, reviewers]) =>
        [...reviewers.keys()]
          .sort()
          .map((reviewerId) => ({ digest, reviewerId })),
      ),
      receipts: this.receipts.map((receipt) => ({
        ...receipt,
        approvals: [...receipt.approvals],
      })),
    };
  }

  invariantViolations(): string[] {
    const violations: string[] = [];
    try {
      this.verifyActive();
    } catch {
      /* no active bundle is a valid pre-activation state */
    }
    if (this.activeBundle) {
      if (productionConfigDigest(this.activeBundle) !== this.activeDigest)
        violations.push('B-1');
      if (this.activeBundle.chains.length !== this.profiles.length)
        violations.push('B-6');
      if (this.activeBundle.chains.length > MAX_CONFIG_CHAINS)
        violations.push('B-7');
      if (
        this.currentTime >= this.activeBundle.expiresAt &&
        !violations.includes('B-8')
      )
        violations.push('B-8');
    }
    for (const digest of this.activatedDigests) {
      const approvals = this.approvals.get(digest)?.size ?? 0;
      if (approvals < this.minApprovals) violations.push('B-2');
    }
    for (let index = 1; index < this.receipts.length; index++) {
      if (
        this.receipts[index].releaseSequence <=
        this.receipts[index - 1].releaseSequence
      )
        violations.push('B-4');
    }
    for (const reviewer of this.reviewers.keys()) {
      if (!/^0x[0-9a-f]{40}$/.test(reviewer)) violations.push('B-9');
    }
    return [...new Set(violations)];
  }
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function testBundle(
  overrides: Partial<ProductionConfigBundle> = {},
): ProductionConfigBundle {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    parameterSetVersion: CONFIG_PARAMETER_SET,
    releaseId: 'rel-baseline-1',
    releaseSequence: 1,
    sourceCommit: 'a'.repeat(40),
    effectiveFrom: 1_700_000_000_000,
    expiresAt: 1_700_000_000_000 + MAX_CONFIG_LIFETIME_MS,
    chains: CONFIG_CHAIN_PROFILES.map((chain) => ({ ...chain })),
    ...overrides,
  };
}

export function testOptions(
  overrides: ConfigBundleOptions = {},
): ConfigBundleOptions {
  return { now: 1_700_000_000_000, ...overrides };
}
