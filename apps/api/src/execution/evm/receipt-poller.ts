/**
 * EVM Transaction Receipt Polling Engine with Jitter and Backoff.
 *
 * Implements resilient, chain-aware transaction receipt polling for cross-chain execution:
 * - Exponential backoff with configurable jitter algorithms (proportional, full, equal, decorrelated)
 *   to avoid RPC rate limits and thundering-herd synchronization.
 * - Idempotent poller registry: prevents duplicate concurrent requests or conflicting transitions.
 * - Preserves chain boundaries with chain ID validation and chain-specific block/confirmation profiles.
 * - Treats RPC responses as untrusted inputs with strict structural validation.
 * - Handles confirmation depths, timeouts, transaction replacements, and chain reorgs.
 * - Exposes actionable metrics and operator escalation paths while redacting secrets and keys.
 * - Integrates with EvmTransactionLifecycleManager for auditable, conflict-free state transitions.
 *
 * @see Issue #1321 — Add receipt polling jitter and backoff
 */

import {
  EvmTransactionLifecycleManager,
  EvmTxRecord,
} from './evm-transaction-lifecycle';

export type JitterStrategy = 'proportional' | 'full' | 'equal' | 'decorrelated';

export type ReceiptPollingState =
  | 'pending'
  | 'polling'
  | 'confirming'
  | 'confirmed'
  | 'reverted'
  | 'replaced'
  | 'reorg_detected'
  | 'timed_out'
  | 'failed';

export interface ChainPollingProfile {
  chainId: number;
  chainName: string;
  initialIntervalMs: number;
  maxIntervalMs: number;
  backoffMultiplier: number;
  jitterRatio: number;
  jitterStrategy: JitterStrategy;
  requiredConfirmations: number;
  timeoutMs: number;
  maxAttempts: number;
}

export const DEFAULT_CHAIN_POLLING_PROFILES: Record<number, ChainPollingProfile> = {
  // Ethereum Mainnet (12s blocks, deeper finality)
  1: {
    chainId: 1,
    chainName: 'Ethereum Mainnet',
    initialIntervalMs: 4000,
    maxIntervalMs: 16000,
    backoffMultiplier: 1.5,
    jitterRatio: 0.25,
    jitterStrategy: 'proportional',
    requiredConfirmations: 12,
    timeoutMs: 300000, // 5 min
    maxAttempts: 40,
  },
  // Arbitrum One (L2 sequencer, sub-second to 2s)
  42161: {
    chainId: 42161,
    chainName: 'Arbitrum One',
    initialIntervalMs: 800,
    maxIntervalMs: 4000,
    backoffMultiplier: 1.5,
    jitterRatio: 0.2,
    jitterStrategy: 'proportional',
    requiredConfirmations: 1,
    timeoutMs: 60000,
    maxAttempts: 30,
  },
  // Optimism (L2, 2s blocks)
  10: {
    chainId: 10,
    chainName: 'Optimism',
    initialIntervalMs: 1000,
    maxIntervalMs: 5000,
    backoffMultiplier: 1.5,
    jitterRatio: 0.2,
    jitterStrategy: 'proportional',
    requiredConfirmations: 1,
    timeoutMs: 60000,
    maxAttempts: 30,
  },
  // Base (L2, 2s blocks)
  8453: {
    chainId: 8453,
    chainName: 'Base',
    initialIntervalMs: 1000,
    maxIntervalMs: 5000,
    backoffMultiplier: 1.5,
    jitterRatio: 0.2,
    jitterStrategy: 'proportional',
    requiredConfirmations: 2,
    timeoutMs: 60000,
    maxAttempts: 30,
  },
  // Polygon PoS (2s blocks, deeper reorg window)
  137: {
    chainId: 137,
    chainName: 'Polygon PoS',
    initialIntervalMs: 2000,
    maxIntervalMs: 10000,
    backoffMultiplier: 1.6,
    jitterRatio: 0.2,
    jitterStrategy: 'proportional',
    requiredConfirmations: 64,
    timeoutMs: 300000,
    maxAttempts: 50,
  },
  // BNB Chain (3s blocks)
  56: {
    chainId: 56,
    chainName: 'BNB Smart Chain',
    initialIntervalMs: 2000,
    maxIntervalMs: 8000,
    backoffMultiplier: 1.5,
    jitterRatio: 0.2,
    jitterStrategy: 'proportional',
    requiredConfirmations: 15,
    timeoutMs: 120000,
    maxAttempts: 35,
  },
};

