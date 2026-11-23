import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BridgeEscrowModel,
  CHAIN_PROFILES,
  CONSERVATION_INVARIANTS,
  EscrowSpecError,
  EscrowMessage,
  makeProof,
  seededRandom,
  stableStringify,
  testMessage,
  testOptions,
} from './bridge-escrow-conservation';

const RECEIVER = 'receiver-adapter';
const GOVERNANCE = 'governance';
const RELAYER = 'relayer-1';
const GUARDIAN = 'guardian';
const ATTACKER = 'attacker';
const START = 1_000_000;
const SPEC_DOC = join(__dirname, '..', 'docs', 'BRIDGE_ESCROW_CONSERVATION_SPEC.md');

function newModel(): BridgeEscrowModel {
  return new BridgeEscrowModel(testOptions());
}

function message(overrides: Partial<EscrowMessage> = {}): EscrowMessage {
  return testMessage({ observedAt: START, ...overrides });
}

/** Observe and finalize a deposit, advancing model time to satisfy finality. */
function lockFunds(model: BridgeEscrowModel, overrides: Partial<EscrowMessage> = {}): EscrowMessage {
  const msg = message(overrides);
  model.observeDeposit(msg, RECEIVER);
  const depth = model.profileFor(msg.sourceChain).finalityDepth;
  model.setNow(Math.max(model.now, msg.observedAt + depth));
  model.finalizeDeposit(msg.id, RECEIVER, depth);
  return msg;
}

function expectError(fn: () => unknown, code?: string): EscrowSpecError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(EscrowSpecError);
    if (code) expect((error as EscrowSpecError).code).toBe(code);
    return error as EscrowSpecError;
  }
  throw new Error('expected an EscrowSpecError');
}

/** Every rejected operation must be atomic: identical state, no invariant break. */
function expectAtomicRejection(model: BridgeEscrowModel, fn: () => unknown, code?: string): void {
  const before = stableStringify(model.snapshot());
  expectError(fn, code);
  expect(stableStringify(model.snapshot())).toBe(before);
  expect(model.invariantViolations()).toEqual([]);
}

function expectConservation(model: BridgeEscrowModel): void {
  expect(model.invariantViolations()).toEqual([]);
}

function proofFor(msg: EscrowMessage) {
  return makeProof(msg);
}

describe('bridge escrow conservation specification', () => {
  it('defines every invariant and chain in the normative document', () => {
    const doc = readFileSync(SPEC_DOC, 'utf8');
    for (const id of CONSERVATION_INVARIANTS) {
      expect(doc).toContain(`\`${id}\``);
    }
    for (const profile of CHAIN_PROFILES) {
      expect(doc).toContain(`\`${profile.chainId}\``);
      expect(doc).toContain(profile.parameterSetVersion);
      expect(doc).toContain(`\`${profile.parameterSource}\``);
    }
    expect(doc).toContain('escrow-conservation/1.0.0');
  });

  it('has explicit, unique and bounded chain parameters', () => {
    expect(CHAIN_PROFILES.length).toBeGreaterThanOrEqual(7);
    expect(new Set(CHAIN_PROFILES.map((p) => p.chainId)).size).toBe(CHAIN_PROFILES.length);
    for (const profile of CHAIN_PROFILES) {
      const model = new BridgeEscrowModel(testOptions({ profiles: [profile] }));
      expect(model.profileFor(profile.chainId)).toBe(profile);
      expect(profile.finalityDepth).toBeGreaterThan(0);
      expect(profile.reorgWindow).toBeGreaterThanOrEqual(profile.finalityDepth);
      expect(profile.maxAmount).toBeGreaterThan(0n);
    }
    expectError(() => newModel().profileFor('unknown-chain'), 'unsupported-chain');
  });

  it('rejects malformed parameter sets instead of inferring values', () => {
    const valid = CHAIN_PROFILES[0];
    expectError(
      () => new BridgeEscrowModel(testOptions({ profiles: [{ ...valid, finalityDepth: 0 }] })),
      'invalid-profile-bounds',
    );
    expectError(
      () => new BridgeEscrowModel(testOptions({ profiles: [valid, valid] })),
      'duplicate-chain-profile',
    );
    expectError(
      () => new BridgeEscrowModel(testOptions({ profiles: [] })),
      'no-chain-profiles',
    );
  });
});

