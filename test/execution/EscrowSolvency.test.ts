import { expect } from "chai";
import hre from "hardhat";

/**
 * Global escrow solvency invariant (see docs/ESCROW_SOLVENCY_INVARIANTS.md):
 *   for every token, sum over chains of escrow balance >= sum over chains of
 *   unclaimed escrow entries.
 * Each FallbackEscrow instance stands in for one chain's escrow.
 */
describe("Global escrow solvency", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function assertGlobalSolvency(escrows: any[], token: any, messageIds: string[]) {
    let held = 0n;
    let outstanding = 0n;
    for (const escrow of escrows) {
      held += await token.balanceOf(await escrow.getAddress());
      for (const id of messageIds) {
        const e = await escrow.escrows(id);
        if (e.amount > 0n && !e.claimed) outstanding += e.amount;
      }
    }
    expect(held, "global escrow balance < outstanding obligations").to.be.gte(outstanding);
  }

  it("holds across escrow, partial claim, replay and unauthorized calls on two chains", async () => {
    const [owner, recipient, attacker] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockERC20Escrow")).deploy("Escrow Token", "ET");
    const Escrow = await ethers.getContractFactory("FallbackEscrow");
    const chainA = await Escrow.deploy(owner.address);
    const chainB = await Escrow.deploy(owner.address);
    const tokenAddr = await token.getAddress();
    await token.mint(owner.address, 10_000n);
    await token.approve(await chainA.getAddress(), 10_000n);
    await token.approve(await chainB.getAddress(), 10_000n);

    const ids = ["a1", "a2", "b1"].map((s) => ethers.keccak256(ethers.toUtf8Bytes(s)));
    const all = [chainA, chainB];

    await chainA.escrowTokens(ids[0], recipient.address, tokenAddr, 1000n);
    await assertGlobalSolvency(all, token, ids);
    await chainA.escrowTokens(ids[1], recipient.address, tokenAddr, 500n);
    await chainB.escrowTokens(ids[2], recipient.address, tokenAddr, 2000n);
    await assertGlobalSolvency(all, token, ids);

    // Replayed message and unauthorized escrow must not mutate protected state.
    await expect(chainA.escrowTokens(ids[0], recipient.address, tokenAddr, 1n))
      .to.be.revertedWithCustomError(chainA, "AlreadyEscrowed");
    await expect(chainB.connect(attacker).escrowTokens(ids[2], attacker.address, tokenAddr, 1n))
      .to.be.revertedWithCustomError(chainB, "OwnableUnauthorizedAccount")
      .withArgs(attacker.address);
    await assertGlobalSolvency(all, token, ids);

    // Partial claims, then a replayed claim.
    await chainA.connect(recipient).claimEscrowedTokens(ids[0]);
    await assertGlobalSolvency(all, token, ids);
    await expect(chainA.connect(recipient).claimEscrowedTokens(ids[0]))
      .to.be.revertedWithCustomError(chainA, "NothingToClaim");
    await chainB.connect(recipient).claimEscrowedTokens(ids[2]);
    await assertGlobalSolvency(all, token, ids);

    // Only the 500 on chain A remains, fully backed.
    expect(await token.balanceOf(await chainA.getAddress())).to.equal(500n);
    expect(await token.balanceOf(await chainB.getAddress())).to.equal(0n);
  });
});
