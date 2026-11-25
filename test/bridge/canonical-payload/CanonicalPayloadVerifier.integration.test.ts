import { expect } from 'chai';
import { network } from 'hardhat';

const { ethers } = await network.connect();

const CANONICAL_ENCODING_VERSION = 1;
const MSG_TYPE_TRANSFER = 1;
const MSG_TYPE_CONTRACT_CALL = 2;

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

describe('CanonicalPayloadVerifier — Multi-Chain Integration Tests', function () {
  it('enforces distinct per-chain payload policies across Ethereum, Arbitrum, Optimism, and Polygon', async function () {
    const [admin, guardian, sender, recipient] = await ethers.getSigners();
    const val1 = ethers.Wallet.createRandom();
    const val2 = ethers.Wallet.createRandom();

    const Verifier = await ethers.getContractFactory('CanonicalPayloadVerifier');
    const verifier = await Verifier.deploy(
      admin.address,
      guardian.address,
      [val1.address, val2.address],
      2,
    );
    await verifier.waitForDeployment();

    const Executor = await ethers.getContractFactory('MockCanonicalExecutor');
    const executor = await Executor.deploy(await verifier.getAddress());
    await executor.waitForDeployment();
    await verifier.connect(admin).setExecutor(await executor.getAddress(), true);

    const Token = await ethers.getContractFactory('MockCanonicalERC20');
    const usdc = await Token.deploy('USD Coin', 'USDC', 6);
    await usdc.waitForDeployment();
    await usdc.mint(await executor.getAddress(), 1_000_000_000_000n);

    // Register 4 distinct supported source chains with explicit per-chain payload caps
    const chainConfigs = [
      { id: 1n, maxPayload: 4096, allowEmpty: true, maxAmt: 100_000_000_000n }, // Ethereum
      { id: 42161n, maxPayload: 2048, allowEmpty: false, maxAmt: 50_000_000_000n }, // Arbitrum
      { id: 10n, maxPayload: 1024, allowEmpty: true, maxAmt: 50_000_000_000n }, // Optimism
      { id: 137n, maxPayload: 512, allowEmpty: false, maxAmt: 25_000_000_000n }, // Polygon
    ];

    for (const cfg of chainConfigs) {
      await verifier
        .connect(admin)
        .setChainPayloadPolicy(cfg.id, true, cfg.maxPayload, cfg.allowEmpty, cfg.maxAmt);
    }

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const latestBlock = await ethers.provider.getBlock('latest');
    const deadline = BigInt(latestBlock!.timestamp) + 7200n;

    // 1. Each chain succeeds at its exact configured maxPayload
    for (const cfg of chainConfigs) {
      const payload = ethers.hexlify(new Uint8Array(cfg.maxPayload).fill(0x11));
      const envelope = await verifier.encodeCanonicalEnvelope({
        encodingVersion: CANONICAL_ENCODING_VERSION,
        messageType: MSG_TYPE_CONTRACT_CALL,
        sourceChainId: cfg.id,
        targetChainId: chainId,
        sender: sender.address,
        recipient: recipient.address,
        token: await usdc.getAddress(),
        amount: 1_000_000n,
        nonce: 0n,
        deadline,
        configVersion: 1,
        payload,
      });
      const [digest] = await verifier.computeAttestationDigest(envelope);
      const sigs = await signDigestSorted(digest, [val1, val2]);

      await executor.executeCanonicalMessage(envelope, sigs, ethers.ZeroAddress);
      expect(await verifier.verifiedVolumeByChain(cfg.id)).to.equal(1_000_000n);
    }

    // 2. Emergency pause halts all chains; only admin can unpause
    await verifier.connect(guardian).pause();
    const pausedEnv = await verifier.encodeCanonicalEnvelope({
      encodingVersion: CANONICAL_ENCODING_VERSION,
      messageType: MSG_TYPE_TRANSFER,
      sourceChainId: 1n,
      targetChainId: chainId,
      sender: sender.address,
      recipient: recipient.address,
      token: await usdc.getAddress(),
      amount: 1_000_000n,
      nonce: 1n,
      deadline,
      configVersion: 1,
      payload: '0x',
    });
    const [dPaused] = await verifier.computeAttestationDigest(pausedEnv);
    const sPaused = await signDigestSorted(dPaused, [val1, val2]);

    await expect(
      executor.executeCanonicalMessage(pausedEnv, sPaused, ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(verifier, 'ContractPaused');

    await expect(verifier.connect(guardian).unpause()).to.be.revertedWithCustomError(
      verifier,
      'Unauthorized',
    );
    await verifier.connect(admin).unpause();
    await executor.executeCanonicalMessage(pausedEnv, sPaused, ethers.ZeroAddress);
    expect(await verifier.totalVerifiedMessages()).to.equal(5n);
  });
});
