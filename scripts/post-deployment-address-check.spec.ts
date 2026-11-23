import {
  MAX_VALIDATORS,
  PostDeploymentPlan,
  PostDeploymentReader,
  ValidatorRole,
  runPostDeploymentAddressCheck,
  validatePostDeploymentPlan,
} from './post-deployment-address-check';

const addr = (n: number): string => `0x${n.toString(16).padStart(40, '0')}`;
const ORACLE = addr(100);
const PRIMARY = addr(101);
const FALLBACK = addr(102);
const OWNER = addr(103);
const VSM = addr(200);
const VALIDATORS = [1, 2, 3, 4, 5].map(addr);
const PROPOSER = addr(10);
const DEPLOYER = addr(11);
const ADMIN = addr(12);

function makePlan(overrides: Partial<PostDeploymentPlan> = {}): PostDeploymentPlan {
  return {
    chainId: 31337,
    deployedAtBlock: 0,
    minConfirmations: 2,
    oracle: { address: ORACLE, primary: PRIMARY, fallback: FALLBACK, owner: OWNER },
    validatorSet: {
      address: VSM,
      validators: VALIDATORS,
      threshold: 3,
      proposers: [PROPOSER],
      forbiddenRoleHolders: [DEPLOYER],
    },
    ...overrides,
  };
}

interface ChainState {
  code: Set<string>;
  oracle: { primary: string; fallback: string; owner: string };
  validators: string[];
  threshold: number;
  pending: { validators: string[]; threshold: number; activeAt: number } | null;
  roles: Record<ValidatorRole, Set<string>>;
}

function cloneState(s: ChainState): ChainState {
  return {
    code: new Set(s.code),
    oracle: { ...s.oracle },
    validators: [...s.validators],
    threshold: s.threshold,
    pending: s.pending ? { ...s.pending, validators: [...s.pending.validators] } : null,
    roles: { PROPOSER: new Set(s.roles.PROPOSER), DEFAULT_ADMIN: new Set(s.roles.DEFAULT_ADMIN) },
  };
}

function goodState(): ChainState {
  return {
    code: new Set([ORACLE, PRIMARY, FALLBACK, VSM]),
    oracle: { primary: PRIMARY, fallback: FALLBACK, owner: OWNER },
    validators: [...VALIDATORS],
    threshold: 3,
    pending: null,
    roles: { PROPOSER: new Set([PROPOSER]), DEFAULT_ADMIN: new Set([ADMIN]) },
  };
}

/** In-memory chain with per-block history so reads can be pinned. */
class FakeChain implements PostDeploymentReader {
  history: ChainState[] = [goodState()];
  chainId = 31337n;
  readCalls: string[] = [];
  failing = new Set<string>();
  overrides: Partial<Record<string, unknown>> = {};

  get head(): number {
    return this.history.length - 1;
  }
  get state(): ChainState {
    return this.history[this.head];
  }
  mine(mutate: (s: ChainState) => void = () => {}): void {
    const next = cloneState(this.state);
    mutate(next);
    this.history.push(next);
  }
  private at(block: number): ChainState {
    const s = this.history[block];
    if (!s) throw new Error('unknown block');
    return s;
  }
  private maybeFail(name: string): void {
    this.readCalls.push(name);
    if (this.failing.has(name)) throw new Error('rpc down https://rpc.example/?key=secret');
  }

  async getChainId() {
    this.maybeFail('getChainId');
    return this.chainId;
  }
  async getBlockNumber() {
    this.maybeFail('getBlockNumber');
    return this.head;
  }
  async getCode(address: string, block: number) {
    this.maybeFail('getCode');
    return this.at(block).code.has(address) ? '0x6080' : '0x';
  }
  async readOracle(_address: string, block: number) {
    this.maybeFail('readOracle');
    return { ...this.at(block).oracle, ...(this.overrides.oracle as object) };
  }
  async readValidatorSet(_address: string, block: number) {
    this.maybeFail('readValidatorSet');
    const s = this.at(block);
    return {
      validators: (this.overrides.validators as string[]) ?? [...s.validators],
      threshold: (this.overrides.threshold as number | bigint) ?? s.threshold,
      hasPendingProposal: s.pending !== null,
    };
  }
  async hasRole(_address: string, role: ValidatorRole, account: string, block: number) {
    this.maybeFail('hasRole');
    return this.at(block).roles[role].has(account);
  }
}