describe('escrow message validation (valid, invalid and boundary inputs)', () => {
  it('creates a pending observation without touching escrow totals', () => {
    const model = newModel();
    const msg = message();
    model.observeDeposit(msg, RECEIVER);
    expect(model.transfer(msg.id).status).toBe('pending');
    const ledger = model.ledger(msg.sourceChain, msg.token);
    expect([ledger.deposited, ledger.held, ledger.delivered, ledger.refunded, ledger.fees]).toEqual([0n, 0n, 0n, 0n, 0n]);
    expectConservation(model);
  });

  it.each<[string, Partial<EscrowMessage>, string]>([
    ['zero amount', { amount: 0n }, 'amount-out-of-bounds'],
    ['negative amount', { amount: -1n }, 'amount-out-of-bounds'],
    ['amount over profile bound', { amount: 10n ** 31n }, 'amount-out-of-bounds'],
    ['fee above amount', { fee: 1_001n }, 'fee-out-of-bounds'],
    ['negative fee', { fee: -1n }, 'fee-out-of-bounds'],
    ['invalid id', { id: 'bad id!' }, 'invalid-message-id'],
    ['empty sender', { sender: '' }, 'invalid-sender'],
    ['same-chain lane', { targetChain: 'evm:137' }, 'same-chain-lane'],
    ['unsupported source', { sourceChain: 'evm:9999' }, 'unsupported-chain'],
    ['unsupported target', { targetChain: 'evm:9999' }, 'unsupported-chain'],
    ['oversized message', { bytes: 4097 }, 'message-too-large'],
    ['nonce gap', { nonce: 4 }, 'nonce-gap-or-replay'],
    ['negative nonce', { nonce: -1 }, 'invalid-nonce'],
    ['expired message', { expiresAt: START }, 'message-expired'],
  ])('rejects %s atomically', (_name, overrides, code) => {
    const model = newModel();
    expectAtomicRejection(model, () => model.observeDeposit(message(overrides), RECEIVER), code);
  });

  it('accepts exact profile bounds and rejects one unit beyond them', () => {
    const model = newModel();
    const profile = model.profileFor('soroban:stellar');
    const atBound = message({ sourceChain: 'soroban:stellar', targetChain: 'evm:1', bytes: profile.maxMessageBytes, amount: 1_000n });
    expect(() => model.observeDeposit(atBound, RECEIVER)).not.toThrow();
    expectAtomicRejection(
      model,
      () => model.observeDeposit(message({ id: 'over-bound', sourceChain: 'soroban:stellar', targetChain: 'evm:1', bytes: profile.maxMessageBytes + 1 }), RECEIVER),
      'message-too-large',
    );
  });

  it('rejects unauthorized, duplicate and replayed observations without mutation', () => {
    const model = newModel();
    const msg = message();
    model.observeDeposit(msg, RECEIVER);
    expectAtomicRejection(model, () => model.observeDeposit(message(), ATTACKER), 'caller-is-not-receiver');
    expectAtomicRejection(model, () => model.observeDeposit(msg, RECEIVER), 'duplicate-message-id');
    expectAtomicRejection(model, () => model.observeDeposit(message({ id: 'replay', nonce: 0 }), RECEIVER), 'nonce-gap-or-replay');
  });
});

