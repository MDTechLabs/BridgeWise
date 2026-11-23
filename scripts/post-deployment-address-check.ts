/**
 * Read-only post-deployment check of the configured oracle and validator
 * addresses.
 *
 * Trust model:
 * - Every expected value (oracle feeds, owner, validator set, threshold, role
 *   holders, chain id, confirmation depth) comes from the reviewed plan. RPC
 *   data is only the *observation* compared against it.
 * - All contract reads happen at one pinned block that is at least
 *   `minConfirmations` behind head, so a shallow reorg cannot produce a pass
 *   from state that later disappears, and the reads are mutually consistent.
 * - It never sends transactions. Any read failure, malformed value or mismatch
 *   fails the check; error text from the RPC is never copied into the report.
 */

export interface PostDeploymentPlan {
  chainId: number;
  /** Block the contracts were deployed in (from the reviewed deploy record). */
  deployedAtBlock: number;
  /** Blocks that must be built on top of the pinned block before checking. */
  minConfirmations: number;
  oracle: {
    address: string;
    primary: string;
    fallback: string;
    owner: string;
  };
  validatorSet: {
    address: string;
    validators: string[];
    threshold: number;
    /** Accounts that must hold PROPOSER_ROLE. */
    proposers: string[];
    /** Accounts that must hold neither PROPOSER_ROLE nor DEFAULT_ADMIN_ROLE. */
    forbiddenRoleHolders: string[];
  };
}

export type ValidatorRole = 'PROPOSER' | 'DEFAULT_ADMIN';

export interface PostDeploymentReader {
  getChainId(): Promise<bigint>;
  getBlockNumber(): Promise<number>;
  getCode(address: string, blockNumber: number): Promise<string>;
  readOracle(
    address: string,
    blockNumber: number,
  ): Promise<{ primary: string; fallback: string; owner: string }>;
  readValidatorSet(
    address: string,
    blockNumber: number,
  ): Promise<{
    validators: string[];
    threshold: number | bigint;
    hasPendingProposal: boolean;
  }>;
  hasRole(
    address: string,
    role: ValidatorRole,
    account: string,
    blockNumber: number,
  ): Promise<boolean>;
}

export interface PostDeploymentCheck {
  id: string;
  status: 'passed' | 'failed';
  detail: string;
}

export interface PostDeploymentReport {
  chainId: number;
  checkedBlock: number | null;
  passed: boolean;
  checks: PostDeploymentCheck[];
}

/** Hard cap so an adversarial or misconfigured set cannot blow up the check. */
export const MAX_VALIDATORS = 256;

