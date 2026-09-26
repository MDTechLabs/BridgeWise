import { expect } from "chai";
import hre from "hardhat";

describe("YulBatchRouter", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  /// Builds the router's custom batch calldata encoding:
  ///   [0x00:0x20)            uint256 messageCount
  ///   for each message:
  ///     [off      :off+0x20) address target (left-padded)
  ///     [off+0x20 :off+0x40) uint256 payloadLength (N)
  ///     [off+0x40 :off+0x40+N) bytes payload (tightly packed, unpadded)
  function encodeBatch(messages: { target: string; payload: string }[]): string {
    const parts: string[] = [ethers.zeroPadValue(ethers.toBeHex(messages.length), 32)];
    for (const m of messages) {
      const payloadBytes = ethers.getBytes(m.payload);
      parts.push(ethers.zeroPadValue(m.target, 32));
      parts.push(ethers.zeroPadValue(ethers.toBeHex(payloadBytes.length), 32));
      parts.push(m.payload);
    }
    return ethers.concat(parts);
  }

  async function deploy() {
    const [owner, user] = await ethers.getSigners();

    const RouterFactory = await ethers.getContractFactory("YulBatchRouter");
    const router = await RouterFactory.deploy();
    await router.waitForDeployment();

    const TargetFactory = await ethers.getContractFactory("MockMessageTarget");
    const targetA = await TargetFactory.deploy();
    await targetA.waitForDeployment();
    const targetB = await TargetFactory.deploy();
    await targetB.waitForDeployment();
    const targetC = await TargetFactory.deploy();
    await targetC.waitForDeployment();

    return { router, targetA, targetB, targetC, owner, user };
  }

  it("delivers a batch of all-successful messages to multiple distinct targets", async () => {
    const { router, targetA, targetB, targetC, user } = await deploy();

    const addrA = await targetA.getAddress();
    const addrB = await targetB.getAddress();
    const addrC = await targetC.getAddress();

    const payloadA = targetA.interface.encodeFunctionData("record", [111]);
    const payloadB = targetB.interface.encodeFunctionData("record", [222]);
    const payloadC = targetC.interface.encodeFunctionData("record", [333]);

    const batch = encodeBatch([
      { target: addrA, payload: payloadA },
      { target: addrB, payload: payloadB },
      { target: addrC, payload: payloadC },
    ]);

    const [processed, succeeded, failed] = await router.routeBatch.staticCall(batch);
    expect(processed).to.equal(3n);
    expect(succeeded).to.equal(3n);
    expect(failed).to.equal(0n);

    const tx = await router.connect(user).routeBatch(batch);
    await expect(tx).to.emit(router, "MessageDelivered").withArgs(0n, addrA);
    await expect(tx).to.emit(router, "MessageDelivered").withArgs(1n, addrB);
    await expect(tx).to.emit(router, "MessageDelivered").withArgs(2n, addrC);
    await expect(tx).to.emit(router, "BatchProcessed").withArgs(3n, 3n, 0n);

    expect(await targetA.callCount()).to.equal(1n);
    expect(await targetA.lastValue()).to.equal(111n);
    expect(await targetB.callCount()).to.equal(1n);
    expect(await targetB.lastValue()).to.equal(222n);
    expect(await targetC.callCount()).to.equal(1n);
    expect(await targetC.lastValue()).to.equal(333n);
  });

  it("isolates a reverting message in the middle of the batch — other messages still deliver", async () => {
    const { router, targetA, targetB, targetC, user } = await deploy();

    const addrA = await targetA.getAddress();
    const addrB = await targetB.getAddress();
    const addrC = await targetC.getAddress();

    const payloadA = targetA.interface.encodeFunctionData("record", [1]);
    const payloadFail = targetB.interface.encodeFunctionData("fail", ["boom"]);
    const payloadC = targetC.interface.encodeFunctionData("record", [3]);

    const batch = encodeBatch([
      { target: addrA, payload: payloadA },
      { target: addrB, payload: payloadFail },
      { target: addrC, payload: payloadC },
    ]);

    const [processed, succeeded, failed] = await router.routeBatch.staticCall(batch);
    expect(processed).to.equal(3n);
    expect(succeeded).to.equal(2n);
    expect(failed).to.equal(1n);

    // The whole batch transaction must NOT revert even though message 1 reverts.
    const tx = await router.connect(user).routeBatch(batch);
    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);

    await expect(tx).to.emit(router, "MessageDelivered").withArgs(0n, addrA);
    await expect(tx).to.emit(router, "MessageDelivered").withArgs(2n, addrC);
    await expect(tx).to.emit(router, "BatchProcessed").withArgs(3n, 2n, 1n);

    // Message 1's failure event must carry the correct index/target and the
    // sub-call's actual revert data (MockRevert("boom")).
    const expectedRevertData = targetB.interface.encodeErrorResult("MockRevert", ["boom"]);
    await expect(tx)
      .to.emit(router, "MessageDeliveryFailed")
      .withArgs(1n, addrB, expectedRevertData);

    // The two successful messages actually delivered their state changes.
    expect(await targetA.callCount()).to.equal(1n);
    expect(await targetA.lastValue()).to.equal(1n);
    expect(await targetC.callCount()).to.equal(1n);
    expect(await targetC.lastValue()).to.equal(3n);

    // targetB's `fail` reverted, so its own state must be untouched.
    expect(await targetB.callCount()).to.equal(0n);
  });

  it("handles an empty batch gracefully (no revert, zero messages processed)", async () => {
    const { router, user } = await deploy();

    const [processed, succeeded, failed] = await router.routeBatch.staticCall("0x");
    expect(processed).to.equal(0n);
    expect(succeeded).to.equal(0n);
    expect(failed).to.equal(0n);

    const tx = await router.connect(user).routeBatch("0x");
    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);
    await expect(tx).to.emit(router, "BatchProcessed").withArgs(0n, 0n, 0n);
  });

  it("reverts with MalformedBatch when the encoding is internally inconsistent", async () => {
    const { router, targetA, user } = await deploy();
    const addrA = await targetA.getAddress();
    const payload = targetA.interface.encodeFunctionData("record", [1]);

    // Claim a payload length far longer than the bytes actually supplied.
    const truncated = ethers.concat([
      ethers.zeroPadValue(ethers.toBeHex(1), 32),
      ethers.zeroPadValue(addrA, 32),
      ethers.zeroPadValue(ethers.toBeHex(9999), 32),
      payload,
    ]);

    await expect(
      router.connect(user).routeBatch(truncated)
    ).to.be.revertedWithCustomError(router, "MalformedBatch");
  });

  it("processes a 20-message batch with well under generous per-message gas ceiling", async () => {
    const { router, user } = await deploy();

    const TargetFactory = await ethers.getContractFactory("MockMessageTarget");
    const N = 20;
    const targets: any[] = [];
    for (let i = 0; i < N; i++) {
      const t = await TargetFactory.deploy();
      await t.waitForDeployment();
      targets.push(t);
    }

    const messages = await Promise.all(
      targets.map(async (t, i) => ({
        target: await t.getAddress(),
        payload: t.interface.encodeFunctionData("record", [i]),
      }))
    );
    const batch = encodeBatch(messages);

    const tx = await router.connect(user).routeBatch(batch);
    const receipt = await tx.wait();

    const gasUsed = receipt.gasUsed as bigint;
    const perMessage = gasUsed / BigInt(N);

    // Coarse, non-flaky perf assertion (mirrors this codebase's convention of
    // asserting a generous per-unit gas ceiling rather than a brittle exact
    // figure that would break across compiler/solidity-version changes).
    // Measured empirically on solc 0.8.24 (cancun) for this 20-message batch:
    // gasUsed = 1,065,619 total => ~53,280 gas/message (dominated by the
    // `record` target call's own SSTORE + LOG, plus one small calldatacopy
    // per message — no nested memory array is ever allocated by the router
    // itself). We assert a generous ceiling of 100,000 gas/message, ~1.9x the
    // measured value so the test isn't flaky across minor optimizer/version
    // changes, while still being far below what N independent
    // externally-triggered transactions (21,000 base gas each, i.e. 420,000
    // gas just in base costs for 20 separate txs, before any of their own
    // execution cost) would incur.
    const PER_MESSAGE_GAS_CEILING = 100_000n;
    expect(perMessage).to.be.lessThan(PER_MESSAGE_GAS_CEILING);

    for (let i = 0; i < N; i++) {
      expect(await targets[i].callCount()).to.equal(1n);
      expect(await targets[i].lastValue()).to.equal(BigInt(i));
    }
  });
});
