import { expect } from "chai";
import hre from "hardhat";

/**
 * Reentrancy regression for FallbackEscrow.claimEscrowedTokens: a token that
 * re-enters the claim during its own transfer must not be able to pay out twice.
 */
describe("FallbackEscrow reentrancy regression", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [owner, recipient] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("ReentrantTokenEscrow")).deploy();
    const escrow = await (await ethers.getContractFactory("FallbackEscrow")).deploy(owner.address);
    await token.mint(owner.address, 1000n);
    await token.approve(await escrow.getAddress(), 1000n);
    return { token, escrow, owner, recipient };
  }

  it("blocks a token that re-enters claimEscrowedTokens mid-transfer", async () => {
    const { token, escrow, recipient } = await deploy();
    const escrowAddr = await escrow.getAddress();
    const msgId = ethers.keccak256(ethers.toUtf8Bytes("reenter-1"));
    const other = ethers.keccak256(ethers.toUtf8Bytes("reenter-2"));

    await escrow.escrowTokens(msgId, recipient.address, await token.getAddress(), 400n);
    await escrow.escrowTokens(other, recipient.address, await token.getAddress(), 600n);

    await token.arm(escrowAddr, msgId);
    await escrow.connect(recipient).claimEscrowedTokens(msgId);

    expect(await token.reentered()).to.equal(true);
    expect(await token.reentrySucceeded()).to.equal(false);

    // Paid exactly once; the unrelated entry is still fully backed.
    expect(await token.balanceOf(recipient.address)).to.equal(400n);
    expect(await token.balanceOf(escrowAddr)).to.equal(600n);
    expect((await escrow.escrows(msgId)).claimed).to.equal(true);
    expect((await escrow.escrows(other)).claimed).to.equal(false);
  });

  it("still rejects a plain second claim of the same message", async () => {
    const { token, escrow, recipient } = await deploy();
    const msgId = ethers.keccak256(ethers.toUtf8Bytes("reenter-3"));
    await escrow.escrowTokens(msgId, recipient.address, await token.getAddress(), 100n);
    await escrow.connect(recipient).claimEscrowedTokens(msgId);

    await expect(escrow.connect(recipient).claimEscrowedTokens(msgId))
      .to.be.revertedWithCustomError(escrow, "NothingToClaim");
  });
});