export const FALLBACK_POLLING_PROFILE: ChainPollingProfile = {
  chainId: 0,
  chainName: 'Generic EVM Chain',
  initialIntervalMs: 1500,
  maxIntervalMs: 10000,
  backoffMultiplier: 1.5,
  jitterRatio: 0.2,
  jitterStrategy: 'proportional',
  requiredConfirmations: 1,
  timeoutMs: 120000,
  maxAttempts: 30,
};

export interface EvmTransactionReceipt {
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  status: 0 | 1;
  gasUsed?: bigint;
  effectiveGasPrice?: bigint;
  logs?: unknown[];
}

export interface ReceiptPollingOptions {
  chainId?: number;
  initialIntervalMs?: number;
  maxIntervalMs?: number;
  backoffMultiplier?: number;
  jitterRatio?: number;
  jitterStrategy?: JitterStrategy;
  requiredConfirmations?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  checkReplacement?: (txHash: string) => Promise<string | null>;
  lifecycleManager?: EvmTransactionLifecycleManager;
  txRecordId?: string;
  onPollAttempt?: (info: PollAttemptTelemetry) => void;
  onConfirmationProgress?: (current: number, required: number, blockNumber: number) => void;
  onEscalation?: (escalation: OperatorEscalationEvent) => void;
}

export interface PollAttemptTelemetry {
  chainId: number;
  txHash: string;
  attempt: number;
  delayMs: number;
  elapsedMs: number;
  rawIntervalMs: number;
  jitterMs: number;
}

export interface OperatorEscalationEvent {
  alertType: 'POLLING_TIMEOUT' | 'PERSISTENT_RPC_FAILURE' | 'REVERTED_TRANSACTION' | 'REORG_DETECTED';
  chainId: number;
  txHash: string;
  attempts: number;
  elapsedMs: number;
  reason: string;
  timestamp: number;
}

export interface ReceiptPollingOutcome {
  status: ReceiptPollingState;
  transactionHash: string;
  chainId: number;
  receipt?: EvmTransactionReceipt;
  attempts: number;
  elapsedMs: number;
  confirmations: number;
  requiredConfirmations: number;
  replacedByTxHash?: string;
  errorReason?: string;
  escalationRequired: boolean;
  lifecycleRecord?: EvmTxRecord;
}

export interface EvmProviderLike {
  getTransactionReceipt(txHash: string): Promise<unknown>;
  getBlockNumber(): Promise<number>;
  getNetwork?(): Promise<{ chainId: bigint | number }>;
}

export class InvalidTransactionHashError extends Error {
  constructor(txHash: string) {
    super(`Invalid EVM transaction hash format: "${txHash}". Expected 32-byte 0x-prefixed hex string.`);
    this.name = 'InvalidTransactionHashError';
  }
}

export class MalformedReceiptError extends Error {
  constructor(reason: string) {
    super(`Untrusted RPC returned malformed receipt: ${reason}`);
    this.name = 'MalformedReceiptError';
  }
}

export class ChainBoundaryMismatchError extends Error {
  constructor(expectedChainId: number, actualChainId: number) {
    super(`Chain boundary violation: expected chainId ${expectedChainId}, but RPC is connected to chainId ${actualChainId}.`);
    this.name = 'ChainBoundaryMismatchError';
  }
}

const SENSITIVE_KEY_PATTERN = /(secret|private|key|signature|auth|token|mnemonic|bearer|credential)/i;

/**
 * Recursively redacts sensitive credentials, private keys, and secrets from telemetry and logs.
 */
export function redactSensitiveData<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item)) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveData(value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Sanitizes RPC endpoint URLs by scrubbing embedded tokens, basic-auth, or credentials.
 */
export function sanitizeRpcUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = 'REDACTED';
    if (parsed.username) parsed.username = 'REDACTED';
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        parsed.searchParams.set(key, 'REDACTED');
      }
    }
    return decodeURIComponent(parsed.toString()).replace(/REDACTED/g, '[REDACTED]');
  } catch {
    return url.replace(/([?&][^=]+)=([^&]+)/g, '$1=[REDACTED]');
  }
}

/**
 * Validates and normalizes an untrusted JSON-RPC transaction receipt.
 */
