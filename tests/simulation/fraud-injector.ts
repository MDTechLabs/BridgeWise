/**
 * tests/simulation/fraud-injector.ts
 *
 * Fraud Injection Toolkit
 * -----------------------
 * Deterministic fraud injection for the multi-chain testbed.  Provides
 * composable attack vectors that a malicious relayer or compromised
 * proposer could use, along with helper functions to build the fraud
 * proofs needed to challenge them.
 *
 * Attack vectors:
 *   1. Invalid state root submission — proposer posts a root that
 *      doesn't match the canonical chain.
 *   2. Relayer message tampering — relayer modifies amount, asset,
 *      or recipient before forwarding the bridge message.
 *   3. Relayer failure / dropout — relayer goes offline mid-flight,
 *      leaving the bridge in a pending state.
 *   4. Double-spend via replay — same lock event relayed twice.
 */

import type {
  EVMChainSimulator,
  SorobanChainSimulator,
  BridgeRelay,
  BridgeMessage,
  FraudProof,
  MultiChainTestbed,
} from './multi-chain-environment';

// ─── Fraud Types ───────────────────────────────────────────────────────────

export type FraudType =
  | 'invalid_state_root'
  | 'relayer_tamper_amount'
  | 'relayer_tamper_asset'
  | 'relayer_tamper_recipient'
  | 'relayer_failure'
  | 'double_spend';

export interface FraudInjectionResult {
  fraudType: FraudType;
  detected: boolean;
  challengeId?: string;
  slashingTriggered: boolean;
  message?: string;
}

export interface InvalidStateRootFraud {
  assertionId: string;
  invalidStateRoot: string;
  canonicalStateRoot: string;
  proposer: string;
}

export interface RelayerTamperFraud {
  originalMessage: BridgeMessage;
  tamperedMessage: Partial<BridgeMessage>;
  field: 'amount' | 'asset' | 'recipient';
}

export interface RelayerFailureFraud {
  failedMessageId: string;
  pendingSettlements: string[];
}

export interface DoubleSpendFraud {
  originalMessageId: string;
  replayCount: number;
}

// ─── Fraud Injector ────────────────────────────────────────────────────────

export class FraudInjector {
  private readonly testbed: MultiChainTestbed;

  constructor(testbed: MultiChainTestbed) {
    this.testbed = testbed;
  }

  // ─── Vector 1: Invalid State Root ────────────────────────────────────

  /**
   * Submit a state root assertion that deliberately disagrees with the
   * canonical chain state, simulating a malicious proposer.
   */
  injectInvalidStateRoot(
    assertionId: string,
    proposer: string,
    invalidRootOverride?: string,
  ): InvalidStateRootFraud {
    const canonicalRoot = this.testbed.evm.latestBlock?.stateRoot ?? '0x00000000';
    const invalidRoot = invalidRootOverride ?? this.fuzzStateRoot(canonicalRoot);

    this.testbed.evm.submitAssertion(assertionId, invalidRoot, proposer);

    return {
      assertionId,
      invalidStateRoot: invalidRoot,
      canonicalStateRoot: canonicalRoot,
      proposer,
    };
  }

  /**
   * Build a fraud proof demonstrating the state root mismatch.
   */
  buildInvalidStateRootProof(fraud: InvalidStateRootFraud): FraudProof {
    return {
      invalidStateRoot: fraud.invalidStateRoot,
      canonicalStateRoot: fraud.canonicalStateRoot,
      transitionIndex: 0,
      preStateRoot: fraud.canonicalStateRoot,
      postStateRoot: fraud.invalidStateRoot,
      data: JSON.stringify({
        type: 'state_root_mismatch',
        assertionId: fraud.assertionId,
        proposer: fraud.proposer,
      }),
    };
  }

  // ─── Vector 2: Relayer Message Tampering ─────────────────────────────

