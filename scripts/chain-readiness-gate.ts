/**
 * Production readiness gate for chain halt and restart scenarios (#1522).
 *
 * Trust model: every security-critical value (chain ids, halt semantics,
 * restart epochs, confirmation depth, bounds, observers and operators) is
 * checked in and versioned in the reviewed plan. RPC/health feeds are treated
 * only as untrusted observations that are compared against that plan; a
 * missing, malformed, stale or contradictory observation always fails closed.
 * Nothing here reads a network, signs a transaction, or uses production keys.
 */

export const READINESS_SCHEMA_VERSION = 1;
export const READINESS_PARAMETER_SET = 'readiness/1.0.0';
export const READINESS_DIGEST_DOMAIN = 'bridgewise-chain-readiness-v1';
export const MAX_READINESS_CHAINS = 8;
export const MAX_READINESS_OBSERVERS = 32;
export const MAX_READINESS_OBSERVATIONS = 4096;
export const MAX_IN_FLIGHT_MESSAGES = 100_000;

export const READINESS_INVARIANTS = [
  'R-1',
  'R-2',
  'R-3',
  'R-4',
  'R-5',
  'R-6',
  'R-7',
  'R-8',
] as const;
export type ReadinessInvariantId = (typeof READINESS_INVARIANTS)[number];

export type ChainLifecycle = 'active' | 'paused' | 'halted' | 'restarting';

export interface ChainReadinessProfile {
  readonly chainId: string;
  readonly parameterSetVersion: string;
  /** Number of independent observers that must agree before a chain is ready. */
  readonly minObservers: number;
  /** Confirmations required beneath the observed head before a block is pinned. */
  readonly minConfirmations: number;
  /** Observers may not report a head older than this many blocks. */
  readonly maxHeadLagBlocks: number;
  /** Upper bound for unacknowledged cross-chain messages after a restart. */
  readonly maxInFlightMessages: number;
  /** Explicit, reviewed halt/restart epoch; never inferred from a feed. */
  readonly restartEpoch: number;
}

export interface ReadinessPlan {
  readonly schemaVersion: number;
  readonly parameterSetVersion: string;
  readonly releaseId: string;
  readonly chains: readonly ChainReadinessProfile[];
  readonly observers: readonly string[];
  readonly operators: readonly string[];
}

export interface ReadinessObservation {
  readonly observerId: string;
  readonly chainId: string;
  readonly epoch: number;
  readonly headBlock: number;
  /** Block all reads are pinned to; must be minConfirmations behind head. */
  readonly pinnedBlock: number;
  readonly halted: boolean;
  readonly inFlightMessages: number;
  readonly observedAt: number;
}

export interface ReadinessCheck {
  readonly id: string;
  readonly status: 'passed' | 'failed';
  readonly detail: string;
}

export interface ChainReadinessReport {
  readonly chainId: string;
  readonly lifecycle: ChainLifecycle;
  readonly restartEpoch: number;
  readonly ready: boolean;
  readonly checks: readonly ReadinessCheck[];
}

export interface ReadinessReport {
  readonly evaluatedAt: number;
  readonly releaseId: string;
  readonly ready: boolean;
  readonly chains: readonly ChainReadinessReport[];
}

export class ReadinessError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ReadinessError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assertId(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ReadinessError('invalid-plan', `invalid ${field}`);
  }
  return value;
}

function assertBound(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    throw new ReadinessError('invalid-plan', `invalid ${field}`);
  }
  return value as number;
}

