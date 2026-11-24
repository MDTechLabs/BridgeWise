/**
 * Executable reference model for Token Adapter Risk, Approval Guard,
 * Malicious Callback Isolation, and Asset Reconciliation.
 *
 * Implements issues:
 *  - #1485 / #1486: Prevent arbitrary token approval growth in adapters
 *  - #1488: Test malicious token callbacks against bridge adapter contracts
 *  - #1489: Add reconciliation for rebasing and fee-on-transfer assets
 *
 * The prose specification is `docs/TOKEN_ADAPTER_RISK_AND_RECONCILIATION_SPEC.md`.
 */

export const TOKEN_ADAPTER_INVARIANTS = [
  'A-1',
  'A-2',
  'A-3',
  'A-4',
  'A-5',
  'A-6',
  'A-7',
  'A-8',
  'A-9',
  'A-10',
] as const;

export type TokenAdapterInvariantId = (typeof TOKEN_ADAPTER_INVARIANTS)[number];

export interface ChainRiskProfile {
  readonly chainId: string;
  readonly parameterSetVersion: string;
  readonly finalityDepth: number;
  readonly reorgWindow: number;
  readonly maxTxAllowanceCap: bigint;
  readonly defaultMaxFotFeeBps: number;
  readonly parameterSource: string;
}

export const RISK_CHAIN_PROFILES: readonly ChainRiskProfile[] = [
  { chainId: 'evm:1', parameterSetVersion: 'asset-risk/1.0.0', finalityDepth: 12, reorgWindow: 64, maxTxAllowanceCap: 10n ** 27n, defaultMaxFotFeeBps: 500, parameterSource: 'asset-risk:1' },
  { chainId: 'evm:137', parameterSetVersion: 'asset-risk/1.0.0', finalityDepth: 128, reorgWindow: 256, maxTxAllowanceCap: 10n ** 27n, defaultMaxFotFeeBps: 500, parameterSource: 'asset-risk:137' },
  { chainId: 'evm:56', parameterSetVersion: 'asset-risk/1.0.0', finalityDepth: 15, reorgWindow: 50, maxTxAllowanceCap: 10n ** 27n, defaultMaxFotFeeBps: 1000, parameterSource: 'asset-risk:56' },
  { chainId: 'evm:42161', parameterSetVersion: 'asset-risk/1.0.0', finalityDepth: 1, reorgWindow: 10, maxTxAllowanceCap: 10n ** 27n, defaultMaxFotFeeBps: 500, parameterSource: 'asset-risk:42161' },
  { chainId: 'evm:10', parameterSetVersion: 'asset-risk/1.0.0', finalityDepth: 1, reorgWindow: 10, maxTxAllowanceCap: 10n ** 27n, defaultMaxFotFeeBps: 500, parameterSource: 'asset-risk:10' },
  { chainId: 'evm:8453', parameterSetVersion: 'asset-risk/1.0.0', finalityDepth: 6, reorgWindow: 20, maxTxAllowanceCap: 10n ** 27n, defaultMaxFotFeeBps: 500, parameterSource: 'asset-risk:8453' },
  { chainId: 'soroban:stellar', parameterSetVersion: 'asset-risk/1.0.0', finalityDepth: 1, reorgWindow: 1, maxTxAllowanceCap: (1n << 63n) - 1n, defaultMaxFotFeeBps: 0, parameterSource: 'asset-risk:stellar' },
];

export class TokenAdapterRiskError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'TokenAdapterRiskError';
  }
}

export interface ApprovalEntry {
  currentAllowance: bigint;
  cumulativeApproved: bigint;
  maxSingleLimit: bigint;
  cumulativeCap: bigint;
  activeTxSpender?: string;
}

export interface ReconciledDeposit {
  depositId: string;
  sender: string;
  token: string;
  nominalAmount: bigint;
  feeDeducted: bigint;
  creditedDelta: bigint;
  destinationChain: string;
  recipient: string;
  timestamp: number;
}

export interface AssetReserveState {
  token: string;
  physicalBalance: bigint;
  recordedLiabilities: bigint;
  driftStatus: 'BALANCED' | 'SURPLUS' | 'SHORTFALL';
  driftAmount: bigint;
}

export interface TokenAdapterRiskModelOptions {
  profiles?: readonly ChainRiskProfile[];
  admin?: string;
  guardian?: string;
  operator?: string;
}

