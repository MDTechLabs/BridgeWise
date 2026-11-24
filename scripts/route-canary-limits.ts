/**
 * Controlled canary limits for newly enabled bridge routes (#1523).
 *
 * Trust model: route identifiers, assets, caps, window lengths and operators
 * come from a checked-in, versioned policy. Amounts and message ids supplied by
 * a relayer are untrusted inputs that are validated and bounded here; no value
 * is inferred from an RPC response. All arithmetic is integer minor units and
 * the active state is bounded so worst-case work never grows with history.
 */

export const CANARY_SCHEMA_VERSION = 1;
export const CANARY_PARAMETER_SET = 'canary/1.0.0';
export const MAX_CANARY_ROUTES = 128;
export const MAX_TRACKED_WINDOWS = 4;
export const MAX_TRANSFER_MINOR_UNITS = 10n ** 30n;

export const CANARY_INVARIANTS = [
  'C-1',
  'C-2',
  'C-3',
  'C-4',
  'C-5',
  'C-6',
  'C-7',
  'C-8',
] as const;
export type CanaryInvariantId = (typeof CANARY_INVARIANTS)[number];

export type RouteStatus = 'new' | 'canary' | 'promoted' | 'rolled-back';

export interface CanaryPolicy {
  readonly routeId: string;
  readonly sourceChain: string;
  readonly destinationChain: string;
  readonly asset: string;
  readonly windowMs: number;
  readonly minWindowMs: number;
  readonly maxTransfersPerWindow: number;
  readonly maxNotionalMinorUnitsPerWindow: string;
  readonly maxTransferMinorUnits: string;
}

export interface CanaryPlan {
  readonly schemaVersion: number;
  readonly parameterSetVersion: string;
  readonly releaseId: string;
  readonly operators: readonly string[];
  readonly routes: readonly CanaryPolicy[];
}

export interface CanaryTransfer {
  readonly messageId: string;
  readonly routeId: string;
  readonly amountMinorUnits: string;
  readonly observedAt: number;
}

export type TransferOutcome = 'accepted' | 'duplicate' | 'rejected';

export interface WindowUsage {
  readonly index: number;
  readonly transfers: number;
  readonly notionalMinorUnits: string;
}

export interface RouteState {
  readonly routeId: string;
  readonly status: RouteStatus;
  readonly canaryStart: number | null;
  readonly windows: readonly WindowUsage[];
}

export interface CanaryCheck {
  readonly id: string;
  readonly status: 'passed' | 'failed';
  readonly detail: string;
}

export class CanaryError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'CanaryError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function positiveInt(
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
    throw new CanaryError('invalid-policy', `invalid ${field}`);
  }
  return value as number;
}

function minorUnits(value: unknown, field: string, allowZero = false): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new CanaryError('invalid-policy', `invalid ${field}`);
  }
  const amount = BigInt(value);
  if ((!allowZero && amount === 0n) || amount > MAX_TRANSFER_MINOR_UNITS) {
    throw new CanaryError('invalid-policy', `invalid ${field}`);
  }
  return amount;
}

function token(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new CanaryError('invalid-policy', `invalid ${field}`);
  }
  return value;
}

export function validateCanaryPlan(value: unknown): CanaryPlan {
  if (!isObject(value)) throw new CanaryError('invalid-plan');
  if (value.schemaVersion !== CANARY_SCHEMA_VERSION)
    throw new CanaryError('unsupported-schema');
  if (value.parameterSetVersion !== CANARY_PARAMETER_SET)
    throw new CanaryError('unsupported-parameter-set');
  token(value.releaseId, 'releaseId', /^rel-[a-z0-9][a-z0-9-]{2,39}$/);
  if (
    !Array.isArray(value.operators) ||
    value.operators.length === 0 ||
    value.operators.length > 32
  ) {
    throw new CanaryError('invalid-plan', 'invalid operators');
  }
  const operators = value.operators.map((op) =>
    token(op, 'operator', /^[a-z0-9][a-z0-9-]{2,63}$/),
  );
  if (new Set(operators).size !== operators.length)
    throw new CanaryError('invalid-plan', 'duplicate operator');
  if (
    !Array.isArray(value.routes) ||
    value.routes.length === 0 ||
    value.routes.length > MAX_CANARY_ROUTES
  ) {
    throw new CanaryError('invalid-routes');
  }
  const routeIds = new Set<string>();
  const routes = value.routes.map((raw) => {
    if (!isObject(raw)) throw new CanaryError('invalid-policy');
    const routeId = token(raw.routeId, 'routeId', /^[a-z0-9][a-z0-9-]{2,63}$/);
    if (routeIds.has(routeId)) throw new CanaryError('duplicate-route');
    routeIds.add(routeId);
    const sourceChain = token(
      raw.sourceChain,
      'sourceChain',
      /^[a-z0-9-]{1,32}$/,
    );
    const destinationChain = token(
      raw.destinationChain,
      'destinationChain',
      /^[a-z0-9-]{1,32}$/,
    );
    if (sourceChain === destinationChain)
      throw new CanaryError('invalid-policy', 'route must cross chains');
    const asset = token(raw.asset, 'asset', /^[A-Z0-9]{2,12}$/);
    const minWindowMs = positiveInt(
      raw.minWindowMs,
      'minWindowMs',
      1,
      90 * 24 * 60 * 60 * 1000,
    );
    const windowMs = positiveInt(
      raw.windowMs,
      'windowMs',
      minWindowMs,
      90 * 24 * 60 * 60 * 1000,
    );
    const maxTransfersPerWindow = positiveInt(
      raw.maxTransfersPerWindow,
      'maxTransfersPerWindow',
      1,
      1_000_000,
    );
    const maxNotionalMinorUnitsPerWindow = minorUnits(
      raw.maxNotionalMinorUnitsPerWindow,
      'maxNotionalMinorUnitsPerWindow',
    );
    const maxTransferMinorUnits = minorUnits(
      raw.maxTransferMinorUnits,
      'maxTransferMinorUnits',
    );
    if (maxTransferMinorUnits > maxNotionalMinorUnitsPerWindow) {
      throw new CanaryError(
        'invalid-policy',
        'per-transfer cap exceeds window cap',
      );
    }
    return {
      routeId,
      sourceChain,
      destinationChain,
      asset,
      windowMs,
      minWindowMs,
      maxTransfersPerWindow,
      maxNotionalMinorUnitsPerWindow: maxNotionalMinorUnitsPerWindow.toString(),
      maxTransferMinorUnits: maxTransferMinorUnits.toString(),
    } satisfies CanaryPolicy;
  });
  return {
    schemaVersion: CANARY_SCHEMA_VERSION,
    parameterSetVersion: CANARY_PARAMETER_SET,
    releaseId: value.releaseId as string,
    operators,
    routes,
  };
}

