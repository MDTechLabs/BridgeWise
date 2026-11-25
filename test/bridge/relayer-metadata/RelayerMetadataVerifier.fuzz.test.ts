import { expect } from 'chai';
import { network } from 'hardhat';
import { ethers } from 'ethers';

const { ethers: hhEthers } = await network.connect();

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function packSortedSignatures(digest: string, wallets: ethers.HDNodeWallet[]): string {
  const sorted = [...wallets].sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1));
  return ethers.concat(
    sorted.map((w) => {
      const sig = w.signingKey.sign(digest);
      return ethers.concat([sig.r, sig.s, ethers.toBeHex(sig.v, 1)]);
    }),
  );
}

describe('RelayerMetadataVerifier (Stateful Fuzz & Invariants)', function () {
  it('maintains nonce, replay, and volume invariants across 50 randomized multi-chain steps', async function () {
    const rand = mulberry32(0x5eed1234);
    const [admin, guardian, executor, attester, attacker, senderA, senderB, recipient, token] =
      await hhEthers.getSigners();

    const validators = [
      ethers.Wallet.createRandom(),
      ethers.Wallet.createRandom(),
      ethers.Wallet.createRandom(),
    ];

    const Factory = await hhEthers.getContractFactory('RelayerMetadataVerifier');
    const verifier = await Factory.deploy(
      admin.address,
      guardian.address,
      validators.map((v) => v.address),
      2,
    );
    await verifier.waitForDeployment();
    await verifier.connect(admin).setExecutor(executor.address, true);
    await verifier.connect(admin).setCheckpointAttester(attester.address, true);

    const chains = [1n, 10n, 137n, 42161n];
    const finalized: Record<string, bigint> = {};
    const expectedVolume: Record<string, bigint> = {};
    const expectedNonces: Record<string, bigint> = {};

    for (const cid of chains) {
      await verifier.connect(admin).setChainPolicy(cid, true, 5, 7200, 120, ethers.parseEther('500'));
      await verifier.connect(attester).updateFinalizedSourceBlock(cid, 500n);
      finalized[cid.toString()] = 500n;
      expectedVolume[cid.toString()] = 0n;
      expectedNonces[`${cid}-${senderA.address}`] = 0n;
      expectedNonces[`${cid}-${senderB.address}`] = 0n;
    }

    const net = await hhEthers.provider.getNetwork();
    const targetChainId = net.chainId;
    const senders = [senderA, senderB];
    const seenMessages: Array<{ meta: any; payload: string; sigs: string }> = [];
    let expectedTotalVerified = 0n;

    for (let step = 0; step < 50; step++) {
      const cid = chains[Math.floor(rand() * chains.length)];
      const snd = senders[Math.floor(rand() * senders.length)];
      const key = `${cid}-${snd.address}`;
      const action = rand();

      // Advance finalized block occasionally
      if (action < 0.15) {
        const nextBlock = finalized[cid.toString()] + BigInt(1 + Math.floor(rand() * 20));
        await verifier.connect(attester).updateFinalizedSourceBlock(cid, nextBlock);
        finalized[cid.toString()] = nextBlock;
        continue;
      }

      // Replay an already-consumed message — must always revert and never mutate state
      if (action < 0.35 && seenMessages.length > 0) {
        const prev = seenMessages[Math.floor(rand() * seenMessages.length)];
        await expect(
          verifier.connect(executor).verifyAndConsumeMetadata(prev.meta, prev.payload, prev.sigs),
        ).to.be.reverted;
        continue;
      }

      // Unauthorized caller attempt — must always revert
      const latestBlock = await hhEthers.provider.getBlock('latest');
      const nowTs = BigInt(latestBlock!.timestamp);
      const nonce = expectedNonces[key];
      const payload = ethers.hexlify(ethers.randomBytes(16 + Math.floor(rand() * 64)));
      const amount = BigInt(1 + Math.floor(rand() * 100)) * 10n ** 18n;
      const canonicalId = await verifier.deriveMessageId(cid, targetChainId, snd.address, nonce);

      const meta = {
        messageId: canonicalId,
        sourceChainId: cid,
        targetChainId,
        sender: snd.address,
        recipient: recipient.address,
        token: token.address,
        amount,
        nonce,
        sourceBlockNumber: finalized[cid.toString()] - 10n,
        sourceTimestamp: nowTs - 5n,
        deadline: nowTs + 600n,
        payloadHash: ethers.keccak256(payload),
      };

      const policy = await verifier.getChainPolicy(cid);
      const digest = await verifier.computeDigest(meta, policy.configVersion);
      const sigs = packSortedSignatures(digest, [validators[0], validators[2]]);

      if (action < 0.50) {
        await expect(
          verifier.connect(attacker).verifyAndConsumeMetadata(meta, payload, sigs),
        ).to.be.revertedWithCustomError(verifier, 'UnauthorizedExecutor');
        continue;
      }

      // Valid transition
      await verifier.connect(executor).verifyAndConsumeMetadata(meta, payload, sigs);
      expectedNonces[key] = nonce + 1n;
      expectedVolume[cid.toString()] += amount;
      expectedTotalVerified += 1n;
      seenMessages.push({ meta, payload, sigs });

      // Assert invariants after every state mutation
      expect(await verifier.expectedNonce(cid, snd.address)).to.equal(expectedNonces[key]);
      expect(await verifier.consumedMessages(canonicalId)).to.equal(true);
      expect(await verifier.totalVerifiedMessages()).to.equal(expectedTotalVerified);
      expect(await verifier.verifiedVolumeByChain(cid)).to.equal(expectedVolume[cid.toString()]);
    }
  });
});