describe('finality, reorg and freeze behavior', () => {
  it('does not finalize below the chain-specific confirmation depth', () => {
    const model = newModel();
    const msg = message({ sourceChain: 'evm:137' });
    model.observeDeposit(msg, RECEIVER);
    const depth = model.profileFor(msg.sourceChain).finalityDepth;
    expectAtomicRejection(model, () => model.finalizeDeposit(msg.id, RECEIVER, depth - 1), 'finality-not-reached');
    model.setNow(START + depth);
    model.finalizeDeposit(msg.id, RECEIVER, depth);
    expect(model.transfer(msg.id).status).toBe('locked');
    expect(model.ledger(msg.sourceChain, msg.token).held).toBe(msg.amount);
    expectAtomicRejection(model, () => model.finalizeDeposit(msg.id, RECEIVER, depth), 'deposit-not-pending');
    expectConservation(model);
  });

  it('does not finalize before chain time reaches the observation plus finality depth', () => {
    const model = newModel();
    const msg = message({ sourceChain: 'evm:137' });
    model.observeDeposit(msg, RECEIVER);
    const depth = model.profileFor(msg.sourceChain).finalityDepth;
    expectAtomicRejection(model, () => model.finalizeDeposit(msg.id, RECEIVER, depth), 'finality-not-reached');
  });

  it('drops unfinalized observations on reorg without changing totals', () => {
    const model = newModel();
    const msg = message();
    model.observeDeposit(msg, RECEIVER);
    const before = stableStringify(model.snapshot());
    model.reorg(msg.sourceChain, msg.observedAt - 1, [msg.id], GOVERNANCE);
    expect(model.transfer.bind(model, msg.id)).toThrow('unknown-transfer');
    expect(model.ledger(msg.sourceChain, msg.token).deposited).toBe(0n);
    expect(model.nextNonce(msg.sender, msg.sourceChain)).toBe(0);
    expect(stableStringify(model.snapshot())).not.toBe(before); // only the pending record was removed
    expectConservation(model);
  });

  it('freezes and requires reviewed recovery for a finalized reorg', () => {
    const model = newModel();
    const msg = lockFunds(model);
    const before = stableStringify(model.snapshot());
    expectError(() => model.reorg(msg.sourceChain, msg.observedAt - 1, [msg.id], GOVERNANCE), 'finalized-reorg-requires-recovery');
    expect(model.frozen).toBe(true);
    expect(model.recoveryRequired).toBe(true);
    expect(model.transfer(msg.id).status).toBe('locked');
    expect(stableStringify(model.snapshot())).not.toBe(before); // freeze flags only; no accounting rewrite
    expectAtomicRejection(model, () => model.unfreeze(GOVERNANCE), 'recovery-required');
    expectConservation(model);
  });

  it('blocks new deposits and deliveries while frozen but keeps refunds open', () => {
    const model = newModel();
    const msg = lockFunds(model);
    model.freeze(GUARDIAN);
    expectAtomicRejection(model, () => model.observeDeposit(message({ id: 'frozen', nonce: 1 }), RECEIVER), 'frozen');
    expectAtomicRejection(model, () => model.deliver(msg.id, RELAYER, { targetSucceeds: true, proof: proofFor(msg) }), 'frozen');
    expect(() => model.refund(msg.id, GOVERNANCE)).not.toThrow();
    expect(model.ledger(msg.sourceChain, msg.token).refunded).toBe(msg.amount);
    expectConservation(model);
  });

  it('rejects unauthorized freeze, reorg and unfreeze attempts', () => {
    const model = newModel();
    const msg = lockFunds(model);
    expectAtomicRejection(model, () => model.freeze(ATTACKER), 'caller-is-not-governance');
    expectAtomicRejection(model, () => model.unfreeze(RELAYER), 'caller-is-not-governance');
    expectAtomicRejection(model, () => model.reorg(msg.sourceChain, 1, [msg.id], ATTACKER), 'caller-is-not-governance');
    expect(model.frozen).toBe(false);
  });
});