interface Usage {
  transfers: number;
  notional: bigint;
}

export class CanaryRouteRegistry {
  private readonly plan: CanaryPlan;
  private readonly operators: Set<string>;
  private readonly policies = new Map<string, CanaryPolicy>();
  private readonly statuses = new Map<string, RouteStatus>();
  private readonly starts = new Map<string, number | null>();
  private readonly usage = new Map<string, Map<number, Usage>>();
  private readonly processed = new Set<string>();
  private currentTime: number;

  constructor(planInput: unknown, options: { now?: number } = {}) {
    this.plan = validateCanaryPlan(planInput);
    this.operators = new Set(this.plan.operators);
    for (const policy of this.plan.routes) {
      this.policies.set(policy.routeId, policy);
      this.statuses.set(policy.routeId, 'new');
      this.starts.set(policy.routeId, null);
      this.usage.set(policy.routeId, new Map());
    }
    const now = options.now ?? 0;
    if (!Number.isSafeInteger(now) || now < 0)
      throw new CanaryError('invalid-time');
    this.currentTime = now;
  }

  setNow(value: number): void {
    if (!Number.isSafeInteger(value) || value < this.currentTime) {
      throw new CanaryError('clock-must-not-go-backwards');
    }
    this.currentTime = value;
  }

  get now(): number {
    return this.currentTime;
  }

  activate(operator: string, routeId: string): void {
    this.assertOperator(operator);
    const policy = this.assertRoute(routeId);
    if (this.statuses.get(routeId) !== 'new')
      throw new CanaryError('invalid-transition');
    this.statuses.set(routeId, 'canary');
    this.starts.set(routeId, this.currentTime);
    const window = this.windowIndex(policy, this.currentTime);
    this.bucket(routeId, window);
  }

  /** Idempotent by message id: a replay never mutates counters. */
  submit(input: unknown): TransferOutcome {
    if (!isObject(input)) throw new CanaryError('invalid-transfer');
    const messageId = token(input.messageId, 'messageId', /^[a-f0-9]{64}$/);
    const routeId = token(
      input.routeId,
      'routeId',
      /^[a-z0-9][a-z0-9-]{2,63}$/,
    );
    const policy = this.assertRoute(routeId);
    const amount = minorUnits(input.amountMinorUnits, 'amountMinorUnits');
    const observedAt = positiveInt(
      input.observedAt,
      'observedAt',
      0,
      Number.MAX_SAFE_INTEGER,
    );
    if (this.processed.has(messageId)) return 'duplicate';
    if (observedAt < this.currentTime) throw new CanaryError('stale-transfer');
    if (this.statuses.get(routeId) !== 'canary')
      throw new CanaryError('route-not-canary');
    if (amount > BigInt(policy.maxTransferMinorUnits))
      throw new CanaryError('per-transfer-cap');

    const window = this.windowIndex(policy, observedAt);
    const bucket = this.bucket(routeId, window);
    if (bucket.transfers + 1 > policy.maxTransfersPerWindow)
      throw new CanaryError('transfer-count-cap');
    if (
      bucket.notional + amount >
      BigInt(policy.maxNotionalMinorUnitsPerWindow)
    ) {
      throw new CanaryError('notional-cap');
    }
    this.processed.add(messageId);
    bucket.transfers += 1;
    bucket.notional += amount;
    return 'accepted';
  }