export function validateReceipt(receipt: unknown, expectedTxHash: string): EvmTransactionReceipt {
  if (!receipt || typeof receipt !== 'object') {
    throw new MalformedReceiptError('Receipt payload must be a non-null object');
  }

  const r = receipt as Record<string, unknown>;

  if (typeof r.transactionHash !== 'string' || r.transactionHash.toLowerCase() !== expectedTxHash.toLowerCase()) {
    throw new MalformedReceiptError(`Receipt transactionHash mismatch: expected ${expectedTxHash}, got ${r.transactionHash}`);
  }

  let blockNumber: number;
  if (typeof r.blockNumber === 'number') {
    blockNumber = r.blockNumber;
  } else if (typeof r.blockNumber === 'string') {
    blockNumber = Number.parseInt(r.blockNumber, 16);
  } else {
    throw new MalformedReceiptError('Receipt blockNumber is missing or not a valid number');
  }

  if (!Number.isFinite(blockNumber) || blockNumber < 0) {
    throw new MalformedReceiptError(`Invalid blockNumber value: ${r.blockNumber}`);
  }

  if (typeof r.blockHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(r.blockHash)) {
    throw new MalformedReceiptError(`Invalid blockHash format: ${r.blockHash}`);
  }

  let status: 0 | 1;
  if (r.status === 1 || r.status === '0x1' || r.status === '1' || r.status === true) {
    status = 1;
  } else if (r.status === 0 || r.status === '0x0' || r.status === '0' || r.status === false) {
    status = 0;
  } else {
    throw new MalformedReceiptError(`Invalid transaction execution status: ${r.status}`);
  }

  let gasUsed: bigint | undefined;
  if (r.gasUsed !== undefined && r.gasUsed !== null) {
    try {
      gasUsed = BigInt(r.gasUsed as any);
    } catch {
      gasUsed = undefined;
    }
  }

  let effectiveGasPrice: bigint | undefined;
  if (r.effectiveGasPrice !== undefined && r.effectiveGasPrice !== null) {
    try {
      effectiveGasPrice = BigInt(r.effectiveGasPrice as any);
    } catch {
      effectiveGasPrice = undefined;
    }
  }

  return {
    transactionHash: r.transactionHash.toLowerCase(),
    blockNumber,
    blockHash: r.blockHash.toLowerCase(),
    status,
    gasUsed,
    effectiveGasPrice,
    logs: Array.isArray(r.logs) ? r.logs : [],
  };
}

/**
 * Calculates exponential backoff with deterministic or randomized jitter.
 */
export function calculateBackoffWithJitter(
  attempt: number,
  params: {
    initialIntervalMs: number;
    maxIntervalMs: number;
    backoffMultiplier: number;
    jitterRatio: number;
    jitterStrategy: JitterStrategy;
  },
  randomFn: () => number = Math.random,
  previousDelayMs?: number,
): { delayMs: number; rawIntervalMs: number; jitterMs: number } {
  const safeAttempt = Math.max(0, attempt);
  const rawInterval = Math.min(
    params.maxIntervalMs,
    Math.round(params.initialIntervalMs * Math.pow(params.backoffMultiplier, safeAttempt)),
  );

  let delayMs: number;
  let jitterMs = 0;

  switch (params.jitterStrategy) {
    case 'full': {
      delayMs = Math.round(randomFn() * rawInterval);
      jitterMs = delayMs - rawInterval;
      break;
    }
    case 'equal': {
      const half = rawInterval / 2;
      jitterMs = Math.round(randomFn() * half);
      delayMs = Math.round(half + jitterMs);
      break;
    }
    case 'decorrelated': {
      const prev = previousDelayMs ?? params.initialIntervalMs;
      delayMs = Math.min(
        params.maxIntervalMs,
        Math.round(params.initialIntervalMs + randomFn() * (prev * 3 - params.initialIntervalMs)),
      );
      jitterMs = delayMs - rawInterval;
      break;
    }
    case 'proportional':
    default: {
      const maxJitter = rawInterval * params.jitterRatio;
      jitterMs = Math.round((randomFn() * 2 - 1) * maxJitter);
      delayMs = Math.max(0, Math.min(params.maxIntervalMs, Math.round(rawInterval + jitterMs)));
      break;
    }
  }

  return {
    delayMs: Math.max(10, delayMs),
    rawIntervalMs: rawInterval,
    jitterMs,
  };
}

/**
 * EVM Transaction Receipt Poller with exponential backoff and jitter.
 */
