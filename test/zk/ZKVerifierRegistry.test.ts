import { expect } from "chai";
import hre from "hardhat";

describe("ZKVerifierRegistry", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [admin, verifierAdmin, user] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("ZKVerifierRegistry");
    const registry = await Factory.deploy(admin.address);
    await registry.waitForDeployment();

    const VERIFIER_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VERIFIER_ADMIN_ROLE"));
    await registry.grantRole(VERIFIER_ADMIN_ROLE, verifierAdmin.address);

    return { registry, admin, verifierAdmin, user };
  }

  it("registers a verifier for a chain", async () => {
    const { registry, verifierAdmin } = await deploy();

    // Deploy a mock verifier
    const MockVerifier = await ethers.getContractFactory("MockZKVerifier");
    const verifier = await MockVerifier.deploy();
    await verifier.waitForDeployment();

    await expect(
      registry.connect(verifierAdmin).registerVerifier(1, await verifier.getAddress(), "v1")
    ).to.emit(registry, "VerifierRegistered");

    expect(await registry.hasVerifier(1)).to.equal(true);
    expect(await registry.chainVerifiers(1)).to.equal(await verifier.getAddress());
    expect(await registry.registeredCount()).to.equal(1);
  });

  it("upgrades a verifier for a chain", async () => {
    const { registry, verifierAdmin } = await deploy();

    const MockVerifier = await ethers.getContractFactory("MockZKVerifier");
    const v1 = await MockVerifier.deploy();
    const v2 = await MockVerifier.deploy();

    await registry.connect(verifierAdmin).registerVerifier(1, await v1.getAddress(), "v1");
    await expect(
      registry.connect(verifierAdmin).registerVerifier(1, await v2.getAddress(), "v2")
    ).to.emit(registry, "VerifierUpgraded");

    expect(await registry.chainVerifiers(1)).to.equal(await v2.getAddress());
    expect(await registry.registeredCount()).to.equal(1);
  });

  it("removes a verifier", async () => {
    const { registry, verifierAdmin } = await deploy();

    const MockVerifier = await ethers.getContractFactory("MockZKVerifier");
    const verifier = await MockVerifier.deploy();

    await registry.connect(verifierAdmin).registerVerifier(1, await verifier.getAddress(), "v1");

    await expect(
      registry.connect(verifierAdmin).removeVerifier(1)
    ).to.emit(registry, "VerifierRemoved");

    expect(await registry.hasVerifier(1)).to.equal(false);
    expect(await registry.registeredCount()).to.equal(0);
  });

  it("rejects zero address verifier", async () => {
    const { registry, verifierAdmin } = await deploy();

    await expect(
      registry.connect(verifierAdmin).registerVerifier(1, ethers.ZeroAddress, "v1")
    ).to.be.revertedWithCustomError(registry, "InvalidVerifierAddress");
  });

  it("rejects removing non-existent verifier", async () => {
    const { registry, verifierAdmin } = await deploy();

    await expect(
      registry.connect(verifierAdmin).removeVerifier(999)
    ).to.be.revertedWithCustomError(registry, "NoVerifierForChain");
  });

  it("non-admin cannot register", async () => {
    const { registry, user } = await deploy();

    await expect(
      registry.connect(user).registerVerifier(1, user.address, "test")
    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });
});
