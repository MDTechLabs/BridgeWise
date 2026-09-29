import { expect } from "chai";
import hre from "hardhat";

describe("DurableOrchestrator", () => {
  let ethers: any;
  let owner: any;
  let orchestrator: any;

  const TARGET = "0x0000000000000000000000000000000000000003";

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    [owner] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const Factory = await ethers.getContractFactory("DurableOrchestrator");
    orchestrator = await Factory.deploy(owner.address);
    await orchestrator.waitForDeployment();
  });

  describe("lifecycle", () => {
    it("creates and executes a durable execution", async () => {
      const payloadHash = ethers.solidityPackedKeccak256(["string"], ["test"]);
      const data = ethers.hexlify(ethers.toUtf8Bytes("execute"));

      const tx = await orchestrator.createExecution(payloadHash, TARGET, data, 1000, owner.address);
      expect(tx).to.emit(orchestrator, "ExecutionCreated");

      await orchestrator.startExecution(0);
      expect(await orchestrator.getExecution(0).then(e => e.state)).to.equal(1);

      await orchestrator.completeExecution(0, "0x");
      expect(await orchestrator.getExecution(0).then(e => e.state)).to.equal(2);
    });

    it("records failure and schedules retry", async () => {
      const payloadHash = ethers.solidityPackedKeccak256(["string"], ["test"]);
      const data = ethers.hexlify(ethers.toUtf8Bytes("execute"));

      await orchestrator.createExecution(payloadHash, TARGET, data, 1000, owner.address);
      await orchestrator.startExecution(0);
      await orchestrator.failExecution(0, "Test failure");

      const ex = await orchestrator.getExecution(0);
      expect(ex.state).to.equal(4);
      expect(ex.retryCount).to.equal(1);
    });

    it("finalizes after max retries", async () => {
      const payloadHash = ethers.solidityPackedKeccak256(["string"], ["test"]);
      const data = ethers.hexlify(ethers.toUtf8Bytes("execute"));

      await orchestrator.createExecution(payloadHash, TARGET, data, 1000, owner.address);
      await orchestrator.startExecution(0);

      for (let i = 0; i < 3; i++) {
        await orchestrator.failExecution(0, "Test failure");
      }

      const ex = await orchestrator.getExecution(0);
      expect(ex.state).to.equal(3);
    });

    it("tracks active execution count", async () => {
      expect(await orchestrator.getActiveExecutionCount()).to.equal(0);
    });
  });
});
