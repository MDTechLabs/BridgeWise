import { expect } from "chai";
import hre from "hardhat";

describe("SafeNativeTransfer", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [deployer] = await ethers.getSigners();

    const Harness = await ethers.getContractFactory("SafeNativeTransferHarness");
    const harness = await Harness.deploy();
    await harness.waitForDeployment();

    await deployer.sendTransaction({
      to: await harness.getAddress(),
      value: ethers.parseEther("10"),
    });

    return { harness, deployer };
  }

  async function deployReceiver(name: string) {
    const factory = await ethers.getContractFactory(name);
    const receiver = await factory.deploy();
    await receiver.waitForDeployment();
    return receiver;
  }

  it("uses the NativeTransferFailed() selector hardcoded in the assembly block", () => {
    expect(ethers.id("NativeTransferFailed()").slice(0, 10)).to.equal("0xf4b3b1bc");
  });

  it("delivers the exact amount to an EOA", async () => {
    const { harness } = await deploy();
    const to = ethers.Wallet.createRandom().address;
    const amount = ethers.parseEther("1.5");

    const before = await ethers.provider.getBalance(to);
    await (await harness.releaseSafe(to, amount)).wait();

    expect((await ethers.provider.getBalance(to)) - before).to.equal(amount);
  });

  it("delivers to a contract with a payable receive()", async () => {
    const { harness } = await deploy();
    const receiver = await deployReceiver("PayableReceiver");
    const amount = ethers.parseEther("2");

    await (await harness.releaseSafe(await receiver.getAddress(), amount)).wait();

    expect(await receiver.received()).to.equal(amount);
  });

  it("treats a zero-amount transfer as a no-op, not a revert", async () => {
    const { harness } = await deploy();
    const to = ethers.Wallet.createRandom().address;

    await expect(harness.releaseSafe(to, 0n)).to.not.be.reverted;
    expect(await ethers.provider.getBalance(to)).to.equal(0n);
  });

  // --- Acceptance criterion: failed transfers revert with custom error selectors ---

  it("reverts with NativeTransferFailed when the recipient rejects", async () => {
    const { harness } = await deploy();
    const rejecter = await deployReceiver("RejectingReceiver");

    await expect(
      harness.releaseSafe(await rejecter.getAddress(), ethers.parseEther("1"))
    ).to.be.revertedWithCustomError(harness, "NativeTransferFailed");
  });

  it("reverts with NativeTransferFailed when the balance is insufficient", async () => {
    const { harness } = await deploy();
    const to = ethers.Wallet.createRandom().address;

    await expect(
      harness.releaseSafe(to, ethers.parseEther("11"))
    ).to.be.revertedWithCustomError(harness, "NativeTransferFailed");
  });

  it("returns exactly 4 bytes of revert data (no reason string)", async () => {
    const { harness } = await deploy();
    const rejecter = await deployReceiver("RejectingReceiver");

    try {
      await harness.releaseSafe.staticCall(await rejecter.getAddress(), ethers.parseEther("1"));
      expect.fail("expected the transfer to revert");
    } catch (err: any) {
      const data = err.data ?? err.error?.data ?? err.info?.error?.data;
      expect(data).to.equal("0xf4b3b1bc");
    }
  });

  it("does not copy a 4 KiB revert bomb into memory", async () => {
    const { harness } = await deploy();
    const bomb = await deployReceiver("RevertBombReceiver");

    await expect(
      harness.releaseSafe(await bomb.getAddress(), ethers.parseEther("1"))
    ).to.be.revertedWithCustomError(harness, "NativeTransferFailed");
  });

  // --- Acceptance criterion: gas consumed during successful releases is reduced ---

  it("consumes no more gas than the naked call on the success path", async () => {
    const { harness, deployer } = await deploy();
    const to = ethers.Wallet.createRandom().address;
    const amount = ethers.parseEther("1");

    // Pre-fund so neither measurement pays the 25k empty-account surcharge.
    await (await deployer.sendTransaction({ to, value: 1n })).wait();

    const nakedGas = (await (await harness.releaseNaked(to, amount)).wait()).gasUsed;
    const safeGas = (await (await harness.releaseSafe(to, amount)).wait()).gasUsed;

    expect(safeGas, `safe=${safeGas} naked=${nakedGas}`).to.be.at.most(nakedGas);
  });

  it("consumes materially less gas than the bubbling call on the failure path", async () => {
    const { harness } = await deploy();
    const bomb = await deployReceiver("RevertBombReceiver");
    const bombAddress = await bomb.getAddress();
    const amount = ethers.parseEther("1");

    async function measure(variant: number): Promise<bigint> {
      const receipt = await (await harness.measureFailure(variant, bombAddress, amount)).wait();
      const log = receipt.logs
        .map((l: any) => {
          try {
            return harness.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((l: any) => l?.name === "GasMeasured");
      return log.args.gasUsed;
    }

    const safeGas = await measure(0);
    const bubbleGas = await measure(1);

    expect(safeGas, `safe=${safeGas} bubble=${bubbleGas}`).to.be.lessThan(bubbleGas);
  });
});
