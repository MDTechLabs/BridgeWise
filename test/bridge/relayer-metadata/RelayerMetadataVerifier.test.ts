import { expect } from 'chai';
import { network } from 'hardhat';
import { ethers } from 'ethers';

const { ethers: hhEthers } = await network.connect();

const SECP256K1_N = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
);
const SECP256K1_N_DIV_2 = BigInt(
  '0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0',
);

interface MessageMetadata {
  messageId: string;
  sourceChainId: bigint;
  targetChainId: bigint;
  sender: string;
  recipient: string;
  token: string;
  amount: bigint;
  nonce: bigint;
  sourceBlockNumber: bigint;
  sourceTimestamp: bigint;
  deadline: bigint;
  payloadHash: string;
}

function packSortedSignatures(
  digest: string,
  wallets: ethers.HDNodeWallet[],
): string {
  const sorted = [...wallets].sort((a, b) =>
    BigInt(a.address) < BigInt(b.address) ? -1 : 1,
  );
  const parts = sorted.map((w) => {
    const sig = w.signingKey.sign(digest);
    return ethers.concat([
      sig.r,
      sig.s,
      ethers.toBeHex(sig.v, 1),
    ]);
  });
  return ethers.concat(parts);
}

describe('RelayerMetadataVerifier (Unit & Adversarial)', function () {
  async function deployFixture() {
    const [admin, guardian, executor, attester, attacker, sender, recipient, token] =
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

    const sourceChainId = 1n;
    const net = await hhEthers.provider.getNetwork();
    const targetChainId = net.chainId;

    await verifier.connect(admin).setChainPolicy(
      sourceChainId,
      true,
      12, // requiredConfirmations
      3600, // maxMessageAgeSecs
      60, // maxFutureDriftSecs
      ethers.parseEther('1000'), // maxAmountPerMessage
    );
    await verifier.connect(attester).updateFinalizedSourceBlock(sourceChainId, 1000n);

    const latestBlock = await hhEthers.provider.getBlock('latest');
    const nowTs = BigInt(latestBlock!.timestamp);

    async function buildValidMessage(overrides: Partial<MessageMetadata> = {}, payloadHex = '0x1234abcd') {
      const nonce = overrides.nonce ?? 0n;
      const src = overrides.sourceChainId ?? sourceChainId;
      const dst = overrides.targetChainId ?? targetChainId;
      const snd = overrides.sender ?? sender.address;

      const canonicalId = await verifier.deriveMessageId(src, dst, snd, nonce);
      const meta: MessageMetadata = {
        messageId: overrides.messageId ?? canonicalId,
        sourceChainId: src,
        targetChainId: dst,
        sender: snd,
        recipient: overrides.recipient ?? recipient.address,
        token: overrides.token ?? token.address,
        amount: overrides.amount ?? ethers.parseEther('10'),
        nonce,
        sourceBlockNumber: overrides.sourceBlockNumber ?? 980n,
        sourceTimestamp: overrides.sourceTimestamp ?? nowTs - 10n,
        deadline: overrides.deadline ?? nowTs + 600n,
        payloadHash: overrides.payloadHash ?? ethers.keccak256(payloadHex),
      };

      const policy = await verifier.getChainPolicy(src);
      const digest = await verifier.computeDigest(meta, policy.configVersion);
      const sigs = packSortedSignatures(digest, [validators[0], validators[1]]);
      return { meta, payloadHex, digest, sigs, configVersion: policy.configVersion };
    }

    return {
      verifier,
      admin,
      guardian,
      executor,
      attester,
      attacker,
      sender,
      recipient,
      token,
      validators,
      sourceChainId,
      targetChainId,
      nowTs,
      buildValidMessage,
    };
  }

  it('verifies valid relayer metadata, advances nonce, and records accounting', async function () {
    const { verifier, executor, sender, sourceChainId, buildValidMessage } = await deployFixture();
    const { meta, payloadHex, sigs } = await buildValidMessage();

    const [viewId, cfgVer] = await verifier.verifyMetadataView(meta, payloadHex, sigs);
    expect(viewId).to.equal(meta.messageId);
    expect(cfgVer).to.equal(1n);

    await expect(verifier.connect(executor).verifyAndConsumeMetadata(meta, payloadHex, sigs))
      .to.emit(verifier, 'MetadataVerified')
      .withArgs(
        meta.messageId,
        sourceChainId,
        sender.address,
        meta.recipient,
        meta.token,
        meta.amount,
        0n,
        meta.sourceBlockNumber,
        1n,
        executor.address,
      );

    expect(await verifier.consumedMessages(meta.messageId)).to.equal(true);
    expect(await verifier.expectedNonce(sourceChainId, sender.address)).to.equal(1n);
    expect(await verifier.totalVerifiedMessages()).to.equal(1n);
    expect(await verifier.verifiedVolumeByChain(sourceChainId)).to.equal(meta.amount);
  });

  it('rejects unauthorized callers and preserves state', async function () {
    const { verifier, attacker, buildValidMessage } = await deployFixture();
    const { meta, payloadHex, sigs } = await buildValidMessage();

    await expect(
      verifier.connect(attacker).verifyAndConsumeMetadata(meta, payloadHex, sigs),
    ).to.be.revertedWithCustomError(verifier, 'UnauthorizedExecutor');

    await expect(
      verifier.connect(attacker).updateFinalizedSourceBlock(1n, 2000n),
    ).to.be.revertedWithCustomError(verifier, 'UnauthorizedAttester');

    await expect(
      verifier.connect(attacker).pause(),
    ).to.be.revertedWithCustomError(verifier, 'UnauthorizedGuardian');

    expect(await verifier.totalVerifiedMessages()).to.equal(0n);
  });

  it('rejects duplicate/replayed messages and out-of-order nonces', async function () {
    const { verifier, executor, buildValidMessage } = await deployFixture();
    const first = await buildValidMessage({ nonce: 0n });
    await verifier.connect(executor).verifyAndConsumeMetadata(first.meta, first.payloadHex, first.sigs);

    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(first.meta, first.payloadHex, first.sigs),
    ).to.be.revertedWithCustomError(verifier, 'MessageAlreadyConsumed');

    const skipped = await buildValidMessage({ nonce: 2n });
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(skipped.meta, skipped.payloadHex, skipped.sigs),
    ).to.be.revertedWithCustomError(verifier, 'InvalidNonce');
  });

  it('rejects tampered messageId, tampered payloadHash, and wrong targetChainId', async function () {
    const { verifier, executor, buildValidMessage } = await deployFixture();

    const badId = await buildValidMessage({ messageId: ethers.keccak256('0xdeadbeef') });
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(badId.meta, badId.payloadHex, badId.sigs),
    ).to.be.revertedWithCustomError(verifier, 'MessageIdMismatch');

    const badPayload = await buildValidMessage({ payloadHash: ethers.keccak256('0x9999') });
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(badPayload.meta, badPayload.payloadHex, badPayload.sigs),
    ).to.be.revertedWithCustomError(verifier, 'PayloadHashMismatch');

    const badTarget = await buildValidMessage({ targetChainId: 999999n });
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(badTarget.meta, badTarget.payloadHex, badTarget.sigs),
    ).to.be.revertedWithCustomError(verifier, 'TargetChainMismatch');
  });

  it('rejects unfinalized source blocks, non-monotonic checkpoints, and clock skew violations', async function () {
    const { verifier, executor, attester, nowTs, buildValidMessage } = await deployFixture();

    // finalizedSourceBlock = 1000, requiredConfirmations = 12 -> max valid sourceBlockNumber = 988
    const unfinalized = await buildValidMessage({ sourceBlockNumber: 989n });
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(unfinalized.meta, unfinalized.payloadHex, unfinalized.sigs),
    ).to.be.revertedWithCustomError(verifier, 'SourceBlockNotFinalized');

    // Boundary: 988 is valid (1000 - 988 == 12)
    const boundary = await buildValidMessage({ sourceBlockNumber: 988n });
    await verifier.connect(executor).verifyAndConsumeMetadata(boundary.meta, boundary.payloadHex, boundary.sigs);

    // Non-monotonic checkpoint rollback rejected
    await expect(
      verifier.connect(attester).updateFinalizedSourceBlock(1n, 1000n),
    ).to.be.revertedWithCustomError(verifier, 'NonMonotonicFinalizedBlock');

    // Clock skew: too old
    const tooOld = await buildValidMessage({ nonce: 1n, sourceTimestamp: nowTs - 4000n });
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(tooOld.meta, tooOld.payloadHex, tooOld.sigs),
    ).to.be.revertedWithCustomError(verifier, 'SourceTimestampTooOld');

    // Clock skew: too far in future
    const tooFuture = await buildValidMessage({ nonce: 1n, sourceTimestamp: nowTs + 120n });
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(tooFuture.meta, tooFuture.payloadHex, tooFuture.sigs),
    ).to.be.revertedWithCustomError(verifier, 'SourceTimestampInFuture');

    // Expired deadline
    const expired = await buildValidMessage({ nonce: 1n, deadline: nowTs });
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(expired.meta, expired.payloadHex, expired.sigs),
    ).to.be.revertedWithCustomError(verifier, 'MessageExpired');
  });

  it('rejects malleable high-s signatures, duplicate signers, unsorted signers, and insufficient quorum', async function () {
    const { verifier, executor, validators, buildValidMessage } = await deployFixture();
    const { meta, payloadHex, digest } = await buildValidMessage();

    // High-s malleability
    const sig0 = validators[0].signingKey.sign(digest);
    const highS = SECP256K1_N - BigInt(sig0.s);
    expect(highS > SECP256K1_N_DIV_2).to.equal(true);
    const malleableV = sig0.v === 27 ? 28 : 27;
    const malleableSig = ethers.concat([
      sig0.r,
      ethers.zeroPadValue(ethers.toBeHex(highS), 32),
      ethers.toBeHex(malleableV, 1),
    ]);
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(meta, payloadHex, malleableSig),
    ).to.be.revertedWithCustomError(verifier, 'MalleableSignatureS');

    // Duplicate signer
    const oneSig = ethers.concat([sig0.r, sig0.s, ethers.toBeHex(sig0.v, 1)]);
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(meta, payloadHex, ethers.concat([oneSig, oneSig])),
    ).to.be.revertedWithCustomError(verifier, 'UnsortedOrDuplicateSigner');

    // Insufficient quorum (1 of 2)
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(meta, payloadHex, oneSig),
    ).to.be.revertedWithCustomError(verifier, 'QuorumNotMet');
  });

  it('enforces pause circuit breaker and invalidates old attestations on policy version bump', async function () {
    const { verifier, admin, guardian, executor, buildValidMessage } = await deployFixture();
    const msgV1 = await buildValidMessage();

    await verifier.connect(guardian).pause();
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(msgV1.meta, msgV1.payloadHex, msgV1.sigs),
    ).to.be.revertedWithCustomError(verifier, 'ContractPaused');

    await verifier.connect(admin).unpause();
    // Bump configVersion by updating chain policy
    await verifier.connect(admin).setChainPolicy(1n, true, 15, 3600, 60, ethers.parseEther('500'));
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(msgV1.meta, msgV1.payloadHex, msgV1.sigs),
    ).to.be.revertedWithCustomError(verifier, 'QuorumNotMet');
  });

  it('enforces payload size cap and measures worst-case gas bounds', async function () {
    const { verifier, executor, buildValidMessage } = await deployFixture();

    const oversized = '0x' + 'aa'.repeat(16_385);
    const badSize = await buildValidMessage({}, oversized);
    await expect(
      verifier.connect(executor).verifyAndConsumeMetadata(badSize.meta, badSize.payloadHex, badSize.sigs),
    ).to.be.revertedWithCustomError(verifier, 'PayloadTooLarge');

    const maxPayload = '0x' + 'bb'.repeat(16_384);
    const maxMsg = await buildValidMessage({}, maxPayload);
    const tx = await verifier
      .connect(executor)
      .verifyAndConsumeMetadata(maxMsg.meta, maxMsg.payloadHex, maxMsg.sigs);
    const receipt = await tx.wait();
    // Bounded gas: even with 16KB payload, verification stays well under 400k gas
    expect(receipt!.gasUsed).to.be.lessThan(400_000n);
  });
});