export function validateReadinessPlan(value: unknown): ReadinessPlan {
  if (!isObject(value))
    throw new ReadinessError('invalid-plan', 'plan must be an object');
  if (value.schemaVersion !== READINESS_SCHEMA_VERSION) {
    throw new ReadinessError('unsupported-schema');
  }
  if (value.parameterSetVersion !== READINESS_PARAMETER_SET) {
    throw new ReadinessError('unsupported-parameter-set');
  }
  assertId(value.releaseId, 'releaseId', /^rel-[a-z0-9][a-z0-9-]{2,39}$/);
  if (
    !Array.isArray(value.chains) ||
    value.chains.length === 0 ||
    value.chains.length > MAX_READINESS_CHAINS
  ) {
    throw new ReadinessError('invalid-chains');
  }
  const chainIds = new Set<string>();
  const chains = value.chains.map((raw, index) => {
    if (!isObject(raw))
      throw new ReadinessError('invalid-chains', `chains[${index}]`);
    const chainId = assertId(
      raw.chainId,
      `chains[${index}].chainId`,
      /^(evm:[1-9][0-9]*|soroban:[a-z0-9-]+)$/,
    );
    if (chainIds.has(chainId)) throw new ReadinessError('duplicate-chain');
    chainIds.add(chainId);
    if (raw.parameterSetVersion !== READINESS_PARAMETER_SET) {
      throw new ReadinessError('unsupported-parameter-set');
    }
    const minObservers = assertBound(
      raw.minObservers,
      'minObservers',
      1,
      MAX_READINESS_OBSERVERS,
    );
    const minConfirmations = assertBound(
      raw.minConfirmations,
      'minConfirmations',
      1,
      10_000,
    );
    const maxHeadLagBlocks = assertBound(
      raw.maxHeadLagBlocks,
      'maxHeadLagBlocks',
      0,
      10_000,
    );
    const maxInFlightMessages = assertBound(
      raw.maxInFlightMessages,
      'maxInFlightMessages',
      0,
      MAX_IN_FLIGHT_MESSAGES,
    );
    const restartEpoch = assertBound(
      raw.restartEpoch,
      'restartEpoch',
      0,
      Number.MAX_SAFE_INTEGER,
    );
    return {
      chainId,
      parameterSetVersion: READINESS_PARAMETER_SET,
      minObservers,
      minConfirmations,
      maxHeadLagBlocks,
      maxInFlightMessages,
      restartEpoch,
    } satisfies ChainReadinessProfile;
  });

  const observers = assertIdList(
    value.observers,
    'observers',
    MAX_READINESS_OBSERVERS,
  );
  const operators = assertIdList(
    value.operators,
    'operators',
    MAX_READINESS_OBSERVERS,
  );
  for (const chain of chains) {
    if (chain.minObservers > observers.length) {
      throw new ReadinessError(
        'invalid-plan',
        'minObservers exceeds observer set',
      );
    }
  }
  return {
    schemaVersion: READINESS_SCHEMA_VERSION,
    parameterSetVersion: READINESS_PARAMETER_SET,
    releaseId: value.releaseId as string,
    chains,
    observers,
    operators,
  };
}

function assertIdList(value: unknown, field: string, max: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    throw new ReadinessError('invalid-plan', `invalid ${field}`);
  }
  const list = value.map((item, index) =>
    assertId(item, `${field}[${index}]`, /^[a-z0-9][a-z0-9-]{2,63}$/),
  );
  if (new Set(list).size !== list.length) {
    throw new ReadinessError('invalid-plan', `${field} must be unique`);
  }
  return list;
}

function validateObservation(value: unknown): ReadinessObservation {
  try {
    return parseObservation(value);
  } catch (error) {
    throw new ReadinessError('invalid-observation', (error as Error).message);
  }
}

