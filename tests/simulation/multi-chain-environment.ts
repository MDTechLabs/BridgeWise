/**
 * tests/simulation/multi-chain-environment.ts
 *
 * Multi-Chain Local Testbed Simulation
 * -------------------------------------
 * Lightweight in-memory simulators for an EVM chain (Anvil-like) and a
 * Soroban/Stellar chain, wired together through a shared bridge message
 * relay.  Designed for integration-test scenarios where we need deterministic
 * block production, state-root commitments, and cross-chain message passing
 * without external node dependencies.
 *
 * Each simulated chain:
 *   - Maintains an ordered block log with state roots
 *   - Exposes deposit / lock / settlement operations
 *   - Supports fraud-injection hooks (see fraud-injector.ts)
 */

import { EventEmitter } from 'events';

// ─── Shared Types ──────────────────────────────────────────────────────────

export interface Block {
  height: number;
  stateRoot: string;
  timestamp: number;
  transactions: Transaction[];
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  data?: string;
  blockHeight: number;
}

export interface BridgeMessage {
  id: string;
  sourceChain: ChainType;
  destinationChain: ChainType;
  sender: string;
  recipient: string;
  amount: string;
  asset: string;
  nonce: number;
  stateRoot?: string;
  timestamp: number;
}

export interface FraudProofChallenge {
  challengeId: string;
  assertionId: string;
  challenger: string;
  proof: FraudProof;
  submittedAtBlock: number;
  submittedAtTimestamp: number;
}

export interface FraudProof {
  invalidStateRoot: string;
  canonicalStateRoot: string;
  transitionIndex: number;
  preStateRoot: string;
  postStateRoot: string;
  data: string;
}

export type ChainType = 'evm' | 'soroban';

export interface ChainSimulatorConfig {
  chainType: ChainType;
  chainId: number;
  blockTimeSeconds: number;
  challengeWindowSeconds: number;
}

// ─── EVM Chain Simulator (Anvil-like) ──────────────────────────────────────

export class EVMChainSimulator extends EventEmitter {
  readonly chainType: ChainType = 'evm';
  readonly chainId: number;
  private readonly blocks: Block[] = [];
  private readonly accounts = new Map<string, string>();
  private readonly bridgeLocks = new Map<string, { sender: string; amount: string; asset: string; lockedAt: number }>();
  private readonly challenges: FraudProofChallenge[] = [];
  private readonly assertions = new Map<string, { stateRoot: string; proposer: string; submittedAt: number; windowSeconds: number }>();
  private blockHeight = 0;
  private readonly blockTimeSeconds: number;
  private readonly challengeWindowSeconds: number;
  private readonly now: () => number;

  constructor(config: Partial<ChainSimulatorConfig> & { chainId: number }, opts?: { now?: () => number }) {
    super();
    this.chainId = config.chainId;
    this.blockTimeSeconds = config.blockTimeSeconds ?? 2;
    this.challengeWindowSeconds = config.challengeWindowSeconds ?? 3600;
    this.now = opts?.now ?? (() => Math.floor(Date.now() / 1000));
  }

  get currentBlockHeight(): number {
    return this.blockHeight;
  }

  get latestBlock(): Block | undefined {
    return this.blocks[this.blocks.length - 1];
  }

  get allBlocks(): readonly Block[] {
    return this.blocks;
  }

  get activeChallenges(): readonly FraudProofChallenge[] {
    return this.challenges;
  }

  /** Seed an account with an initial balance (hex-encoded wei string). */
  seedAccount(address: string, balance: string): void {
    this.accounts.set(address, balance);
  }

  getBalance(address: string): string {
    return this.accounts.get(address) ?? '0';
  }

  /** Produce a new block, optionally with transactions. */
  produceBlock(transactions: Transaction[] = []): Block {
    this.blockHeight++;
    const block: Block = {
      height: this.blockHeight,
      stateRoot: this.computeStateRoot(),
      timestamp: this.now(),
      transactions,
    };
    this.blocks.push(block);
    this.emit('block', block);
    return block;
  }

