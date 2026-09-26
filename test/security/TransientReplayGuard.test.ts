import { expect } from "chai";
import hre from "hardhat";

describe("TransientReplayGuard", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [owner, user1, user2] = await ethers.getSigners();
    const Harness = await ethers.getContractFactory("TransientReplayGuardHarness");
    const guard = await Harness.deploy();
    await guard.waitForDeployment();
    return { guard, owner, user1, user2 };
  }

  it("acquires lock for a message hash", async () => {
    const { guard, user1 } = await deploy();
    const msgHash = ethers.keccak256(ethers.toUtf8Bytes("msg-1"));

    const locked = await guard.connect(user1).acquireAndCheck.staticCall(msgHash);
    expect(locked).to.equal(true);
  });

  it("emits MessageLocked on acquireLock", async () => {
    const { guard, user1 } = await deploy();
    const msgHash = ethers.keccak256(ethers.toUtf8Bytes("msg-emit"));

    await expect(guard.connect(user1).acquireLock(msgHash))
      .to.emit(guard, "MessageLocked")
      .withArgs(msgHash);
  });

  it("reverts when replaying the same message in one tx", async () => {
    const { guard, user1 } = await deploy();
    const msgHash = ethers.keccak256(ethers.toUtf8Bytes("msg-replay"));

    await expect(
      guard.connect(user1).replaySameTx(msgHash)
    ).to.be.revertedWithCustomError(guard, "MessageReplayed").withArgs(msgHash);
  });

  it("allows different message hashes simultaneously", async () => {
    const { guard, user1 } = await deploy();
    const hash1 = ethers.keccak256(ethers.toUtf8Bytes("msg-a"));
    const hash2 = ethers.keccak256(ethers.toUtf8Bytes("msg-b"));

    const [locked1, locked2] = await guard.connect(user1).acquireAndCheckTwice.staticCall(hash1, hash2);
    expect(locked1).to.equal(true);
    expect(locked2).to.equal(true);
  });

  it("executeWithGuard acquires lock", async () => {
    const { guard, user1 } = await deploy();
    const msgHash = ethers.keccak256(ethers.toUtf8Bytes("msg-exec"));

    await expect(guard.connect(user1).executeWithGuard(msgHash, "0x"))
      .to.emit(guard, "MessageLocked")
      .withArgs(msgHash);
  });

  it("second executeWithGuard succeeds after first (transient storage clears)", async () => {
    const { guard, user1 } = await deploy();
    const msgHash = ethers.keccak256(ethers.toUtf8Bytes("msg-exec-replay"));

    await guard.connect(user1).executeWithGuard(msgHash, "0x");

    // After a new tx, transient storage is cleared, so same msg succeeds again
    await expect(guard.connect(user1).executeWithGuard(msgHash, "0x"))
      .to.emit(guard, "MessageLocked");
  });

  it("lock is NOT persistent across transactions (transient storage clears)", async () => {
    const { guard, user1 } = await deploy();
    const msgHash = ethers.keccak256(ethers.toUtf8Bytes("msg-transient"));

    await guard.connect(user1).acquireLock(msgHash);

    // After a new tx, the lock should be cleared (transient storage)
    await ethers.provider.send("evm_mine", []);

    // Re-acquiring the same message should succeed (lock was cleared)
    await expect(guard.connect(user1).acquireLock(msgHash))
      .to.emit(guard, "MessageLocked");
  });

  it("manual release clears the lock within same tx", async () => {
    const { guard, user1 } = await deploy();
    const msgHash = ethers.keccak256(ethers.toUtf8Bytes("msg-release"));

    const stillLocked = await guard.connect(user1).acquireReleaseAndCheck.staticCall(msgHash);
    expect(stillLocked).to.equal(false);
  });
});