export class TokenAdapterRiskModel {
  public readonly admin: string;
  public readonly guardian: string;
  public readonly operator: string;
  private readonly profiles: Map<string, ChainRiskProfile> = new Map();

  // (token:spender) -> ApprovalEntry
  private allowances: Map<string, ApprovalEntry> = new Map();

  // Reentrancy lock per adapter/context
  private callDepth = 0;
  private isLocked = false;

  // token -> AssetReserveState
  private reserves: Map<string, AssetReserveState> = new Map();

  // depositId -> ReconciledDeposit
  private deposits: Map<string, ReconciledDeposit> = new Map();

  // Replay guard set for processed message / tx IDs
  private consumedMessages: Set<string> = new Set();

  constructor(options: TokenAdapterRiskModelOptions = {}) {
    this.admin = options.admin ?? 'admin';
    this.guardian = options.guardian ?? 'guardian';
    this.operator = options.operator ?? 'operator';

    const profs = options.profiles ?? RISK_CHAIN_PROFILES;
    for (const p of profs) {
      if (p.finalityDepth <= 0 || p.reorgWindow < p.finalityDepth || p.maxTxAllowanceCap <= 0n) {
        throw new TokenAdapterRiskError('invalid-profile-bounds', `Invalid profile bounds for ${p.chainId}`);
      }
      this.profiles.set(p.chainId, p);
    }
  }

  public profileFor(chainId: string): ChainRiskProfile {
    const prof = this.profiles.get(chainId);
    if (!prof) {
      throw new TokenAdapterRiskError('unsupported-chain', `Unsupported chain: ${chainId}`);
    }
    return prof;
  }

  private key(token: string, spender: string): string {
    return `${token.toLowerCase()}:${spender.toLowerCase()}`;
  }

  // -------------------------------------------------------------------------
  // Token Approval Management (#1485, #1486)
  // -------------------------------------------------------------------------

  public configureApprovalCaps(
    caller: string,
    token: string,
    spender: string,
    maxSingleLimit: bigint,
    cumulativeCap: bigint
  ): void {
    if (caller !== this.admin) {
      throw new TokenAdapterRiskError('unauthorized', 'Only admin can configure approval caps');
    }
    if (maxSingleLimit <= 0n || cumulativeCap < maxSingleLimit) {
      throw new TokenAdapterRiskError('invalid-limits', 'Invalid allowance limits');
    }

    const k = this.key(token, spender);
    const existing = this.allowances.get(k) ?? {
      currentAllowance: 0n,
      cumulativeApproved: 0n,
      maxSingleLimit,
      cumulativeCap,
    };

    this.allowances.set(k, {
      ...existing,
      maxSingleLimit,
      cumulativeCap,
    });
  }

  /**
   * Request exact-on-demand approval.
   * Enforces:
   *  - A-1: Exact allowance (never arbitrary uint256.max)
   *  - A-2: Safe reset-before-set if non-zero
   *  - A-3: Single limit and cumulative cap
   */
  public grantExactApproval(
    caller: string,
    token: string,
    spender: string,
    amount: bigint
  ): void {
    this.executeWithReentrancyProtection(() => {
      if (caller !== this.operator && caller !== this.admin) {
        throw new TokenAdapterRiskError('unauthorized', 'Unauthorized caller requesting approval');
      }
      if (amount <= 0n) {
        throw new TokenAdapterRiskError('invalid-amount', 'Approval amount must be positive');
      }

      const k = this.key(token, spender);
      const entry = this.allowances.get(k) ?? {
        currentAllowance: 0n,
        cumulativeApproved: 0n,
        maxSingleLimit: 10n ** 24n, // default 1M tokens
        cumulativeCap: 10n ** 26n,  // default 100M tokens
      };

      // A-3: Check per-tx limit
      if (amount > entry.maxSingleLimit) {
        throw new TokenAdapterRiskError('exceeds-single-limit', `Amount ${amount} exceeds max single limit ${entry.maxSingleLimit}`);
      }

      // A-3: Check cumulative cap
      if (entry.cumulativeApproved + amount > entry.cumulativeCap) {
        throw new TokenAdapterRiskError('exceeds-cumulative-cap', `Approval would exceed cumulative cap ${entry.cumulativeCap}`);
      }

      // A-2: Safe reset before set (simulate zeroing allowance first)
      if (entry.currentAllowance > 0n) {
        // Zeroed first
        entry.currentAllowance = 0n;
      }

      // A-1: Exact allowance set
      entry.currentAllowance = amount;
      entry.cumulativeApproved += amount;
      entry.activeTxSpender = spender;

      this.allowances.set(k, entry);
    });
  }

