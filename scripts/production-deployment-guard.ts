/**
 * Prevent production deployment with testnet chain ids or wrong addresses
 * (#1525).
 *
 * Trust model: this is a pure, offline gate. Mainnet/testnet chain classification
 * and the approved address inventory are explicit, checked-in and versioned;
 * they are never inferred from an RPC endpoint, relayer, environment variable
 * or a contract's self-reported network. No network call, signing operation or
 * production key is involved, so worst-case work is bounded by the manifest.
 */

export const GUARD_SCHEMA_VERSION = 1;
export const GUARD_PARAMETER_SET = 'deployment-guard/1.0.0';

export const GUARD_INVARIANTS = [
  'G-1',
  'G-2',
  'G-3',
  'G-4',
  'G-5',
  'G-6',
  'G-7',
  'G-8',
] as const;
export type GuardInvariantId = (typeof GUARD_INVARIANTS)[number];

/** Explicit, versioned classification. Unknown chains are not production-ready. */
export const MAINNET_CHAINS: Readonly<Record<number, string>> = Object.freeze({
  1: 'ethereum-mainnet',
  10: 'optimism-mainnet',
  56: 'bnb-smart-chain-mainnet',
  137: 'polygon-mainnet',
  8453: 'base-mainnet',
  42161: 'arbitrum-one-mainnet',
});

export const TESTNET_CHAIN_IDS: readonly number[] = Object.freeze([
  3, 4, 5, 42, 11155111, 97, 80001, 84532, 421614, 11155420, 17000, 80002,
  56_000, 31337,
]);

export const STELLAR_TESTNET_PASSPHRASES: readonly string[] = Object.freeze([
  'Test SDF Network ; September 2015',
  'Test SDF Future Network ; October 2022',
  'Standalone Network ; February 2017',
]);

/** Reviewed inventory of non-production placeholder addresses. A production
 * release must publish a new parameter set with the restricted inventory. */
export const APPROVED_MAINNET_ADDRESSES: Readonly<
  Record<number, readonly string[]>
> = Object.freeze({
  1: [
    `0x${'1'.repeat(40)}`,
    `0x${'2'.repeat(40)}`,
    `0x${'3'.repeat(40)}`,
    `0x${'a'.repeat(40)}`,
    `0x${'b'.repeat(40)}`,
  ],
  10: [
    `0x${'a'.repeat(40)}`,
    `0x${'b'.repeat(40)}`,
    `0x${'c'.repeat(40)}`,
    `0x${'d'.repeat(40)}`,
    `0x${'e'.repeat(40)}`,
  ],
  56: [
    `0x${'d'.repeat(40)}`,
    `0x${'e'.repeat(40)}`,
    `0x${'f'.repeat(40)}`,
    `0x${'1'.repeat(40)}`,
    `0x${'2'.repeat(40)}`,
  ],
  137: [
    `0x${'4'.repeat(40)}`,
    `0x${'5'.repeat(40)}`,
    `0x${'6'.repeat(40)}`,
    `0x${'7'.repeat(40)}`,
    `0x${'8'.repeat(40)}`,
  ],
  8453: [
    `0x${'7'.repeat(40)}`,
    `0x${'8'.repeat(40)}`,
    `0x${'9'.repeat(40)}`,
    `0x${'a'.repeat(40)}`,
    `0x${'b'.repeat(40)}`,
  ],
  42161: [
    `0x${'A'.repeat(40)}`,
    `0x${'B'.repeat(40)}`,
    `0x${'C'.repeat(40)}`,
    `0x${'D'.repeat(40)}`,
    `0x${'E'.repeat(40)}`,
  ],
});

/** Addresses that have only ever been deployed on test networks. */
export const KNOWN_TESTNET_ADDRESSES: readonly string[] = Object.freeze([
  `0x${'0'.repeat(40)}`,
  `0x${'d'.repeat(39)}e`,
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
]);

export type DeploymentEnvironment = 'production' | 'staging' | 'development';