  /** Lock funds in the bridge contract for cross-chain transfer. */
  lockFunds(sender: string, amount: string, asset: string): string {
    const balance = BigInt(this.accounts.get(sender) ?? '0');
    const lockAmount = BigInt(amount);
    if (balance < lockAmount) {
      throw new Error(`Insufficient balance: have ${balance}, need ${lockAmount}`);
    }
    this.accounts.set(sender, (balance - lockAmount).toString());

    const lockId = `lock-${this.blockHeight + 1}-${sender.slice(-6)}`;
    this.bridgeLocks.set(lockId, {
      sender,
      amount,
      asset,
      lockedAt: this.now(),
    });

    this.produceBlock([{
      hash: `0xtx-${lockId}`,
      from: sender,
      to: '0xBridgeContract',
      value: amount,
      blockHeight: this.blockHeight,
    }]);

    return lockId;
  }

  /** Submit a state root assertion for a bridge settlement. */
  submitAssertion(assertionId: string, stateRoot: string, proposer: string): void {
    this.assertions.set(assertionId, {
      stateRoot,
      proposer,
      submittedAt: this.now(),
      windowSeconds: this.challengeWindowSeconds,
    });
    this.produceBlock();
    this.emit('assertionSubmitted', { assertionId, stateRoot, proposer });
  }

  /** Resolve the canonical state root for a given assertion. */
  resolveCanonicalStateRoot(assertionId: string): string | undefined {
    const assertion = this.assertions.get(assertionId);
    if (!assertion) return undefined;
    return this.latestBlock?.stateRoot ?? assertion.stateRoot;
  }

  /** Submit a fraud proof challenge against an invalid assertion. */
  submitChallenge(challengeId: string, assertionId: string, challenger: string, proof: FraudProof): FraudProofChallenge {
    const assertion = this.assertions.get(assertionId);
    if (!assertion) {
      throw new Error(`Assertion ${assertionId} not found`);
    }

    const elapsed = this.now() - assertion.submittedAt;
    if (elapsed > assertion.windowSeconds) {
      throw new Error(`Challenge window expired for assertion ${assertionId}`);
    }

    const challenge: FraudProofChallenge = {
      challengeId,
      assertionId,
      challenger,
      proof,
      submittedAtBlock: this.blockHeight,
      submittedAtTimestamp: this.now(),
    };
    this.challenges.push(challenge);

    this.produceBlock();
    this.emit('challengeSubmitted', challenge);
    return challenge;
  }

  /** Slash the proposer of a challenged assertion and resolve the dispute. */
  slashProposer(assertionId: string): { slashed: boolean; proposer: string; reason: string } {
    const assertion = this.assertions.get(assertionId);
    if (!assertion) {
      return { slashed: false, proposer: '', reason: 'Assertion not found' };
    }

    this.produceBlock();
    this.emit('slashExecuted', { assertionId, proposer: assertion.proposer });
    return {
      slashed: true,
      proposer: assertion.proposer,
      reason: 'Invalid state root submitted',
    };
  }

  /** Remove a lock after successful cross-chain settlement. */
  settleLock(lockId: string): boolean {
    return this.bridgeLocks.delete(lockId);
  }

  private computeStateRoot(): string {
    const blockData = `${this.blockHeight}-${this.blocks.length}-${this.bridgeLocks.size}`;
    let hash = 0;
    for (let i = 0; i < blockData.length; i++) {
      hash = ((hash << 5) - hash + blockData.charCodeAt(i)) | 0;
    }
    return `0x${Math.abs(hash).toString(16).padStart(8, '0')}`;
  }
}

// ─── Soroban Chain Simulator ───────────────────────────────────────────────

