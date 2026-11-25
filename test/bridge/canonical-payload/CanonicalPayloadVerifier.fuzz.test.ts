import { expect } from 'chai';
import { network } from 'hardhat';

const { ethers } = await network.connect();

const CANONICAL_ENCODING_VERSION = 1;
const MSG_TYPE_CONTRACT_CALL = 2;

function createPrng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state;
  };
}

async function signDigestSorted(digest: string, wallets: any[]): Promise<string> {
  const sorted = [...wallets].sort((a, b) =>
    a.address.toLowerCase().localeCompare(b.address.toLowerCase()),
  );
  let packed = '0x';
  for (const w of sorted) {
    const sig = w.signingKey.sign(digest);
    packed += sig.r.slice(2) + sig.s.slice(2) + sig.v.toString(16).padStart(2, '0');
  }
  return packed;
}

describe('CanonicalPayloadVerifier — Stateful Fuzz & Invariant Tests', function () {
  it('preserves nonce monotonicity, payload byte accounting, and token conservation across multi-step transitions', async function () {
    const [admin, guardian, senderA, senderB, recipientA, recipientB] =
      await ethers.getSigners();
    const val1 = ethers.Wallet.createRandom();
    const val2 = ethers.Wallet.createRandom();
    const val3 = ethers.Wallet.createRandom();

    const Verifier = await ethers.getContractFactory('CanonicalPayloadVerifier');
    const verifier = await Verifier.deploy(
      admin.address,
      guardian.address,
      [val1.address, val2.address, val3.address],
      2,
    );
    await verifier.waitForDeployment();

    const Executor = await ethers.getContractFactory('MockCanonicalExecutor');
    const executor = await Executor.deploy(await verifier.getAddress());
    await executor.waitForDeployment();
    await verifier.connect(admin).setExecutor(await executor.getAddress(), true);

    const Token = await ethers.getContractFactory('MockCanonicalERC20');
    const token = await Token.deploy('Bridge Token', 'BRG', 18);
    await token.waitForDeployment();
    const initialLiquidity = ethers.parseEther('1000000');
    await token.mint(await executor.getAddress(), initialLiquidity);

    const Target = await ethers.getContractFactory('MockCanonicalTarget');
    const target = await Target.deploy();
    await target.waitForDeployment();

    const chains = [1n, 10n, 42161n];
    const maxSizes = [256, 512, 1024];
    const configVersions = new Map<bigint, number>();
    for (let i = 0; i < chains.length; i++) {
      await verifier
        .connect(admin)
        .setChainPayloadPolicy(chains[i], true, maxSizes[i], false, ethers.parseEther('500'));
      configVersions.set(chains[i], 1);
    }

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const latestBlock = await ethers.provider.getBlock('latest');
    const deadline = BigInt(latestBlock!.timestamp) + 86400n;

    const senders = [senderA, senderB];
    const recipients = [recipientA, recipientB];
    const nextNonce = new Map<string, bigint>();
    const pendingEscrows: Array<{ messageId: string; recipient: any }> = [];

    let expectedTotalMsgs = 0n;
    let expectedTotalBytes = 0n;
    const expectedVolumeByChain = new Map<bigint, bigint>([
      [1n, 0n],
      [10n, 0n],
      [42161n, 0n],
    ]);

    const rand = createPrng(0x5eed1234);

    for (let step = 0; step < 30; step++) {
      const chainIdx = rand() % chains.length;
      const srcChain = chains[chainIdx];
      const maxSize = maxSizes[chainIdx];
      const sender = senders[rand() % senders.length];
      const recipient = recipients[rand() % recipients.length];
      const key = `${srcChain.toString()}:${sender.address}`;
      const nonce = nextNonce.get(key) ?? 0n;

      // Randomly test oversized payload rejection (20% of steps)
      const isOversized = rand() % 5 === 0;
      const payloadLen = isOversized ? maxSize + 1 : 1 + (rand() % maxSize);
      const payload = ethers.hexlify(new Uint8Array(payloadLen).fill((step + 1) & 0xff));
      const amount = ethers.parseEther(String(1 + (rand() % 20)));

      const envelope = await verifier.encodeCanonicalEnvelope({
        encodingVersion: CANONICAL_ENCODING_VERSION,
        messageType: MSG_TYPE_CONTRACT_CALL,
        sourceChainId: srcChain,
        targetChainId: chainId,
        sender: sender.address,
        recipient: recipient.address,
        token: await token.getAddress(),
        amount,
        nonce,
        deadline,
        configVersion: configVersions.get(srcChain)!,
        payload,
      });
      const [digest, messageId] = await verifier.computeAttestationDigest(envelope);
      const sigs = await signDigestSorted(digest, [val1, val2]);

      if (isOversized) {
        await expect(
          executor.executeCanonicalMessage(envelope, sigs, await target.getAddress()),
        ).to.be.revertedWithCustomError(verifier, 'PayloadTooLarge');
        // State must remain unchanged
        expect(await verifier.expectedNonce(srcChain, sender.address)).to.equal(nonce);
        continue;
      }

      // Randomly simulate target revert -> fallback escrow path
      const shouldFailTarget = rand() % 3 === 0;
      await target.setShouldRevert(shouldFailTarget);

      await executor.executeCanonicalMessage(envelope, sigs, await target.getAddress());

      nextNonce.set(key, nonce + 1n);
      expectedTotalMsgs += 1n;
      expectedTotalBytes += BigInt(payloadLen);
      expectedVolumeByChain.set(srcChain, expectedVolumeByChain.get(srcChain)! + amount);

      if (shouldFailTarget) {
        pendingEscrows.push({ messageId, recipient });
      }

      // Periodically claim an escrow refund
      if (pendingEscrows.length > 0 && step % 4 === 0) {
        const item = pendingEscrows.shift()!;
        await executor.connect(item.recipient).claimEscrowRefund(item.messageId);
      }

      // Check invariants after every step
      expect(await verifier.totalVerifiedMessages()).to.equal(expectedTotalMsgs);
      expect(await verifier.totalVerifiedPayloadBytes()).to.equal(expectedTotalBytes);
      expect(await verifier.verifiedVolumeByChain(srcChain)).to.equal(
        expectedVolumeByChain.get(srcChain),
      );

      const executorBal = await token.balanceOf(await executor.getAddress());
      const released = await executor.totalReleased();
      const refunded = await executor.totalRefunded();
      // Accounting conservation: executor balance + released + refunded == initialLiquidity
      expect(executorBal + released + refunded).to.equal(initialLiquidity);
    }

    // Drain remaining escrows and verify final conservation
    for (const item of pendingEscrows) {
      await executor.connect(item.recipient).claimEscrowRefund(item.messageId);
    }
    expect(await executor.totalEscrowed()).to.equal(0n);
    const finalExecBal = await token.balanceOf(await executor.getAddress());
    const finalRecipA = await token.balanceOf(recipientA.address);
    const finalRecipB = await token.balanceOf(recipientB.address);
    expect(finalExecBal + finalRecipA + finalRecipB).to.equal(initialLiquidity);
  });
});
