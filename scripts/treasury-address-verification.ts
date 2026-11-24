/**
 * Automated verification of treasury and fee-recipient addresses (#1524).
 *
 * Trust model: the reviewed, versioned plan is the only source of expected
 * values. On-chain reads are untrusted observations at a single block pinned
 * beneath the confirmation depth; a mismatch, malformed value, burn address or
 * read failure always fails closed. No transaction is sent and no production
 * key or secret is read. Error text from a provider is never copied to a report.
 */

export const TREASURY_SCHEMA_VERSION = 1;
export const TREASURY_PARAMETER_SET = 'treasury-addresses/1.0.0';
export const MAX_TREASURY_CHAINS = 8;

export const TREASURY_INVARIANTS = [
  'T-1',
  'T-2',
  'T-3',
  'T-4',
  'T-5',
  'T-6',
  'T-7',
] as const;
export type TreasuryInvariantId = (typeof TREASURY_INVARIANTS)[number];

/** Addresses that must never receive protocol treasury or fee value. */
export const BURN_ADDRESSES: readonly string[] = [
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',
  '0xdead00000000000000000000000000000000dead',
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
];

export interface TreasuryRolePlan {
  readonly treasury: string;
  readonly feeRecipient: string;
  /** Addresses of other roles that must never equal treasury/fee recipient. */
  readonly reserved: readonly string[];
  readonly treasuryMustBeContract: boolean;
  readonly feeRecipientMustBeContract: boolean;
}

export interface TreasuryChainPlan {
  readonly chainId: string;
  readonly parameterSetVersion: string;
  readonly deployedAtBlock: number;
  readonly minConfirmations: number;
  readonly registryAddress: string;
  readonly roles: TreasuryRolePlan;
}

export interface TreasuryPlan {
  readonly schemaVersion: number;
  readonly parameterSetVersion: string;
  readonly releaseId: string;
  readonly chains: readonly TreasuryChainPlan[];
}

export interface TreasuryReader {
  getChainId(): Promise<string | bigint>;
  getBlockNumber(): Promise<number>;
  getCode(address: string, blockNumber: number): Promise<string>;
  readRoles(
    registryAddress: string,
    blockNumber: number,
  ): Promise<{
    treasury: string;
    feeRecipient: string;
  }>;
}

export interface TreasuryCheck {
  readonly id: string;
  readonly status: 'passed' | 'failed';
  readonly detail: string;
}

export interface TreasuryChainReport {
  readonly chainId: string;
  readonly checkedBlock: number | null;
  readonly passed: boolean;
  readonly checks: readonly TreasuryCheck[];
}

export interface TreasuryReport {
  readonly releaseId: string;
  readonly passed: boolean;
  readonly chains: readonly TreasuryChainReport[];
}

export class TreasuryAddressError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'TreasuryAddressError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Canonical form: EVM addresses are lower-case, Stellar addresses upper-case. */
export function normalizeAddress(value: unknown, field: string): string {
  if (typeof value !== 'string')
    throw new TreasuryAddressError('invalid-address', field);
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) return value.toLowerCase();
  if (/^G[A-Z2-7]{55}$/.test(value)) return value;
  throw new TreasuryAddressError('invalid-address', field);
}

export function isBurnAddress(address: string): boolean {
  const normalized = /^0x/.test(address) ? address.toLowerCase() : address;
  return BURN_ADDRESSES.some((burn) => burn.toLowerCase() === normalized);
}