function settle(chain: FakeChain, blocks = 3): void {
  for (let i = 0; i < blocks; i++) chain.mine();
}

const failed = (r: { checks: Array<{ id: string; status: string }> }) =>
  r.checks.filter((c) => c.status === 'failed').map((c) => c.id);

describe('post-deployment oracle and validator address check', () => {
  describe('happy path', () => {
    it('passes when observed state equals the reviewed plan', async () => {
      const chain = new FakeChain();
      settle(chain);
      const report = await runPostDeploymentAddressCheck(makePlan(), chain);
      expect(failed(report)).toEqual([]);
      expect(report.passed).toBe(true);
      expect(report.checkedBlock).toBe(chain.head - 2);
    });

    it('treats validator ordering and address case as irrelevant', async () => {
      const chain = new FakeChain();
      chain.history[0].validators = [...VALIDATORS].reverse();
      settle(chain);
      const plan = makePlan();
      plan.oracle.primary = PRIMARY.toUpperCase().replace('0X', '0x');
      expect((await runPostDeploymentAddressCheck(plan, chain)).passed).toBe(true);
    });
  });

  describe('plan validation', () => {
    it.each([
      ['null plan', null],
      ['zero chain id', { ...makePlan(), chainId: 0 }],
      ['negative deploy block', { ...makePlan(), deployedAtBlock: -1 }],
      ['zero confirmations', { ...makePlan(), minConfirmations: 0 }],
      ['zero oracle address', { ...makePlan(), oracle: { ...makePlan().oracle, address: addr(0) } }],
      ['malformed primary', { ...makePlan(), oracle: { ...makePlan().oracle, primary: '0x12' } }],
      ['empty validators', { ...makePlan(), validatorSet: { ...makePlan().validatorSet, validators: [] } }],
      ['duplicate validators', { ...makePlan(), validatorSet: { ...makePlan().validatorSet, validators: [addr(1), addr(1)], threshold: 1 } }],
      ['threshold zero', { ...makePlan(), validatorSet: { ...makePlan().validatorSet, threshold: 0 } }],
      ['threshold above count', { ...makePlan(), validatorSet: { ...makePlan().validatorSet, threshold: 6 } }],
      ['too many validators', { ...makePlan(), validatorSet: { ...makePlan().validatorSet, validators: Array.from({ length: MAX_VALIDATORS + 1 }, (_, i) => addr(i + 1)), threshold: 1 } }],
      ['non-array proposers', { ...makePlan(), validatorSet: { ...makePlan().validatorSet, proposers: 'x' } }],
    ])('rejects %s', async (_name, plan) => {
      expect(() => validatePostDeploymentPlan(plan)).toThrow(TypeError);
      await expect(runPostDeploymentAddressCheck(plan, new FakeChain())).rejects.toThrow(TypeError);
    });

    it('accepts boundary values (single validator, 256 validators, 1 confirmation)', () => {
      const one = makePlan({ minConfirmations: 1 });
      one.validatorSet.validators = [addr(1)];
      one.validatorSet.threshold = 1;
      expect(() => validatePostDeploymentPlan(one)).not.toThrow();

      const max = makePlan();
      max.validatorSet.validators = Array.from({ length: MAX_VALIDATORS }, (_, i) => addr(i + 1));
      max.validatorSet.threshold = MAX_VALIDATORS;
      expect(() => validatePostDeploymentPlan(max)).not.toThrow();
    });

    it('fails policy checks for identical oracles and a non-majority threshold', async () => {
      const chain = new FakeChain();
      settle(chain);
      const plan = makePlan();
      plan.oracle.fallback = PRIMARY;
      plan.validatorSet.threshold = 2;
      const report = await runPostDeploymentAddressCheck(plan, chain);
      expect(failed(report)).toEqual(
        expect.arrayContaining(['plan:oracle-distinct', 'plan:threshold-majority']),
      );
      expect(report.passed).toBe(false);
    });
  });

  describe('adversarial and mismatched configuration', () => {
    it('detects a swapped primary or fallback oracle', async () => {
      const chain = new FakeChain();
      chain.history[0].oracle.primary = addr(666);
      chain.history[0].oracle.fallback = addr(667);
      settle(chain);
      const report = await runPostDeploymentAddressCheck(makePlan(), chain);
      expect(failed(report)).toEqual(expect.arrayContaining(['oracle:primary', 'oracle:fallback']));
    });

    it('detects both feeds pointing at the same address on chain', async () => {
      const chain = new FakeChain();
      chain.history[0].oracle.fallback = PRIMARY;
      settle(chain);
      expect(failed(await runPostDeploymentAddressCheck(makePlan(), chain))).toEqual(
        expect.arrayContaining(['oracle:fallback', 'oracle:distinct-on-chain']),
      );
    });

    it('detects an oracle owner that is not the reviewed governance address', async () => {
      const chain = new FakeChain();
      chain.history[0].oracle.owner = DEPLOYER;
      settle(chain);
      expect(failed(await runPostDeploymentAddressCheck(makePlan(), chain))).toContain('oracle:owner');
    });

    it('detects feeds or contracts with no runtime code (EOA or zero address)', async () => {
      const chain = new FakeChain();
      chain.history[0].code.delete(PRIMARY);
      chain.history[0].code.delete(VSM);
      chain.history[0].oracle.fallback = addr(0);
      settle(chain);
      const report = await runPostDeploymentAddressCheck(makePlan(), chain);
      expect(failed(report)).toEqual(
        expect.arrayContaining(['oracle:primary-code', 'validators:contract-code', 'oracle:fallback']),
      );
    });

    it('detects missing, extra, duplicate and zero validators', async () => {
      for (const validators of [
        VALIDATORS.slice(1),
        [...VALIDATORS, addr(99)],
        [addr(1), addr(1), addr(2), addr(3), addr(4)],
        [addr(0), addr(2), addr(3), addr(4), addr(5)],
        ['not-an-address', ...VALIDATORS.slice(1)],
      ]) {
        const chain = new FakeChain();
        chain.overrides.validators = validators;
        settle(chain);
        const report = await runPostDeploymentAddressCheck(makePlan(), chain);
        expect(failed(report)).toContain('validators:set');
      }
    });

    it('rejects an oversized observed validator set without iterating it', async () => {
      const chain = new FakeChain();
      chain.overrides.validators = Array.from({ length: MAX_VALIDATORS + 1 }, (_, i) => addr(i + 1));
      settle(chain);
      expect(failed(await runPostDeploymentAddressCheck(makePlan(), chain))).toContain('validators:set');
    });

    it('detects a wrong threshold, including bigint values', async () => {
      for (const threshold of [1, 5, 0, 3n + 1n]) {
        const chain = new FakeChain();
        chain.overrides.threshold = threshold;
        settle(chain);
        expect(failed(await runPostDeploymentAddressCheck(makePlan(), chain))).toContain('validators:threshold');
      }
      const ok = new FakeChain();
      ok.overrides.threshold = 3n;
      settle(ok);
      expect((await runPostDeploymentAddressCheck(makePlan(), ok)).passed).toBe(true);
    });

    it('detects a pending validator proposal', async () => {
      const chain = new FakeChain();
      chain.history[0].pending = { validators: [addr(666)], threshold: 1, activeAt: 99 };
      settle(chain);
      expect(failed(await runPostDeploymentAddressCheck(makePlan(), chain))).toContain(
        'validators:no-pending-proposal',
      );
    });

    it('detects a lingering deployer role and a missing proposer', async () => {
      const chain = new FakeChain();
      chain.history[0].roles.PROPOSER.add(DEPLOYER);
      chain.history[0].roles.DEFAULT_ADMIN.add(DEPLOYER);
      chain.history[0].roles.PROPOSER.delete(PROPOSER);
      settle(chain);
      expect(failed(await runPostDeploymentAddressCheck(makePlan(), chain))).toEqual(
        expect.arrayContaining([
          `validators:role:PROPOSER:${PROPOSER}`,
          `validators:role:PROPOSER:${DEPLOYER}`,
          `validators:role:DEFAULT_ADMIN:${DEPLOYER}`,
        ]),
      );
    });
  });

  describe('partial failure and reorg safety', () => {
    it('fails closed on a wrong chain without reading contract state', async () => {
      const chain = new FakeChain();
      chain.chainId = 1n;
      settle(chain);
      const report = await runPostDeploymentAddressCheck(makePlan(), chain);
      expect(failed(report)).toEqual(['chain-id']);
      expect(report.checkedBlock).toBeNull();
      expect(chain.readCalls).toEqual(['getChainId']);
    });

    it('refuses to sign off before the deployment has enough confirmations', async () => {
      const chain = new FakeChain();
      chain.mine();
      const plan = makePlan({ deployedAtBlock: 1, minConfirmations: 5 });
      const report = await runPostDeploymentAddressCheck(plan, chain);
      expect(failed(report)).toEqual(['pinned-block']);
      expect(chain.readCalls).not.toContain('readOracle');
    });

    it('passes exactly when the deployment block has reached the required depth', async () => {
      const chain = new FakeChain();
      chain.mine();
      chain.mine();
      const plan = makePlan({ deployedAtBlock: 0, minConfirmations: 2 });
      expect((await runPostDeploymentAddressCheck(plan, chain)).passed).toBe(true);
      expect(failed(await runPostDeploymentAddressCheck({ ...plan, deployedAtBlock: 1 }, chain))).toEqual([
        'pinned-block',
      ]);
    });

    it('ignores a bad change in the unconfirmed tip (reorg-able blocks)', async () => {
      const chain = new FakeChain();
      settle(chain);
      chain.mine((s) => (s.oracle.primary = addr(666)));
      const report = await runPostDeploymentAddressCheck(makePlan(), chain);
      expect(report.passed).toBe(true);
      expect(report.checkedBlock).toBe(chain.head - 2);

      chain.mine();
      chain.mine();
      expect(failed(await runPostDeploymentAddressCheck(makePlan(), chain))).toContain('oracle:primary');
    });

    it.each([
      'getChainId',
      'getBlockNumber',
      'getCode',
      'readOracle',
      'readValidatorSet',
      'hasRole',
    ])('fails closed without leaking RPC text when %s errors', async (method) => {
      const chain = new FakeChain();
      settle(chain);
      chain.failing.add(method);
      const report = await runPostDeploymentAddressCheck(makePlan(), chain);
      expect(report.passed).toBe(false);
      expect(JSON.stringify(report)).not.toContain('secret');
      expect(JSON.stringify(report)).not.toContain('rpc.example');
    });

    it('fails closed on a non-integer head block', async () => {
      const chain = new FakeChain();
      chain.getBlockNumber = async () => Number.NaN;
      const report = await runPostDeploymentAddressCheck(makePlan(), chain);
      expect(failed(report)).toEqual(['pinned-block']);
    });
  });

  describe('read-only guarantees', () => {
    it('does not mutate the plan or chain and only uses read methods', async () => {
      const chain = new FakeChain();
      settle(chain);
      const plan = makePlan();
      const planBefore = JSON.stringify(plan);
      const headBefore = chain.head;
      const stateBefore = JSON.stringify([...chain.state.roles.PROPOSER]);

      await runPostDeploymentAddressCheck(plan, chain);

      expect(JSON.stringify(plan)).toBe(planBefore);
      expect(chain.head).toBe(headBefore);
      expect(JSON.stringify([...chain.state.roles.PROPOSER])).toBe(stateBefore);
      const allowed = ['getChainId', 'getBlockNumber', 'getCode', 'readOracle', 'readValidatorSet', 'hasRole'];
      expect(chain.readCalls.every((c) => allowed.includes(c))).toBe(true);
    });

    it('reads every contract value at the same pinned block', async () => {
      const chain = new FakeChain();
      settle(chain, 6);
      const blocks = new Set<number>();
      const spy = (name: string, index: number) => {
        const target = chain as unknown as Record<string, (...a: unknown[]) => unknown>;
        const original = target[name].bind(chain);
        target[name] = (...args: unknown[]) => {
          blocks.add(args[index] as number);
          return original(...args);
        };
      };
      spy('getCode', 1);
      spy('readOracle', 1);
      spy('readValidatorSet', 1);
      spy('hasRole', 3);
      await runPostDeploymentAddressCheck(makePlan(), chain);
      expect([...blocks]).toEqual([chain.head - 2]);
    });
  });

  describe('stateful invariant: check passes iff confirmed on-chain state matches the plan', () => {
    function rng(seed: number): () => number {
      let s = seed >>> 0;
      return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2 ** 32;
      };
    }

    /** Independent oracle of "is this state what was reviewed". */
    function matches(s: ChainState): boolean {
      const set = (xs: string[]) => [...xs].sort().join(',');
      return (
        s.oracle.primary === PRIMARY &&
        s.oracle.fallback === FALLBACK &&
        s.oracle.owner === OWNER &&
        [ORACLE, PRIMARY, FALLBACK, VSM].every((a) => s.code.has(a)) &&
        set(s.validators) === set(VALIDATORS) &&
        s.threshold === 3 &&
        s.pending === null &&
        s.roles.PROPOSER.has(PROPOSER) &&
        !s.roles.PROPOSER.has(DEPLOYER) &&
        !s.roles.DEFAULT_ADMIN.has(DEPLOYER)
      );
    }

    const pool = [PRIMARY, FALLBACK, addr(666), addr(0), addr(150)];
    const actors = [OWNER, ADMIN, PROPOSER, DEPLOYER, addr(999)];
    const EPOCH_DELAY = 3;
    const outcomes = { pass: 0, fail: 0 };
    afterAll(() => {
      // The generator must actually exercise both outcomes.
      expect(outcomes.pass).toBeGreaterThan(0);
      expect(outcomes.fail).toBeGreaterThan(0);
    });

    it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('holds for seed %d', async (seed) => {
      const rand = rng(seed);
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
      const chain = new FakeChain();
      const plan = makePlan();
      for (let step = 0; step < 150; step++) {
        const actor = pick(actors);
        const op = pick(['setOracles', 'transferOwnership', 'propose', 'activate', 'grant', 'revoke', 'mine'] as const);

        switch (op) {
          case 'setOracles':
            if (actor === chain.state.oracle.owner) {
              const p = pick(pool);
              const f = pick(pool);
              if (p !== addr(0) && f !== addr(0)) chain.mine((s) => (s.oracle = { ...s.oracle, primary: p, fallback: f }));
            }
            break;
          case 'transferOwnership':
            if (actor === chain.state.oracle.owner) {
              const to = pick([OWNER, DEPLOYER, ADMIN]);
              chain.mine((s) => (s.oracle.owner = to));
            }
            break;
          case 'propose':
            if (chain.state.roles.PROPOSER.has(actor)) {
              const count = 1 + Math.floor(rand() * 5);
              const validators = Array.from({ length: count }, (_, i) => addr(1 + i));
              const threshold = 1 + Math.floor(rand() * count);
              chain.mine((s) => (s.pending = { validators, threshold, activeAt: chain.head + EPOCH_DELAY }));
            }
            break;
          case 'activate':
            if (chain.state.roles.PROPOSER.has(actor) && chain.state.pending && chain.head >= chain.state.pending.activeAt) {
              chain.mine((s) => {
                s.validators = s.pending!.validators;
                s.threshold = s.pending!.threshold;
                s.pending = null;
              });
            }
            break;
          case 'grant':
            if (chain.state.roles.DEFAULT_ADMIN.has(actor)) {
              const role = pick(['PROPOSER', 'DEFAULT_ADMIN'] as const);
              const account = pick([PROPOSER, DEPLOYER, addr(999)]);
              chain.mine((s) => s.roles[role].add(account));
            }
            break;
          case 'revoke':
            if (chain.state.roles.DEFAULT_ADMIN.has(actor)) {
              const role = pick(['PROPOSER', 'DEFAULT_ADMIN'] as const);
              const account = pick([PROPOSER, DEPLOYER, addr(999)]);
              chain.mine((s) => s.roles[role].delete(account));
            }
            break;
          default:
            chain.mine();
        }

        const pinned = chain.head - plan.minConfirmations;
        const report = await runPostDeploymentAddressCheck(plan, chain);
        if (pinned < plan.deployedAtBlock) {
          expect(report.passed).toBe(false);
        } else {
          expect(report.checkedBlock).toBe(pinned);
          expect(report.passed).toBe(matches(chain.history[pinned]));
        }
        outcomes[report.passed ? 'pass' : 'fail']++;
      }
    });

    it('concurrent checks against a moving chain all agree with the pinned state', async () => {
      const chain = new FakeChain();
      settle(chain);
      const plan = makePlan();
      const reports = await Promise.all(
        Array.from({ length: 25 }, async (_, i) => {
          if (i % 5 === 0) chain.mine((s) => (s.oracle.primary = i % 10 === 0 ? addr(666) : PRIMARY));
          const report = await runPostDeploymentAddressCheck(plan, chain);
          return { report, pinned: report.checkedBlock! };
        }),
      );
      for (const { report, pinned } of reports) {
        expect(report.passed).toBe(chain.history[pinned].oracle.primary === PRIMARY);
      }
    });
  });
});
