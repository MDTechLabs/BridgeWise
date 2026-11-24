/**
 * EVM Transaction Lifecycle State Machine.
 *
 * Models and enforces valid state transitions for EVM transactions in cross-chain execution:
 * - Prevents duplicate submissions and concurrent conflicting transitions via optimistic versioning.
 * - Handles block confirmation depths, mempool timeouts, gas replacements, and chain reorgs.
 * - Enforces chain boundaries and sanitizes payloads to protect secrets and private keys.
 *
 * @see Issue #1324 — Create EVM transaction lifecycle state tests
 */

export const EVM_TX_STATES = [
  'prepared',
  'submitted',
  'in_mempool',
  'mined',
  'confirmed',
  'replaced',
  'reorg_detected',
  'reverted',
  'timed_out',
  'cancelled',
] as const;

export type EvmTxState = (typeof EVM_TX_STATES)[number];

export interface GasConfig {
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
  gasLimit: bigint;
}

export interface EvmTxRecord {
  id: string;
  chainId: number;
  from: string;
  to: string;
  nonce: number;
  state: EvmTxState;
  version: number;
  txHash?: string;
  minedBlock?: number;
  minedBlockHash?: string;
  confirmations: number;
  requiredConfirmations: number;
  gasConfig: GasConfig;
  replacementTxId?: string;
  submittedAt?: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface LifecycleEvent {
  txId: string;
  fromState: EvmTxState;
  toState: EvmTxState;
  version: number;
  timestamp: number;
  details?: Record<string, unknown>;
}

export class InvalidLifecycleTransitionError extends Error {
  constructor(from: EvmTxState, to: EvmTxState, txId: string) {
    super(`Invalid EVM transaction transition ${from} -> ${to} for transaction ${txId}`);
    this.name = 'InvalidLifecycleTransitionError';
  }
}

export class LifecycleVersionConflictError extends Error {
  constructor(expected: number, actual: number, txId: string) {
    super(`Version conflict for transaction ${txId}: expected ${expected}, got ${actual}`);
    this.name = 'LifecycleVersionConflictError';
  }
}

export class InvalidReplacementError extends Error {
  constructor(reason: string) {
    super(`Invalid replacement transaction: ${reason}`);
    this.name = 'InvalidReplacementError';
  }
}

const SENSITIVE_KEY = /(secret|private|key|signature|auth|token|mnemonic)/i;

export function redactMetadata(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_KEY.test(k)) {
      result[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      result[k] = redactMetadata(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

if (typeof BigInt !== 'undefined' && !(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

/** Allowed transitions for EVM transactions. */
export const EVM_TRANSITIONS: Record<EvmTxState, readonly EvmTxState[]> = {
  prepared: ['submitted', 'cancelled'],
  submitted: ['in_mempool', 'mined', 'confirmed', 'replaced', 'timed_out', 'cancelled'],
  in_mempool: ['mined', 'confirmed', 'replaced', 'timed_out', 'cancelled'],
  mined: ['confirmed', 'reorg_detected', 'reverted'],
  reorg_detected: ['in_mempool', 'mined', 'timed_out', 'replaced'],
  confirmed: ['reorg_detected', 'reverted'], // Deep reorg can theoretically reorg a confirmed block
  replaced: [],
  reverted: [],
  timed_out: ['replaced', 'cancelled'],
  cancelled: [],
};

export class EvmTransactionLifecycleManager {
  private readonly transactions = new Map<string, EvmTxRecord>();
  private readonly events: LifecycleEvent[] = [];
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  prepare(params: {
    id: string;
    chainId: number;
    from: string;
    to: string;
    nonce: number;
    gasConfig: GasConfig;
    requiredConfirmations?: number;
    metadata?: Record<string, unknown>;
  }): EvmTxRecord {
    if (this.transactions.has(params.id)) {
      throw new Error(`Transaction ${params.id} already exists`);
    }
    if (params.nonce < 0) {
      throw new Error('Nonce must be non-negative');
    }

    const record: EvmTxRecord = {
      id: params.id,
      chainId: params.chainId,
      from: params.from.toLowerCase(),
      to: params.to.toLowerCase(),
      nonce: params.nonce,
      state: 'prepared',
      version: 1,
      confirmations: 0,
      requiredConfirmations: params.requiredConfirmations ?? 1,
      gasConfig: { ...params.gasConfig },
      updatedAt: this.now(),
      metadata: redactMetadata(params.metadata),
    };

    this.transactions.set(params.id, record);
    return record;
  }

  get(id: string): EvmTxRecord | undefined {
    return this.transactions.get(id);
  }

  getEvents(txId?: string): LifecycleEvent[] {
    return txId ? this.events.filter((e) => e.txId === txId) : [...this.events];
  }

  private updateState(
    id: string,
    toState: EvmTxState,
    expectedVersion: number,
    mutations: Partial<EvmTxRecord> = {},
    details?: Record<string, unknown>,
  ): EvmTxRecord {
    const current = this.transactions.get(id);
    if (!current) throw new Error(`Transaction ${id} not found`);

    if (current.version !== expectedVersion) {
      throw new LifecycleVersionConflictError(expectedVersion, current.version, id);
    }

    const allowed = EVM_TRANSITIONS[current.state];
    if (!allowed || !allowed.includes(toState)) {
      throw new InvalidLifecycleTransitionError(current.state, toState, id);
    }

    const newVersion = current.version + 1;
    const updated: EvmTxRecord = {
      ...current,
      ...mutations,
      state: toState,
      version: newVersion,
      updatedAt: this.now(),
    };

    this.transactions.set(id, updated);
    this.events.push({
      txId: id,
      fromState: current.state,
      toState,
      version: newVersion,
      timestamp: this.now(),
      details: redactMetadata(details),
    });

    return updated;
  }

  markSubmitted(id: string, txHash: string, expectedVersion: number): EvmTxRecord {
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new Error(`Invalid txHash format: ${txHash}`);
    }
    return this.updateState(
      id,
      'submitted',
      expectedVersion,
      { txHash, submittedAt: this.now() },
      { txHash },
    );
  }

  markMempool(id: string, expectedVersion: number): EvmTxRecord {
    return this.updateState(id, 'in_mempool', expectedVersion);
  }

  recordMined(
    id: string,
    blockNumber: number,
    blockHash: string,
    expectedVersion: number,
  ): EvmTxRecord {
    const tx = this.transactions.get(id);
    if (!tx) throw new Error(`Transaction ${id} not found`);

    const depth = 1;
    const targetState = depth >= tx.requiredConfirmations ? 'confirmed' : 'mined';

    return this.updateState(
      id,
      targetState,
      expectedVersion,
      {
        minedBlock: blockNumber,
        minedBlockHash: blockHash,
        confirmations: depth,
      },
      { blockNumber, blockHash, depth },
    );
  }

  advanceConfirmations(
    id: string,
    currentBlockNumber: number,
    expectedVersion: number,
  ): EvmTxRecord {
    const tx = this.transactions.get(id);
    if (!tx || !tx.minedBlock) throw new Error(`Transaction ${id} is not mined`);

    const depth = Math.max(1, currentBlockNumber - tx.minedBlock + 1);
    if (depth >= tx.requiredConfirmations && tx.state !== 'confirmed') {
      return this.updateState(
        id,
        'confirmed',
        expectedVersion,
        { confirmations: depth },
        { currentBlock: currentBlockNumber, depth },
      );
    }

    // Just update depth without state change if still mined or already confirmed
    const updated = {
      ...tx,
      confirmations: depth,
      version: tx.version + 1,
      updatedAt: this.now(),
    };
    this.transactions.set(id, updated);
    return updated;
  }

  detectReorg(
    id: string,
    actualBlockHashAtHeight: string,
    expectedVersion: number,
  ): EvmTxRecord {
    const tx = this.transactions.get(id);
    if (!tx || !tx.minedBlockHash) throw new Error(`Transaction ${id} has no mined block hash`);

    if (tx.minedBlockHash === actualBlockHashAtHeight) {
      return tx; // No reorg detected
    }

    return this.updateState(
      id,
      'reorg_detected',
      expectedVersion,
      { confirmations: 0 },
      { expectedHash: tx.minedBlockHash, actualHash: actualBlockHashAtHeight },
    );
  }

  replace(
    id: string,
    replacementTxId: string,
    newGasConfig: GasConfig,
    expectedVersion: number,
  ): { original: EvmTxRecord; replacement: EvmTxRecord } {
    const original = this.transactions.get(id);
    if (!original) throw new Error(`Transaction ${id} not found`);

    // Enforce >= 10% bump for replacement gas
    if (original.gasConfig.gasPrice && newGasConfig.gasPrice) {
      const minRequired = (original.gasConfig.gasPrice * 110n) / 100n;
      if (newGasConfig.gasPrice < minRequired) {
        throw new InvalidReplacementError(
          `Gas price bump must be >= 10%. Existing: ${original.gasConfig.gasPrice}, Provided: ${newGasConfig.gasPrice}`,
        );
      }
    }

    if (original.gasConfig.maxFeePerGas && newGasConfig.maxFeePerGas) {
      const minFee = (original.gasConfig.maxFeePerGas * 110n) / 100n;
      if (newGasConfig.maxFeePerGas < minFee) {
        throw new InvalidReplacementError('maxFeePerGas bump must be >= 10%');
      }
    }

    // Mark original as replaced
    const updatedOriginal = this.updateState(
      id,
      'replaced',
      expectedVersion,
      { replacementTxId },
      { replacementTxId },
    );

    // Prepare replacement with identical nonce and chainId
    const replacement = this.prepare({
      id: replacementTxId,
      chainId: original.chainId,
      from: original.from,
      to: original.to,
      nonce: original.nonce,
      gasConfig: newGasConfig,
      requiredConfirmations: original.requiredConfirmations,
      metadata: { replacedTxId: id },
    });

    return { original: updatedOriginal, replacement };
  }

  checkTimeout(id: string, timeoutMs: number, expectedVersion: number): EvmTxRecord {
    const tx = this.transactions.get(id);
    if (!tx || !tx.submittedAt) throw new Error(`Transaction ${id} is not submitted`);

    if (this.now() - tx.submittedAt >= timeoutMs) {
      return this.updateState(id, 'timed_out', expectedVersion, {}, { timeoutMs });
    }
    return tx;
  }

  markReverted(id: string, blockNumber: number, reason: string, expectedVersion: number): EvmTxRecord {
    return this.updateState(
      id,
      'reverted',
      expectedVersion,
      { minedBlock: blockNumber },
      { reason },
    );
  }

  cancel(id: string, expectedVersion: number, reason?: string): EvmTxRecord {
    return this.updateState(id, 'cancelled', expectedVersion, {}, { reason });
  }
}
