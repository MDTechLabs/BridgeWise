import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONFIG_CHAIN_PROFILES,
  CONFIG_PARAMETER_SET,
  seededRandom,
} from './production-config-bundle';
import {
  DelayedRelayerRecovery,
  RelayRecoveryError,
  RELAY_INVARIANTS,
  testMessage,
  testProbe,
  testProof,
} from './delayed-relayer-recovery';

const SPEC_DOC = join(__dirname, '..', 'docs', 'DELAYED_RELAYER_RECOVERY.md');
const RELAYER = 'relayer-1';
const GUARDIAN = 'guardian';
const ATTACKER = 'attacker';

function model(overrides: ConstructorParameters<typeof DelayedRelayerRecovery>[0] = {}) {
  return new DelayedRelayerRecovery({ now: 1_000_000, ...overrides });
}

function expectError(fn: () => unknown, code: string): RelayRecoveryError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(RelayRecoveryError);
    expect((error as RelayRecoveryError).code).toBe(code);
    return error as RelayRecoveryError;
  }
  throw new Error(`expected RelayRecoveryError ${code}`);
}

function expectAtomic(relay: DelayedRelayerRecovery, fn: () => unknown, code: string): void {
  const before = JSON.stringify(relay.snapshot());
  expectError(fn, code);
  expect(JSON.stringify(relay.snapshot())).toBe(before);
  expect(relay.invariantViolations()).toEqual([]);
}

function prepared() {
  const relay = model();
  const message = testMessage();
  relay.observe(message, RELAYER);
  relay.submit(message.id, RELAYER, `0x${'a'.repeat(64)}`);
  return { relay, message };
}

describe('delayed relayer recovery specification', () => {
  it('documents every invariant, chain and parameter version in the normative spec', () => {
    const doc = readFileSync(SPEC_DOC, 'utf8');
    for (const id of RELAY_INVARIANTS) expect(doc).toContain(`\`${id}\``);
    for (const profile of CONFIG_CHAIN_PROFILES) expect(doc).toContain(`\`${profile.chainId}\``);
    expect(doc).toContain(CONFIG_PARAMETER_SET);
    expect(doc).toContain('`duplicate-destination-execution`');
    expect(doc).toContain('`recovery-requires-unexecuted-target`');
  });

  it('rejects malformed service configuration', () => {
    expectError(() => model({ profiles: [] }), 'invalid-profiles');
    expectError(() => model({ relayers: [] }), 'invalid-actors');
    expectError(() => model({ relayers: [GUARDIAN] }), 'invalid-actors');
    expectError(() => model({ maxAttempts: 0 }), 'invalid-bounds');
    expectError(() => model({ maxDelay: 0 }), 'invalid-bounds');
    expectError(() => model({ now: -1 }), 'invalid-time');
  });
});

