import { expect } from "chai";
import hre from "hardhat";

describe("FallbackEscrow", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [owner, recipient, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20Escrow");
    const token = await MockERC20.deploy("Escrow Token", "ET");
    await token.waitForDeployment();

    const Escrow = await ethers.getContractFactory("FallbackEscrow");
    const escrow = await Escrow.deploy(owner.address);
    await escrow.waitForDeployment();

    // Mint tokens
    await token.mint(owner.address, ethers.parseEther("10000"));

    return { escrow, token, owner, recipient, other };
  }

  it("escrows tokens for a failed message", async () => {
    const { escrow, token, owner, recipient } = await deploy();
    const msgId = ethers.keccak256(ethers.toUtf8Bytes("msg-1"));
    const amount = ethers.parseEther("100");

    await token.approve(await escrow.getAddress(), amount);
    await expect(
      escrow.escrowTokens(msgId, recipient.address, await token.getAddress(), amount)
    ).to.emit(escrow, "TokensEscrowed").withArgs(msgId, recipient.address, await token.getAddress(), amount);

    const entry = await escrow.escrows(msgId);
    expect(entry.amount).to.equal(amount);
    expect(entry.claimed).to.equal(false);
  });

  it("rejects duplicate message escrow", async () => {
    const { escrow, token, owner, recipient } = await deploy();
    const msgId = ethers.keccak256(ethers.toUtf8Bytes("msg-dup"));
    const amount = ethers.parseEther("50");

    await token.approve(await escrow.getAddress(), amount);
    await escrow.escrowTokens(msgId, recipient.address, await token.getAddress(), amount);

    await expect(
      escrow.escrowTokens(msgId, recipient.address, await token.getAddress(), amount)
    ).to.be.revertedWithCustomError(escrow, "AlreadyEscrowed");
  });

  it("recipient can claim escrowed tokens", async () => {
    const { escrow, token, owner, recipient } = await deploy();
    const msgId = ethers.keccak256(ethers.toUtf8Bytes("msg-claim"));
    const amount = ethers.parseEther("75");

    await token.approve(await escrow.getAddress(), amount);
    await escrow.escrowTokens(msgId, recipient.address, await token.getAddress(), amount);

    const balBefore = await token.balanceOf(recipient.address);
    await escrow.connect(recipient).claimEscrowedTokens(msgId);
    const balAfter = await token.balanceOf(recipient.address);

    expect(balAfter - balBefore).to.equal(amount);
  });

  it("rejects claiming with nothing to claim", async () => {
    const { escrow, recipient } = await deploy();
    const msgId = ethers.keccak256(ethers.toUtf8Bytes("msg-empty"));

    await expect(
      escrow.connect(recipient).claimEscrowedTokens(msgId)
    ).to.be.revertedWithCustomError(escrow, "NothingToClaim");
  });

  it("non-owner cannot escrow", async () => {
    const { escrow, token, other, recipient } = await deploy();
    const msgId = ethers.keccak256(ethers.toUtf8Bytes("msg-auth"));

    await expect(
      escrow.connect(other).escrowTokens(msgId, recipient.address, await token.getAddress(), 100)
    ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
  });

  it("tracks claimable amounts per recipient", async () => {
    const { escrow, token, owner, recipient } = await deploy();
    const amount = ethers.parseEther("200");

    await token.approve(await escrow.getAddress(), amount * 2n);

    const msg1 = ethers.keccak256(ethers.toUtf8Bytes("msg-a"));
    const msg2 = ethers.keccak256(ethers.toUtf8Bytes("msg-b"));

    await escrow.escrowTokens(msg1, recipient.address, await token.getAddress(), amount);
    await escrow.escrowTokens(msg2, recipient.address, await token.getAddress(), amount);

    const claimable = await escrow.getClaimableAmount(recipient.address, await token.getAddress());
    expect(claimable).to.equal(amount * 2n);
  });
});
