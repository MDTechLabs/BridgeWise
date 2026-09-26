import { expect } from "chai";
import { ethers } from "hardhat";

describe("BridgeSender", () => {
  async function deploy() {
    const [owner, user] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BridgeSender");
    const sender = await Factory.deploy();
    await sender.waitForDeployment();
    return { sender, owner, user };
  }

  const DEST_CHAIN = 1;
  const PAYLOAD = ethers.toUtf8Bytes("hello-cross-chain");

  it("starts with nonce 0 for any destination chain", async () => {
    const { sender } = await deploy();
    expect(await sender.outboundNonces(DEST_CHAIN)).to.equal(0);
  });

  it("increments nonce per dispatched message", async () => {
    const { sender } = await deploy();

    const tx0 = await sender.dispatchMessage(DEST_CHAIN, PAYLOAD);
    await tx0.wait();
    expect(await sender.outboundNonces(DEST_CHAIN)).to.equal(1);

    const tx1 = await sender.dispatchMessage(DEST_CHAIN, PAYLOAD);
    await tx1.wait();
    expect(await sender.outboundNonces(DEST_CHAIN)).to.equal(2);
  });

  it("maintains independent nonces per destination chain", async () => {
    const { sender } = await deploy();
    const CHAIN_A = 1;
    const CHAIN_B = 137;

    await (await sender.dispatchMessage(CHAIN_A, PAYLOAD)).wait();
    await (await sender.dispatchMessage(CHAIN_A, PAYLOAD)).wait();
    await (await sender.dispatchMessage(CHAIN_B, PAYLOAD)).wait();

    expect(await sender.outboundNonces(CHAIN_A)).to.equal(2);
    expect(await sender.outboundNonces(CHAIN_B)).to.equal(1);
  });

  it("emits MessageDispatched with correct nonce", async () => {
    const { sender } = await deploy();

    await expect(sender.dispatchMessage(DEST_CHAIN, PAYLOAD))
      .to.emit(sender, "MessageDispatched")
      .withArgs(DEST_CHAIN, 0, ethers.anyValue, ethers.hexlify(PAYLOAD));
  });

  it("emits sequential nonces in events", async () => {
    const { sender } = await deploy();

    const tx0 = sender.dispatchMessage(DEST_CHAIN, PAYLOAD);
    await expect(tx0)
      .to.emit(sender, "MessageDispatched")
      .withArgs(DEST_CHAIN, 0, ethers.anyValue, ethers.hexlify(PAYLOAD));

    const tx1 = sender.dispatchMessage(DEST_CHAIN, PAYLOAD);
    await expect(tx1)
      .to.emit(sender, "MessageDispatched")
      .withArgs(DEST_CHAIN, 1, ethers.anyValue, ethers.hexlify(PAYLOAD));
  });
});