describe('observation and submission', () => {
  it('records an observation, pins the nonce and conserves the ledger', () => {
    const relay = model();
    const message = testMessage();
    relay.observe(message, RELAYER);
    expect(relay.phaseOf(message.id)).toBe('observed');
    expect(relay.snapshot().messages[0].pinnedNonce).toBe(0);
    expect(relay.ledgerFor('evm:1', 'USDC')).toEqual({
      chainId: 'evm:1', token: 'USDC',
      deposited: 1000n, held: 1000n, delivered: 0n, refunded: 0n, fees: 0n,
    });
    expect(relay.invariantViolations()).toEqual([]);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['bad id', { id: 'bad id' }, 'invalid-message-id'],
    ['unsupported source', { sourceChain: 'evm:9999' }, 'unsupported-chain'],
    ['unsupported target', { targetChain: 'evm:9999' }, 'unsupported-chain'],
    ['same chain lane', { targetChain: 'evm:1' }, 'same-chain-lane'],
    ['bad token', { token: 'bad token' }, 'invalid-token'],
    ['zero amount', { amountMinorUnits: '0' }, 'amount-out-of-bounds'],
    ['fee above amount', { feeMinorUnits: '1001' }, 'amount-out-of-bounds'],
    ['fee equal to amount', { feeMinorUnits: '1000' }, 'amount-out-of-bounds'],
    ['oversized amount', { amountMinorUnits: (10n ** 30n + 1n).toString() }, 'amount-out-of-bounds'],
    ['bad nonce', { nonce: -1 }, 'invalid-nonce'],
    ['bad sender', { sender: 'x' }, 'invalid-actor-address'],
    ['future observation', { observedAt: 1_000_001 }, 'invalid-observation-time'],
    ['nonce gap', { nonce: 2 }, 'nonce-gap-or-replay'],
  ])('rejects %s atomically', (_name, patch, code) => {
    const relay = model();
    expectAtomic(relay, () => relay.observe({ ...testMessage(), ...patch }, RELAYER), code);
  });

  it('rejects unauthorized, duplicate and replayed observations', () => {
    const relay = model();
    const message = testMessage();
    expectAtomic(relay, () => relay.observe(message, ATTACKER), 'unauthorized-relayer');
    relay.observe(message, RELAYER);
    expectAtomic(relay, () => relay.observe(message, RELAYER), 'duplicate-message-id');
    expectAtomic(relay, () => relay.observe(
      testMessage({ id: 'msg-replay-2', amountMinorUnits: '2000', nonce: 0 }),
      RELAYER,
    ), 'nonce-gap-or-replay');
    const fresh = model();
    fresh.observe(message, RELAYER);
    expectAtomic(fresh, () => fresh.observe(
      testMessage({ id: 'msg-fingerprint-2' }),
      RELAYER,
    ), 'duplicate-fingerprint');
  });

  it('submits with a pinned nonce and bounds retry attempts', () => {
    const relay = model();
    const message = testMessage();
    relay.observe(message, RELAYER);
    expectAtomic(relay, () => relay.submit(message.id, ATTACKER, `0x${'a'.repeat(64)}`), 'unauthorized-relayer');
    expectAtomic(relay, () => relay.submit(message.id, RELAYER, '0x1234'), 'invalid-tx-hash');
    expectAtomic(relay, () => relay.submit('msg-unknown', RELAYER, `0x${'b'.repeat(64)}`), 'unknown-message');
    relay.submit(message.id, RELAYER, `0x${'a'.repeat(64)}`);
    expectAtomic(relay, () => relay.submit(message.id, RELAYER, `0x${'b'.repeat(64)}`), 'invalid-phase-for-submit');
    expect(relay.snapshot().messages[0].attempts).toBe(1);
    expect(relay.snapshot().messages[0].pinnedNonce).toBe(0);
  });
});