  /**
   * Post-execution allowance cleanup.
   * Enforces A-4: Any residual allowance on the spender must be zeroed out.
   */
  public sweepAllowanceToZero(caller: string, token: string, spender: string): void {
    this.executeWithReentrancyProtection(() => {
      if (caller !== this.operator && caller !== this.admin) {
        throw new TokenAdapterRiskError('unauthorized', 'Unauthorized caller sweeping allowance');
      }
      const k = this.key(token, spender);
      const entry = this.allowances.get(k);
      if (entry) {
        entry.currentAllowance = 0n;
        entry.activeTxSpender = undefined;
        this.allowances.set(k, entry);
      }
    });
  }

  /**
   * Emergency revocation.
   * Enforces A-5: Admin or Guardian can instantly revoke any allowance to 0.
   */
  public emergencyRevokeAllowance(caller: string, token: string, spender: string): void {
    if (caller !== this.admin && caller !== this.guardian) {
      throw new TokenAdapterRiskError('unauthorized', 'Only admin or guardian can emergency revoke');
    }
    const k = this.key(token, spender);
    const entry = this.allowances.get(k);
    if (entry) {
      entry.currentAllowance = 0n;
      entry.activeTxSpender = undefined;
      this.allowances.set(k, entry);
    }
  }

  public getAllowance(token: string, spender: string): bigint {
    const k = this.key(token, spender);
    return this.allowances.get(k)?.currentAllowance ?? 0n;
  }

  // -------------------------------------------------------------------------
  // Malicious Callback & Reentrancy Isolation (#1488)
  // -------------------------------------------------------------------------

  /**
   * Execute an operation with nonReentrant mutual exclusion guard.
   * Enforces A-6: Any callback trying to reenter fails with reentrancy-denied.
   */
  public executeWithReentrancyProtection<T>(action: () => T): T {
    if (this.isLocked) {
      throw new TokenAdapterRiskError('reentrancy-denied', 'Reentrancy guard locked: reentrant call rejected');
    }
    this.isLocked = true;
    this.callDepth++;
    try {
      return action();
    } finally {
      this.callDepth--;
      this.isLocked = false;
    }
  }