export async function runPostDeploymentAddressCheck(
  planInput: unknown,
  reader: PostDeploymentReader,
): Promise<PostDeploymentReport> {
  const plan = validatePostDeploymentPlan(planInput);
  const checks: PostDeploymentCheck[] = [];
  const add = (id: string, passed: boolean, detail: string): void => {
    checks.push({ id, status: passed ? 'passed' : 'failed', detail });
  };
  const fail = (id: string, what: string): void =>
    add(id, false, `Unable to ${what} from the configured RPC`);

  // Reviewed-plan sanity: policy that must hold regardless of what is on chain.
  const { oracle, validatorSet } = plan;
  add(
    'plan:oracle-distinct',
    oracle.primary !== oracle.fallback,
    oracle.primary !== oracle.fallback
      ? 'Primary and fallback oracles are distinct'
      : 'Primary and fallback oracles must be different addresses',
  );
  const majority = validatorSet.threshold * 2 > validatorSet.validators.length;
  add(
    'plan:threshold-majority',
    majority,
    majority
      ? 'Threshold is a strict majority of the validator set'
      : 'Threshold must exceed half of the validator set',
  );

  let chainOk = false;
  try {
    const chainId = await reader.getChainId();
    chainOk = chainId === BigInt(plan.chainId);
    add(
      'chain-id',
      chainOk,
      chainOk
        ? `Connected to expected chain ${plan.chainId}`
        : `Connected chain ${chainId} does not match expected chain ${plan.chainId}`,
    );
  } catch {
    fail('chain-id', 'query chain ID');
  }
  if (!chainOk) return finish(plan, null, checks);

  let pinned: number;
  try {
    const head = await reader.getBlockNumber();
    if (!Number.isSafeInteger(head)) throw new Error('bad head');
    pinned = head - plan.minConfirmations;
  } catch {
    fail('pinned-block', 'query the latest block');
    return finish(plan, null, checks);
  }
  const deepEnough = pinned >= plan.deployedAtBlock;
  add(
    'pinned-block',
    deepEnough,
    deepEnough
      ? `Reading at block ${pinned} (${plan.minConfirmations} confirmations)`
      : `Deployment at block ${plan.deployedAtBlock} does not yet have ${plan.minConfirmations} confirmations`,
  );
  if (!deepEnough) return finish(plan, null, checks);

  // Oracle contract and the feeds it points at.
  await hasCode('oracle:contract-code', 'BridgeMultiOracle', oracle.address);
  try {
    const observed = await reader.readOracle(oracle.address, pinned);
    const primary = normalizeObserved(observed.primary);
    const fallback = normalizeObserved(observed.fallback);
    const owner = normalizeObserved(observed.owner);
    compare('oracle:primary', 'Primary oracle', primary, oracle.primary);
    compare('oracle:fallback', 'Fallback oracle', fallback, oracle.fallback);
    compare('oracle:owner', 'Oracle owner', owner, oracle.owner);
    if (primary && fallback && primary === fallback) {
      add('oracle:distinct-on-chain', false, 'On-chain primary and fallback oracles are the same address');
    }
    if (primary) await hasCode('oracle:primary-code', 'Primary oracle', primary);
    if (fallback) await hasCode('oracle:fallback-code', 'Fallback oracle', fallback);
  } catch {
    fail('oracle:read', 'read oracle configuration');
  }

  // Validator set manager.
  await hasCode('validators:contract-code', 'ValidatorSetManager', validatorSet.address);
  try {
    const observed = await reader.readValidatorSet(validatorSet.address, pinned);
    if (!Array.isArray(observed.validators) || observed.validators.length > MAX_VALIDATORS) {
      add('validators:set', false, 'Observed validator set is malformed or too large');
    } else {
      const normalized = observed.validators.map(normalizeObserved);
      const wellFormed =
        normalized.every((v): v is string => v !== undefined) &&
        new Set(normalized).size === normalized.length;
      add(
        'validators:well-formed',
        wellFormed,
        wellFormed
          ? 'Observed validators are unique non-zero addresses'
          : 'Observed validators include a zero, malformed or duplicate address',
      );
      const observedSet = new Set(normalized.filter((v): v is string => !!v));
      const expectedSet = new Set(validatorSet.validators);
      const missing = [...expectedSet].filter((v) => !observedSet.has(v));
      const extra = [...observedSet].filter((v) => !expectedSet.has(v));
      add(
        'validators:set',
        missing.length === 0 && extra.length === 0,
        missing.length === 0 && extra.length === 0
          ? `Validator set matches the ${expectedSet.size} reviewed validators`
          : `Validator set differs from the reviewed set (${missing.length} missing, ${extra.length} unexpected)`,
      );
    }

    const threshold = Number(observed.threshold);
    add(
      'validators:threshold',
      threshold === validatorSet.threshold,
      threshold === validatorSet.threshold
        ? `Threshold is ${validatorSet.threshold}`
        : 'Threshold differs from the reviewed threshold',
    );
    add(
      'validators:no-pending-proposal',
      observed.hasPendingProposal === false,
      observed.hasPendingProposal === false
        ? 'No validator set proposal is pending'
        : 'A validator set proposal is pending; resolve it before sign-off',
    );
  } catch {
    fail('validators:read', 'read the validator set');
  }

  for (const account of validatorSet.proposers) {
    await role('PROPOSER', account, true);
  }
  for (const account of validatorSet.forbiddenRoleHolders) {
    await role('PROPOSER', account, false);
    await role('DEFAULT_ADMIN', account, false);
  }

  return finish(plan, pinned, checks);

  async function hasCode(id: string, label: string, address: string): Promise<void> {
    try {
      const code = await reader.getCode(address, pinned);
      const present = typeof code === 'string' && /^0x([0-9a-fA-F]{2})+$/.test(code) && !/^0x(00)+$/i.test(code);
      add(id, present, present ? `${label} has runtime code` : `${label} has no runtime code`);
    } catch {
      add(id, false, `Unable to query runtime code for ${label}`);
    }
  }

  function compare(id: string, label: string, observed: string | undefined, expected: string): void {
    add(
      id,
      observed === expected,
      observed === expected ? `${label} matches the reviewed address` : `${label} differs from the reviewed address`,
    );
  }

  async function role(name: ValidatorRole, account: string, expected: boolean): Promise<void> {
    const id = `validators:role:${name}:${account}`;
    try {
      const holds = await reader.hasRole(validatorSet.address, name, account, pinned);
      add(
        id,
        holds === expected,
        holds === expected
          ? expected
            ? `${account} holds ${name}_ROLE as reviewed`
            : `${account} does not hold ${name}_ROLE`
          : expected
            ? `${account} is missing ${name}_ROLE`
            : `${account} must not hold ${name}_ROLE but does`,
      );
    } catch {
      add(id, false, `Unable to query ${name}_ROLE for ${account}`);
    }
  }
}