  /** Promotion requires a fully elapsed canary window and no violations. */
  promote(operator: string, routeId: string): void {
    this.assertOperator(operator);
    const policy = this.assertRoute(routeId);
    if (this.statuses.get(routeId) !== 'canary')
      throw new CanaryError('invalid-transition');
    const start = this.starts.get(routeId);
    if (this.currentTime - start < policy.windowMs)
      throw new CanaryError('canary-window-not-elapsed');
    if (this.invariantViolations().some((v) => v === 'C-2' || v === 'C-3')) {
      throw new CanaryError('cap-violation');
    }
    this.statuses.set(routeId, 'promoted');
  }

  rollback(operator: string, routeId: string): void {
    this.assertOperator(operator);
    this.assertRoute(routeId);
    if (this.statuses.get(routeId) !== 'canary')
      throw new CanaryError('invalid-transition');
    this.statuses.set(routeId, 'rolled-back');
  }

  state(routeId: string): RouteState {
    this.assertRoute(routeId);
    const windows = [...this.usage.get(routeId).entries()]
      .sort(([a], [b]) => b - a)
      .map(([index, usage]) => ({
        index,
        transfers: usage.transfers,
        notionalMinorUnits: usage.notional.toString(),
      }));
    return {
      routeId,
      status: this.statuses.get(routeId),
      canaryStart: this.starts.get(routeId),
      windows,
    };
  }

  checks(): CanaryCheck[] {
    const checks: CanaryCheck[] = [];
    const add = (id: string, passed: boolean, detail: string): void =>
      checks.push({ id, status: passed ? 'passed' : 'failed', detail });
    for (const policy of this.plan.routes) {
      const status = this.statuses.get(policy.routeId);
      add(
        `route:${policy.routeId}:status`,
        status === 'canary' || status === 'promoted' || status === 'new',
        `Route ${policy.routeId} is ${status}`,
      );
      const buckets = [...this.usage.get(policy.routeId).values()];
      add(
        `route:${policy.routeId}:notional`,
        buckets.every(
          (b) => b.notional <= BigInt(policy.maxNotionalMinorUnitsPerWindow),
        ),
        'Window notional caps respected',
      );
      add(
        `route:${policy.routeId}:count`,
        buckets.every((b) => b.transfers <= policy.maxTransfersPerWindow),
        'Window transfer-count caps respected',
      );
    }
    return checks;
  }

  invariantViolations(): string[] {
    const violations = new Set<string>();
    if (this.plan.routes.length > MAX_CANARY_ROUTES) violations.add('C-7');
    if (this.processed.size > 1_000_000) violations.add('C-7');
    for (const policy of this.plan.routes) {
      const buckets = this.usage.get(policy.routeId);
      if (buckets.size > MAX_TRACKED_WINDOWS) violations.add('C-7');
      for (const bucket of buckets.values()) {
        if (bucket.transfers > policy.maxTransfersPerWindow)
          violations.add('C-3');
        if (bucket.notional > BigInt(policy.maxNotionalMinorUnitsPerWindow))
          violations.add('C-2');
      }
    }
    if (
      [...this.statuses.values()].includes('rolled-back') &&
      this.checks().some(
        (c) => c.status === 'failed' && c.id.includes('status'),
      )
    ) {
      violations.add('C-4');
    }
    return [...violations];
  }

  private bucket(routeId: string, index: number): Usage {
    const windows = this.usage.get(routeId);
    let bucket = windows.get(index);
    if (!bucket) {
      bucket = { transfers: 0, notional: 0n };
      windows.set(index, bucket);
      while (windows.size > MAX_TRACKED_WINDOWS) {
        windows.delete(Math.min(...windows.keys()));
      }
    }
    return bucket;
  }

  private windowIndex(policy: CanaryPolicy, at: number): number {
    return Math.floor(at / policy.windowMs);
  }

  private assertOperator(operator: string): void {
    if (!this.operators.has(operator))
      throw new CanaryError('unauthorized-operator');
  }

  private assertRoute(routeId: string): CanaryPolicy {
    const policy = this.policies.get(routeId);
    if (!policy) throw new CanaryError('unsupported-route');
    return policy;
  }
}

export function testPolicy(
  overrides: Partial<CanaryPolicy> = {},
): CanaryPolicy {
  return {
    routeId: 'eth-to-sol',
    sourceChain: 'evm-1',
    destinationChain: 'soroban-stellar',
    asset: 'USDC',
    windowMs: 3_600_000,
    minWindowMs: 600_000,
    maxTransfersPerWindow: 5,
    maxNotionalMinorUnitsPerWindow: '1000000',
    maxTransferMinorUnits: '500000',
    ...overrides,
  };
}

export function testCanaryPlan(
  overrides: Partial<CanaryPlan> = {},
): CanaryPlan {
  return {
    schemaVersion: CANARY_SCHEMA_VERSION,
    parameterSetVersion: CANARY_PARAMETER_SET,
    releaseId: 'rel-canary-1',
    operators: ['operator'],
    routes: [testPolicy()],
    ...overrides,
  };
}

export function messageId(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').repeat(8);
}
