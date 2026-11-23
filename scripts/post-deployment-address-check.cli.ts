import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Contract, id, ZeroHash, type Provider } from 'ethers';
import { network } from 'hardhat';
import {
  PostDeploymentReader,
  ValidatorRole,
  runPostDeploymentAddressCheck,
} from './post-deployment-address-check';

const ORACLE_ABI = [
  'function primaryOracle() view returns (address)',
  'function fallbackOracle() view returns (address)',
  'function owner() view returns (address)',
];
const VALIDATOR_ABI = [
  'function getActiveValidators() view returns (address[])',
  'function activeThreshold() view returns (uint32)',
  'function hasPendingProposal() view returns (bool)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
];
const ROLE_IDS: Record<ValidatorRole, string> = {
  PROPOSER: id('PROPOSER_ROLE'),
  DEFAULT_ADMIN: ZeroHash,
};

/** Every read is pinned to an explicit block so results are mutually consistent. */
export function createEthersReader(provider: Provider): PostDeploymentReader {
  return {
    getChainId: async () => (await provider.getNetwork()).chainId,
    getBlockNumber: () => provider.getBlockNumber(),
    getCode: (address, blockNumber) => provider.getCode(address, blockNumber),
    readOracle: async (address, blockNumber) => {
      const contract = new Contract(address, ORACLE_ABI, provider);
      const overrides = { blockTag: blockNumber };
      const [primary, fallback, owner] = await Promise.all([
        contract.primaryOracle(overrides),
        contract.fallbackOracle(overrides),
        contract.owner(overrides),
      ]);
      return { primary, fallback, owner };
    },
    readValidatorSet: async (address, blockNumber) => {
      const contract = new Contract(address, VALIDATOR_ABI, provider);
      const overrides = { blockTag: blockNumber };
      const [validators, threshold, hasPendingProposal] = await Promise.all([
        contract.getActiveValidators(overrides),
        contract.activeThreshold(overrides),
        contract.hasPendingProposal(overrides),
      ]);
      return { validators: [...validators], threshold, hasPendingProposal };
    },
    hasRole: async (address, role, account, blockNumber) =>
      new Contract(address, VALIDATOR_ABI, provider).hasRole(ROLE_IDS[role], account, {
        blockTag: blockNumber,
      }),
  };
}

export async function main(): Promise<void> {
  const planPath = process.env.POST_DEPLOYMENT_PLAN_PATH;
  if (!planPath) throw new Error('Set POST_DEPLOYMENT_PLAN_PATH');

  const plan = JSON.parse(readFileSync(resolve(planPath), 'utf8'));
  const connection = await network.getOrCreate();
  const report = await runPostDeploymentAddressCheck(
    plan,
    createEthersReader(connection.ethers.provider),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
