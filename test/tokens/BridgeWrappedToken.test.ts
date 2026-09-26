import { expect } from "chai";
import { ethers } from "hardhat";

describe("BridgeWrappedToken", () => {
  async function deploy() {
    const [admin, vault, user, other] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("BridgeWrappedToken");
    const token = await Token.deploy("Bridged USDC", "bwUSDC", vault.address, admin.address);
    await token.waitForDeployment();
    return { token, admin, vault, user, other };
  }

  it("grants MINTER_ROLE and BURNER_ROLE to the bridge vault", async () => {
    const { token, vault } = await deploy();
    expect(await token.hasRole(await token.MINTER_ROLE(), vault.address)).to.equal(true);
    expect(await token.hasRole(await token.BURNER_ROLE(), vault.address)).to.equal(true);
  });

  it("lets the vault mint", async () => {
    const { token, vault, user } = await deploy();
    await token.connect(vault).mint(user.address, 1000n);
    expect(await token.balanceOf(user.address)).to.equal(1000n);
  });

  it("reverts when an unauthorized address mints", async () => {
    const { token, other, user } = await deploy();
    await expect(token.connect(other).mint(user.address, 1000n))
      .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, await token.MINTER_ROLE());
  });

  it("lets the vault burnFrom a holder with allowance", async () => {
    const { token, vault, user } = await deploy();
    await token.connect(vault).mint(user.address, 1000n);
    await token.connect(user).approve(vault.address, 400n);
    await token.connect(vault).burnFrom(user.address, 400n);
    expect(await token.balanceOf(user.address)).to.equal(600n);
  });

  it("reverts when an unauthorized address calls burnFrom", async () => {
    const { token, vault, user, other } = await deploy();
    await token.connect(vault).mint(user.address, 1000n);
    await token.connect(user).approve(other.address, 400n);
    await expect(token.connect(other).burnFrom(user.address, 400n))
      .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, await token.BURNER_ROLE());
  });
});
