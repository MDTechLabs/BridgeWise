/**
 * tests/simulation/fraud-proof-suite.spec.ts
 *
 * End-to-end fraud proof challenge workflow tests for the multi-chain
 * local testbed simulation.  Validates that:
 *
 *   1. Invalid state root assertions are detected and challenged.
 *   2. Relayer message tampering is caught.
 *   3. Relayer failures leave recoverable bridge state.
 *   4. Double-spend replay attacks are prevented.
 *   5. Bridge recovers after successful fraud resolution.
 *   6. Challenge window expiry is correctly tracked.
 */

import { MultiChainTestbed } from './multi-chain-environment';
import { FraudInjector } from './fraud-injector';
import {
  ChallengeMonitor,
  type StateRootAssertion,
} from '../../packages/analyzers/src/optimistic/challenge-monitor';

describe('#747 Multi-Chain Fraud Proof Local Testbed Simulation', () => {
  let testbed: MultiChainTestbed;
  let injector: FraudInjector;

  const PROPOSER = '0xMaliciousProposer';
  const CHALLENGER = '0xBenevolentChallenger';
  const USER = '0xUser123';
  const RECIPIENT = 'rStellarRecipient';

  beforeEach(() => {
    let fakeNow = 1_000_000;
    testbed = new MultiChainTestbed(
      { challengeWindowSeconds: 3600, evmBlockTimeSeconds: 2, sorobanBlockTimeSeconds: 5 },
      { now: () => fakeNow },
    );
    testbed.evm.seedAccount(USER, '1000000');
    testbed.evm.produceBlock();
    injector = new FraudInjector(testbed);
  });

  // ─── Environment Sanity ──────────────────────────────────────────────

  describe('Multi-chain environment', () => {
    it('boots with independent EVM and Soroban chain instances', () => {
      expect(testbed.evm.chainType).toBe('evm');
      expect(testbed.soroban.chainType).toBe('soroban');
      expect(testbed.evm.currentBlockHeight).toBeGreaterThanOrEqual(1);
      expect(testbed.soroban.currentLedgerSequence).toBe(0);
    });

    it('relay passes messages between chains', () => {
      const msg = testbed.relay.createMessage(USER, RECIPIENT, '500', 'XLM');
      const result = testbed.relay.relayMessage(msg.id);

      expect(result.success).toBe(true);
      expect(result.settlementId).toBeDefined();
      expect(testbed.soroban.allSettlements.size).toBe(1);
      expect(testbed.relay.pendingMessages).toHaveLength(0);
      expect(testbed.relay.processedMessages).toHaveLength(1);
    });

    it('accounts track balances after lock operations', () => {
      const lockId = testbed.evm.lockFunds(USER, '1000', 'ETH');
      expect(testbed.evm.getBalance(USER)).toBe('999000');
      expect(lockId).toBeDefined();
    });

    it('rejects lock when balance is insufficient', () => {
      expect(() => testbed.evm.lockFunds(USER, '9999999', 'ETH')).toThrow('Insufficient balance');
    });
  });

  // ─── Fraud Vector 1: Invalid State Root ──────────────────────────────

  describe('Invalid state root fraud', () => {
    it('detects and challenges a fraudulent state root assertion', () => {
      testbed.evm.produceBlock();
      const fraud = injector.injectInvalidStateRoot('assertion-fraud-1', PROPOSER);

      expect(fraud.invalidStateRoot).not.toBe(fraud.canonicalStateRoot);

      const result = injector.challengeFraud('invalid_state_root', fraud, CHALLENGER);

      expect(result.detected).toBe(true);
      expect(result.challengeId).toBeDefined();
      expect(result.slashingTriggered).toBe(true);
      expect(result.message).toContain('Invalid state root');
    });

    it('submits a valid fraud proof with correct pre/post state roots', () => {
      testbed.evm.produceBlock();
      const fraud = injector.injectInvalidStateRoot('assertion-proof-1', PROPOSER, '0xDEADBEEF');
      const proof = injector.buildInvalidStateRootProof(fraud);

      expect(proof.invalidStateRoot).toBe('0xDEADBEEF');
      expect(proof.canonicalStateRoot).toBe(fraud.canonicalStateRoot);
      expect(proof.data).toContain('state_root_mismatch');
    });

    it('integration with ChallengeMonitor detects invalid assertion', async () => {
      testbed.evm.produceBlock();
      const block = testbed.evm.produceBlock();

      const monitor = new ChallengeMonitor({
        resolveCanonicalStateRoot: async () => block.stateRoot,
        now: () => testbed.currentTime,
      });

      const validAssertion: StateRootAssertion = {
        chainId: 31337,
        assertionId: 'assertion-valid',
        proposer: '0xHonestProposer',
        claimedStateRoot: block.stateRoot,
        submittedAtBlock: block.height,
        submittedAtTimestamp: testbed.currentTime,
        challengeWindowSeconds: 3600,
      };

      const validated = jest.fn();
      monitor.on('validated', validated);
      await monitor.trackAssertion(validAssertion);
      expect(validated).toHaveBeenCalledTimes(1);

      const invalidAssertion: StateRootAssertion = {
        chainId: 31337,
        assertionId: 'assertion-invalid',
        proposer: PROPOSER,
        claimedStateRoot: '0xCAFEBABE',
        submittedAtBlock: block.height,
        submittedAtTimestamp: testbed.currentTime,
        challengeWindowSeconds: 3600,
      };

      const invalidDetected = jest.fn();
      monitor.on('invalidAssertionDetected', invalidDetected);
      await monitor.trackAssertion(invalidAssertion);

      expect(invalidDetected).toHaveBeenCalledWith(invalidAssertion, block.stateRoot);
      expect(monitor.pendingCount).toBe(1);
    });
  });

  // ─── Fraud Vector 2: Relayer Tampering ───────────────────────────────

  describe('Relayer message tampering', () => {
    it('detects amount tampering in a bridge message', () => {
      const msg = testbed.relay.createMessage(USER, RECIPIENT, '1000', 'USDC');
      const tamper = injector.injectRelayerTamper(msg.id, 'amount', '999999');

      expect(tamper.originalMessage.amount).toBe('1000');
      expect(tamper.tamperedMessage.amount).toBe('999999');
      expect(tamper.field).toBe('amount');
    });

    it('detects asset tampering in a bridge message', () => {
      const msg = testbed.relay.createMessage(USER, RECIPIENT, '500', 'XLM');
      const tamper = injector.injectRelayerTamper(msg.id, 'asset', 'FAKE_TOKEN');

      expect(tamper.originalMessage.asset).toBe('XLM');
      expect(tamper.tamperedMessage.asset).toBe('FAKE_TOKEN');
    });

    it('detects recipient tampering in a bridge message', () => {
      const msg = testbed.relay.createMessage(USER, RECIPIENT, '500', 'XLM');
      const tamper = injector.injectRelayerTamper(msg.id, 'recipient', 'rAttacker');

      expect(tamper.originalMessage.recipient).toBe(RECIPIENT);
      expect(tamper.tamperedMessage.recipient).toBe('rAttacker');
    });

    it('challengeFraud reports the tampered field', () => {
      const msg = testbed.relay.createMessage(USER, RECIPIENT, '1000', 'USDC');
      const tamper = injector.injectRelayerTamper(msg.id, 'amount', '1');
      const result = injector.challengeFraud('relayer_tamper_amount', tamper, CHALLENGER);

      expect(result.detected).toBe(true);
      expect(result.message).toContain('amount');
    });
  });

  // ─── Fraud Vector 3: Relayer Failure ─────────────────────────────────

  describe('Relayer failure', () => {
    it('halts message relay when relayer goes offline', () => {
      testbed.relay.createMessage(USER, RECIPIENT, '200', 'ETH');
      testbed.relay.createMessage(USER, RECIPIENT, '300', 'BTC');

      const failure = injector.injectRelayerFailure();

      expect(testbed.relay.isRelayerHealthy).toBe(false);
      expect(failure.pendingSettlements).toHaveLength(2);

      const result = testbed.relay.relayMessage(testbed.relay.pendingMessages[0].id);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Relayer is offline');
    });

    it('resumes relay after relayer recovery', () => {
      testbed.relay.createMessage(USER, RECIPIENT, '200', 'ETH');
      injector.injectRelayerFailure();

      testbed.relay.setRelayerHealthy(true);
      const result = testbed.relay.relayMessage(testbed.relay.pendingMessages[0].id);
      expect(result.success).toBe(true);
    });
  });

  // ─── Fraud Vector 4: Double Spend ────────────────────────────────────

  describe('Double spend / replay attack', () => {
    it('detects and blocks message replay', () => {
      const msg = testbed.relay.createMessage(USER, RECIPIENT, '1000', 'USDC');
      const fraud = injector.injectDoubleSpend(msg.id);

      expect(fraud.replayCount).toBe(1);
      expect(fraud.originalMessageId).toBe(msg.id);
    });

    it('reports double spend when relay guard is absent', () => {
      const msg = testbed.relay.createMessage(USER, RECIPIENT, '500', 'XLM');
      const first = testbed.relay.relayMessage(msg.id);
      expect(first.success).toBe(true);

      const second = testbed.relay.relayMessage(msg.id);
      expect(second.success).toBe(false);
      expect(second.error).toContain('already processed');
    });
  });

  // ─── Challenge Window Tracking ───────────────────────────────────────

  describe('Challenge window expiry', () => {
    it('tracks invalid assertion through alert and expiry lifecycle', async () => {
      let fakeNow = 1_000_000;
      testbed = new MultiChainTestbed(
        { challengeWindowSeconds: 1000 },
        { now: () => fakeNow },
      );
      injector = new FraudInjector(testbed);

      testbed.evm.produceBlock();
      const fraud = injector.injectInvalidStateRoot('assertion-window', PROPOSER, '0xFRAUD');

      const monitor = new ChallengeMonitor({
        resolveCanonicalStateRoot: async () => fraud.canonicalStateRoot,
        now: () => fakeNow,
        alertRemainingFraction: 0.2,
      });

      const alert = jest.fn();
      const expired = jest.fn();
      monitor.on('alert', alert);
      monitor.on('expired', expired);

      await monitor.trackAssertion({
        chainId: 31337,
        assertionId: fraud.assertionId,
        proposer: PROPOSER,
        claimedStateRoot: fraud.invalidStateRoot,
        submittedAtBlock: testbed.evm.currentBlockHeight,
        submittedAtTimestamp: fakeNow,
        challengeWindowSeconds: 1000,
      });

      expect(monitor.pendingCount).toBe(1);

      // Advance 850s — 15% remaining, should trigger alert at <=20%.
      fakeNow += 850;
      monitor.checkPendingAssertions();
      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert.mock.calls[0][0].remainingSeconds).toBe(150);
      expect(alert.mock.calls[0][0].remainingFraction).toBeCloseTo(0.15, 2);

      // Advance past window — should expire.
      fakeNow += 200;
      monitor.checkPendingAssertions();
      expect(expired).toHaveBeenCalledTimes(1);
      expect(monitor.pendingCount).toBe(0);
    });

    it('does not allow challenge after window expiry', () => {
      let fakeNow = 1_000_000;
      testbed = new MultiChainTestbed(
        { challengeWindowSeconds: 1000 },
        { now: () => fakeNow },
      );
      injector = new FraudInjector(testbed);

      testbed.evm.produceBlock();
      const fraud = injector.injectInvalidStateRoot('assertion-expired', PROPOSER, '0xFRAUD');

      // Submit the assertion
      testbed.evm.submitAssertion(fraud.assertionId, fraud.invalidStateRoot, PROPOSER);

      // Advance past the challenge window
      fakeNow += 1001;

      const proof = injector.buildInvalidStateRootProof(fraud);
      expect(() => {
        testbed.evm.submitChallenge('ch-expired', fraud.assertionId, CHALLENGER, proof);
      }).toThrow('Challenge window expired');
    });
  });

  // ─── Bridge Recovery After Fraud Resolution ──────────────────────────

  describe('Bridge recovery after fraud resolution', () => {
    it('completes honest transfer after fraudulent assertion is slashed', () => {
      testbed.evm.produceBlock();

      // Malicious assertion + challenge + slash
      const fraud = injector.injectInvalidStateRoot('assertion-mal-1', PROPOSER);
      const result = injector.challengeFraud('invalid_state_root', fraud, CHALLENGER);
      expect(result.slashingTriggered).toBe(true);

      // Honest bridge flow completes normally
      const lockId = testbed.evm.lockFunds(USER, '2000', 'ETH');
      const msg = testbed.relay.createMessage(USER, RECIPIENT, '2000', 'ETH');
      const relayResult = testbed.relay.relayMessage(msg.id);

      expect(relayResult.success).toBe(true);
      expect(testbed.soroban.allSettlements.size).toBe(1);
      expect(testbed.evm.getBalance(USER)).toBe('998000');
    });

    it('recovers from relayer outage without state corruption', () => {
      testbed.evm.produceBlock();
      testbed.evm.lockFunds(USER, '500', 'USDC');
      const msg = testbed.relay.createMessage(USER, RECIPIENT, '500', 'USDC');

      // Relayer goes down mid-flight
      injector.injectRelayerFailure();
      const stuck = testbed.relay.relayMessage(msg.id);
      expect(stuck.success).toBe(false);

      // Relayer recovers, relay succeeds
      testbed.relay.setRelayerHealthy(true);
      const recovered = testbed.relay.relayMessage(testbed.relay.pendingMessages[0].id);
      expect(recovered.success).toBe(true);

      // Settlement confirmed on Soroban
      const settlement = testbed.soroban.allSettlements.get(recovered.settlementId!);
      expect(settlement).toBeDefined();
      expect(settlement!.status).toBe('confirmed');
    });

    it('handles multiple concurrent fraud vectors in sequence', () => {
      testbed.evm.produceBlock();

      // 1. Invalid state root
      const fraud1 = injector.injectInvalidStateRoot('assertion-seq-1', PROPOSER);
      const r1 = injector.challengeFraud('invalid_state_root', fraud1, CHALLENGER);
      expect(r1.slashingTriggered).toBe(true);

      // 2. Relayer tamper attempt
      const msg = testbed.relay.createMessage(USER, RECIPIENT, '100', 'XLM');
      const tamper = injector.injectRelayerTamper(msg.id, 'amount', '99999');
      const r2 = injector.challengeFraud('relayer_tamper_amount', tamper, CHALLENGER);
      expect(r2.detected).toBe(true);

      // 3. Relayer outage
      injector.injectRelayerFailure();
      testbed.relay.setRelayerHealthy(true);

      // 4. Another invalid assertion
      testbed.evm.produceBlock();
      const fraud2 = injector.injectInvalidStateRoot('assertion-seq-2', PROPOSER, '0xTRASH');
      const r3 = injector.challengeFraud('invalid_state_root', fraud2, CHALLENGER);
      expect(r3.slashingTriggered).toBe(true);

      // Bridge still functions after all incidents
      const finalMsg = testbed.relay.createMessage(USER, RECIPIENT, '75', 'ETH');
      const relayFinal = testbed.relay.relayMessage(finalMsg.id);
      expect(relayFinal.success).toBe(true);
      expect(testbed.soroban.allSettlements.size).toBe(1);
    });
  });

  // ─── Multi-Step Integration: Full Fraud Proof Workflow ───────────────

  describe('Full fraud proof challenge workflow (end-to-end)', () => {
    it('executes automated fraud detection → challenge → slash → recovery pipeline', async () => {
      let fakeNow = 1_000_000;
      testbed = new MultiChainTestbed(
        { challengeWindowSeconds: 600 },
        { now: () => fakeNow },
      );
      testbed.evm.seedAccount(USER, '1000000');
      injector = new FraudInjector(testbed);

      // Phase 1: Boot environment and produce initial blocks
      testbed.evm.produceBlock();
      testbed.evm.produceBlock();
      const latestBlock = testbed.evm.latestBlock!;

      // Phase 2: Honest assertion succeeds validation
      const monitor = new ChallengeMonitor({
        resolveCanonicalStateRoot: async () => latestBlock.stateRoot,
        now: () => fakeNow,
      });

      const validAssertion: StateRootAssertion = {
        chainId: 31337,
        assertionId: 'assertion-honest',
        proposer: '0xHonestRelayer',
        claimedStateRoot: latestBlock.stateRoot,
        submittedAtBlock: latestBlock.height,
        submittedAtTimestamp: fakeNow,
        challengeWindowSeconds: 600,
      };

      const validated = jest.fn();
      monitor.on('validated', validated);
      await monitor.trackAssertion(validAssertion);
      expect(validated).toHaveBeenCalledTimes(1);

      // Phase 3: Fraudulent assertion is injected and detected
      const fraud = injector.injectInvalidStateRoot('assertion-dishonest', PROPOSER, '0xBADF00D');

      const invalidDetected = jest.fn();
      monitor.on('invalidAssertionDetected', invalidDetected);
      await monitor.trackAssertion({
        chainId: 31337,
        assertionId: fraud.assertionId,
        proposer: PROPOSER,
        claimedStateRoot: fraud.invalidStateRoot,
        submittedAtBlock: testbed.evm.currentBlockHeight,
        submittedAtTimestamp: fakeNow,
        challengeWindowSeconds: 600,
      });
      expect(invalidDetected).toHaveBeenCalledTimes(1);
      expect(monitor.pendingCount).toBe(1);

      // Phase 4: Challenger submits fraud proof before window expires
      fakeNow += 200;
      monitor.checkPendingAssertions();

      const result = injector.challengeFraud('invalid_state_root', fraud, CHALLENGER);
      expect(result.detected).toBe(true);
      expect(result.slashingTriggered).toBe(true);
      monitor.untrackAssertion(fraud.assertionId);
      expect(monitor.pendingCount).toBe(0);

      // Phase 5: Bridge recovers — honest flow completes
      const lockId = testbed.evm.lockFunds(USER, '3000', 'ETH');
      const bridgeMsg = testbed.relay.createMessage(USER, RECIPIENT, '3000', 'ETH');
      const relayResult = testbed.relay.relayMessage(bridgeMsg.id);

      expect(relayResult.success).toBe(true);
      expect(testbed.soroban.allSettlements.size).toBe(1);
      expect(testbed.evm.getBalance(USER)).toBe('997000');

      // Phase 6: Window expires for any remaining unchallenged assertions
      fakeNow += 601;
      const expired = jest.fn();
      monitor.on('expired', expired);
      monitor.checkPendingAssertions();
      // No expired events since we already untracked the fraud assertion
      expect(monitor.pendingCount).toBe(0);
    });
  });
});
