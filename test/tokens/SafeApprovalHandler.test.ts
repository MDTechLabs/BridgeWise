import { expect } from "chai";
import { ethers } from "hardhat";

describe("SafeApprovalHandler", () => {
  async function deploy() {
    const [owner, spender, user] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("BridgeWrappedToken");
    const token = await Token.deploy("Mock Token", "MTK", owner.address, owner.address);
    await token.waitForDeployment();

    const Handler = await ethers.getContractFactory("SafeApprovalHandler");
    const handler = await Handler.deploy();
    await handler.waitForDeployment();

    return { token, handler, owner, spender, user };
  }

  it("resets allowance to 0 then approves target value", async () => {
    const { token, handler, spender } = await deploy();
    const tokenAddress = await token.getAddress();

    await expect(handler.safeResetAndApprove(tokenAddress, spender.address, 1000n))
      .to.emit(handler, "ApprovalResetAndGranted")
      .withArgs(tokenAddress, spender.address, 1000n);

    expect(await token.allowance(await handler.getAddress(), spender.address)).to.equal(1000n);
  });
});