export class EVMReceiptPoller {
  private readonly activePollers = new Map<string, Promise<ReceiptPollingOutcome>>();
  private readonly chainProfiles = new Map<number, ChainPollingProfile>();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(dependencies?: {
    customProfiles?: ChainPollingProfile[];
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
  }) {
    // Load default profiles
    for (const [chainId, profile] of Object.entries(DEFAULT_CHAIN_POLLING_PROFILES)) {
      this.chainProfiles.set(Number(chainId), profile);
    }
    // Load overrides if provided
    if (dependencies?.customProfiles) {
      for (const profile of dependencies.customProfiles) {
        this.chainProfiles.set(profile.chainId, profile);
      }
    }

    this.now = dependencies?.now ?? Date.now;
    this.sleep = dependencies?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = dependencies?.random ?? Math.random;
  }

  /**
   * Retrieves the configured polling profile for a chain ID, with safe fallback.
   */
  public getProfile(chainId: number): ChainPollingProfile {
    return this.chainProfiles.get(chainId) ?? { ...FALLBACK_POLLING_PROFILE, chainId };
  }

  /**
   * Polls for an EVM transaction receipt with exponential backoff and jitter. (#1321)
   *
   * Enforces idempotency: concurrent calls for the same (chainId, txHash) reuse the in-flight promise.
   */
  public async poll(
    provider: EvmProviderLike,
    txHash: string,
    options?: Partial<ReceiptPollingOptions>,
  ): Promise<ReceiptPollingOutcome> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new InvalidTransactionHashError(txHash);
    }

    const normalizedHash = txHash.toLowerCase();
    const chainId = options?.chainId ?? 1;
    const idempotencyKey = `${chainId}:${normalizedHash}`;

    // Prevent duplicate concurrent polling loops for the same transaction
    const existing = this.activePollers.get(idempotencyKey);
    if (existing) {
      return existing;
    }

    const pollingPromise = this.executePolling(provider, normalizedHash, chainId, options).finally(() => {
      this.activePollers.delete(idempotencyKey);
    });

    this.activePollers.set(idempotencyKey, pollingPromise);
    return pollingPromise;
  }

  private async executePolling(
    provider: EvmProviderLike,
    txHash: string,
    chainId: number,
    options?: Partial<ReceiptPollingOptions>,
  ): Promise<ReceiptPollingOutcome> {
    const profile = this.getProfile(chainId);

    const initialIntervalMs = options?.initialIntervalMs ?? profile.initialIntervalMs;
    const maxIntervalMs = options?.maxIntervalMs ?? profile.maxIntervalMs;
    const backoffMultiplier = options?.backoffMultiplier ?? profile.backoffMultiplier;
    const jitterRatio = options?.jitterRatio ?? profile.jitterRatio;
    const jitterStrategy = options?.jitterStrategy ?? profile.jitterStrategy;
    const requiredConfirmations = Math.max(1, options?.requiredConfirmations ?? profile.requiredConfirmations);
    const timeoutMs = options?.timeoutMs ?? profile.timeoutMs;
    const maxAttempts = options?.maxAttempts ?? profile.maxAttempts;

    const startTime = this.now();
    let attempt = 0;
    let consecutiveRpcErrors = 0;
    let previousDelayMs = initialIntervalMs;

    // Optional chain boundary verification if provider exposes network
    if (provider.getNetwork) {
      try {
        const net = await provider.getNetwork();
        const detectedChainId = Number(net.chainId);
        if (detectedChainId !== chainId) {
          throw new ChainBoundaryMismatchError(chainId, detectedChainId);
        }
      } catch (err) {
        if (err instanceof ChainBoundaryMismatchError) throw err;
      }
    }

    let initialMinedReceipt: EvmTransactionReceipt | undefined;
    let lifecycleRecord: EvmTxRecord | undefined;
    const lifecycle = options?.lifecycleManager;
    const txRecordId = options?.txRecordId;

    while (attempt < maxAttempts) {
      const elapsed = this.now() - startTime;
      if (elapsed >= timeoutMs) {
        const escalation: OperatorEscalationEvent = {
          alertType: 'POLLING_TIMEOUT',
          chainId,
          txHash,
          attempts: attempt,
          elapsedMs: elapsed,
          reason: `Receipt polling timed out after ${elapsed}ms (${attempt} attempts)`,
          timestamp: this.now(),
        };
        options?.onEscalation?.(escalation);

        if (lifecycle && txRecordId) {
          try {
            const currentRec = lifecycle.get(txRecordId);
            if (currentRec) {
              lifecycleRecord = lifecycle.checkTimeout(txRecordId, timeoutMs, currentRec.version);
            }
          } catch {
            // Concurrency safe
          }
        }

        return {
          status: 'timed_out',
          transactionHash: txHash,
          chainId,
          attempts: attempt,
          elapsedMs: elapsed,
          confirmations: 0,
          requiredConfirmations,
          errorReason: `Polling timed out after ${elapsed}ms`,
          escalationRequired: true,
          lifecycleRecord,
        };
      }

      attempt++;

      // Check if transaction was replaced
      if (options?.checkReplacement) {
        try {
          const replacementHash = await options.checkReplacement(txHash);
          if (replacementHash && replacementHash.toLowerCase() !== txHash) {
            return {
              status: 'replaced',
              transactionHash: txHash,
              chainId,
              attempts: attempt,
              elapsedMs: this.now() - startTime,
              confirmations: 0,
              requiredConfirmations,
              replacedByTxHash: replacementHash.toLowerCase(),
              escalationRequired: false,
              lifecycleRecord,
            };
          }
        } catch {
          // Non-fatal check
        }
      }

      // Query transaction receipt from RPC
      let rawReceipt: unknown = null;
      try {
        rawReceipt = await provider.getTransactionReceipt(txHash);
        consecutiveRpcErrors = 0;
      } catch (rpcError: any) {
        consecutiveRpcErrors++;
        if (consecutiveRpcErrors >= 5) {
          const escalation: OperatorEscalationEvent = {
            alertType: 'PERSISTENT_RPC_FAILURE',
            chainId,
            txHash,
            attempts: attempt,
            elapsedMs: this.now() - startTime,
            reason: `Persistent RPC errors (${consecutiveRpcErrors} consecutive): ${rpcError?.message || 'Unknown RPC failure'}`,
            timestamp: this.now(),
          };
          options?.onEscalation?.(escalation);
        }
      }

      if (rawReceipt) {
        const validatedReceipt = validateReceipt(rawReceipt, txHash);

        // Terminal revert check
        if (validatedReceipt.status === 0) {
          const elapsedMs = this.now() - startTime;
          const escalation: OperatorEscalationEvent = {
            alertType: 'REVERTED_TRANSACTION',
            chainId,
            txHash,
            attempts: attempt,
            elapsedMs,
            reason: `Transaction reverted in block ${validatedReceipt.blockNumber} (${validatedReceipt.blockHash})`,
            timestamp: this.now(),
          };
          options?.onEscalation?.(escalation);

          if (lifecycle && txRecordId) {
            try {
              const currentRec = lifecycle.get(txRecordId);
              if (currentRec) {
                lifecycleRecord = lifecycle.markReverted(
                  txRecordId,
                  validatedReceipt.blockNumber,
                  'Transaction execution reverted',
                  currentRec.version,
                );
              }
            } catch {
              // Concurrency safe
            }
          }

          return {
            status: 'reverted',
            transactionHash: txHash,
            chainId,
            receipt: validatedReceipt,
            attempts: attempt,
            elapsedMs,
            confirmations: 1,
            requiredConfirmations,
            errorReason: 'Transaction reverted on chain',
            escalationRequired: true,
            lifecycleRecord,
          };
        }

        if (!initialMinedReceipt) {
          initialMinedReceipt = validatedReceipt;
          if (lifecycle && txRecordId) {
            try {
              const currentRec = lifecycle.get(txRecordId);
              if (currentRec) {
                lifecycleRecord = lifecycle.recordMined(
                  txRecordId,
                  validatedReceipt.blockNumber,
                  validatedReceipt.blockHash,
                  currentRec.version,
                );
              }
            } catch {
              // Concurrency safe
            }
          }
        } else {
          // Reorg detection: verify that block number and block hash remain unchanged
          if (
            validatedReceipt.blockNumber !== initialMinedReceipt.blockNumber ||
            validatedReceipt.blockHash !== initialMinedReceipt.blockHash
          ) {
            const elapsedMs = this.now() - startTime;
            const escalation: OperatorEscalationEvent = {
              alertType: 'REORG_DETECTED',
              chainId,
              txHash,
              attempts: attempt,
              elapsedMs,
              reason: `Reorg detected! Mined block hash changed from ${initialMinedReceipt.blockHash} to ${validatedReceipt.blockHash}`,
              timestamp: this.now(),
            };
            options?.onEscalation?.(escalation);

            if (lifecycle && txRecordId) {
              try {
                const currentRec = lifecycle.get(txRecordId);
                if (currentRec) {
                  lifecycleRecord = lifecycle.detectReorg(
                    txRecordId,
                    validatedReceipt.blockHash,
                    currentRec.version,
                  );
                }
              } catch {
                // Concurrency safe
              }
            }

            return {
              status: 'reorg_detected',
              transactionHash: txHash,
              chainId,
              receipt: validatedReceipt,
              attempts: attempt,
              elapsedMs,
              confirmations: 0,
              requiredConfirmations,
              errorReason: 'Chain reorganization invalidated previous mined receipt',
              escalationRequired: true,
              lifecycleRecord,
            };
          }
        }

        // Check confirmation depth
        let currentBlock: number;
        try {
          currentBlock = await provider.getBlockNumber();
        } catch {
          currentBlock = validatedReceipt.blockNumber;
        }

        const currentConfirmations = Math.max(1, currentBlock - validatedReceipt.blockNumber + 1);
        options?.onConfirmationProgress?.(currentConfirmations, requiredConfirmations, currentBlock);

        if (lifecycle && txRecordId && currentConfirmations > 1) {
          try {
            const currentRec = lifecycle.get(txRecordId);
            if (currentRec && (currentRec.state === 'mined' || currentRec.state === 'confirmed')) {
              lifecycleRecord = lifecycle.advanceConfirmations(txRecordId, currentBlock, currentRec.version);
            }
          } catch {
            // Concurrency safe
          }
        }

        if (currentConfirmations >= requiredConfirmations) {
          return {
            status: 'confirmed',
            transactionHash: txHash,
            chainId,
            receipt: validatedReceipt,
            attempts: attempt,
            elapsedMs: this.now() - startTime,
            confirmations: currentConfirmations,
            requiredConfirmations,
            escalationRequired: false,
            lifecycleRecord,
          };
        }
      } else if (initialMinedReceipt) {
        // Receipt was previously observed, but is now null -> Reorg dropped transaction back into mempool
        const elapsedMs = this.now() - startTime;
        const escalation: OperatorEscalationEvent = {
          alertType: 'REORG_DETECTED',
          chainId,
          txHash,
          attempts: attempt,
          elapsedMs,
          reason: `Reorg detected! Previously mined transaction ${txHash} is no longer present in receipt query.`,
          timestamp: this.now(),
        };
        options?.onEscalation?.(escalation);

        if (lifecycle && txRecordId) {
          try {
            const currentRec = lifecycle.get(txRecordId);
            if (currentRec) {
              lifecycleRecord = lifecycle.detectReorg(
                txRecordId,
                '0x0000000000000000000000000000000000000000000000000000000000000000',
                currentRec.version,
              );
            }
          } catch {
            // Concurrency safe
          }
        }

        return {
          status: 'reorg_detected',
          transactionHash: txHash,
          chainId,
          attempts: attempt,
          elapsedMs,
          confirmations: 0,
          requiredConfirmations,
          errorReason: 'Transaction dropped from chain during reorg',
          escalationRequired: true,
          lifecycleRecord,
        };
      }

      // Calculate next backoff interval with jitter
      const { delayMs, rawIntervalMs, jitterMs } = calculateBackoffWithJitter(
        attempt - 1,
        {
          initialIntervalMs,
          maxIntervalMs,
          backoffMultiplier,
          jitterRatio,
          jitterStrategy,
        },
        this.random,
        previousDelayMs,
      );

      previousDelayMs = delayMs;

      options?.onPollAttempt?.({
        chainId,
        txHash,
        attempt,
        delayMs,
        elapsedMs: this.now() - startTime,
        rawIntervalMs,
        jitterMs,
      });

      const remainingTimeout = timeoutMs - (this.now() - startTime);
      if (remainingTimeout <= 0) break;

      await this.sleep(Math.min(delayMs, remainingTimeout));
    }

    const finalElapsed = this.now() - startTime;
    const timeoutEscalation: OperatorEscalationEvent = {
      alertType: 'POLLING_TIMEOUT',
      chainId,
      txHash,
      attempts: attempt,
      elapsedMs: finalElapsed,
      reason: `Max polling attempts (${maxAttempts}) exceeded without reaching confirmed state`,
      timestamp: this.now(),
    };
    options?.onEscalation?.(timeoutEscalation);

    return {
      status: 'timed_out',
      transactionHash: txHash,
      chainId,
      attempts: attempt,
      elapsedMs: finalElapsed,
      confirmations: 0,
      requiredConfirmations,
      errorReason: `Exceeded maximum polling attempts (${maxAttempts})`,
      escalationRequired: true,
      lifecycleRecord,
    };
  }
}