  /**
   * Simulates an external token transfer with a potential callback hook.
   * If callback triggers reentrant action, executeWithReentrancyProtection will catch it.
   */
  public simulateTransferWithCallback(
    from: string,
    to: string,
    amount: bigint,
    callback?: () => void
  ): void {
    this.executeWithReentrancyProtection(() => {
      // Checks & Effects
      if (amount <= 0n) throw new TokenAdapterRiskError('invalid-amount', 'Zero amount transfer');

      // Interaction: execute callback if token has hooks (ERC-777, ERC-1363, fallback)
      if (callback) {
        callback();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Fee-on-Transfer & Rebasing Asset Reconciliation (#1489)
  // -------------------------------------------------------------------------

  /**
   * Reconcile an inbound token deposit.
   * Enforces:
   *  - A-7: Actual balance delta delta = balanceAfter - balanceBefore
   *  - A-8: Zero / sub-minimum delta rejection
   *  - A-10: One-time consumption of deposit message
   */
  public reconcileDeposit(params: {
    messageId: string;
    sender: string;
    token: string;
    nominalAmount: bigint;
    feeBps: number; // e.g. 100 for 1%
    minExpectedDelta: bigint;
    destinationChain: string;
    recipient: string;
    timestamp?: number;
  }): ReconciledDeposit {
    if (this.consumedMessages.has(params.messageId)) {
      throw new TokenAdapterRiskError('duplicate-message', `Message ${params.messageId} already consumed`);
    }

    if (params.nominalAmount <= 0n) {
      throw new TokenAdapterRiskError('zero-amount', 'Nominal amount must be > 0');
    }

    if (params.feeBps < 0 || params.feeBps > 10000) {
      throw new TokenAdapterRiskError('invalid-fee-bps', 'Fee BPS must be between 0 and 10000');
    }

    // Chain profile check
    const chainProf = this.profileFor(params.destinationChain);
    if (params.nominalAmount > chainProf.maxTxAllowanceCap) {
      throw new TokenAdapterRiskError('exceeds-chain-cap', 'Amount exceeds chain maximum bound');
    }

    return this.executeWithReentrancyProtection(() => {
      // Simulate balance delta:
      const feeDeducted = (params.nominalAmount * BigInt(params.feeBps)) / 10000n;
      const creditedDelta = params.nominalAmount - feeDeducted;

      // A-8: Reject zero delta
      if (creditedDelta <= 0n) {
        throw new TokenAdapterRiskError('zero-delta', 'Transfer resulted in zero net balance delta');
      }

      // A-8: Reject sub-minimum delta (slippage / excessive fee)
      if (creditedDelta < params.minExpectedDelta) {
        throw new TokenAdapterRiskError('sub-minimum-delta', `Credited delta ${creditedDelta} below minimum expected ${params.minExpectedDelta}`);
      }

      // Update physical balance & liabilities in reserve
      const reserve = this.reserves.get(params.token) ?? {
        token: params.token,
        physicalBalance: 0n,
        recordedLiabilities: 0n,
        driftStatus: 'BALANCED',
        driftAmount: 0n,
      };

      reserve.physicalBalance += creditedDelta;
      reserve.recordedLiabilities += creditedDelta;
      this.reserves.set(params.token, reserve);

      const record: ReconciledDeposit = {
        depositId: params.messageId,
        sender: params.sender,
        token: params.token,
        nominalAmount: params.nominalAmount,
        feeDeducted,
        creditedDelta,
        destinationChain: params.destinationChain,
        recipient: params.recipient,
        timestamp: params.timestamp ?? Date.now(),
      };

      this.deposits.set(params.messageId, record);
      this.consumedMessages.add(params.messageId);

      return record;
    });
  }

  /**
   * Reconcile rebasing asset balance drift.
   * Enforces A-9: Escrow physical balance must cover recorded liabilities.
   */
  public reconcileRebase(token: string, newPhysicalBalance: bigint): AssetReserveState {
    const reserve = this.reserves.get(token) ?? {
      token,
      physicalBalance: 0n,
      recordedLiabilities: 0n,
      driftStatus: 'BALANCED',
      driftAmount: 0n,
    };

    reserve.physicalBalance = newPhysicalBalance;
    const liabilities = reserve.recordedLiabilities;

    if (newPhysicalBalance === liabilities) {
      reserve.driftStatus = 'BALANCED';
      reserve.driftAmount = 0n;
    } else if (newPhysicalBalance > liabilities) {
      reserve.driftStatus = 'SURPLUS';
      reserve.driftAmount = newPhysicalBalance - liabilities;
    } else {
      reserve.driftStatus = 'SHORTFALL';
      reserve.driftAmount = liabilities - newPhysicalBalance;
    }

    this.reserves.set(token, reserve);
    return reserve;
  }

  // -------------------------------------------------------------------------
  // Invariant Verification
  // -------------------------------------------------------------------------

  public invariantViolations(): string[] {
    const violations: string[] = [];

    // A-1 & A-4: No lingering un-swept allowance on idle spenders
    for (const [key, entry] of this.allowances.entries()) {
      if (entry.currentAllowance < 0n) {
        violations.push(`A-1: negative allowance on ${key}`);
      }
      if (entry.currentAllowance > entry.maxSingleLimit) {
        violations.push(`A-3: current allowance exceeds single limit on ${key}`);
      }
      if (entry.cumulativeApproved > entry.cumulativeCap) {
        violations.push(`A-3: cumulative approvals exceed cap on ${key}`);
      }
    }

    // A-6: Reentrancy lock must be released when idle
    if (this.isLocked || this.callDepth !== 0) {
      violations.push('A-6: reentrancy lock not released');
    }

    // A-9: Solvency invariant (physical balance >= liabilities for balanced/surplus assets)
    for (const [token, reserve] of this.reserves.entries()) {
      if (reserve.driftStatus === 'SHORTFALL') {
        violations.push(`A-9: shortfall detected on token ${token}: deficit of ${reserve.driftAmount}`);
      }
    }

    return violations;
  }

  public snapshot(): string {
    return JSON.stringify({
      allowances: Array.from(this.allowances.entries()),
      reserves: Array.from(this.reserves.entries()),
      deposits: Array.from(this.deposits.entries()),
      consumed: Array.from(this.consumedMessages.values()),
      isLocked: this.isLocked,
      callDepth: this.callDepth,
    });
  }
}
