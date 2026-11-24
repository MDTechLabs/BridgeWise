import { expect } from 'chai';
import hre from 'hardhat';

import {
  CONFIG_CHAIN_PROFILES,
  ChainConfigEntry,
} from '../../scripts/production-config-bundle';
import {
  ChainReadinessProfile,
  ProductionReadinessGate,
  READINESS_PARAMETER_SET,
} from '../../scripts/chain-readiness-gate';
import {
  CanaryRouteRegistry,
  CANARY_PARAMETER_SET,
  CanaryPolicy,
  messageId,
} from '../../scripts/route-canary-limits';
import {
  TreasuryReader,
  TREASURY_PARAMETER_SET,
  TreasuryChainPlan,
  normalizeAddress,
  testRolePlan,
  verifyTreasuryAddresses,
} from '../../scripts/treasury-address-verification';
import {
  APPROVED_MAINNET_ADDRESSES,
  GUARD_PARAMETER_SET,
  MAINNET_CHAINS,
  evaluateDeploymentGuard,
} from '../../scripts/production-deployment-guard';

/**
 * Integration evidence for the production readiness gates (#1522-#1525).
 *
 * Every supported chain profile is exercised with real EVM token/escrow
 * bytecode on a local network. No RPC endpoint, relayer feed or production key
 * is used: all reviewed values come from checked-in, versioned tables and all
 * signing/test identities are disposable local values.
 */