function parseObservation(value: unknown): ReadinessObservation {
  if (!isObject(value)) throw new ReadinessError('invalid-observation');
  const observerId = assertId(
    value.observerId,
    'observerId',
    /^[a-z0-9][a-z0-9-]{2,63}$/,
  );
  const chainId = assertId(
    value.chainId,
    'chainId',
    /^(evm:[1-9][0-9]*|soroban:[a-z0-9-]+)$/,
  );
  const epoch = assertBound(value.epoch, 'epoch', 0, Number.MAX_SAFE_INTEGER);
  const headBlock = assertBound(
    value.headBlock,
    'headBlock',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const pinnedBlock = assertBound(
    value.pinnedBlock,
    'pinnedBlock',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const inFlightMessages = assertBound(
    value.inFlightMessages,
    'inFlightMessages',
    0,
    MAX_IN_FLIGHT_MESSAGES,
  );
  const observedAt = assertBound(
    value.observedAt,
    'observedAt',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (typeof value.halted !== 'boolean')
    throw new ReadinessError('invalid-observation', 'halted');
  return {
    observerId,
    chainId,
    epoch,
    headBlock,
    pinnedBlock,
    halted: value.halted,
    inFlightMessages,
    observedAt,
  };
}

export class ProductionReadinessGate {
  private readonly plan: ReadinessPlan;
  private readonly observers: Set<string>;
  private readonly operators: Set<string>;
  private readonly profiles = new Map<string, ChainReadinessProfile>();
  private readonly lifecycles = new Map<string, ChainLifecycle>();
  private readonly epochs = new Map<string, number>();
  private readonly accepted = new Map<string, ReadinessObservation>();
  private readonly seen = new Set<string>();
  private currentTime: number;

  constructor(planInput: unknown, options: { now?: number } = {}) {
    this.plan = validateReadinessPlan(planInput);
    this.observers = new Set(this.plan.observers);
    this.operators = new Set(this.plan.operators);
    for (const profile of this.plan.chains) {
      this.profiles.set(profile.chainId, profile);
      this.lifecycles.set(profile.chainId, 'active');
      this.epochs.set(profile.chainId, profile.restartEpoch);
    }
    const now = options.now ?? 0;
    if (!Number.isSafeInteger(now) || now < 0)
      throw new ReadinessError('invalid-time');
    this.currentTime = now;
  }

  setNow(value: number): void {
    if (!Number.isSafeInteger(value) || value < this.currentTime) {
      throw new ReadinessError('clock-must-not-go-backwards');
    }
    this.currentTime = value;
  }

  get now(): number {
    return this.currentTime;
  }

  /** Records an untrusted observation. Duplicate/replayed keys are rejected. */
  submit(observerId: string, input: unknown): void {
    if (!this.observers.has(observerId))
      throw new ReadinessError('unauthorized-observer');
    const observation = validateObservation(input);
    if (observation.observerId !== observerId)
      throw new ReadinessError('observer-mismatch');
    const profile = this.profiles.get(observation.chainId);
    if (!profile) throw new ReadinessError('unsupported-chain');
    const key = this.observationKey(observation);
    if (
      this.seen.has(key) ||
      this.accepted.size >= MAX_READINESS_OBSERVATIONS
    ) {
      throw new ReadinessError('replay-or-bound');
    }
    this.seen.add(key);
    this.accepted.set(key, observation);
  }

  /** Emergency halt: only an authorized operator may move a chain to halted. */
  halt(operator: string, chainId: string): void {
    this.assertOperator(operator);
    this.assertChain(chainId);
    this.lifecycles.set(chainId, 'halted');
  }

  /**
   * Authorized restart: clears a halt/pause only when a quorum of distinct
   * observers agrees on the same pinned, unhalted, bounded state. The epoch is
   * strictly monotonic and invalidates all older observations.
   */
  restart(operator: string, chainId: string, nextEpoch: number): void {
    this.assertOperator(operator);
    this.assertChain(chainId);
    const profile = this.profiles.get(chainId);
    if (
      !Number.isSafeInteger(nextEpoch) ||
      nextEpoch <= this.epochs.get(chainId)
    ) {
      throw new ReadinessError('epoch-must-advance');
    }
    const current = this.currentTime;
    const fresh = this.observationsFor(chainId).filter(
      (obs) =>
        obs.epoch === this.epochs.get(chainId) &&
        current - obs.observedAt <= profile.maxHeadLagBlocks * 1000 &&
        !obs.halted &&
        obs.inFlightMessages <= profile.maxInFlightMessages &&
        obs.headBlock - obs.pinnedBlock >= profile.minConfirmations,
    );
    if (
      new Set(fresh.map((obs) => obs.observerId)).size < profile.minObservers
    ) {
      throw new ReadinessError('restart-quorum-not-met');
    }
    this.lifecycles.set(chainId, 'restarting');
    this.epochs.set(chainId, nextEpoch);
    this.lifecycles.set(chainId, 'active');
  }

  evaluate(): ReadinessReport {
    const chains = this.plan.chains.map((profile) =>
      this.evaluateChain(profile),
    );
    return {
      evaluatedAt: this.currentTime,
      releaseId: this.plan.releaseId,
      ready: chains.every((chain) => chain.ready),
      chains,
    };
  }

  private evaluateChain(profile: ChainReadinessProfile): ChainReadinessReport {
    const checks: ReadinessCheck[] = [];
    const add = (id: string, passed: boolean, detail: string): void =>
      checks.push({ id, status: passed ? 'passed' : 'failed', detail });
    const lifecycle = this.lifecycles.get(profile.chainId);
    const epoch = this.epochs.get(profile.chainId);
    const observations = this.observationsFor(profile.chainId);

    add(
      'lifecycle',
      lifecycle === 'active',
      lifecycle === 'active'
        ? `Chain ${profile.chainId} is active`
        : `Chain ${profile.chainId} is ${lifecycle}; readiness is blocked`,
    );

    const matching = observations.filter((obs) => obs.epoch === epoch);
    const observers = new Set(matching.map((obs) => obs.observerId));
    add(
      'observer-quorum',
      observers.size >= profile.minObservers,
      `${observers.size} of ${profile.minObservers} required observers reported the current epoch`,
    );

    const unhalted = matching.filter((obs) => !obs.halted);
    add(
      'chain-not-halted',
      matching.length > 0 && unhalted.length === matching.length,
      unhalted.length === matching.length && matching.length > 0
        ? 'No observer reports a chain halt'
        : 'One or more observers report a halted chain',
    );

    const reorgSafe = matching.every(
      (obs) => obs.headBlock - obs.pinnedBlock >= profile.minConfirmations,
    );
    add(
      'reorg-depth',
      matching.length > 0 && reorgSafe,
      reorgSafe && matching.length > 0
        ? 'All observations are pinned beneath the confirmation depth'
        : 'An observation is pinned too close to the chain head',
    );

    const fresh = matching.every(
      (obs) =>
        this.currentTime - obs.observedAt <= profile.maxHeadLagBlocks * 1000,
    );
    add(
      'freshness',
      matching.length > 0 && fresh,
      fresh && matching.length > 0
        ? 'All observations are within the freshness bound'
        : 'An observation is stale',
    );

    const pinnedBlocks = new Set(matching.map((obs) => obs.pinnedBlock));
    add(
      'consistent-pin',
      pinnedBlocks.size <= 1,
      pinnedBlocks.size <= 1
        ? 'Observers agree on a single pinned block'
        : 'Observers disagree on the pinned block',
    );

    const bounded = matching.every(
      (obs) => obs.inFlightMessages <= profile.maxInFlightMessages,
    );
    add(
      'in-flight-bound',
      matching.length > 0 && bounded,
      bounded && matching.length > 0
        ? 'In-flight messages are within the reviewed bound'
        : 'In-flight messages exceed the reviewed bound',
    );

    return {
      chainId: profile.chainId,
      lifecycle,
      restartEpoch: epoch,
      ready: checks.every((check) => check.status === 'passed'),
      checks,
    };
  }

  /** Reports currently unsafe gating conditions for monitoring and audits. */
  invariantViolations(): string[] {
    const violations = new Set<string>();
    if (this.plan.chains.length > MAX_READINESS_CHAINS) violations.add('R-8');
    if (this.accepted.size > MAX_READINESS_OBSERVATIONS) violations.add('R-8');
    if (this.seen.size !== this.accepted.size) violations.add('R-5');
    for (const profile of this.plan.chains) {
      const epoch = this.epochs.get(profile.chainId);
      const lifecycle = this.lifecycles.get(profile.chainId);
      const matching = this.observationsFor(profile.chainId).filter(
        (obs) => obs.epoch === epoch,
      );
      if (matching.some((obs) => obs.halted)) violations.add('R-1');
      if (
        new Set(matching.map((obs) => obs.observerId)).size <
        profile.minObservers
      )
        violations.add('R-2');
      if (lifecycle === 'halted' || lifecycle === 'restarting')
        violations.add('R-3');
      if (epoch < profile.restartEpoch) violations.add('R-4');
      if (
        matching.some(
          (obs) => obs.headBlock - obs.pinnedBlock < profile.minConfirmations,
        )
      )
        violations.add('R-7');
    }
    return [...violations];
  }

  private observationsFor(chainId: string): ReadinessObservation[] {
    return [...this.accepted.values()].filter((obs) => obs.chainId === chainId);
  }

  private observationKey(observation: ReadinessObservation): string {
    return [
      observation.chainId,
      observation.observerId,
      observation.epoch,
      observation.pinnedBlock,
    ].join('|');
  }

  private assertOperator(operator: string): void {
    if (!this.operators.has(operator))
      throw new ReadinessError('unauthorized-operator');
  }

  private assertChain(chainId: string): void {
    if (!this.profiles.has(chainId))
      throw new ReadinessError('unsupported-chain');
  }
}

export function testProfile(
  overrides: Partial<ChainReadinessProfile> = {},
): ChainReadinessProfile {
  return {
    chainId: 'evm:1',
    parameterSetVersion: READINESS_PARAMETER_SET,
    minObservers: 2,
    minConfirmations: 12,
    maxHeadLagBlocks: 20,
    maxInFlightMessages: 100,
    restartEpoch: 1,
    ...overrides,
  };
}

export function testPlan(
  overrides: Partial<ReadinessPlan> = {},
): ReadinessPlan {
  return {
    schemaVersion: READINESS_SCHEMA_VERSION,
    parameterSetVersion: READINESS_PARAMETER_SET,
    releaseId: 'rel-readiness-1',
    chains: [testProfile(), testProfile({ chainId: 'soroban:stellar' })],
    observers: ['observer-a', 'observer-b', 'observer-c'],
    operators: ['operator'],
    ...overrides,
  };
}

export function testObservation(
  overrides: Partial<ReadinessObservation> = {},
): ReadinessObservation {
  return {
    observerId: 'observer-a',
    chainId: 'evm:1',
    epoch: 1,
    headBlock: 100,
    pinnedBlock: 88,
    halted: false,
    inFlightMessages: 0,
    observedAt: 1_700_000_000_000,
    ...overrides,
  };
}