describe('delivery, retry, refund and conservation identities', () => {
  it('conserves gross deposit as net delivery plus explicit fee', () => {
    const model = newModel();
    const msg = lockFunds(model, { amount: 1_000n, fee: 25n });
    const ledgerBefore = model.ledger(msg.sourceChain, msg.token);
    expect([ledgerBefore.deposited, ledgerBefore.held, ledgerBefore.fees]).toEqual([1_000n, 1_000n, 0n]);

    model.deliver(msg.id, RELAYER, { targetSucceeds: true, proof: proofFor(msg) });
    const ledger = model.ledger(msg.sourceChain, msg.token);
    expect([ledger.held, ledger.delivered, ledger.refunded, ledger.fees]).toEqual([0n, 975n, 0n, 25n]);
    expect(ledger.deposited).toBe(ledger.delivered + ledger.fees);
    expectConservation(model);
  });

  it('keeps a reverted delivery locked and bounded across retries', () => {
    const model = newModel();
    const msg = lockFunds(model);
    const profile = model.profileFor(msg.targetChain);
    const proof = proofFor(msg);
    const beforeTotals = stableStringify(model.ledger(msg.sourceChain, msg.token));

    for (let attempt = 0; attempt < profile.maxDeliveryAttempts; attempt++) {
      model.deliver(msg.id, RELAYER, { targetSucceeds: false, proof });
      expect(model.transfer(msg.id).status).toBe('locked');
      expect(stableStringify(model.ledger(msg.sourceChain, msg.token))).toBe(beforeTotals);
      expectConservation(model);
    }
    expectAtomicRejection(model, () => model.deliver(msg.id, RELAYER, { targetSucceeds: true, proof }), 'attempts-exhausted');
    model.refund(msg.id, GOVERNANCE);
    expect(model.ledger(msg.sourceChain, msg.token).refunded).toBe(msg.amount);
    expectConservation(model);
  });

  it('retries after a revert and settles exactly once', () => {
    const model = newModel();
    const msg = lockFunds(model);
    const proof = proofFor(msg);
    model.deliver(msg.id, RELAYER, { targetSucceeds: false, proof });
    model.deliver(msg.id, RELAYER, { targetSucceeds: true, proof });
    expect(model.transfer(msg.id).status).toBe('delivered');
    expectAtomicRejection(model, () => model.deliver(msg.id, RELAYER, { targetSucceeds: true, proof }), 'transfer-not-locked');
    expectAtomicRejection(model, () => model.refund(msg.id, GOVERNANCE), 'transfer-not-locked');
    expectConservation(model);
  });

  it('refunds the gross amount without accruing a fee and never settles twice', () => {
    const model = newModel();
    const msg = lockFunds(model, { fee: 40n });
    model.refund(msg.id, GOVERNANCE);
    const ledger = model.ledger(msg.sourceChain, msg.token);
    expect([ledger.held, ledger.delivered, ledger.refunded, ledger.fees]).toEqual([0n, 0n, 1_000n, 0n]);
    expectAtomicRejection(model, () => model.refund(msg.id, GOVERNANCE), 'transfer-not-locked');
    expectConservation(model);
  });

  it('rejects unauthorized delivery and refund without mutation', () => {
    const model = newModel();
    const msg = lockFunds(model);
    expectAtomicRejection(model, () => model.deliver(msg.id, ATTACKER, { targetSucceeds: true, proof: proofFor(msg) }), 'caller-is-not-relayer');
    expectAtomicRejection(model, () => model.refund(msg.id, ATTACKER), 'caller-is-not-governance');
  });

  it('rejects unbound, uncorroborated or unverified settlement proofs', () => {
    const model = newModel();
    const msg = lockFunds(model);
    const good = proofFor(msg);
    expectAtomicRejection(model, () => model.deliver(msg.id, RELAYER, { targetSucceeds: true, proof: { ...good, messageId: 'other' } }), 'proof-binding-mismatch');
    expectAtomicRejection(model, () => model.deliver(msg.id, RELAYER, { targetSucceeds: true, proof: { ...good, sourceNonce: 99 } }), 'proof-binding-mismatch');
    expectAtomicRejection(model, () => model.deliver(msg.id, RELAYER, { targetSucceeds: true, proof: { ...good, finalized: false } }), 'unverified-proof');
    expectAtomicRejection(model, () => model.deliver(msg.id, RELAYER, { targetSucceeds: true, proof: { ...good, targetUnexecuted: false } }), 'unverified-proof');
    expectAtomicRejection(model, () => model.deliver(msg.id, RELAYER, { targetSucceeds: true, proof: { ...good, independentSources: ['relayer'] } }), 'proof-not-corroborated');
  });

  it('supports rollback dry runs for canaries and preflight checks', () => {
    const model = newModel();
    const msg = lockFunds(model);
    const before = stableStringify(model.snapshot());
    const canary = model.simulate(() => {
      model.refund(msg.id, GOVERNANCE);
      return model.ledger(msg.sourceChain, msg.token).refunded;
    });
    expect(canary).toBe(msg.amount);
    expect(stableStringify(model.snapshot())).toBe(before);
    expectConservation(model);
  });
});