describe('Production readiness gates — supported-chain integration', () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deployFixture() {
    const [owner, recipient, attacker] = await ethers.getSigners();
    const token = await (
      await ethers.getContractFactory('MockERC20Escrow')
    ).deploy('Gate Token', 'GTKN');
    const escrow = await (
      await ethers.getContractFactory('FallbackEscrow')
    ).deploy(owner.address);
    await token.waitForDeployment();
    await escrow.waitForDeployment();
    const receipt = await escrow.deploymentTransaction().wait();
    return {
      owner,
      recipient,
      attacker,
      escrowAddress: await escrow.getAddress(),
      tokenAddress: await token.getAddress(),
      deployedAtBlock: receipt.blockNumber as number,
    };
  }

  function numericChainId(profile: ChainConfigEntry): number | null {
    return profile.chainId.startsWith('evm:')
      ? Number(profile.chainId.slice(4))
      : null;
  }

  for (const profile of CONFIG_CHAIN_PROFILES) {
    it(`gates halt/restart readiness for ${profile.chainId}`, () => {
      const chain: ChainReadinessProfile = {
        chainId: profile.chainId,
        parameterSetVersion: READINESS_PARAMETER_SET,
        minObservers: 2,
        minConfirmations: Math.min(profile.finalityDepth, 12),
        maxHeadLagBlocks: 20,
        maxInFlightMessages: 100,
        restartEpoch: 1,
      };
      const gate = new ProductionReadinessGate(
        {
          schemaVersion: 1,
          parameterSetVersion: READINESS_PARAMETER_SET,
          releaseId: 'rel-integration-readiness',
          chains: [chain],
          observers: ['observer-a', 'observer-b'],
          operators: ['operator'],
        },
        { now: 1_700_000_000_000 },
      );
      for (const observer of ['observer-a', 'observer-b']) {
        gate.submit(observer, {
          observerId: observer,
          chainId: profile.chainId,
          epoch: 1,
          headBlock: 100,
          pinnedBlock: 100 - chain.minConfirmations,
          halted: false,
          inFlightMessages: 0,
          observedAt: gate.now,
        });
      }
      expect(gate.evaluate().ready).to.equal(true);
      gate.halt('operator', profile.chainId);
      expect(gate.evaluate().ready).to.equal(false);
      gate.restart('operator', profile.chainId, 2);
      expect(gate.evaluate().chains[0].restartEpoch).to.equal(2);
    });

    it(`enforces canary caps for ${profile.chainId}`, () => {
      const chainId = numericChainId(profile);
      const policy: CanaryPolicy = {
        routeId: `route-${profile.chainId.replace(':', '-')}`,
        sourceChain: profile.chainId.replace(':', '-'),
        destinationChain: chainId ? 'soroban-stellar' : 'evm-1',
        asset: 'USDC',
        windowMs: 3_600_000,
        minWindowMs: 600_000,
        maxTransfersPerWindow: 2,
        maxNotionalMinorUnitsPerWindow: '1000',
        maxTransferMinorUnits: '600',
      };
      const registry = new CanaryRouteRegistry(
        {
          schemaVersion: 1,
          parameterSetVersion: CANARY_PARAMETER_SET,
          releaseId: 'rel-integration-canary',
          operators: ['operator'],
          routes: [policy],
        },
        { now: 1_700_000_000_000 },
      );
      registry.activate('operator', policy.routeId);
      expect(
        registry.submit({
          messageId: messageId(`${profile.chainId}-1`),
          routeId: policy.routeId,
          amountMinorUnits: '600',
          observedAt: registry.now,
        }),
      ).to.equal('accepted');
      expect(() =>
        registry.submit({
          messageId: messageId(`${profile.chainId}-2`),
          routeId: policy.routeId,
          amountMinorUnits: '600',
          observedAt: registry.now,
        }),
      ).to.throw();
      expect(
        registry.state(policy.routeId).windows[0].notionalMinorUnits,
      ).to.equal('600');
    });

    it(`verifies treasury and fee recipients against deployed bytecode for ${profile.chainId}`, async () => {
      const fixture = await deployFixture();
      const chainId = numericChainId(profile);
      const roles = chainId
        ? testRolePlan({
            treasury: normalizeAddress(
              APPROVED_MAINNET_ADDRESSES[chainId][0],
              'treasury',
            ),
            feeRecipient: normalizeAddress(
              fixture.recipient.address,
              'feeRecipient',
            ),
            reserved: [],
          })
        : testRolePlan({
            treasury: `G${'A'.repeat(54)}B`,
            feeRecipient: `G${'A'.repeat(54)}C`,
            reserved: [],
          });
      const chain: TreasuryChainPlan = {
        chainId: profile.chainId,
        parameterSetVersion: TREASURY_PARAMETER_SET,
        deployedAtBlock: fixture.deployedAtBlock,
        minConfirmations: 1,
        registryAddress: chainId
          ? fixture.escrowAddress
          : normalizeAddress(`G${'A'.repeat(55)}`, 'registry'),
        roles,
      };
      const reader: TreasuryReader = {
        getChainId: async () => (chainId ? BigInt(chainId) : 'soroban:stellar'),
        getBlockNumber: async () => fixture.deployedAtBlock + 1,
        getCode: async (address: string, block: number) =>
          chainId ? ethers.provider.getCode(address, block) : '0x6000',
        readRoles: async () => ({
          treasury: roles.treasury,
          feeRecipient: roles.feeRecipient,
        }),
      };
      const report = await verifyTreasuryAddresses(
        {
          schemaVersion: 1,
          parameterSetVersion: TREASURY_PARAMETER_SET,
          releaseId: 'rel-integration-treasury',
          chains: [chain],
        },
        reader,
      );
      expect(report.passed, JSON.stringify(report.chains[0].checks)).to.equal(
        true,
      );
      expect(report.chains[0].checkedBlock).to.equal(fixture.deployedAtBlock);

      const wrong = await verifyTreasuryAddresses(
        {
          schemaVersion: 1,
          parameterSetVersion: TREASURY_PARAMETER_SET,
          releaseId: 'rel-integration-treasury',
          chains: [
            {
              ...chain,
              roles: {
                ...roles,
                feeRecipient: chainId
                  ? normalizeAddress(
                      APPROVED_MAINNET_ADDRESSES[chainId][1],
                      'feeRecipient',
                    )
                  : `G${'A'.repeat(54)}Z`,
              },
            },
          ],
        },
        reader,
      );
      expect(wrong.passed).to.equal(false);
    });

    it(`blocks a testnet production manifest for ${profile.chainId}`, () => {
      const chainId = numericChainId(profile);
      if (chainId) {
        const inventory = APPROVED_MAINNET_ADDRESSES[chainId];
        const good = evaluateDeploymentGuard({
          schemaVersion: 1,
          parameterSetVersion: GUARD_PARAMETER_SET,
          releaseId: 'rel-integration-deploy',
          environment: 'production',
          chainFamily: 'evm',
          chainId,
          networkLabel: MAINNET_CHAINS[chainId],
          sourceCommit: 'a'.repeat(40),
          deployerAddress: inventory[0],
          bridgeAddress: inventory[1],
          treasuryAddress: inventory[2],
          feeRecipient: inventory[3],
          adminAddress: inventory[4],
        });
        expect(good.passed, JSON.stringify(good.checks)).to.equal(true);
        expect(
          evaluateDeploymentGuard({
            schemaVersion: 1,
            parameterSetVersion: GUARD_PARAMETER_SET,
            releaseId: 'rel-integration-deploy',
            environment: 'production',
            chainFamily: 'evm',
            chainId: 31337,
            networkLabel: MAINNET_CHAINS[chainId],
            sourceCommit: 'a'.repeat(40),
            deployerAddress: inventory[0],
            bridgeAddress: inventory[1],
            treasuryAddress: inventory[2],
            feeRecipient: inventory[3],
            adminAddress: inventory[4],
          }).passed,
        ).to.equal(false);
      } else {
        const addresses = {
          deployerAddress: `G${'A'.repeat(54)}B`,
          bridgeAddress: `G${'A'.repeat(54)}C`,
          treasuryAddress: `G${'A'.repeat(54)}D`,
          feeRecipient: `G${'A'.repeat(54)}E`,
          adminAddress: `G${'A'.repeat(54)}F`,
        };
        const base = {
          schemaVersion: 1,
          parameterSetVersion: GUARD_PARAMETER_SET,
          releaseId: 'rel-integration-deploy',
          environment: 'production' as const,
          chainFamily: 'soroban',
          chainId: 'stellar',
          sourceCommit: 'a'.repeat(40),
          ...addresses,
        };
        expect(
          evaluateDeploymentGuard({ ...base, networkLabel: 'stellar-public' })
            .passed,
        ).to.equal(true);
        expect(
          evaluateDeploymentGuard({ ...base, networkLabel: 'stellar-testnet' })
            .passed,
        ).to.equal(false);
      }
    });
  }

  it('refuses replayed messages and unauthorized transitions on every chain', () => {
    for (const profile of CONFIG_CHAIN_PROFILES) {
      const policy: CanaryPolicy = {
        routeId: `replay-${profile.chainId.replace(':', '-')}`,
        sourceChain: profile.chainId.replace(':', '-'),
        destinationChain: profile.chainId.startsWith('evm:')
          ? 'soroban-stellar'
          : 'evm-1',
        asset: 'USDC',
        windowMs: 600_000,
        minWindowMs: 600_000,
        maxTransfersPerWindow: 3,
        maxNotionalMinorUnitsPerWindow: '1000',
        maxTransferMinorUnits: '500',
      };
      const registry = new CanaryRouteRegistry(
        {
          schemaVersion: 1,
          parameterSetVersion: CANARY_PARAMETER_SET,
          releaseId: 'rel-integration-replay',
          operators: ['operator'],
          routes: [policy],
        },
        { now: 1_700_000_000_000 },
      );
      expect(() => registry.activate('attacker', policy.routeId)).to.throw();
      registry.activate('operator', policy.routeId);
      const transfer = {
        messageId: messageId(`replay-${profile.chainId}`),
        routeId: policy.routeId,
        amountMinorUnits: '100',
        observedAt: registry.now,
      };
      expect(registry.submit(transfer)).to.equal('accepted');
      expect(registry.submit(transfer)).to.equal('duplicate');
      expect(registry.state(policy.routeId).windows[0].transfers).to.equal(1);
    }
  });
});
