import { expect } from 'chai';
import { network } from 'hardhat';

const { ethers } = await network.connect();

const CANONICAL_ENCODING_VERSION = 1;
const MSG_TYPE_TRANSFER = 1;
const MSG_TYPE_CONTRACT_CALL = 2;
const SOURCE_CHAIN_ID = 1n; // Ethereum Mainnet

const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

interface CanonicalMsgInput {
  encodingVersion?: number;
  messageType?: number;
  sourceChainId?: bigint;
  targetChainId: bigint;
  sender: string;
  recipient: string;
  token: string;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  configVersion: number;
  payload: string;
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

describe('CanonicalPayloadVerifier — Unit, Boundary & Adversarial Tests', function () {
  async function deployFixture() {
    const [admin, guardian, executor, sender, recipient, attacker] =
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

    await verifier.connect(admin).setExecutor(executor.address, true);
    await verifier
      .connect(admin)
      .setChainPayloadPolicy(SOURCE_CHAIN_ID, true, 1024, false, ethers.parseEther('1000'));

    const Token = await ethers.getContractFactory('MockCanonicalERC20');
    const token = await Token.deploy('Bridge USD', 'bUSD', 18);
    await token.waitForDeployment();

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const latestBlock = await ethers.provider.getBlock('latest');
    const now = BigInt(latestBlock!.timestamp);

    return {
      verifier,
      token,
      admin,
      guardian,
      executor,
      sender,
      recipient,
      attacker,
      validators: [val1, val2, val3],
      chainId,
      now,
    };
  }

  async function buildEnvelope(verifier: any, input: CanonicalMsgInput): Promise<string> {
    return verifier.encodeCanonicalEnvelope({
      encodingVersion: input.encodingVersion ?? CANONICAL_ENCODING_VERSION,
      messageType: input.messageType ?? MSG_TYPE_CONTRACT_CALL,
      sourceChainId: input.sourceChainId ?? SOURCE_CHAIN_ID,
      targetChainId: input.targetChainId,
      sender: input.sender,
      recipient: input.recipient,
      token: input.token,
      amount: input.amount,
      nonce: input.nonce,
      deadline: input.deadline,
      configVersion: input.configVersion,
      payload: input.payload,
    });
  }

  it('encodes, decodes, and verifies a valid canonical envelope', async function () {
    const { verifier, token, executor, sender, recipient, validators, chainId, now } =
      await deployFixture();

    const payload = ethers.hexlify(ethers.randomBytes(64));
    const envelope = await buildEnvelope(verifier, {
      targetChainId: chainId,
      sender: sender.address,
      recipient: recipient.address,
      token: await token.getAddress(),
      amount: ethers.parseEther('10'),
      nonce: 0n,
      deadline: now + 3600n,
      configVersion: 1,
      payload,
    });

    expect(await verifier.isCanonicalEncoding(envelope)).to.equal(true);
    const [digest, messageId] = await verifier.computeAttestationDigest(envelope);
    const sigs = await signDigestSorted(digest, [validators[0], validators[1]]);

    await expect(
      verifier.connect(executor).verifyAndConsumeCanonicalEnvelope(envelope, sigs),
    ).to.emit(verifier, 'CanonicalEnvelopeVerified');

    expect(await verifier.consumedMessages(messageId)).to.equal(true);
    expect(await verifier.expectedNonce(SOURCE_CHAIN_ID, sender.address)).to.equal(1n);
    expect(await verifier.totalVerifiedMessages()).to.equal(1n);
    expect(await verifier.totalVerifiedPayloadBytes()).to.equal(64n);
  });

  it('enforces exact maxPayloadBytes boundary (accepts maxPayloadBytes, rejects maxPayloadBytes + 1)', async function () {
    const { verifier, token, executor, sender, recipient, validators, chainId, now } =
      await deployFixture();

    // Boundary 1: exact 1024 bytes succeeds
    const exactPayload = ethers.hexlify(new Uint8Array(1024).fill(0xab));
    const exactEnv = await buildEnvelope(verifier, {
      targetChainId: chainId,
      sender: sender.address,
      recipient: recipient.address,
      token: await token.getAddress(),
      amount: ethers.parseEther('1'),
      nonce: 0n,
      deadline: now + 3600n,
      configVersion: 1,
      payload: exactPayload,
    });
    const [digest1] = await verifier.computeAttestationDigest(exactEnv);
    const sigs1 = await signDigestSorted(digest1, [validators[0], validators[1]]);
    await verifier.connect(executor).verifyAndConsumeCanonicalEnvelope(exactEnv, sigs1);

    // Boundary 2: 1025 bytes fails with PayloadTooLarge
    const overPayload = ethers.hexlify(new Uint8Array(1025).fill(0xcd));
    const overEnv = await buildEnvelope(verifier, {
      targetChainId: chainId,
      sender: sender.address,
      recipient: recipient.address,
      token: await token.getAddress(),
      amount: ethers.parseEther('1'),
      nonce: 1n,
      deadline: now + 3600n,
      configVersion: 1,
      payload: overPayload,
    });
    const [digest2] = await verifier.computeAttestationDigest(overEnv);
    const sigs2 = await signDigestSorted(digest2, [validators[0], validators[1]]);
    await expect(
      verifier.connect(executor).verifyAndConsumeCanonicalEnvelope(overEnv, sigs2),
    ).to.be.revertedWithCustomError(verifier, 'PayloadTooLarge');
  });

  it('rejects non-canonical encodings: trailing garbage bytes, truncated header, wrong version, unknown messageType', async function () {
    const { verifier, token, sender, recipient, chainId, now } = await deployFixture();

    const validEnv = await buildEnvelope(verifier, {
      targetChainId: chainId,
      sender: sender.address,
      recipient: recipient.address,
      token: await token.getAddress(),
      amount: ethers.parseEther('1'),
      nonce: 0n,
      deadline: now + 3600n,
      configVersion: 1,
      payload: '0xdeadbeef',
    });

    // Trailing garbage byte
    const withTrailingByte = validEnv + '00';
    await expect(
      verifier.decodeCanonicalEnvelope(withTrailingByte),
    ).to.be.revertedWithCustomError(verifier, 'PayloadLengthMismatch');

    // Truncated envelope (< 231 bytes)
    const truncated = validEnv.slice(0, 2 + 100 * 2);
    await expect(
      verifier.decodeCanonicalEnvelope(truncated),
    ).to.be.revertedWithCustomError(verifier, 'EnvelopeTooShort');

    // Mutated encodingVersion byte (0x01 -> 0x02)
    const badVersion = '0x02' + validEnv.slice(4);
    await expect(
      verifier.decodeCanonicalEnvelope(badVersion),
    ).to.be.revertedWithCustomError(verifier, 'UnsupportedEncodingVersion');

    // Mutated messageType bytes (0x0002 -> 0x00ff)
    const badMsgType = validEnv.slice(0, 4) + '00ff' + validEnv.slice(8);
    await expect(
      verifier.decodeCanonicalEnvelope(badMsgType),
    ).to.be.revertedWithCustomError(verifier, 'UnsupportedMessageType');
  });

  it('enforces per-chain allowEmptyPayload flag', async function () {
    const { verifier, token, admin, executor, sender, recipient, validators, chainId, now } =
      await deployFixture();

    const emptyEnvV1 = await buildEnvelope(verifier, {
      messageType: MSG_TYPE_TRANSFER,
      targetChainId: chainId,
      sender: sender.address,
      recipient: recipient.address,
      token: await token.getAddress(),
      amount: ethers.parseEther('1'),
      nonce: 0n,
      deadline: now + 3600n,
      configVersion: 1,
      payload: '0x',
    });
    const [d1] = await verifier.computeAttestationDigest(emptyEnvV1);
    const s1 = await signDigestSorted(d1, [validators[0], validators[1]]);

    await expect(
      verifier.connect(executor).verifyAndConsumeCanonicalEnvelope(emptyEnvV1, s1),
    ).to.be.revertedWithCustomError(verifier, 'EmptyPayloadNotAllowed');

    // Enable allowEmptyPayload (bumps configVersion to 2)
    await verifier
      .connect(admin)
      .setChainPayloadPolicy(SOURCE_CHAIN_ID, true, 1024, true, ethers.parseEther('1000'));

    // Stale configVersion=1 now fails closed
    await expect(
      verifier.connect(executor).verifyAndConsumeCanonicalEnvelope(emptyEnvV1, s1),
    ).to.be.revertedWithCustomError(verifier, 'ConfigVersionMismatch');

    const emptyEnvV2 = await buildEnvelope(verifier, {
      messageType: MSG_TYPE_TRANSFER,
      targetChainId: chainId,
      sender: sender.address,
      recipient: recipient.address,
      token: await token.getAddress(),
      amount: ethers.parseEther('1'),
      nonce: 0n,
      deadline: now + 3600n,
      configVersion: 2,
      payload: '0x',
    });
    const [d2] = await verifier.computeAttestationDigest(emptyEnvV2);
    const s2 = await signDigestSorted(d2, [validators[0], validators[1]]);
    await verifier.connect(executor).verifyAndConsumeCanonicalEnvelope(emptyEnvV2, s2);
    expect(await verifier.totalVerifiedMessages()).to.equal(1n);
  });

  it('rejects unauthorized callers, replayed messages, and non-monotonic nonces', async function () {
    const { verifier, token, executor, sender, recipient, attacker, validators, chainId, now } =
      await deployFixture();

    const envelope = await buildEnvelope(verifier, {
      targetChainId: chainId,
      sender: sender.address,
      recipient: recipient.address,
      token: await token.getAddress(),
      amount: ethers.parseEther('5'),
      nonce: 0n,
      deadline: now + 3600n,
      configVersion: 1,
      payload: '0x1234',
    });
    const [digest] = await verifier.computeAttestationDigest(envelope);
    const sigs = await signDigestSorted(digest, [validators[0], validators[1]]);

    // Unauthorized caller cannot mutate state
    await expect(
      verifier.connect(attacker).verifyAndConsumeCanonicalEnvelope(envelope, sigs),
    ).to.be.revertedWithCustomError(verifier, 'Unauthorized');

    // Authorized executor succeeds
    await verifier.connect(executor).verifyAndConsumeCanonicalEnvelope(envelope, sigs);

    // Replay is rejected
    await expect(
      verifier.connect(executor).verifyAndConsumeCanonicalEnvelope(envelope, sigs),
    ).to.be.revertedWithCustomError(verifier, 'MessageAlreadyConsumed');

    // Skipped nonce (nonce 2 instead of 1) is rejected
    const skippedEnv = await buildEnvelope(verifier, {
      targetChainId: chainId,
      sender: sender.address,
      recipient: recipient.address,
      token: await token.getAddress(),
      amount: ethers.parseEther('5'),
      nonce: 2n,
      deadline: now + 3600n,
      configVersion: 1,
      payload: '0x1234',
    });
    const [dSkip] = await verifier.computeAttestationDigest(skippedEnv);
    const sSkip = await signDigestSorted(dSkip, [validators[0], validators[1]]);
    await expect(
      verifier.connect(executor).verifyAndConsumeCanonicalEnvelope(skippedEnv, sSkip),
    ).to.be.revertedWithCustomError(verifier, 'InvalidNonce');
  });

  it('rejects malleable high-s signatures and duplicate/unsorted signers', async function () {
    const { verifier, token, executor, sender, recipient, validators, chainId, now } =
      await deployFixture();

    const envelope = await buildEnvelope(verifier, {
      targetChainId: chainId,
      sender: sender.address,
      recipient: recipient.address,
      token: await token.getAddress(),
      amount: ethers.parseEther('2'),
      nonce: 0n,
      deadline: now + 3600n,
      configVersion: 1,
      payload: '0xabcd',
    });
    const [digest] = await verifier.computeAttestationDigest(envelope);

    // Duplicate signer
    const sig0 = validators[0].signingKey.sign(digest);
    const s0Hex =
      sig0.r.slice(2) + sig0.s.slice(2) + sig0.v.toString(16).padStart(2, '0');
    await expect(
      verifier
        .connect(executor)
        .verifyAndConsumeCanonicalEnvelope(envelope, '0x' + s0Hex + s0Hex),
    ).to.be.revertedWithCustomError(verifier, 'NonAscendingSigners');

    // Malleable high-s signature
    const highS = (SECP256K1_N - BigInt(sig0.s)).toString(16).padStart(64, '0');
    const flippedV = (sig0.v === 27 ? 28 : 27).toString(16).padStart(2, '0');
    const malleable = '0x' + sig0.r.slice(2) + highS + flippedV + s0Hex;
    await expect(
      verifier.connect(executor).verifyAndConsumeCanonicalEnvelope(envelope, malleable),
    ).to.be.revertedWithCustomError(verifier, 'MalleableSignatureS');
  });

  it('measures worst-case gas bound for ABSOLUTE_MAX_PAYLOAD_BYTES (16 KiB)', async function () {
    const { verifier, token, admin, executor, sender, recipient, validators, chainId, now } =
      await deployFixture();

    await verifier
      .connect(admin)
      .setChainPayloadPolicy(SOURCE_CHAIN_ID, true, 16_384, false, ethers.parseEther('1000'));

    const maxPayload = ethers.hexlify(new Uint8Array(16_384).fill(0x5a));
    const envelope = await buildEnvelope(verifier, {
      targetChainId: chainId,
      sender: sender.address,
      recipient: recipient.address,
      token: await token.getAddress(),
      amount: ethers.parseEther('1'),
      nonce: 0n,
      deadline: now + 3600n,
      configVersion: 2,
      payload: maxPayload,
    });
    const [digest] = await verifier.computeAttestationDigest(envelope);
    const sigs = await signDigestSorted(digest, validators);

    const tx = await verifier
      .connect(executor)
      .verifyAndConsumeCanonicalEnvelope(envelope, sigs);
    const receipt = await tx.wait();
    // Bounded well below 1,000,000 gas even at 16 KiB payload + 3 validators
    expect(receipt!.gasUsed).to.be.lessThan(1_000_000n);
  });
});