describe('operator recovery and solvency monitoring', () => {
  it('recovers a frozen lane by refund and resumes only after proof', () => {
    const model = newModel();
    const msg = lockFunds(model);
    model.freeze(GUARDIAN);
    expectAtomicRejection(model, () => model.recover(msg.id, GUARDIAN, 'refund', { ...proofFor(msg), independentSources: ['relayer'] }), 'proof-not-corroborated');
    model.recover(msg.id, GUARDIAN, 'refund', proofFor(msg));
    expect(model.transfer(msg.id).status).toBe('refunded');
    expect(model.recoveries).toBe(1);
    expect(model.recoveryRequired).toBe(false);
    model.unfreeze(GOVERNANCE);
    expect(model.frozen).toBe(false);
    expectConservation(model);
  });

  it('recovers a frozen locked transfer by verified delivery', () => {
    const model = newModel();
    const msg = lockFunds(model, { fee: 5n });
    model.freeze(GUARDIAN);
    model.recover(msg.id, GUARDIAN, 'deliver', proofFor(msg));
    const ledger = model.ledger(msg.sourceChain, msg.token);
    expect([ledger.held, ledger.delivered, ledger.fees]).toEqual([0n, 995n, 5n]);
    expectConservation(model);
  });

  it('requires two distinct sources for an actual balance and detects shortfalls', () => {
    const model = newModel();
    const msg = lockFunds(model);
    expectAtomicRejection(model, () => model.observeActualBalance(msg.sourceChain, msg.token, 1n, ['rpc']), 'balance-not-corroborated');
    model.observeActualBalance(msg.sourceChain, msg.token, msg.amount, ['rpc-a', 'independent-indexer']);
    expectConservation(model);
    model.observeActualBalance(msg.sourceChain, msg.token, msg.amount - 1n, ['rpc-a', 'independent-indexer']);
    expect(model.invariantViolations()).toContain(`C-2:${msg.sourceChain}:${msg.token}`);
    model.refund(msg.id, GOVERNANCE);
    expectConservation(model);
  });
});

describe('per-chain and resource-bound behavior', () => {
  it.each(CHAIN_PROFILES.map((profile) => [profile.chainId, profile] as const))(
    'settles a %s lane with chain-specific finality and conservation',
    (_id, profile) => {
      const model = newModel();
      const target = CHAIN_PROFILES.find((p) => p.chainId !== profile.chainId)!;
      const msg = message({
        sourceChain: profile.chainId,
        targetChain: target.chainId,
        bytes: Math.min(profile.maxMessageBytes, target.maxMessageBytes),
      });
      model.observeDeposit(msg, RECEIVER);
      model.setNow(START + profile.finalityDepth);
      model.finalizeDeposit(msg.id, RECEIVER, profile.finalityDepth);
      model.deliver(msg.id, RELAYER, { targetSucceeds: true, proof: proofFor(msg) });
      const ledger = model.ledger(profile.chainId, msg.token);
      expect(ledger.deposited).toBe(ledger.delivered + ledger.fees);
      expect(ledger.held).toBe(0n);
      expectConservation(model);
    },
  );

  it('enforces batch bounds before doing any work', () => {
    const model = newModel();
    const profile = model.profileFor('evm:1');
    const ids: string[] = [];
    for (let i = 0; i < profile.maxTransfersPerBatch; i++) {
      const msg = message({ id: `batch-${i}`, nonce: i, sourceChain: 'evm:1', targetChain: 'evm:10' });
      model.observeDeposit(msg, RECEIVER);
      ids.push(msg.id);
    }
    model.setNow(START + profile.finalityDepth);
    const before = stableStringify(model.snapshot());
    expectError(() => model.finalizeBatch([...ids, 'too-many'], RECEIVER, profile.finalityDepth), 'batch-out-of-bounds');
    expect(stableStringify(model.snapshot())).toBe(before);
    model.finalizeBatch(ids, RECEIVER, profile.finalityDepth);
    expect(ids.every((id) => model.transfer(id).status === 'locked')).toBe(true);
    expectAtomicRejection(model, () => model.finalizeBatch([], RECEIVER, profile.finalityDepth), 'batch-out-of-bounds');
    expectConservation(model);
  });

  it('refunds a bounded batch atomically', () => {
    const model = newModel();
    const ids = [0, 1, 2].map((nonce) => lockFunds(model, { id: `sweep-${nonce}`, nonce }).id);
    model.freeze(GUARDIAN);
    const before = stableStringify(model.snapshot());
    expectError(() => model.refundAll([...ids, 'unknown'], GOVERNANCE), 'unknown-transfer');
    expect(stableStringify(model.snapshot())).toBe(before);
    expect(model.refundAll(ids, GOVERNANCE)).toEqual(ids);
    expectConservation(model);
  });
});

