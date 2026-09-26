import { expect } from "chai";
import hre from "hardhat";

describe("ValidatorSlasher", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [owner, validator1, validator2, reporter, user] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ValidatorSlasher");
    const MIN_STAKE = ethers.parseEther("1.0");
    const slasher = await Factory.deploy(MIN_STAKE);
    await slasher.waitForDeployment();

    return { slasher, owner, validator1, validator2, reporter, user, MIN_STAKE };
  }

  it("registers a validator with sufficient stake", async () => {
    const { slasher, validator1, MIN_STAKE } = await deploy();

    await expect(slasher.connect(validator1).registerValidator({ value: MIN_STAKE }))
      .to.emit(slasher, "ValidatorRegistered")
      .withArgs(validator1.address, MIN_STAKE);

    const val = await slasher.validators(validator1.address);
    expect(val.stake).to.equal(MIN_STAKE);
    expect(val.isActive).to.equal(true);
    expect(val.isSlashed).to.equal(false);

    const activeList = await slasher.getActiveValidators();
    expect(activeList).to.include(validator1.address);
  });

  it("rejects registration with insufficient stake", async () => {
    const { slasher, validator1, MIN_STAKE } = await deploy();
    const lowStake = ethers.parseEther("0.5");

    await expect(
      slasher.connect(validator1).registerValidator({ value: lowStake })
    ).to.be.revertedWithCustomError(slasher, "InsufficientStake");
  });

  it("successfully slashes malicious validator signing conflicting payloads", async () => {
    const { slasher, validator1, reporter, MIN_STAKE } = await deploy();

    await slasher.connect(validator1).registerValidator({ value: MIN_STAKE });

    const nonceOrHeight = 100;
    const payload1 = ethers.getBytes(ethers.solidityPackedKeccak256(["string", "uint256"], ["HEADER_A", nonceOrHeight]));
    const payload2 = ethers.getBytes(ethers.solidityPackedKeccak256(["string", "uint256"], ["HEADER_B", nonceOrHeight]));

    const hash1 = ethers.keccak256(payload1);
    const hash2 = ethers.keccak256(payload2);

    const sig1 = await validator1.signMessage(ethers.getBytes(hash1));
    const sig2 = await validator1.signMessage(ethers.getBytes(hash2));

    await expect(
      slasher.connect(reporter).reportEquivocation(payload1, sig1, payload2, sig2, nonceOrHeight)
    )
      .to.emit(slasher, "ValidatorSlashed")
      .withArgs(validator1.address, reporter.address, MIN_STAKE, (MIN_STAKE * 10n) / 100n);

    const val = await slasher.validators(validator1.address);
    expect(val.stake).to.equal(0);
    expect(val.isActive).to.equal(false);
    expect(val.isSlashed).to.equal(true);

    const activeList = await slasher.getActiveValidators();
    expect(activeList).to.not.include(validator1.address);
  });

  it("rejects non-conflicting (identical) payloads", async () => {
    const { slasher, validator1, reporter, MIN_STAKE } = await deploy();

    await slasher.connect(validator1).registerValidator({ value: MIN_STAKE });

    const nonceOrHeight = 100;
    const payload1 = ethers.getBytes(ethers.solidityPackedKeccak256(["string", "uint256"], ["HEADER_A", nonceOrHeight]));

    const hash1 = ethers.keccak256(payload1);
    const sig1 = await validator1.signMessage(ethers.getBytes(hash1));
    const sig2 = await validator1.signMessage(ethers.getBytes(hash1));

    await expect(
      slasher.connect(reporter).reportEquivocation(payload1, sig1, payload1, sig2, nonceOrHeight)
    ).to.be.revertedWithCustomError(slasher, "ProofsNotConflicting");
  });

  it("rejects proofs signed by different addresses", async () => {
    const { slasher, validator1, validator2, reporter, MIN_STAKE } = await deploy();

    await slasher.connect(validator1).registerValidator({ value: MIN_STAKE });
    await slasher.connect(validator2).registerValidator({ value: MIN_STAKE });

    const nonceOrHeight = 100;
    const payload1 = ethers.getBytes(ethers.solidityPackedKeccak256(["string", "uint256"], ["HEADER_A", nonceOrHeight]));
    const payload2 = ethers.getBytes(ethers.solidityPackedKeccak256(["string", "uint256"], ["HEADER_B", nonceOrHeight]));

    const hash1 = ethers.keccak256(payload1);
    const hash2 = ethers.keccak256(payload2);

    const sig1 = await validator1.signMessage(ethers.getBytes(hash1));
    const sig2 = await validator2.signMessage(ethers.getBytes(hash2));

    await expect(
      slasher.connect(reporter).reportEquivocation(payload1, sig1, payload2, sig2, nonceOrHeight)
    ).to.be.revertedWithCustomError(slasher, "SignaturesDoNotMatch");
  });
});