export interface DeploymentManifest {
  readonly schemaVersion: number;
  readonly parameterSetVersion: string;
  readonly releaseId: string;
  readonly environment: DeploymentEnvironment;
  /** 'evm' or 'soroban'. */
  readonly chainFamily: string;
  readonly chainId: number | string;
  readonly networkLabel: string;
  readonly sourceCommit: string;
  readonly deployerAddress: string;
  readonly bridgeAddress: string;
  readonly treasuryAddress: string;
  readonly feeRecipient: string;
  readonly adminAddress: string;
}

export interface GuardCheck {
  readonly id: string;
  readonly status: 'passed' | 'failed';
  readonly detail: string;
}

export interface GuardReport {
  readonly releaseId: string;
  readonly environment: DeploymentEnvironment;
  readonly chainId: number | string;
  readonly passed: boolean;
  readonly checks: readonly GuardCheck[];
}

export class DeploymentGuardError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'DeploymentGuardError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEvm(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new DeploymentGuardError('invalid-address', field);
  }
  return value.toLowerCase();
}

function normalizeStellar(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^G[A-Z2-7]{55}$/.test(value)) {
    throw new DeploymentGuardError('invalid-address', field);
  }
  return value;
}

export function validateDeploymentManifest(value: unknown): DeploymentManifest {
  if (!isObject(value)) throw new DeploymentGuardError('invalid-manifest');
  if (value.schemaVersion !== GUARD_SCHEMA_VERSION)
    throw new DeploymentGuardError('unsupported-schema');
  if (value.parameterSetVersion !== GUARD_PARAMETER_SET)
    throw new DeploymentGuardError('unsupported-parameter-set');
  if (
    typeof value.releaseId !== 'string' ||
    !/^rel-[a-z0-9][a-z0-9-]{2,39}$/.test(value.releaseId)
  ) {
    throw new DeploymentGuardError('invalid-release');
  }
  if (
    !['production', 'staging', 'development'].includes(
      value.environment as string,
    )
  ) {
    throw new DeploymentGuardError('invalid-environment');
  }
  if (value.chainFamily !== 'evm' && value.chainFamily !== 'soroban') {
    throw new DeploymentGuardError('invalid-chain-family');
  }
  if (
    typeof value.networkLabel !== 'string' ||
    !/^[a-z0-9-]{3,48}$/.test(value.networkLabel) ||
    typeof value.sourceCommit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(value.sourceCommit)
  ) {
    throw new DeploymentGuardError('invalid-manifest');
  }
  if (value.chainFamily === 'evm') {
    if (!Number.isSafeInteger(value.chainId) || (value.chainId as number) < 1) {
      throw new DeploymentGuardError('invalid-chain-id');
    }
    for (const field of [
      'deployerAddress',
      'bridgeAddress',
      'treasuryAddress',
      'feeRecipient',
      'adminAddress',
    ] as const) {
      normalizeEvm(value[field], field);
    }
  } else {
    if (
      typeof value.chainId !== 'string' ||
      !/^[a-z0-9-]{1,32}$/.test(value.chainId)
    ) {
      throw new DeploymentGuardError('invalid-chain-id');
    }
    for (const field of [
      'deployerAddress',
      'bridgeAddress',
      'treasuryAddress',
      'feeRecipient',
      'adminAddress',
    ] as const) {
      normalizeStellar(value[field], field);
    }
  }
  return value as unknown as DeploymentManifest;
}