function finish(
  plan: PostDeploymentPlan,
  checkedBlock: number | null,
  checks: PostDeploymentCheck[],
): PostDeploymentReport {
  return {
    chainId: plan.chainId,
    checkedBlock,
    passed: checks.every((check) => check.status === 'passed'),
    checks,
  };
}

export function validatePostDeploymentPlan(value: unknown): PostDeploymentPlan {
  const root = object(value, 'plan');
  const chainId = root.chainId;
  if (!Number.isSafeInteger(chainId) || (chainId as number) < 1) {
    throw new TypeError('chainId must be a positive safe integer');
  }
  const deployedAtBlock = root.deployedAtBlock;
  if (!Number.isSafeInteger(deployedAtBlock) || (deployedAtBlock as number) < 0) {
    throw new TypeError('deployedAtBlock must be a non-negative safe integer');
  }
  const minConfirmations = root.minConfirmations;
  if (!Number.isSafeInteger(minConfirmations) || (minConfirmations as number) < 1) {
    throw new TypeError('minConfirmations must be a positive safe integer');
  }

  const oracle = object(root.oracle, 'oracle');
  const validatorSet = object(root.validatorSet, 'validatorSet');
  const validators = addressList(validatorSet.validators, 'validatorSet.validators');
  if (validators.length === 0 || validators.length > MAX_VALIDATORS) {
    throw new TypeError(`validatorSet.validators must contain 1-${MAX_VALIDATORS} addresses`);
  }
  const threshold = validatorSet.threshold;
  if (!Number.isSafeInteger(threshold) || (threshold as number) < 1 || (threshold as number) > validators.length) {
    throw new TypeError('validatorSet.threshold must be between 1 and the validator count');
  }

  return {
    chainId: chainId as number,
    deployedAtBlock: deployedAtBlock as number,
    minConfirmations: minConfirmations as number,
    oracle: {
      address: address(oracle.address, 'oracle.address'),
      primary: address(oracle.primary, 'oracle.primary'),
      fallback: address(oracle.fallback, 'oracle.fallback'),
      owner: address(oracle.owner, 'oracle.owner'),
    },
    validatorSet: {
      address: address(validatorSet.address, 'validatorSet.address'),
      validators,
      threshold: threshold as number,
      proposers: addressList(validatorSet.proposers ?? [], 'validatorSet.proposers'),
      forbiddenRoleHolders: addressList(
        validatorSet.forbiddenRoleHolders ?? [],
        'validatorSet.forbiddenRoleHolders',
      ),
    },
  };
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function address(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(value) || /^0x0{40}$/i.test(value)) {
    throw new TypeError(`${field} must be a non-zero EVM address`);
  }
  return value.toLowerCase();
}

function addressList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  const out = value.map((item, i) => address(item, `${field}[${i}]`));
  if (new Set(out).size !== out.length) {
    throw new TypeError(`${field} must not contain duplicates`);
  }
  return out;
}

/** Observed values are never trusted: malformed or zero addresses become undefined. */
function normalizeObserved(value: unknown): string | undefined {
  try {
    return address(value, 'observed');
  } catch {
    return undefined;
  }
}
