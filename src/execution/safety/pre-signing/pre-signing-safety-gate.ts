export const PRE_SIGNING_CHECKS = [
  'balance',
  'allowance',
  'route_validity',
  'limits',
  'provider_health',
  'quote_freshness',
] as const;

export type PreSigningCheckName = (typeof PRE_SIGNING_CHECKS)[number];

export type PreSigningCheck<TContext> = (context: TContext) => Promise<void>;

export interface PreSigningCheckSet<TContext> {
  /** Reject unless the source and fee balances cover the exact required amounts. */
  balance(context: TContext): Promise<void>;
  /** Reject unless the token allowance covers the exact amount and spender. */
  allowance(context: TContext): Promise<void>;
  /** Reject unless the selected route is still valid for this transfer. */
  routeValidity(context: TContext): Promise<void>;
  /** Reject when amount, fee, slippage, or execution resource limits are exceeded. */
  limits(context: TContext): Promise<void>;
  /** Reject unless the selected provider and route are currently available. */
  providerHealth(context: TContext): Promise<void>;
  /** Reject if the quote is expired or outside the configured freshness window. */
  quoteFreshness(context: TContext): Promise<void>;
}

export interface PreSigningCheckResult {
  check: PreSigningCheckName;
  passed: boolean;
  code?: string;
}

export interface PreSigningGateResult<TSigned> {
  signed: TSigned;
  checkedAt: number;
  checks: PreSigningCheckResult[];
}

export interface PreSigningSafetyGateOptions {
  now?: () => number;
  /** Receives bounded check names and outcomes only; never receives request data. */
  onCheckComplete?: (event: {
    check: PreSigningCheckName;
    passed: boolean;
    code?: string;
  }) => void;
}

/**
 * Stable, non-sensitive failure raised by an injected readiness check.
 * Avoid including wallet addresses, amounts, quotes, or transaction data.
 */
export class PreSigningCheckError extends Error {
  public readonly code: string;

  constructor(code: string) {
    super('Pre-signing safety check failed.');
    this.name = 'PreSigningCheckError';
    this.code = /^[A-Z][A-Z0-9_]{0,63}$/.test(code)
      ? code
      : 'PRECONDITION_FAILED';
  }
}

export class PreSigningBlockedError extends Error {
  constructor(public readonly failures: PreSigningCheckResult[]) {
    super(
      `Signing blocked by pre-signing checks: ${failures.map(({ check }) => check).join(', ')}.`,
    );
    this.name = 'PreSigningBlockedError';
  }
}

/**
 * Mandatory fail-closed boundary for callers that control a signer. Every
 * check must be wired; an unavailable or throwing check blocks signing. Quote
 * freshness is evaluated last so it is as close as possible to the signer call.
 */
export class PreSigningSafetyGate<TContext> {
  private readonly now: () => number;

  constructor(
    private readonly checks: PreSigningCheckSet<TContext>,
    private readonly options: PreSigningSafetyGateOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  async sign<TSigned>(
    context: TContext,
    signer: (context: TContext) => Promise<TSigned>,
  ): Promise<PreSigningGateResult<TSigned>> {
    if (!Number.isFinite(this.now())) {
      throw new RangeError('Pre-signing clock must return a finite timestamp.');
    }

    const orderedChecks: Array<
      [PreSigningCheckName, PreSigningCheck<TContext>]
    > = [
      ['balance', (value) => this.checks.balance(value)],
      ['allowance', (value) => this.checks.allowance(value)],
      ['route_validity', (value) => this.checks.routeValidity(value)],
      ['limits', (value) => this.checks.limits(value)],
      ['provider_health', (value) => this.checks.providerHealth(value)],
      ['quote_freshness', (value) => this.checks.quoteFreshness(value)],
    ];
    const results: PreSigningCheckResult[] = [];

    for (const [check, verify] of orderedChecks) {
      try {
        await verify(context);
        const result = { check, passed: true };
        results.push(result);
        this.notify(result);
      } catch (error) {
        const result: PreSigningCheckResult = {
          check,
          passed: false,
          code:
            error instanceof PreSigningCheckError
              ? error.code
              : 'CHECK_UNAVAILABLE',
        };
        results.push(result);
        this.notify(result);
      }
    }

    const failures = results.filter(({ passed }) => !passed);
    if (failures.length > 0) {
      throw new PreSigningBlockedError(failures);
    }

    const checkedAt = this.now();
    if (!Number.isFinite(checkedAt)) {
      throw new RangeError('Pre-signing clock must return a finite timestamp.');
    }
    const signed = await signer(context);
    return { signed, checkedAt, checks: results };
  }

  private notify(result: PreSigningCheckResult): void {
    try {
      this.options.onCheckComplete?.({ ...result });
    } catch {
      // Observability callbacks must never weaken or interrupt the signing gate.
    }
  }
}
