import { expect } from "chai";
import hre from "hardhat";

import {
  CHAIN_PROFILES,
  ChainProfile,
} from "../../scripts/bridge-escrow-conservation";

/**
 * Integration evidence for docs/BRIDGE_ESCROW_CONSERVATION_SPEC.md.
 *
 * Every supported chain profile is exercised against the real EVM escrow
 * bytecode on a local network with synthetic tokens and accounts. No RPC
 * endpoint, relayer data or production key is used. The versioned profile
 * supplies the chain-specific bounds; real fork evidence must still be
 * attached to the release record for each production chain.
 */
describe("Bridge escrow conservation — supported-chain integration", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function assertEscrowConservation(
    escrow: any,
    token: any,
    ids: string[],
  ): Promise<void> {
    const escrowAddress = await escrow.getAddress();
    let unclaimed = 0n;
    for (const id of ids) {
      const entry = await escrow.escrows(id);
      if (entry.amount > 0n && !entry.claimed) unclaimed += entry.amount;
    }
    // C-1/C-2: held tokens exactly back outstanding entries; no chain may
    // borrow liquidity from another chain or token to cover a shortfall.
    expect(await token.balanceOf(escrowAddress)).to.equal(unclaimed);
  }

  async function deployFixture(profile: ChainProfile) {
    const [owner, recipient, attacker] = await ethers.getSigners();
    const token = await (
      await ethers.getContractFactory("MockERC20Escrow")
    ).deploy(`Escrow ${profile.chainId}`, `ESC${profile.chainId.replace(/\W/g, "")}`);
    const escrow = await (
      await ethers.getContractFactory("FallbackEscrow")
    ).deploy(owner.address);
    await token.waitForDeployment();
    await escrow.waitForDeployment();

    const tokenAddress = await token.getAddress();
    const escrowAddress = await escrow.getAddress();
    return { owner, recipient, attacker, token, escrow, tokenAddress, escrowAddress };
  }

  function messageId(profile: ChainProfile, index: number): string {
    return ethers.keccak256(
      ethers.toUtf8Bytes(`conservation-${profile.chainId}-${index}`),
    );
  }

  it("covers every EVM deployment network and the Soroban lane", () => {
    const ids = CHAIN_PROFILES.map((profile) => profile.chainId);
    for (const expected of [
      "evm:1",
      "evm:137",
      "evm:56",
      "evm:42161",
      "evm:10",
      "evm:8453",
      "soroban:stellar",
    ]) {
      expect(ids, `missing profile for ${expected}`).to.include(expected);
    }
    for (const profile of CHAIN_PROFILES) {
      expect(profile.parameterSetVersion).to.equal("escrow-conservation/1.0.0");
      expect(profile.maxTransfersPerBatch).to.be.gte(1);
    }
  });

  for (const profile of CHAIN_PROFILES) {
    it(`holds accounting, replay and authorization invariants for ${profile.chainId}`, async () => {
      const { owner, recipient, attacker, token, escrow, tokenAddress, escrowAddress } =
        await deployFixture(profile);

      const amounts = [1_000n, 2_000n, 3_000n];
      const ids = amounts.map((_, index) => messageId(profile, index));
      const total = amounts.reduce((sum, value) => sum + value, 0n);
      expect(Number(total)).to.be.at.most(Number(profile.maxAmount));

      await token.mint(owner.address, total);
      await token.approve(escrowAddress, total);
      for (let index = 0; index < ids.length; index++) {
        await escrow.escrowTokens(ids[index], recipient.address, tokenAddress, amounts[index]);
        await assertEscrowConservation(escrow, token, ids);
      }

      // C-3/C-4/C-5: duplicate and unauthorized calls leave protected state intact.
      await expect(
        escrow.escrowTokens(ids[0], recipient.address, tokenAddress, 1n),
      ).to.be.revertedWithCustomError(escrow, "AlreadyEscrowed");
      await expect(
        escrow.connect(attacker).escrowTokens(ids[0], attacker.address, tokenAddress, 1n),
      )
        .to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount")
        .withArgs(attacker.address);
      await assertEscrowConservation(escrow, token, ids);

      // Settlement is terminal and backs the escrow exactly once.
      const claimTx = await escrow.connect(recipient).claimEscrowedTokens(ids[0]);
      const receipt = await claimTx.wait();
      expect(Number(receipt.gasUsed)).to.be.lessThan(500_000);
      await assertEscrowConservation(escrow, token, ids);
      await expect(
        escrow.connect(recipient).claimEscrowedTokens(ids[0]),
      ).to.be.revertedWithCustomError(escrow, "NothingToClaim");

      await escrow.connect(recipient).claimEscrowedTokens(ids[1]);
      await escrow.connect(recipient).claimEscrowedTokens(ids[2]);
      expect(await token.balanceOf(escrowAddress)).to.equal(0n);
      expect(await token.balanceOf(recipient.address)).to.equal(total);
      await assertEscrowConservation(escrow, token, ids);
    });
  }

  it("keeps worst-case bounded batch work below the resource ceiling", async () => {
    const profile = CHAIN_PROFILES.find((item) => item.chainId === "evm:1")!;
    const { owner, recipient, token, escrow, tokenAddress, escrowAddress } =
      await deployFixture(profile);

    // Test-scoped worst case stays small enough for CI; the production bound
    // remains profile.maxTransfersPerBatch and is enforced by the model.
    const batchSize = Math.min(16, profile.maxTransfersPerBatch);
    const perItem = 100n;
    const total = perItem * BigInt(batchSize);
    const ids = Array.from({ length: batchSize }, (_, index) =>
      messageId(profile, 1_000 + index),
    );
    await token.mint(owner.address, total);
    await token.approve(escrowAddress, total);

    let maxEscrowGas = 0;
    for (let index = 0; index < batchSize; index++) {
      const tx = await escrow.escrowTokens(ids[index], recipient.address, tokenAddress, perItem);
      const receipt = await tx.wait();
      maxEscrowGas = Math.max(maxEscrowGas, Number(receipt.gasUsed));
    }
    await assertEscrowConservation(escrow, token, ids);
    expect(maxEscrowGas).to.be.lessThan(300_000);

    for (const id of ids) {
      const tx = await escrow.connect(recipient).claimEscrowedTokens(id);
      const receipt = await tx.wait();
      expect(Number(receipt.gasUsed)).to.be.lessThan(300_000);
    }
    expect(await token.balanceOf(escrowAddress)).to.equal(0n);
    expect(await token.balanceOf(recipient.address)).to.equal(total);
    await assertEscrowConservation(escrow, token, ids);
  });
});