describe('probe, duplicate execution and delayed recovery', () => {
  it('consumes a message exactly once on finalized corroborated execution', () => {
    const { relay, message } = prepared();
    const ledgerBefore = relay.ledgerFor('evm:1', 'USDC');
    expect(ledgerBefore.held).toBe(1000n);
    expect(relay.probe(message.id, RELAYER, testProbe())).toBe(true);
    expect(relay.phaseOf(message.id)).toBe('delivered');
    expect(relay.ledgerFor('evm:1', 'USDC')).toEqual({
      chainId: 'evm:1', token: 'USDC',
      deposited: 1000n, held: 0n, delivered: 990n, refunded: 0n, fees: 10n,
    });
    expect(relay.snapshot().consumed).toEqual([`evm:137:${message.id}`]);
    expect(relay.invariantViolations()).toEqual([]);
    expectAtomic(relay, () => relay.probe(message.id, RELAYER, testProbe()), 'duplicate-destination-execution');
  });

  it('fails closed on uncorroborated, unconfirmed or mismatched probes', () => {
    const { relay, message } = prepared();
    expectAtomic(relay, () => relay.probe(message.id, ATTACKER, testProbe()), 'unauthorized-caller');
    expectAtomic(relay, () => relay.probe(message.id, RELAYER, testProbe({ sources: ['chain-read'] })), 'uncorroborated-probe');
    expectAtomic(relay, () => relay.probe(message.id, RELAYER, testProbe({ sources: ['chain-read', 'chain-read'] })), 'uncorroborated-probe');
    expectAtomic(relay, () => relay.probe(message.id, RELAYER, testProbe({ confirmations: -1 })), 'invalid-probe');
    expectAtomic(relay, () => relay.probe(message.id, RELAYER, testProbe({ messageId: 'msg-other' })), 'probe-mismatch');
    expectAtomic(relay, () => relay.probe(message.id, RELAYER, testProbe({ targetChain: 'evm:1' })), 'probe-mismatch');
    expect(relay.probe(message.id, RELAYER, testProbe({ executed: false }))).toBe(false);
    expect(relay.probe(message.id, RELAYER, testProbe({ confirmations: 127 }))).toBe(false);
    expect(relay.phaseOf(message.id)).toBe('submitted');
    expect(relay.ledgerFor('evm:1', 'USDC').held).toBe(1000n);
  });

  it('requires the delay to elapse before a lost submission can be recovered', () => {
    const { relay, message } = prepared();
    expectAtomic(relay, () => relay.markLost(message.id, GUARDIAN), 'delay-not-elapsed');
    relay.setNow(relay.now + 10);
    expectAtomic(relay, () => relay.markLost(message.id, ATTACKER), 'unauthorized-guardian');
    relay.markLost(message.id, GUARDIAN);
    expect(relay.phaseOf(message.id)).toBe('lost');
    expect(relay.ledgerFor('evm:1', 'USDC').held).toBe(1000n);
    expect(relay.invariantViolations()).toEqual([]);
  });

  it('resubmits with the pinned nonce after a delayed loss', () => {
    const { relay, message } = prepared();
    relay.setNow(relay.now + 10);
    relay.markLost(message.id, GUARDIAN);
    expectAtomic(relay, () => relay.recover(message.id, ATTACKER, 'resubmit', testProof()), 'unauthorized-guardian');
    expectAtomic(relay, () => relay.recover(message.id, GUARDIAN, 'resubmit', testProof({ executed: true })), 'recovery-requires-unexecuted-target');
    expectAtomic(relay, () => relay.recover(message.id, GUARDIAN, 'resubmit', testProof({ finalized: false })), 'recovery-requires-unexecuted-target');
    expectAtomic(relay, () => relay.recover(message.id, GUARDIAN, 'resubmit', testProof({ sources: ['chain-read'] })), 'invalid-proof');
    expectAtomic(relay, () => relay.recover(message.id, GUARDIAN, 'resubmit', testProof({ sourceNonce: 9 })), 'invalid-proof');
    relay.recover(message.id, GUARDIAN, 'resubmit', testProof());
    const state = relay.snapshot().messages[0];
    expect(state.phase).toBe('submitted');
    expect(state.attempts).toBe(2);
    expect(state.pinnedNonce).toBe(message.nonce);
    expect(relay.ledgerFor('evm:1', 'USDC').deposited).toBe(1000n);
  });

  it('refunds only a corroborated unexecuted target and consumes the destination key', () => {
    const { relay, message } = prepared();
    relay.setNow(relay.now + 10);
    relay.markLost(message.id, GUARDIAN);
    expectAtomic(relay, () => relay.recover(message.id, GUARDIAN, 'burn' as 'resubmit', testProof()), 'invalid-resolution');
    relay.recover(message.id, GUARDIAN, 'refund', testProof());
    expect(relay.phaseOf(message.id)).toBe('refunded');
    expect(relay.ledgerFor('evm:1', 'USDC')).toEqual({
      chainId: 'evm:1', token: 'USDC',
      deposited: 1000n, held: 0n, delivered: 0n, refunded: 1000n, fees: 0n,
    });
    expectAtomic(relay, () => relay.recover(message.id, GUARDIAN, 'refund', testProof()), 'invalid-phase-for-recovery');
    expectAtomic(relay, () => relay.probe(message.id, RELAYER, testProbe()), 'duplicate-destination-execution');
    expect(relay.invariantViolations()).toEqual([]);
  });

  it('enforces the retry bound across repeated losses', () => {
    const relay = model({ maxAttempts: 2 });
    const message = testMessage();
    relay.observe(message, RELAYER);
    relay.submit(message.id, RELAYER, `0x${'a'.repeat(64)}`);
    relay.setNow(relay.now + 10);
    relay.markLost(message.id, GUARDIAN);
    relay.recover(message.id, GUARDIAN, 'resubmit', testProof());
    relay.setNow(relay.now + 10);
    relay.markLost(message.id, GUARDIAN);
    expectAtomic(relay, () => relay.recover(message.id, GUARDIAN, 'resubmit', testProof()), 'attempts-exhausted');
    relay.recover(message.id, GUARDIAN, 'refund', testProof());
    expect(relay.invariantViolations()).toEqual([]);
  });
});