export class SorobanChainSimulator extends EventEmitter {
  readonly chainType: ChainType = 'soroban';
  readonly chainId: number;
  private readonly blocks: Block[] = [];
  private readonly ledgers: Array<{ sequence: number; stateRoot: string; timestamp: number }> = [];
  private readonly settlements = new Map<string, { settlementId: string; sourceTxHash: string; amount: string; asset: string; status: string; ledgerSequence: number }>();
  private readonly contractStates = new Map<string, string>();
  private ledgerSequence = 0;
  private readonly blockTimeSeconds: number;
  private readonly now: () => number;

  constructor(config: Partial<ChainSimulatorConfig> & { chainId: number }, opts?: { now?: () => number }) {
    super();
    this.chainId = config.chainId;
    this.blockTimeSeconds = config.blockTimeSeconds ?? 5;
    this.now = opts?.now ?? (() => Math.floor(Date.now() / 1000));
  }

  get currentLedgerSequence(): number {
    return this.ledgerSequence;
  }

  get latestLedger(): { sequence: number; stateRoot: string; timestamp: number } | undefined {
    return this.ledgers[this.ledgers.length - 1];
  }

  get allLedgers(): readonly { sequence: number; stateRoot: string; timestamp: number }[] {
    return this.ledgers;
  }

  get allSettlements(): Map<string, { settlementId: string; sourceTxHash: string; amount: string; asset: string; status: string; ledgerSequence: number }> {
    return this.settlements;
  }

  /** Produce a new ledger (Soroban block). */
  produceLedger(): { sequence: number; stateRoot: string; timestamp: number } {
    this.ledgerSequence++;
    const stateRoot = this.computeStateRoot();
    const ledger = { sequence: this.ledgerSequence, stateRoot, timestamp: this.now() };
    this.ledgers.push(ledger);
    this.emit('ledger', ledger);
    return ledger;
  }

  /** Record an incoming settlement from the EVM chain. */
  receiveSettlement(settlementId: string, sourceTxHash: string, amount: string, asset: string): void {
    const ledger = this.produceLedger();
    this.settlements.set(settlementId, {
      settlementId,
      sourceTxHash,
      amount,
      asset,
      status: 'confirmed',
      ledgerSequence: ledger.sequence,
    });
    this.emit('settlementReceived', { settlementId, ledger });
  }

  /** Write a value to a contract state slot. */
  setContractState(key: string, value: string): void {
    this.contractStates.set(key, value);
    this.produceLedger();
  }

  getContractState(key: string): string | undefined {
    return this.contractStates.get(key);
  }

  private computeStateRoot(): string {
    const ledgerData = `${this.ledgerSequence}-${this.ledgers.length}-${this.settlements.size}`;
    let hash = 0;
    for (let i = 0; i < ledgerData.length; i++) {
      hash = ((hash << 5) - hash + ledgerData.charCodeAt(i)) | 0;
    }
    return `0x${Math.abs(hash).toString(16).padStart(8, '0')}`;
  }
}

// ─── Bridge Relay ──────────────────────────────────────────────────────────

export interface RelayConfig {
  sourceChain: ChainSimulatorConfig;
  destinationChain: ChainSimulatorConfig;
}

/**
 * Coordinates message passing between two simulated chains.
 * Models the relayer that picks up source-chain lock events and
 * submits settlement proofs on the destination chain.
 */
export class BridgeRelay extends EventEmitter {
  private readonly evmChain: EVMChainSimulator;
  private readonly sorobanChain: SorobanChainSimulator;
  private messageNonce = 0;
  private readonly messages: BridgeMessage[] = [];
  private readonly processedMessageIds = new Set<string>();
  private relayerHealthy = true;
  private readonly now: () => number;

  constructor(evmChain: EVMChainSimulator, sorobanChain: SorobanChainSimulator, opts?: { now?: () => number }) {
    super();
    this.evmChain = evmChain;
    this.sorobanChain = sorobanChain;
    this.now = opts?.now ?? (() => Math.floor(Date.now() / 1000));
  }

  get pendingMessages(): readonly BridgeMessage[] {
    return this.messages.filter((m) => !this.processedMessageIds.has(m.id));
  }

  get processedMessages(): readonly BridgeMessage[] {
    return this.messages.filter((m) => this.processedMessageIds.has(m.id));
  }

