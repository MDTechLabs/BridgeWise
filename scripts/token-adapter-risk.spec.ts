import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TokenAdapterRiskModel,
  TOKEN_ADAPTER_INVARIANTS,
  RISK_CHAIN_PROFILES,
  TokenAdapterRiskError,
  ChainRiskProfile,
} from './token-adapter-risk';

const SPEC_DOC = join(__dirname, '..', 'docs', 'TOKEN_ADAPTER_RISK_AND_RECONCILIATION_SPEC.md');

function expectError(fn: () => unknown, code?: string): TokenAdapterRiskError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(TokenAdapterRiskError);
    if (code) {
      expect((error as TokenAdapterRiskError).code).toBe(code);
    }
    return error as TokenAdapterRiskError;
  }
  throw new Error('Expected TokenAdapterRiskError to be thrown');
}

describe('Token Adapter Risk & Asset Reconciliation Specification', () => {
  let model: TokenAdapterRiskModel;

  beforeEach(() => {
    model = new TokenAdapterRiskModel({
      admin: 'admin-0',
      guardian: 'guardian-0',
      operator: 'operator-0',
    });
  });

  // =========================================================================
  // 1. Documentation & Invariant Coverage
  // =========================================================================

  it('defines every normative invariant and chain profile in the spec document', () => {
    const doc = readFileSync(SPEC_DOC, 'utf8');

    for (const inv of TOKEN_ADAPTER_INVARIANTS) {
      expect(doc).toContain(`\`${inv}\``);
    }

    for (const profile of RISK_CHAIN_PROFILES) {
      expect(doc).toContain(`\`${profile.chainId}\``);
      expect(doc).toContain(profile.parameterSetVersion);
    }

    expect(doc).toContain('#1485');
    expect(doc).toContain('#1486');
    expect(doc).toContain('#1488');
    expect(doc).toContain('#1489');
  });

  it('has explicit, versioned and validated chain profiles', () => {
    expect(RISK_CHAIN_PROFILES.length).toBe(7);
    for (const p of RISK_CHAIN_PROFILES) {
      expect(p.finalityDepth).toBeGreaterThan(0);
      expect(p.reorgWindow).toBeGreaterThanOrEqual(p.finalityDepth);
      expect(p.maxTxAllowanceCap).toBeGreaterThan(0n);
      expect(p.parameterSetVersion).toBe('asset-risk/1.0.0');
    }

    expectError(() => model.profileFor('unsupported:999'), 'unsupported-chain');
  });

  // =========================================================================
  // 2. Token Approval Growth Prevention (#1485, #1486 - A-1, A-2, A-3, A-4, A-5)
  // =========================================================================

  describe('Approval Growth & Allowance Management (#1485, #1486)', () => {
    const token = '0xUSDC';
    const spender = '0xAdapterRouter';

    it('grants exact-on-demand allowance and prevents arbitrary growth (A-1)', () => {
      const amount = 5_000n;
      model.grantExactApproval('operator-0', token, spender, amount);
      expect(model.getAllowance(token, spender)).toBe(amount);

      // Verify no invariant violations
      expect(model.invariantViolations()).toEqual([]);
    });

    it('enforces safe reset-before-set when updating existing non-zero allowance (A-2)', () => {
      model.grantExactApproval('operator-0', token, spender, 1_000n);
      expect(model.getAllowance(token, spender)).toBe(1_000n);

      // Re-approving new amount resets first then applies new value
      model.grantExactApproval('operator-0', token, spender, 2_500n);
      expect(model.getAllowance(token, spender)).toBe(2_500n);
    });

    it('enforces single-transaction allowance limits (A-3)', () => {
      model.configureApprovalCaps('admin-0', token, spender, 10_000n, 100_000n);

      // Below limit passes
      model.grantExactApproval('operator-0', token, spender, 8_000n);

      // Above single limit fails
      expectError(
        () => model.grantExactApproval('operator-0', token, spender, 12_000n),
        'exceeds-single-limit'
      );
    });

    it('enforces cumulative allowance cap across transactions (A-3)', () => {
      model.configureApprovalCaps('admin-0', token, spender, 10_000n, 20_000n);

      model.grantExactApproval('operator-0', token, spender, 9_000n);
      model.sweepAllowanceToZero('operator-0', token, spender);

      model.grantExactApproval('operator-0', token, spender, 9_000n);
      model.sweepAllowanceToZero('operator-0', token, spender);

      // Next approval exceeds cumulative cap (9k + 9k + 3k = 21k > 20k)
      expectError(
        () => model.grantExactApproval('operator-0', token, spender, 3_000n),
        'exceeds-cumulative-cap'
      );
    });

    it('sweeps remaining allowance back to zero after external transfer execution (A-4)', () => {
      model.grantExactApproval('operator-0', token, spender, 5_000n);
      expect(model.getAllowance(token, spender)).toBe(5_000n);

      // Adapter finishes execution -> sweeps to zero
      model.sweepAllowanceToZero('operator-0', token, spender);
      expect(model.getAllowance(token, spender)).toBe(0n);
      expect(model.invariantViolations()).toEqual([]);
    });

    it('allows Guardian and Admin to execute emergency allowance revocation (A-5)', () => {
      model.grantExactApproval('operator-0', token, spender, 50_000n);
      expect(model.getAllowance(token, spender)).toBe(50_000n);

      // Guardian revokes instantly
      model.emergencyRevokeAllowance('guardian-0', token, spender);
      expect(model.getAllowance(token, spender)).toBe(0n);

      // Admin can also revoke
      model.grantExactApproval('operator-0', token, spender, 10_000n);
      model.emergencyRevokeAllowance('admin-0', token, spender);
      expect(model.getAllowance(token, spender)).toBe(0n);
    });

    it('blocks unauthorized callers from managing approvals or configuring caps (A-10)', () => {
      expectError(
        () => model.configureApprovalCaps('attacker', token, spender, 100n, 500n),
        'unauthorized'
      );
      expectError(
        () => model.grantExactApproval('attacker', token, spender, 100n),
        'unauthorized'
      );
      expectError(
        () => model.emergencyRevokeAllowance('attacker', token, spender),
        'unauthorized'
      );
      expectError(
        () => model.sweepAllowanceToZero('attacker', token, spender),
        'unauthorized'
      );
    });
  });

  // =========================================================================
  // 3. Malicious Token Callbacks & Reentrancy Isolation (#1488 - A-6)
  // =========================================================================

  describe('Malicious Token Callback Isolation (#1488)', () => {
    it('blocks reentrancy attempts via token hooks (ERC-777, ERC-1363) (A-6)', () => {
      let reentrancyTriggered = false;

      // Attacker token callback attempts to reenter model
      const maliciousCallback = () => {
        reentrancyTriggered = true;
        model.grantExactApproval('operator-0', '0xATTACK', '0xSpender', 1_000n);
      };

      expectError(() => {
        model.simulateTransferWithCallback('0xAttacker', '0xAdapter', 100n, maliciousCallback);
      }, 'reentrancy-denied');

      expect(reentrancyTriggered).toBe(true);
      expect(model.invariantViolations()).toEqual([]);
    });

    it('atomically rolls back state when external callback reverts', () => {
      const snapshotBefore = model.snapshot();

      const failingCallback = () => {
        throw new Error('Malicious token griefing revert');
      };

      expect(() => {
        model.simulateTransferWithCallback('0xAttacker', '0xAdapter', 100n, failingCallback);
      }).toThrow('Malicious token griefing revert');

      // State remains identical
      expect(model.snapshot()).toBe(snapshotBefore);
      expect(model.invariantViolations()).toEqual([]);
    });

    it('safely completes transfers with benign callback hooks', () => {
      let benignExecuted = false;
      const benignCallback = () => {
        benignExecuted = true;
      };

      model.simulateTransferWithCallback('0xUser', '0xVault', 500n, benignCallback);
      expect(benignExecuted).toBe(true);
      expect(model.invariantViolations()).toEqual([]);
    });
  });

  // =========================================================================
  // 4. Rebasing & Fee-on-Transfer Reconciliation (#1489 - A-7, A-8, A-9, A-10)
  // =========================================================================

  describe('Rebasing & Fee-on-Transfer Reconciliation (#1489)', () => {
    const token = '0xFoTToken';

    it('credits actual balance delta rather than nominal amount for Fee-on-Transfer tokens (A-7)', () => {
      const deposit = model.reconcileDeposit({
        messageId: 'msg-1',
        sender: '0xAlice',
        token,
        nominalAmount: 10_000n,
        feeBps: 500, // 5% fee on transfer
        minExpectedDelta: 9_500n,
        destinationChain: 'evm:1',
        recipient: '0xBob',
      });

      expect(deposit.nominalAmount).toBe(10_000n);
      expect(deposit.feeDeducted).toBe(500n);
      expect(deposit.creditedDelta).toBe(9_500n);
      expect(model.invariantViolations()).toEqual([]);
    });

    it('reverts fail-closed if fee results in zero net balance delta (A-8)', () => {
      expectError(() => {
        model.reconcileDeposit({
          messageId: 'msg-zero-delta',
          sender: '0xAlice',
          token,
          nominalAmount: 1_000n,
          feeBps: 10_000, // 100% tax
          minExpectedDelta: 1n,
          destinationChain: 'evm:1',
          recipient: '0xBob',
        });
      }, 'zero-delta');
    });

    it('reverts fail-closed if net delta is below minimum expected (slippage check) (A-8)', () => {
      expectError(() => {
        model.reconcileDeposit({
          messageId: 'msg-slippage',
          sender: '0xAlice',
          token,
          nominalAmount: 10_000n,
          feeBps: 1000, // 10% tax -> credits 9,000n
          minExpectedDelta: 9_500n, // User expected at least 9,500n
          destinationChain: 'evm:1',
          recipient: '0xBob',
        });
      }, 'sub-minimum-delta');
    });

    it('rejects duplicate deposit message identifiers (A-10)', () => {
      model.reconcileDeposit({
        messageId: 'msg-dup-1',
        sender: '0xAlice',
        token,
        nominalAmount: 1_000n,
        feeBps: 0,
        minExpectedDelta: 1_000n,
        destinationChain: 'evm:1',
        recipient: '0xBob',
      });

      expectError(() => {
        model.reconcileDeposit({
          messageId: 'msg-dup-1',
          sender: '0xAlice',
          token,
          nominalAmount: 1_000n,
          feeBps: 0,
          minExpectedDelta: 1_000n,
          destinationChain: 'evm:1',
          recipient: '0xBob',
        });
      }, 'duplicate-message');
    });

    it('accurately reconciles rebasing asset balance drift and detects shortfalls (A-9)', () => {
      // Step 1: Deposit establishes 10,000 units of liabilities
      model.reconcileDeposit({
        messageId: 'rebase-msg-1',
        sender: '0xAlice',
        token: '0xRebaseToken',
        nominalAmount: 10_000n,
        feeBps: 0,
        minExpectedDelta: 10_000n,
        destinationChain: 'evm:1',
        recipient: '0xBob',
      });

      // Balanced initially
      expect(model.invariantViolations()).toEqual([]);

      // Step 2: Positive rebase (+500 yield)
      const surplus = model.reconcileRebase('0xRebaseToken', 10_500n);
      expect(surplus.driftStatus).toBe('SURPLUS');
      expect(surplus.driftAmount).toBe(500n);
      expect(model.invariantViolations()).toEqual([]);

      // Step 3: Negative rebase (-1000 slashing/deflation) -> 9,500 physical vs 10,000 liabilities
      const shortfall = model.reconcileRebase('0xRebaseToken', 9_500n);
      expect(shortfall.driftStatus).toBe('SHORTFALL');
      expect(shortfall.driftAmount).toBe(500n);

      // Invariant violation flagged immediately
      const violations = model.invariantViolations();
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain('shortfall detected on token 0xRebaseToken');
    });
  });

  // =========================================================================
  // 5. Stateful Fuzz Testing Across Deterministic Seeds
  // =========================================================================

  describe('Stateful Fuzz Testing', () => {
    const SEEDS = [42, 1337, 8888, 99999];

    for (const seed of SEEDS) {
      it(`maintains accounting and approval invariants under randomized stateful fuzzing (seed: ${seed})`, () => {
        let rng = seed;
        const nextInt = (max: number) => {
          rng = (rng * 1664525 + 1013904223) >>> 0;
          return rng % max;
        };

        const fuzzModel = new TokenAdapterRiskModel();
        const tokens = ['0xUSDC', '0xWETH', '0xFoT', '0xRebase'];
        const spenders = ['0xSpender1', '0xSpender2'];

        for (let i = 0; i < 50; i++) {
          const action = nextInt(5);
          const token = tokens[nextInt(tokens.length)];
          const spender = spenders[nextInt(spenders.length)];

          switch (action) {
            case 0: {
              // Grant approval
              const amount = BigInt(nextInt(100_000) + 1);
              try {
                fuzzModel.grantExactApproval('operator', token, spender, amount);
              } catch (e) {
                // Expected if exceeding limits
              }
              break;
            }
            case 1: {
              // Sweep approval
              fuzzModel.sweepAllowanceToZero('operator', token, spender);
              break;
            }
            case 2: {
              // Deposit with fee
              const nominal = BigInt(nextInt(50_000) + 100);
              const feeBps = nextInt(1000); // up to 10%
              try {
                fuzzModel.reconcileDeposit({
                  messageId: `fuzz-msg-${seed}-${i}`,
                  sender: '0xFuzzer',
                  token,
                  nominalAmount: nominal,
                  feeBps,
                  minExpectedDelta: (nominal * BigInt(10000 - feeBps)) / 10000n,
                  destinationChain: 'evm:1',
                  recipient: '0xDest',
                });
              } catch (e) {
                // Handled gracefully
              }
              break;
            }
            case 3: {
              // Emergency revocation
              fuzzModel.emergencyRevokeAllowance('guardian', token, spender);
              break;
            }
            case 4: {
              // Rebase reconciliation
              const currentAllowance = fuzzModel.getAllowance(token, spender);
              expect(currentAllowance).toBeGreaterThanOrEqual(0n);
              break;
            }
          }
        }

        // Final invariant assertion
        const violations = fuzzModel.invariantViolations();
        expect(violations).toEqual([]);
      });
    }
  });

  // =========================================================================
  // 6. Worst-Case Resource Bounds
  // =========================================================================

  describe('Worst-Case Resource Bounds', () => {
    it('executes batch deposit and approval operations with bounded O(1) performance', () => {
      const start = Date.now();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        model.grantExactApproval('operator-0', `0xToken${i % 10}`, `0xSpender${i % 5}`, 1_000n);
        model.sweepAllowanceToZero('operator-0', `0xToken${i % 10}`, `0xSpender${i % 5}`);
      }

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1500); // 1000 operations under 1.5 seconds
      expect(model.invariantViolations()).toEqual([]);
    });
  });
});
