import { expect } from 'chai';
import hre from 'hardhat';

import {
  CONFIG_CHAIN_PROFILES,
  CONFIG_PARAMETER_SET,
  ConfigSigningIdentity,
  ProductionConfigRegistry,
  createTestSigningIdentity,
  productionConfigDigest,
  publicReviewerKey,
  signConfigDigest,
  testBundle,
} from '../../scripts/production-config-bundle';
import {
  DelayedRelayerRecovery,
  testMessage,
  testProbe,
} from '../../scripts/delayed-relayer-recovery';
import {
  IncidentEvidenceExporter,
  evidenceRequestDigest,
  testRecord,
  testRequest,
  verifyEvidenceBundle,
} from '../../scripts/incident-evidence-export';
import {
  DailyReconciliationService,
  testInput,
  verifyDailyReport,
} from '../../scripts/daily-event-reconciliation-report';

/**
 * Integration evidence for the operational safety bundle (issues #1526-1529).
 *
 * Every supported chain profile is exercised with the real EVM escrow token
 * bytecode on a local network. No RPC endpoint, relayer feed or production key
 * is used: reviewers are disposable local keys and the reviewed chain values
 * come from the checked-in versioned configuration table.
 */
describe('Operational safety — supported-chain integration', () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  function reviewers(): ConfigSigningIdentity[] {
    return [
      createTestSigningIdentity('integration-reviewer-1'),
      createTestSigningIdentity('integration-reviewer-2'),
    ];
  }

  async function deployFixture() {
    const [owner, recipient, attacker] = await ethers.getSigners();
    const token = await (
      await ethers.getContractFactory('MockERC20Escrow')
    ).deploy('Integration Token', 'ITKN');
    const escrow = await (
      await ethers.getContractFactory('FallbackEscrow')
    ).deploy(owner.address);
    await token.waitForDeployment();
    await escrow.waitForDeployment();
    return {
      owner,
      recipient,
      attacker,
      token,
      escrow,
      tokenAddress: await token.getAddress(),
      escrowAddress: await escrow.getAddress(),
    };
  }

  function messageId(profile: string, index: number): string {
    return ethers.keccak256(
      ethers.toUtf8Bytes(`operational-${profile}-${index}`),
    );
  }

  it('covers every supported chain with an explicit versioned profile', () => {
    const ids = CONFIG_CHAIN_PROFILES.map((profile) => profile.chainId);
    for (const expected of [
      'evm:1',
      'evm:10',
      'evm:56',
      'evm:137',
      'evm:8453',
      'evm:42161',
      'soroban:stellar',
    ]) {
      expect(ids, `missing profile for ${expected}`).to.include(expected);
    }
    for (const profile of CONFIG_CHAIN_PROFILES) {
      expect(profile.parameterSetVersion).to.equal(CONFIG_PARAMETER_SET);
      expect(profile.finalityDepth).to.be.gte(1);
      expect(profile.reorgWindow).to.be.gte(profile.finalityDepth);
    }
  });

  for (const profile of CONFIG_CHAIN_PROFILES) {
    it(`activates a signed bundle and holds at-most-once escrow accounting for ${profile.chainId}`, async () => {
      const keys = reviewers();
      const registry = new ProductionConfigRegistry({
        chainProfiles: [profile],
        reviewers: keys.map(publicReviewerKey),
        minApprovals: 2,
      });
      const bundle = testBundle({ chains: [profile] });
      const digest = productionConfigDigest(bundle);
      expect(
        productionConfigDigest(testBundle({ chains: [profile] })),
      ).to.equal(digest);
      for (const key of keys) {
        registry.approve(key.reviewerId, bundle, signConfigDigest(key, digest));
      }
      const receipt = registry.activate('operator', bundle);
      expect(receipt.digest).to.equal(digest);
      expect(() => registry.verifyActive()).to.not.throw();
      expect(registry.invariantViolations()).to.deep.equal([]);

      const {
        owner,
        recipient,
        attacker,
        token,
        escrow,
        tokenAddress,
        escrowAddress,
      } = await deployFixture();
      const amounts = [1_000n, 2_000n, 3_000n];
      const ids = amounts.map((_, index) => messageId(profile.chainId, index));
      const total = amounts.reduce((sum, value) => sum + value, 0n);
      expect(total).to.be.lessThan(BigInt(profile.maxAmountMinorUnits));

      await token.mint(owner.address, total);
      await token.approve(escrowAddress, total);
      let maxGas = 0;
      for (let index = 0; index < ids.length; index++) {
        const tx = await escrow.escrowTokens(
          ids[index],
          recipient.address,
          tokenAddress,
          amounts[index],
        );
        const receiptTx = await tx.wait();
        maxGas = Math.max(maxGas, Number(receiptTx.gasUsed));
        expect(await token.balanceOf(escrowAddress)).to.equal(
          amounts.slice(0, index + 1).reduce((sum, value) => sum + value, 0n),
        );
      }
      expect(maxGas).to.be.lessThan(300_000);

      await expect(
        escrow.escrowTokens(ids[0], recipient.address, tokenAddress, 1n),
      ).to.be.revertedWithCustomError(escrow, 'AlreadyEscrowed');
      await expect(
        escrow
          .connect(attacker)
          .escrowTokens(ids[0], attacker.address, tokenAddress, 1n),
      )
        .to.be.revertedWithCustomError(escrow, 'OwnableUnauthorizedAccount')
        .withArgs(attacker.address);

      const claim = await escrow.connect(recipient).claimEscrowedTokens(ids[0]);
      const claimReceipt = await claim.wait();
      expect(Number(claimReceipt.gasUsed)).to.be.lessThan(500_000);
      await expect(
        escrow.connect(recipient).claimEscrowedTokens(ids[0]),
      ).to.be.revertedWithCustomError(escrow, 'NothingToClaim');
      for (const id of ids.slice(1))
        await escrow.connect(recipient).claimEscrowedTokens(id);
      expect(await token.balanceOf(escrowAddress)).to.equal(0n);
      expect(await token.balanceOf(recipient.address)).to.equal(total);

      const relay = new DelayedRelayerRecovery();
      const sourceChain = profile.chainId === 'evm:1' ? 'evm:10' : 'evm:1';
      const message = testMessage({
        id: `msg-integration-${profile.chainId.replace(/\W/g, '')}`,
        sourceChain,
        targetChain: profile.chainId,
        observedAt: 1_000_000,
      });
      relay.observe(message, 'relayer-1');
      relay.submit(message.id, 'relayer-1', `0x${'a'.repeat(64)}`);
      expect(
        relay.probe(
          message.id,
          'relayer-1',
          testProbe({
            messageId: message.id,
            targetChain: profile.chainId,
            confirmations: profile.finalityDepth,
            head: 1_000_000 + profile.finalityDepth,
          }),
        ),
      ).to.equal(true);
      expect(() =>
        relay.probe(
          message.id,
          'relayer-1',
          testProbe({
            messageId: message.id,
            targetChain: profile.chainId,
            confirmations: profile.finalityDepth,
            head: 1_000_000 + profile.finalityDepth,
          }),
        ),
      ).to.throw('duplicate-destination-execution');
      expect(relay.invariantViolations()).to.deep.equal([]);
    });
  }

  it('binds evidence exports and daily reports to the active signed bundle', () => {
    const keys = reviewers();
    const registry = new ProductionConfigRegistry({
      reviewers: keys.map(publicReviewerKey),
      minApprovals: 2,
    });
    const bundle = testBundle();
    const digest = productionConfigDigest(bundle);
    for (const key of keys) {
      registry.approve(key.reviewerId, bundle, signConfigDigest(key, digest));
    }
    registry.activate('operator', bundle);

    const exporter = new IncidentEvidenceExporter({
      config: registry,
      reviewers: keys.map(publicReviewerKey),
      minApprovals: 2,
      now: 3_000,
    });
    const request = testRequest({ transferIds: ['tx-alpha'] });
    const digestOfRequest = evidenceRequestDigest(request);
    const evidence = exporter.exportEvidence(
      request,
      keys.map((key) => ({
        reviewerId: key.reviewerId,
        signature: signConfigDigest(key, digestOfRequest),
      })),
      { fetch: (id) => testRecord({ transferId: id }) },
      () => undefined,
    );
    expect(verifyEvidenceBundle(evidence)).to.equal(true);
    expect(evidence.configDigest).to.equal(digest);

    const reporter = new DailyReconciliationService({ configDigest: digest });
    const report = reporter.generate(testInput());
    expect(report.status).to.equal('pass');
    expect(verifyDailyReport(report)).to.equal(true);
    expect(report.configDigest).to.equal(digest);
  });

  it('keeps worst-case bounded work below the resource ceiling', async () => {
    const { owner, recipient, token, escrow, tokenAddress, escrowAddress } =
      await deployFixture();
    const batchSize = 16;
    const perItem = 100n;
    const total = perItem * BigInt(batchSize);
    const ids = Array.from({ length: batchSize }, (_, index) =>
      messageId('bound', index),
    );
    await token.mint(owner.address, total);
    await token.approve(escrowAddress, total);
    let maxGas = 0;
    for (const id of ids) {
      const tx = await escrow.escrowTokens(
        id,
        recipient.address,
        tokenAddress,
        perItem,
      );
      const receipt = await tx.wait();
      maxGas = Math.max(maxGas, Number(receipt.gasUsed));
    }
    expect(maxGas).to.be.lessThan(300_000);
    expect(await token.balanceOf(escrowAddress)).to.equal(total);
    for (const id of ids)
      await escrow.connect(recipient).claimEscrowedTokens(id);
    expect(await token.balanceOf(escrowAddress)).to.equal(0n);
    expect(await token.balanceOf(recipient.address)).to.equal(total);
  });
});