describe('reorg, freeze and bounded state', () => {
  it('drops unfinalized observations and rejects finalized reorgs atomically', () => {
    const relay = model();
    const first = testMessage({ id: 'msg-unfinalized' });
    const second = testMessage({ id: 'msg-finalized', nonce: 1, observedAt: 1_000_000 });
    relay.observe(first, RELAYER);
    relay.observe(second, RELAYER);
    relay.submit(second.id, RELAYER, `0x${'a'.repeat(64)}`);
    expectAtomic(relay, () => relay.reorg('evm:1', [second.id], GUARDIAN), 'finalized-reorg-requires-recovery');
    expectAtomic(relay, () => relay.reorg('evm:1', [first.id, first.id], GUARDIAN), 'duplicate-reorg-id');
    expectAtomic(relay, () => relay.reorg('evm:1', [second.id], ATTACKER), 'unauthorized-guardian');
    relay.reorg('evm:1', [first.id], GUARDIAN);
    expect(relay.ledgerFor('evm:1', 'USDC').deposited).toBe(1000n);
    expectError(() => relay.phaseOf(first.id), 'unknown-message');
    expect(relay.invariantViolations()).toEqual([]);
  });

  it('rejects reorgs outside the reviewed window', () => {
    const relay = model();
    relay.observe(testMessage(), RELAYER);
    relay.setNow(1_000_000 + 65);
    expectAtomic(relay, () => relay.reorg('evm:1', [testMessage().id], GUARDIAN), 'outside-reorg-window');
  });

  it('freezes and unfreezes lanes only for guardians', () => {
    const relay = model();
    expectAtomic(relay, () => relay.freeze('evm:1', ATTACKER), 'unauthorized-guardian');
    relay.freeze('evm:1', GUARDIAN);
    expectAtomic(relay, () => relay.observe(testMessage(), RELAYER), 'lane-frozen');
    relay.unfreeze('evm:1', GUARDIAN);
    expect(() => relay.observe(testMessage(), RELAYER)).not.toThrow();
    expect(relay.invariantViolations()).toEqual([]);
  });

  it('bounds reorg batches and tracked messages', () => {
    const relay = model();
    const ids = Array.from({ length: 129 }, (_, index) => `msg-batch-${index}`);
    expectAtomic(relay, () => relay.reorg('evm:1', ids, GUARDIAN), 'invalid-reorg-batch');
    for (let index = 0; index < 257; index++) {
      relay.observe(testMessage({ id: `msg-bound-${index}`, nonce: index }), RELAYER);
    }
    expect(relay.invariantViolations()).toContain('D-4');
  });
});

describe('stateful fuzz across delayed recovery transitions', () => {
  it('preserves conservation and at-most-once execution under randomized sequences', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const random = seededRandom(seed);
      const relay = model();
      let counter = 0;
      for (let step = 0; step < 60; step++) {
        const snapshot = relay.snapshot();
        const candidates = snapshot.messages;
        const pick = (phases: string[]) => {
          const matching = candidates.filter((item) => phases.includes(item.phase));
          return matching.length ? matching[Math.floor(random() * matching.length)] : undefined;
        };
        const before = JSON.stringify(snapshot);
        try {
          switch (Math.floor(random() * 6)) {
            case 0:
              relay.observe(testMessage({
                id: `msg-fuzz-${counter}`,
                nonce: counter,
                observedAt: relay.now,
              }), RELAYER);
              counter++;
              break;
            case 1: {
              const target = pick(['observed', 'lost']);
              if (target) relay.submit(target.id, RELAYER, `0x${Math.floor(random() * 9 + 1).toString(16).repeat(64)}`);
              break;
            }
            case 2: {
              const target = pick(['submitted', 'lost', 'delivered', 'refunded']);
              if (target) relay.probe(target.id, RELAYER, testProbe({
                messageId: target.id,
                targetChain: target.targetChain,
                executed: random() < 0.6,
                confirmations: random() < 0.2 ? 1 : 128,
                sources: random() < 0.2 ? ['chain-read'] : ['chain-read', 'independent-indexer'],
              }));
              break;
            }
            case 3: {
              const target = pick(['submitted']);
              if (target) {
                relay.setNow(relay.now + 11);
                relay.markLost(target.id, GUARDIAN);
              }
              break;
            }
            case 4: {
              const target = pick(['lost']);
              if (target) relay.recover(target.id, GUARDIAN, random() < 0.5 ? 'refund' : 'resubmit', testProof({
                messageId: target.id,
                sourceNonce: target.pinnedNonce,
                sources: random() < 0.2 ? ['chain-read'] : ['chain-read', 'independent-indexer'],
              }));
              break;
            }
            default: {
              const target = pick(['observed']);
              if (target) relay.reorg(target.sourceChain, [target.id], GUARDIAN);
            }
          }
        } catch (error) {
          expect(error).toBeInstanceOf(RelayRecoveryError);
          expect(JSON.stringify(relay.snapshot())).toBe(before);
        }
        const violations = relay.invariantViolations().filter((id) => id !== 'D-4');
        expect(violations).toEqual([]);
      }
      const consumed = relay.snapshot().consumed;
      expect(new Set(consumed).size).toBe(consumed.length);
    }
  });
});