export function validateTreasuryPlan(value: unknown): TreasuryPlan {
  if (!isObject(value)) throw new TreasuryAddressError('invalid-plan');
  if (value.schemaVersion !== TREASURY_SCHEMA_VERSION)
    throw new TreasuryAddressError('unsupported-schema');
  if (value.parameterSetVersion !== TREASURY_PARAMETER_SET)
    throw new TreasuryAddressError('unsupported-parameter-set');
  if (
    typeof value.releaseId !== 'string' ||
    !/^rel-[a-z0-9][a-z0-9-]{2,39}$/.test(value.releaseId)
  ) {
    throw new TreasuryAddressError('invalid-release');
  }
  if (
    !Array.isArray(value.chains) ||
    value.chains.length === 0 ||
    value.chains.length > MAX_TREASURY_CHAINS
  ) {
    throw new TreasuryAddressError('invalid-chains');
  }
  const ids = new Set<string>();
  const chains = value.chains.map((raw, index) => {
    if (!isObject(raw))
      throw new TreasuryAddressError('invalid-chain', `chains[${index}]`);
    const chainId = raw.chainId;
    if (
      typeof chainId !== 'string' ||
      !/^(evm:[1-9][0-9]*|soroban:stellar)$/.test(chainId) ||
      ids.has(chainId)
    ) {
      throw new TreasuryAddressError(
        'invalid-chain',
        `chains[${index}].chainId`,
      );
    }
    ids.add(chainId);
    if (raw.parameterSetVersion !== TREASURY_PARAMETER_SET) {
      throw new TreasuryAddressError('unsupported-parameter-set');
    }
    const deployedAtBlock = raw.deployedAtBlock;
    const minConfirmations = raw.minConfirmations;
    if (
      !Number.isSafeInteger(deployedAtBlock) ||
      (deployedAtBlock as number) < 0
    ) {
      throw new TreasuryAddressError('invalid-block');
    }
    if (
      !Number.isSafeInteger(minConfirmations) ||
      (minConfirmations as number) < 1 ||
      (minConfirmations as number) > 10_000
    ) {
      throw new TreasuryAddressError('invalid-confirmations');
    }
    const registryAddress = normalizeAddress(
      raw.registryAddress,
      'registryAddress',
    );
    if (!isObject(raw.roles)) throw new TreasuryAddressError('invalid-roles');
    const treasury = normalizeAddress(raw.roles.treasury, 'treasury');
    const feeRecipient = normalizeAddress(
      raw.roles.feeRecipient,
      'feeRecipient',
    );
    if (treasury === feeRecipient)
      throw new TreasuryAddressError('roles-not-distinct');
    if (isBurnAddress(treasury) || isBurnAddress(feeRecipient))
      throw new TreasuryAddressError('burn-address');
    if (!Array.isArray(raw.roles.reserved) || raw.roles.reserved.length > 64) {
      throw new TreasuryAddressError('invalid-roles');
    }
    const reserved = raw.roles.reserved.map((item, i) =>
      normalizeAddress(item, `reserved[${i}]`),
    );
    if (reserved.includes(treasury) || reserved.includes(feeRecipient)) {
      throw new TreasuryAddressError('reserved-address');
    }
    if (
      typeof raw.roles.treasuryMustBeContract !== 'boolean' ||
      typeof raw.roles.feeRecipientMustBeContract !== 'boolean'
    ) {
      throw new TreasuryAddressError('invalid-roles');
    }
    return {
      chainId,
      parameterSetVersion: TREASURY_PARAMETER_SET,
      deployedAtBlock: deployedAtBlock as number,
      minConfirmations: minConfirmations as number,
      registryAddress,
      roles: {
        treasury,
        feeRecipient,
        reserved,
        treasuryMustBeContract: raw.roles.treasuryMustBeContract,
        feeRecipientMustBeContract: raw.roles.feeRecipientMustBeContract,
      },
    } satisfies TreasuryChainPlan;
  });
  return {
    schemaVersion: TREASURY_SCHEMA_VERSION,
    parameterSetVersion: TREASURY_PARAMETER_SET,
    releaseId: value.releaseId,
    chains,
  };
}

function addressKind(address: string): 'evm' | 'stellar' {
  return address.startsWith('0x') ? 'evm' : 'stellar';
}

