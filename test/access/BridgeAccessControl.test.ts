import { expect } from "chai";
import hre from "hardhat";

describe("BridgeAccessControl", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [admin, relayer, other] = await ethers.getSigners();

    const HandlerFactory = await ethers.getContractFactory("MockRelayerCallbackHandler");
    const handler = await HandlerFactory.deploy(admin.address, [relayer.address]);
    await handler.waitForDeployment();

    return { handler, admin, relayer, other };
  }

  describe("relayer-gated calls", () => {
    it("allows an authorized relayer to call the gated function", async () => {
      const { handler, relayer } = await deploy();
      const messageId = ethers.zeroPadValue("0x01", 32);

      await expect(handler.connect(relayer).deliverMessage(messageId))
        .to.emit(handler, "MessageDelivered")
        .withArgs(messageId, relayer.address);

      expect(await handler.deliveredCount()).to.equal(1n);
    });

    it("rejects an unauthorized caller with the UnauthorizedRelayer custom error", async () => {
      const { handler, other } = await deploy();
      const messageId = ethers.zeroPadValue("0x01", 32);

      await expect(
        handler.connect(other).deliverMessage(messageId)
      ).to.be.revertedWithCustomError(handler, "UnauthorizedRelayer");
    });
  });

  describe("relayer management", () => {
    it("lets the admin add a new relayer, and the new relayer can then call the gated function", async () => {
      const { handler, admin, other } = await deploy();

      expect(await handler.isRelayer(other.address)).to.equal(false);

      await expect(handler.connect(admin).addRelayer(other.address))
        .to.emit(handler, "RelayerAdded")
        .withArgs(other.address);

      expect(await handler.isRelayer(other.address)).to.equal(true);

      const messageId = ethers.zeroPadValue("0x02", 32);
      await expect(handler.connect(other).deliverMessage(messageId)).to.not.be.revert(ethers);
    });

    it("lets the admin remove a relayer, after which they are rejected", async () => {
      const { handler, admin, relayer } = await deploy();

      await expect(handler.connect(admin).removeRelayer(relayer.address))
        .to.emit(handler, "RelayerRemoved")
        .withArgs(relayer.address);

      expect(await handler.isRelayer(relayer.address)).to.equal(false);

      const messageId = ethers.zeroPadValue("0x03", 32);
      await expect(
        handler.connect(relayer).deliverMessage(messageId)
      ).to.be.revertedWithCustomError(handler, "UnauthorizedRelayer");
    });

    it("rejects a non-admin attempting to add a relayer", async () => {
      const { handler, other } = await deploy();

      await expect(
        handler.connect(other).addRelayer(other.address)
      ).to.be.revertedWithCustomError(handler, "UnauthorizedAdmin");
    });

    it("rejects a non-admin attempting to remove a relayer", async () => {
      const { handler, relayer, other } = await deploy();

      await expect(
        handler.connect(other).removeRelayer(relayer.address)
      ).to.be.revertedWithCustomError(handler, "UnauthorizedAdmin");
    });

    it("reverts construction with the zero address as admin", async () => {
      const HandlerFactory = await ethers.getContractFactory("MockRelayerCallbackHandler");
      await expect(
        HandlerFactory.deploy(ethers.ZeroAddress, [])
      ).to.be.revertedWithCustomError(HandlerFactory, "ZeroAddress");
    });
  });

  describe("gas and bytecode comparison: custom error vs. string require", () => {
    async function deployBoth() {
      const [admin, relayer, other] = await ethers.getSigners();

      const CustomErrorFactory = await ethers.getContractFactory("MockRelayerCallbackHandler");
      const customErrorHandler = await CustomErrorFactory.deploy(admin.address, [relayer.address]);
      await customErrorHandler.waitForDeployment();

      const RequireFactory = await ethers.getContractFactory("StringRequireRelayerHandler");
      const requireHandler = await RequireFactory.deploy(admin.address, [relayer.address]);
      await requireHandler.waitForDeployment();

      const ProbeFactory = await ethers.getContractFactory("GasProbe");
      const probe = await ProbeFactory.deploy();
      await probe.waitForDeployment();

      return { customErrorHandler, requireHandler, probe, admin, relayer, other, CustomErrorFactory, RequireFactory };
    }

    it("measures and compares success-path gas cost", async () => {
      const { customErrorHandler, requireHandler, relayer } = await deployBoth();
      const messageId = ethers.zeroPadValue("0x04", 32);

      const customErrorTx = await customErrorHandler.connect(relayer).deliverMessage(messageId);
      const customErrorReceipt = await customErrorTx.wait();

      const requireTx = await requireHandler.connect(relayer).deliverMessage(messageId);
      const requireReceipt = await requireTx.wait();

      console.log(
        `      [gas] success path (tx receipt) — custom error modifier: ${customErrorReceipt.gasUsed.toString()}, ` +
          `require modifier: ${requireReceipt.gasUsed.toString()}, ` +
          `delta: ${(requireReceipt.gasUsed - customErrorReceipt.gasUsed).toString()}`
      );

      expect(customErrorReceipt.gasUsed).to.be.lte(requireReceipt.gasUsed);
    });

    it("measures and compares failure-path (revert) gas cost via an on-chain gas probe", async () => {
      // A reverted top-level transaction has no gasUsed on its receipt, so we
      // route the call through GasProbe, which performs a low-level `.call()`
      // (absorbing the revert) and reports gasleft() sampled immediately before
      // and after — giving an exact, comparable gas figure for the failure path
      // of both the custom-error and string-require modifiers.
      const { customErrorHandler, requireHandler, probe, other } = await deployBoth();
      const messageId = ethers.zeroPadValue("0x05", 32);

      const customErrorCalldata = customErrorHandler.interface.encodeFunctionData("deliverMessage", [messageId]);
      const requireCalldata = requireHandler.interface.encodeFunctionData("deliverMessage", [messageId]);

      const customErrorResult = await probe
        .connect(other)
        .measure.staticCall(await customErrorHandler.getAddress(), customErrorCalldata);
      const requireResult = await probe
        .connect(other)
        .measure.staticCall(await requireHandler.getAddress(), requireCalldata);

      const [customErrorGasUsed, customErrorSuccess] = customErrorResult;
      const [requireGasUsed, requireSuccess] = requireResult;

      expect(customErrorSuccess).to.equal(false);
      expect(requireSuccess).to.equal(false);

      console.log(
        `      [gas] failure path (GasProbe) — custom error: ${customErrorGasUsed.toString()}, ` +
          `require: ${requireGasUsed.toString()}, ` +
          `delta: ${(requireGasUsed - customErrorGasUsed).toString()}`
      );

      // Custom errors avoid ABI-encoding/returning a revert-reason string, so the
      // failure path should never cost more gas than the equivalent require().
      expect(customErrorGasUsed).to.be.lte(requireGasUsed);

      // Independently confirm the actual revert reasons via normal calls too.
      await expect(
        customErrorHandler.connect(other).deliverMessage(messageId)
      ).to.be.revertedWithCustomError(customErrorHandler, "UnauthorizedRelayer");
      await expect(
        requireHandler.connect(other).deliverMessage(messageId)
      ).to.be.revertedWith("Unauthorized relayer");
    });

    it("measures and compares deployed bytecode size", async () => {
      const { CustomErrorFactory, RequireFactory, customErrorHandler, requireHandler } = await deployBoth();

      const customErrorCreationSize = (CustomErrorFactory.bytecode.length - 2) / 2;
      const requireCreationSize = (RequireFactory.bytecode.length - 2) / 2;

      const customErrorDeployedCode = await ethers.provider.getCode(await customErrorHandler.getAddress());
      const requireDeployedCode = await ethers.provider.getCode(await requireHandler.getAddress());

      const customErrorDeployedSize = (customErrorDeployedCode.length - 2) / 2;
      const requireDeployedSize = (requireDeployedCode.length - 2) / 2;

      console.log(
        `      [size] creation bytecode — custom error: ${customErrorCreationSize} bytes, ` +
          `require: ${requireCreationSize} bytes, ` +
          `delta: ${requireCreationSize - customErrorCreationSize} bytes`
      );
      console.log(
        `      [size] deployed bytecode — custom error: ${customErrorDeployedSize} bytes, ` +
          `require: ${requireDeployedSize} bytes, ` +
          `delta: ${requireDeployedSize - customErrorDeployedSize} bytes`
      );

      expect(customErrorDeployedSize).to.be.lte(requireDeployedSize);
    });
  });
});