  /** Simulate a relayer outage. */
  setRelayerHealthy(healthy: boolean): void {
    this.relayerHealthy = healthy;
  }

  get isRelayerHealthy(): boolean {
    return this.relayerHealthy;
  }

  /** Create a cross-chain bridge message from EVM -> Soroban. */
  createMessage(sender: string, recipient: string, amount: string, asset: string): BridgeMessage {
    this.messageNonce++;
    const message: BridgeMessage = {
      id: `msg-${this.messageNonce}`,
      sourceChain: 'evm',
      destinationChain: 'soroban',
      sender,
      recipient,
      amount,
      asset,
      nonce: this.messageNonce,
      timestamp: this.now(),
    };
    this.messages.push(message);
    this.emit('messageCreated', message);
    return message;
  }

  /** Relay a pending message to the destination chain. */
  relayMessage(messageId: string): { success: boolean; settlementId?: string; error?: string } {
    if (!this.relayerHealthy) {
      return { success: false, error: 'Relayer is offline' };
    }

    const message = this.messages.find((m) => m.id === messageId);
    if (!message) {
      return { success: false, error: `Message ${messageId} not found` };
    }

    if (this.processedMessageIds.has(messageId)) {
      return { success: false, error: `Message ${messageId} already processed` };
    }

    const settlementId = `settlement-${messageId}`;
    this.sorobanChain.receiveSettlement(settlementId, message.id, message.amount, message.asset);
    this.processedMessageIds.add(messageId);
    this.emit('messageRelayed', { message, settlementId });
    return { success: true, settlementId };
  }

  /** Relay all pending messages. */
  relayAll(): Array<{ messageId: string; success: boolean; settlementId?: string; error?: string }> {
    const results: Array<{ messageId: string; success: boolean; settlementId?: string; error?: string }> = [];
    for (const msg of this.pendingMessages) {
      const result = this.relayMessage(msg.id);
      results.push({ messageId: msg.id, ...result });
    }
    return results;
  }
}

// ─── Multi-Chain Testbed ───────────────────────────────────────────────────

export interface TestbedConfig {
  evmChainId?: number;
  sorobanChainId?: number;
  evmBlockTimeSeconds?: number;
  sorobanBlockTimeSeconds?: number;
  challengeWindowSeconds?: number;
}

/**
 * Top-level orchestrator that wires EVM + Soroban chain simulators and the
 * bridge relay into a single testbed ready for fraud-proof simulation tests.
 */
export class MultiChainTestbed {
  readonly evm: EVMChainSimulator;
  readonly soroban: SorobanChainSimulator;
  readonly relay: BridgeRelay;
  private readonly clock: { time: number; advance: (seconds: number) => void };

  constructor(config?: TestbedConfig, opts?: { now?: () => number }) {
    const nowState = { time: Math.floor(Date.now() / 1000) };
    const nowFn = opts?.now ?? (() => nowState.time);

    this.evm = new EVMChainSimulator(
      { chainType: 'evm', chainId: config?.evmChainId ?? 31337, blockTimeSeconds: config?.evmBlockTimeSeconds ?? 2, challengeWindowSeconds: config?.challengeWindowSeconds ?? 3600 },
      { now: nowFn },
    );
    this.soroban = new SorobanChainSimulator(
      { chainType: 'soroban', chainId: config?.sorobanChainId ?? 100, blockTimeSeconds: config?.sorobanBlockTimeSeconds ?? 5 },
      { now: nowFn },
    );
    this.relay = new BridgeRelay(this.evm, this.soroban, { now: nowFn });
    this.clock = {
      get time() { return nowState.time; },
      advance(seconds: number) { nowState.time += seconds; },
    };
  }

  /** Advance the simulated clock by the given number of seconds. */
  advanceTime(seconds: number): void {
    this.clock.advance(seconds);
  }

  /** Get the current simulated timestamp. */
  get currentTime(): number {
    return this.clock.time;
  }
}