export async function verifyTreasuryAddresses(
  planInput: unknown,
  reader: TreasuryReader,
): Promise<TreasuryReport> {
  const plan = validateTreasuryPlan(planInput);
  const chainReports: TreasuryChainReport[] = [];
  for (const chain of plan.chains) {
    const checks: TreasuryCheck[] = [];
    const add = (id: string, passed: boolean, detail: string): void =>
      checks.push({ id, status: passed ? 'passed' : 'failed', detail });
    const fail = (id: string, what: string): void =>
      add(id, false, `Unable to ${what} from the configured RPC`);

    const { treasury, feeRecipient, reserved } = chain.roles;
    add(
      'plan:roles-distinct',
      treasury !== feeRecipient &&
        !reserved.includes(treasury) &&
        !reserved.includes(feeRecipient),
      'Treasury and fee recipient are distinct from each other and from reserved roles',
    );
    add(
      'plan:not-burn',
      !isBurnAddress(treasury) && !isBurnAddress(feeRecipient),
      'Neither recipient is a known burn address',
    );
    add(
      'plan:chain-format',
      addressKind(treasury) === addressKind(feeRecipient) &&
        (chain.chainId.startsWith('evm:')
          ? addressKind(treasury) === 'evm'
          : addressKind(treasury) === 'stellar'),
      'Recipient formats match each other and the reviewed chain family',
    );

    let chainOk = false;
    try {
      const observed = await reader.getChainId();
      const observedId =
        typeof observed === 'bigint' ? `evm:${observed.toString()}` : observed;
      chainOk = observedId === chain.chainId;
      add(
        'chain-id',
        chainOk,
        chainOk
          ? `Connected to ${chain.chainId}`
          : 'Connected chain does not match the reviewed chain',
      );
    } catch {
      fail('chain-id', 'query chain ID');
    }
    if (!chainOk) {
      chainReports.push({
        chainId: chain.chainId,
        checkedBlock: null,
        passed: checks.every((c) => c.status === 'passed'),
        checks,
      });
      continue;
    }

    let pinned: number;
    try {
      const head = await reader.getBlockNumber();
      if (!Number.isSafeInteger(head)) throw new Error('bad head');
      pinned = head - chain.minConfirmations;
    } catch {
      fail('pinned-block', 'query the latest block');
      chainReports.push({
        chainId: chain.chainId,
        checkedBlock: null,
        passed: false,
        checks,
      });
      continue;
    }
    const deepEnough = pinned >= chain.deployedAtBlock;
    add(
      'pinned-block',
      deepEnough,
      deepEnough
        ? `Reading at block ${pinned}`
        : 'Deployment lacks the required confirmations',
    );
    if (!deepEnough) {
      chainReports.push({
        chainId: chain.chainId,
        checkedBlock: pinned,
        passed: false,
        checks,
      });
      continue;
    }

    try {
      const code = await reader.getCode(chain.registryAddress, pinned);
      const hasCode =
        typeof code === 'string' &&
        /^0x([0-9a-fA-F]{2})+$/.test(code) &&
        !/^0x(00)+$/i.test(code);
      add(
        'registry:contract-code',
        hasCode,
        hasCode ? 'Registry has runtime code' : 'Registry has no runtime code',
      );
    } catch {
      fail('registry:contract-code', 'query registry runtime code');
    }

    try {
      const observed = await reader.readRoles(chain.registryAddress, pinned);
      let onChainTreasury: string | undefined;
      let onChainFee: string | undefined;
      try {
        onChainTreasury = normalizeAddress(
          observed.treasury,
          'observed treasury',
        );
      } catch {
        /* malformed observed value becomes a failed comparison */
      }
      try {
        onChainFee = normalizeAddress(
          observed.feeRecipient,
          'observed fee recipient',
        );
      } catch {
        /* malformed observed value becomes a failed comparison */
      }
      add(
        'onchain:treasury',
        onChainTreasury === treasury,
        'Treasury matches the reviewed address',
      );
      add(
        'onchain:fee-recipient',
        onChainFee === feeRecipient,
        'Fee recipient matches the reviewed address',
      );
      add(
        'onchain:not-burn',
        !!onChainTreasury &&
          !!onChainFee &&
          !isBurnAddress(onChainTreasury) &&
          !isBurnAddress(onChainFee),
        'On-chain recipients are not burn addresses',
      );
      add(
        'onchain:distinct',
        !!onChainTreasury &&
          !!onChainFee &&
          onChainTreasury !== onChainFee &&
          !reserved.includes(onChainTreasury) &&
          !reserved.includes(onChainFee),
        'On-chain recipients are distinct and not reserved roles',
      );
    } catch {
      fail('onchain:read', 'read recipient roles');
    }

    chainReports.push({
      chainId: chain.chainId,
      checkedBlock: pinned,
      passed: checks.every((c) => c.status === 'passed'),
      checks,
    });
  }
  return {
    releaseId: plan.releaseId,
    passed: chainReports.every((chain) => chain.passed),
    chains: chainReports,
  };
}

export function testRolePlan(
  overrides: Partial<TreasuryRolePlan> = {},
): TreasuryRolePlan {
  return {
    treasury: `0x${'1'.repeat(40)}`,
    feeRecipient: `0x${'2'.repeat(40)}`,
    reserved: [`0x${'3'.repeat(40)}`],
    treasuryMustBeContract: true,
    feeRecipientMustBeContract: false,
    ...overrides,
  };
}

export function testChainPlan(
  overrides: Partial<TreasuryChainPlan> = {},
): TreasuryChainPlan {
  return {
    chainId: 'evm:1',
    parameterSetVersion: TREASURY_PARAMETER_SET,
    deployedAtBlock: 10,
    minConfirmations: 12,
    registryAddress: `0x${'4'.repeat(40)}`,
    roles: testRolePlan(),
    ...overrides,
  };
}

export function testTreasuryPlan(
  overrides: Partial<TreasuryPlan> = {},
): TreasuryPlan {
  return {
    schemaVersion: TREASURY_SCHEMA_VERSION,
    parameterSetVersion: TREASURY_PARAMETER_SET,
    releaseId: 'rel-treasury-1',
    chains: [
      testChainPlan(),
      testChainPlan({
        chainId: 'soroban:stellar',
        roles: testRolePlan({
          treasury: `G${'A'.repeat(54)}B`,
          feeRecipient: `G${'A'.repeat(54)}C`,
          reserved: [],
        }),
      }),
    ],
    ...overrides,
  };
}