describe('stateful seeded fuzz over multi-step transitions', () => {
  for (const seed of [0x1533, 0x4242, 0x9e3779b9, 0xdeadbeef]) {
    it(`preserves every invariant for seed 0x${seed.toString(16)}`, () => {
      const rng = seededRandom(seed);
      const model = newModel();
      let counter = 0;
      const senders = ['alice', 'bob', 'charlie'];
      const sourceChains = ['evm:137', 'evm:1', 'soroban:stellar'];
      const targetChains = ['evm:1', 'evm:10', 'soroban:stellar'];
      let operations = 0;

      for (let step = 0; step < 500; step++) {
        const before = stableStringify(model.snapshot());
        const op = Math.floor(rng() * 8);
        try {
          if (op === 0) {
            const sourceChain = sourceChains[Math.floor(rng() * sourceChains.length)];
            let targetChain = targetChains[Math.floor(rng() * targetChains.length)];
            if (targetChain === sourceChain) targetChain = 'evm:8453';
            const sender = senders[Math.floor(rng() * senders.length)];
            const msg = message({
              id: `fuzz-${seed}-${counter++}`,
              sourceChain,
              targetChain,
              sender,
              nonce: model.nextNonce(sender, sourceChain),
              amount: BigInt(Math.floor(rng() * 9_000) + 1),
              fee: BigInt(Math.floor(rng() * 20)),
              bytes: Math.floor(rng() * 512) + 1,
            });
            model.observeDeposit(msg, RECEIVER);
          } else if (op === 1) {
            const pending = [...model.snapshot().transfers].find((t) => t.status === 'pending');
            if (!pending) continue;
            const msg = model.transfer(pending.id).message;
            const depth = model.profileFor(msg.sourceChain).finalityDepth;
            model.setNow(model.now + depth);
            model.finalizeDeposit(pending.id, RECEIVER, depth);
          } else if (op === 2) {
            const locked = model.lockedIds();
            if (!locked.length) continue;
            const id = locked[Math.floor(rng() * locked.length)];
            const msg = model.transfer(id).message;
            model.deliver(id, RELAYER, { targetSucceeds: rng() > 0.35, proof: proofFor(msg) });
          } else if (op === 3) {
            const locked = model.lockedIds();
            if (!locked.length) continue;
            model.refund(locked[Math.floor(rng() * locked.length)], rng() > 0.5 ? GOVERNANCE : GUARDIAN);
          } else if (op === 4 && !model.frozen) {
            model.freeze(GUARDIAN);
          } else if (op === 5 && model.frozen && !model.recoveryRequired) {
            model.unfreeze(GOVERNANCE);
          } else if (op === 6) {
            const pending = [...model.snapshot().transfers].find((t) => t.status === 'pending');
            if (!pending) continue;
            const msg = model.transfer(pending.id).message;
            model.reorg(msg.sourceChain, msg.observedAt - 1, [pending.id], GOVERNANCE);
          } else if (op === 7) {
            const locked = model.lockedIds();
            if (!locked.length || !model.frozen) continue;
            const id = locked[Math.floor(rng() * locked.length)];
            model.recover(id, GUARDIAN, rng() > 0.5 ? 'refund' : 'deliver', proofFor(model.transfer(id).message));
          }
          operations++;
        } catch (error) {
          // Precondition failures are expected in a fuzz run; they must be atomic.
          expect(error).toBeInstanceOf(EscrowSpecError);
          expect(stableStringify(model.snapshot())).toBe(before);
        }
        expectConservation(model);
      }
      expect(operations).toBeGreaterThan(20);
      expect(model.invariantViolations()).toEqual([]);
    });
  }
});