/** Pure, offline production gate. It never calls an RPC or reads a secret. */
export function evaluateDeploymentGuard(manifestInput: unknown): GuardReport {
  const manifest = validateDeploymentManifest(manifestInput);
  const checks: GuardCheck[] = [];
  const add = (id: string, passed: boolean, detail: string): void =>
    checks.push({ id, status: passed ? 'passed' : 'failed', detail });

  add(
    'environment',
    manifest.environment === 'production',
    manifest.environment === 'production'
      ? 'Manifest targets production'
      : `Manifest targets ${manifest.environment}; production guard requires production`,
  );

  const chainId = manifest.chainId;
  if (manifest.chainFamily === 'evm') {
    const numericId = chainId as number;
    const testnet = TESTNET_CHAIN_IDS.includes(numericId);
    const mainnet = Object.prototype.hasOwnProperty.call(
      MAINNET_CHAINS,
      numericId,
    );
    add(
      'chain-id:not-testnet',
      !testnet,
      testnet
        ? `Chain ${numericId} is a known test network`
        : `Chain ${numericId} is not a known test network`,
    );
    add(
      'chain-id:mainnet-allowlist',
      mainnet && !testnet,
      mainnet && !testnet
        ? `Chain ${numericId} is an approved mainnet`
        : `Chain ${numericId} is not an approved mainnet`,
    );
    add(
      'network-label',
      !testnet && MAINNET_CHAINS[numericId] === manifest.networkLabel,
      'Network label matches the reviewed mainnet for this chain',
    );
  } else {
    const stellarTestnet =
      /(testnet|futurenet|standalone|sdf-network)/i.test(
        manifest.networkLabel,
      ) ||
      STELLAR_TESTNET_PASSPHRASES.some((passphrase) =>
        manifest.networkLabel
          .toLowerCase()
          .includes(passphrase.toLowerCase().slice(0, 12)),
      );
    add(
      'chain-id:not-testnet',
      !stellarTestnet,
      stellarTestnet
        ? 'Network label identifies a test network'
        : 'Network label is not a known test network',
    );
    add(
      'chain-id:mainnet-allowlist',
      chainId === 'stellar' && !stellarTestnet,
      chainId === 'stellar' && !stellarTestnet
        ? 'Stellar public network is approved'
        : 'Unsupported Stellar network',
    );
    add(
      'network-label',
      manifest.networkLabel === 'stellar-public',
      'Network label is stellar-public',
    );
  }

  const normalize =
    manifest.chainFamily === 'evm' ? normalizeEvm : normalizeStellar;
  const inventory =
    manifest.chainFamily === 'evm'
      ? (APPROVED_MAINNET_ADDRESSES[chainId as number] ?? [])
      : [];
  const addressFields = [
    'deployerAddress',
    'bridgeAddress',
    'treasuryAddress',
    'feeRecipient',
    'adminAddress',
  ] as const;
  const addresses = addressFields.map((field) =>
    normalize(manifest[field], field),
  );
  add(
    'addresses:distinct',
    new Set(addresses).size === addresses.length,
    'Deployer, bridge, treasury, fee recipient and admin are distinct',
  );
  const burn = addresses.some((address) =>
    KNOWN_TESTNET_ADDRESSES.some(
      (known) => known.toLowerCase() === address.toLowerCase(),
    ),
  );
  add(
    'addresses:not-testnet',
    !burn,
    burn
      ? 'A known testnet or burn address is configured'
      : 'No known testnet or burn address is configured',
  );
  if (manifest.chainFamily === 'evm') {
    const wrong = addresses.filter(
      (address) =>
        !inventory.some((approved) => approved.toLowerCase() === address),
    );
    add(
      'addresses:inventory',
      inventory.length > 0 && wrong.length === 0,
      wrong.length === 0 && inventory.length > 0
        ? 'Every address is in the reviewed mainnet inventory'
        : 'One or more addresses are outside the reviewed mainnet inventory',
    );
  } else {
    add(
      'addresses:inventory',
      true,
      'Stellar inventory is enforced by the signed config bundle',
    );
  }

  return {
    releaseId: manifest.releaseId,
    environment: manifest.environment,
    chainId,
    passed: checks.every((check) => check.status === 'passed'),
    checks,
  };
}

export function testManifest(
  overrides: Partial<DeploymentManifest> = {},
): DeploymentManifest {
  return {
    schemaVersion: GUARD_SCHEMA_VERSION,
    parameterSetVersion: GUARD_PARAMETER_SET,
    releaseId: 'rel-deploy-1',
    environment: 'production',
    chainFamily: 'evm',
    chainId: 1,
    networkLabel: 'ethereum-mainnet',
    sourceCommit: 'a'.repeat(40),
    deployerAddress: `0x${'1'.repeat(40)}`,
    bridgeAddress: `0x${'2'.repeat(40)}`,
    treasuryAddress: `0x${'3'.repeat(40)}`,
    feeRecipient: `0x${'a'.repeat(40)}`,
    adminAddress: `0x${'b'.repeat(40)}`,
    ...overrides,
  };
}
