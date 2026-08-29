import { expect } from "chai";
import hre from "hardhat";

describe("YulLightClient", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [owner, validator, unauthorizedSigner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("YulLightClient");

    const initialBlockNumber = 100;
    const initialStateRoot = ethers.keccak256(ethers.toUtf8Bytes("INITIAL_STATE_ROOT"));

    const client = await Factory.deploy(validator.address, initialBlockNumber, initialStateRoot);
    await client.waitForDeployment();

    return { client, owner, validator, unauthorizedSigner, initialBlockNumber, initialStateRoot };
  }

  it("verifies valid light client header and updates state root", async () => {
    const { client, validator } = await deploy();

    const newBlockNumber = 101;
    const newStateRoot = ethers.keccak256(ethers.toUtf8Bytes("STATE_ROOT_BLOCK_101"));
    const headerRlp = ethers.getBytes(ethers.solidityPackedKeccak256(["string", "uint256"], ["HEADER_RLP_101", newBlockNumber]));

    const computedHash = ethers.keccak256(headerRlp);
    const sig = await validator.signMessage(ethers.getBytes(computedHash));

    await expect(client.verifyHeader(headerRlp, newBlockNumber, newStateRoot, sig))
      .to.emit(client, "HeaderVerified")
      .withArgs(newBlockNumber, newStateRoot, computedHash);

    expect(await client.latestBlockNumber()).to.equal(newBlockNumber);
    expect(await client.latestStateRoot()).to.equal(newStateRoot);
  });

  it("rejects out-of-order or stale block headers", async () => {
    const { client, validator, initialBlockNumber } = await deploy();

    const staleBlockNumber = initialBlockNumber - 1;
    const newStateRoot = ethers.keccak256(ethers.toUtf8Bytes("STATE_ROOT_STALE"));
    const headerRlp = ethers.getBytes(ethers.solidityPackedKeccak256(["string", "uint256"], ["HEADER_STALE", staleBlockNumber]));

    const computedHash = ethers.keccak256(headerRlp);
    const sig = await validator.signMessage(ethers.getBytes(computedHash));

    await expect(
      client.verifyHeader(headerRlp, staleBlockNumber, newStateRoot, sig)
    ).to.be.revertedWithCustomError(client, "InvalidBlockSequence");
  });

  it("rejects empty header calldata", async () => {
    const { client, validator } = await deploy();

    const newBlockNumber = 101;
    const newStateRoot = ethers.keccak256(ethers.toUtf8Bytes("STATE_ROOT_101"));
    const sig = "0x" + "00".repeat(65);

    await expect(
      client.verifyHeader("0x", newBlockNumber, newStateRoot, sig)
    ).to.be.revertedWithCustomError(client, "InvalidHeaderLength");
  });

  it("rejects headers signed by unauthorized validator", async () => {
    const { client, unauthorizedSigner } = await deploy();

    const newBlockNumber = 101;
    const newStateRoot = ethers.keccak256(ethers.toUtf8Bytes("STATE_ROOT_101"));
    const headerRlp = ethers.getBytes(ethers.solidityPackedKeccak256(["string", "uint256"], ["HEADER_RLP_101", newBlockNumber]));

    const computedHash = ethers.keccak256(headerRlp);
    const sig = await unauthorizedSigner.signMessage(ethers.getBytes(computedHash));

    await expect(
      client.verifyHeader(headerRlp, newBlockNumber, newStateRoot, sig)
    ).to.be.revertedWithCustomError(client, "UnauthorizedValidator");
  });
});