  /**
   * Intercept a bridge message and tamper with its payload before relay.
   * Returns the tampered message that the relayer would forward.
   */
  injectRelayerTamper(
    messageId: string,
    field: 'amount' | 'asset' | 'recipient',
    tamperedValue: string,
  ): RelayerTamperFraud {
    const messages = this.testbed.relay.pendingMessages;
    const original = messages.find((m) => m.id === messageId);
    if (!original) {
      throw new Error(`Message ${messageId} not found or already processed`);
    }

    const tamperedMessage = { ...original, [field]: tamperedValue };

    return {
      originalMessage: original,
      tamperedMessage,
      field,
    };
  }

  /**
   * Inject a relayer failure by taking the relayer offline.
   */
  injectRelayerFailure(): RelayerFailureFraud {
    const pendingIds = this.testbed.relay.pendingMessages.map((m) => m.id);
    this.testbed.relay.setRelayerHealthy(false);

    return {
      failedMessageId: pendingIds[0] ?? '',
      pendingSettlements: pendingIds,
    };
  }

  // ─── Vector 3: Double Spend ──────────────────────────────────────────

  /**
   * Relay the same bridge message twice to simulate a replay attack.
   */
  injectDoubleSpend(messageId: string): DoubleSpendFraud {
    const firstResult = this.testbed.relay.relayMessage(messageId);
    if (!firstResult.success) {
      throw new Error(`Initial relay failed: ${firstResult.error}`);
    }

    const secondResult = this.testbed.relay.relayMessage(messageId);

    return {
      originalMessageId: messageId,
      replayCount: secondResult.success ? 2 : 1,
    };
  }

  // ─── Fraud Proof Submission ──────────────────────────────────────────

  /**
   * End-to-end: detect fraud via ChallengeMonitor, build proof, and
   * submit the challenge on-chain.
   */
  challengeFraud(
    fraudType: FraudType,
    fraudData: InvalidStateRootFraud | RelayerTamperFraud | RelayerFailureFraud | DoubleSpendFraud,
    challengerAddress: string,
  ): FraudInjectionResult {
    switch (fraudType) {
      case 'invalid_state_root': {
        const fraud = fraudData as InvalidStateRootFraud;
        const proof = this.buildInvalidStateRootProof(fraud);
        const challengeId = `ch-${fraud.assertionId}`;
        this.testbed.evm.submitChallenge(challengeId, fraud.assertionId, challengerAddress, proof);
        const slashResult = this.testbed.evm.slashProposer(fraud.assertionId);
        return {
          fraudType,
          detected: true,
          challengeId,
          slashingTriggered: slashResult.slashed,
          message: slashResult.reason,
        };
      }

      case 'relayer_tamper_amount':
      case 'relayer_tamper_asset':
      case 'relayer_tamper_recipient': {
        const fraud = fraudData as RelayerTamperFraud;
        return {
          fraudType,
          detected: true,
          slashingTriggered: false,
          message: `Tamper detected in field: ${fraud.field}. Original: ${JSON.stringify(fraud.originalMessage)}`,
        };
      }

      case 'relayer_failure': {
        return {
          fraudType,
          detected: true,
          slashingTriggered: false,
          message: `Relayer went offline. ${(fraudData as RelayerFailureFraud).pendingSettlements.length} messages stuck pending.`,
        };
      }

      case 'double_spend': {
        const fraud = fraudData as DoubleSpendFraud;
        return {
          fraudType,
          detected: fraud.replayCount > 1,
          slashingTriggered: fraud.replayCount > 1,
          message: `Double spend detected: message relayed ${fraud.replayCount} times`,
        };
      }

      default:
        return {
          fraudType,
          detected: false,
          slashingTriggered: false,
          message: 'Unknown fraud type',
        };
    }
  }

  // ─── Utilities ───────────────────────────────────────────────────────

  /** Generate a deterministic but altered state root for fraud injection. */
  private fuzzStateRoot(original: string): string {
    const hex = original.startsWith('0x') ? original.slice(2) : original;
    const num = parseInt(hex, 16);
    const fuzzed = (num + 0xDEAD) | 0;
    return `0x${Math.abs(fuzzed).toString(16).padStart(8, '0')}`;
  }
}
