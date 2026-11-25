import { expect } from 'chai';
import { network } from 'hardhat';
import { ethers } from 'ethers';

const { ethers: hhEthers } = await network.connect();

function packSortedSignatures(digest: string, wallets: ethers.HDNodeWallet[]): string {
  const sorted = [...wallets].sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1));
  return ethers.concat(
    sorted.map((w) => {
      const sig = w.signingKey.sign(digest);
      return ethers.concat([sig.r, sig.s, ethers.toBeHex(sig.v, 1)]);
    }),
  );
}

describe('RelayerMetadataVerifier (Multi-Chain Integration & Accounting)', function () {
  it('preserves token accounting across success, target revert, retry, and refund paths across supported chains', async function () {
    const [admin, guardian, attester, sender, recipientA, recipientB, relayer] =
      await hhEthers.getSigners();

    const validators = [
      ethers.Wallet.createRandom(),
      ethers.Wallet.createRandom(),
      ethers.Wallet.createRandom(),
    ];

    const VerifierFactory = await hhEthers.getContractFactory('RelayerMetadataVerifier');
    const verifier = await VerifierFactory.deploy(
      admin.address,
      guardian.address,
      validators.map((v) => v.address),
      2,
    );
    await verifier.waitForDeployment();

    const ExecutorFactory = await hhEthers.getContractFactory('MockMetadataExecutor');
    const executor = await ExecutorFactory.deploy(await verifier.getAddress());
    await executor.waitForDeployment();

    const TokenFactory = await hhEthers.getContractFactory('MockBridgeERC20');
    const usdc = await TokenFactory.deploy('USD Coin', 'USDC', 6);
    await usdc.waitForDeployment();

    const TargetFactory = await hhEthers.getContractFactory('MockExecutionTarget');
    const target = await TargetFactory.deploy();
    await target.waitForDeployment();

    await verifier.connect(admin).setExecutor(await executor.getAddress(), true);
    await verifier.connect(admin).setCheckpointAttester(attester.address, true);

    // Configure multiple supported chains: Ethereum (1), Optimism (10), Polygon (137), Arbitrum (42161), Base (8453)
    const supportedChains = [
      { id: 1n, confs: 12, block: 20_000_000n },
      { id: 10n, confs: 20, block: 120_000_000n },
      { id: 137n, confs: 64, block: 60_000_000n },
      { id: 42161n, confs: 16, block: 250_000_000n },
      { id: 8453n, confs: 20, block: 18_000_000n },
    ];

    for (const c of supportedChains) {
      await verifier.connect(admin).setChainPolicy(c.id, true, c.confs, 3600, 60, 1_000_000n * 10n ** 6n);
      await verifier.connect(attester).updateFinalizedSourceBlock(c.id, c.block);
    }

    const initialVaultLiquidity = 500_000n * 10n ** 6n;
    await usdc.mint(await executor.getAddress(), initialVaultLiquidity);

    const net = await hhEthers.provider.getNetwork();
    const targetChainId = net.chainId;
    const targetIface = target.interface;

    async function relayFromChain(
      sourceChainId: bigint,
      sourceBlockNumber: bigint,
      nonce: bigint,
      recipient: string,
      amount: bigint,
    ) {
      const latestBlock = await hhEthers.provider.getBlock('latest');
      const nowTs = BigInt(latestBlock!.timestamp);
      const data = targetIface.encodeFunctionData('handleBridgeCall', [
        ethers.toUtf8Bytes(`chain-${sourceChainId}-nonce-${nonce}`),
      ]);
      const canonicalId = await verifier.deriveMessageId(sourceChainId, targetChainId, sender.address, nonce);
      const meta = {
        messageId: canonicalId,
        sourceChainId,
        targetChainId,
        sender: sender.address,
        recipient,
        token: await usdc.getAddress(),
        amount,
        nonce,
        sourceBlockNumber,
        sourceTimestamp: nowTs - 10n,
        deadline: nowTs + 600n,
        payloadHash: ethers.keccak256(data),
      };
      const policy = await verifier.getChainPolicy(sourceChainId);
      const digest = await verifier.computeDigest(meta, policy.configVersion);
      const sigs = packSortedSignatures(digest, [validators[0], validators[1]]);
      await executor.connect(relayer).relayMessage(meta, data, sigs, await target.getAddress());
      return { canonicalId, data };
    }

    // 1. Success path from Ethereum (1)
    await relayFromChain(1n, 19_999_980n, 0n, recipientA.address, 10_000n * 10n ** 6n);
    expect(await usdc.balanceOf(recipientA.address)).to.equal(10_000n * 10n ** 6n);

    // 2. Target revert -> fallback escrow -> retry success from Optimism (10)
    await target.setShouldRevert(true);
    const failed1 = await relayFromChain(10n, 119_999_970n, 0n, recipientA.address, 25_000n * 10n ** 6n);
    expect(await executor.totalEscrowed()).to.equal(25_000n * 10n ** 6n);

    await target.setShouldRevert(false);
    await executor.connect(relayer).retryEscrowed(failed1.canonicalId, await target.getAddress(), failed1.data);
    expect(await executor.totalEscrowed()).to.equal(0n);
    expect(await usdc.balanceOf(recipientA.address)).to.equal(35_000n * 10n ** 6n);

    // 3. Target revert -> fallback escrow -> user refund recovery from Polygon (137)
    await target.setShouldRevert(true);
    const failed2 = await relayFromChain(137n, 59_999_900n, 0n, recipientB.address, 15_000n * 10n ** 6n);
    await expect(executor.connect(recipientA).claimRefund(failed2.canonicalId)).to.be.revertedWithCustomError(
      executor,
      'UnauthorizedClaim',
    );
    await executor.connect(recipientB).claimRefund(failed2.canonicalId);
    expect(await usdc.balanceOf(recipientB.address)).to.equal(15_000n * 10n ** 6n);

    // 4. Success paths from Arbitrum (42161) and Base (8453)
    await target.setShouldRevert(false);
    await relayFromChain(42161n, 249_999_980n, 0n, recipientB.address, 5_000n * 10n ** 6n);
    await relayFromChain(8453n, 17_999_970n, 0n, recipientA.address, 8_000n * 10n ** 6n);

    // Accounting conservation invariant:
    // vaultBalance + totalReleased + totalRefunded == initialVaultLiquidity
    const vaultBalance = await usdc.balanceOf(await executor.getAddress());
    const released = await executor.totalReleased();
    const refunded = await executor.totalRefunded();
    const escrowed = await executor.totalEscrowed();

    expect(escrowed).to.equal(0n);
    expect(vaultBalance + released + refunded).to.equal(initialVaultLiquidity);
    expect(await verifier.totalVerifiedMessages()).to.equal(5n);
  });
});
