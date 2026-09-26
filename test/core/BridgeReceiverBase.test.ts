import { expect } from "chai";
import { ethers } from "hardhat";

describe("BridgeReceiverBase", () => {
  async function deploy() {
    const [admin, guardian, user] = await ethers.getSigners();
    const Receiver = await ethers.getContractFactory("BridgeReceiverBase");
    const receiver = await Receiver.deploy(admin.address, guardian.address);
    await receiver.waitForDeployment();
    return { receiver, admin, guardian, user };
  }

  const MESSAGE = ethers.toUtf8Bytes("hello-bridge");

  it("allows the guardian to pause and unpause", async () => {
    const { receiver, guardian } = await deploy();
    await receiver.connect(guardian).pause();
    expect(await receiver.paused()).to.equal(true);
    await receiver.connect(guardian).unpause();
    expect(await receiver.paused()).to.equal(false);
  });

  it("reverts pause() for non-guardian callers", async () => {
    const { receiver, user } = await deploy();
    await expect(receiver.connect(user).pause())
      .to.be.revertedWithCustomError(receiver, "AccessControlUnauthorizedAccount")
      .withArgs(user.address, await receiver.GUARDIAN_ROLE());
  });

  it("reverts receiveMessage with EnforcedPause while paused", async () => {
    const { receiver, guardian, user } = await deploy();
    await receiver.connect(guardian).pause();
    await expect(receiver.connect(user).receiveMessage(MESSAGE)).to.be.revertedWithCustomError(
      receiver,
      "EnforcedPause"
    );
  });

  it("reverts withdrawLiquidity with EnforcedPause while paused", async () => {
    const { receiver, guardian, user } = await deploy();
    await receiver.connect(guardian).pause();
    await expect(
      receiver.connect(user).withdrawLiquidity(ethers.ZeroAddress, 1n, user.address)
    ).to.be.revertedWithCustomError(receiver, "EnforcedPause");
  });

  it("processes entry points again after unpause", async () => {
    const { receiver, guardian, user } = await deploy();
    await receiver.connect(guardian).pause();
    await receiver.connect(guardian).unpause();
    await expect(receiver.connect(user).receiveMessage(MESSAGE)).to.emit(receiver, "MessageReceived");
  });
});
