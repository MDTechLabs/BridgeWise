import { expect } from "chai";
import hre from "hardhat";

describe("BridgeMultiSigOwnable Stateful Fuzz & Invariant Suite", () => {
  let ethers: any;
  let networkHelpers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    networkHelpers = connection.networkHelpers;
  });

  // Seeded Linear Congruential Generator for reproducible pseudo-randomness
  function createRng(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  async function deployFuzzFixture(ownerCount = 5, threshold = 3) {
    const allSigners = await ethers.getSigners();
    const owners = allSigners.slice(0, ownerCount);
    const nonOwners = allSigners.slice(ownerCount, ownerCount + 3);

    const ownerAddresses = owners.map((o: any) => o.address);
    const MultiSigFactory = await ethers.getContractFactory("BridgeMultiSigOwnable");
    const multiSig = await MultiSigFactory.deploy(ownerAddresses, threshold);
    await multiSig.waitForDeployment();

    const MockTargetFactory = await ethers.getContractFactory("MockMessageTarget");
    const mockTarget = await MockTargetFactory.deploy();
    await mockTarget.waitForDeployment();

    return { multiSig, mockTarget, owners, nonOwners, threshold, ownerAddresses };
  }

  it("maintains stateful invariants across 100 pseudo-random multi-step transitions", async () => {
    const { multiSig, mockTarget, owners, nonOwners, threshold, ownerAddresses } =
      await deployFuzzFixture(5, 3);
    const rng = createRng(0xdeadbeef);

    const targetAddr = await mockTarget.getAddress();
    const activeProposalIds: number[] = [];

    // Invariant verification helper
    async function assertInvariants() {
      const propCount = Number(await multiSig.getProposalsCount());
      for (let pId = 0; pId < propCount; pId++) {
        const prop = await multiSig.proposals(pId);
        let calculatedConfirmations = 0;

        for (const owner of owners) {
          const confirmed = await multiSig.isConfirmed(pId, owner.address);
          if (confirmed) calculatedConfirmations++;
        }

        // Invariant 1: confirmationsCount must strictly match active isConfirmed flags
        expect(prop.confirmationsCount).to.equal(
          BigInt(calculatedConfirmations),
          `Invariant violation: confirmation mismatch on proposal ${pId}`
        );

        // Invariant 2: Non-owners must NEVER be marked confirmed
        for (const nonOwner of nonOwners) {
          expect(
            await multiSig.isConfirmed(pId, nonOwner.address)
          ).to.be.false;
        }
      }
    }

    // Run 100 stateful transition steps
    for (let step = 0; step < 100; step++) {
      const actionRoll = rng();

      if (actionRoll < 0.25 || activeProposalIds.length === 0) {
        // Action 1: Propose new transaction
        const proposerIndex = Math.floor(rng() * owners.length);
        const proposer = owners[proposerIndex];
        const duration = 300 + Math.floor(rng() * 1000); // 300 - 1300 seconds
        const callData = mockTarget.interface.encodeFunctionData("record", [BigInt(step + 1)]);

        const pId = Number(await multiSig.getProposalsCount());
        await multiSig.connect(proposer).proposeTransaction(targetAddr, 0, callData, duration);
        activeProposalIds.push(pId);
      } else if (actionRoll < 0.55) {
        // Action 2: Confirm existing proposal
        const pId = activeProposalIds[Math.floor(rng() * activeProposalIds.length)];
        const isOwner = rng() > 0.15; // 85% valid owner, 15% adversarial non-owner
        const caller = isOwner
          ? owners[Math.floor(rng() * owners.length)]
          : nonOwners[Math.floor(rng() * nonOwners.length)];

        try {
          await multiSig.connect(caller).confirmTransaction(pId);
        } catch {
          // Expected rejections: non-owner, already confirmed, expired, executed
        }
      } else if (actionRoll < 0.75) {
        // Action 3: Revoke confirmation
        const pId = activeProposalIds[Math.floor(rng() * activeProposalIds.length)];
        const caller = owners[Math.floor(rng() * owners.length)];

        try {
          await multiSig.connect(caller).revokeConfirmation(pId);
        } catch {
          // Expected rejections: not confirmed, executed
        }
      } else if (actionRoll < 0.90) {
        // Action 4: Attempt execution
        const pId = activeProposalIds[Math.floor(rng() * activeProposalIds.length)];
        const isOwner = rng() > 0.15;
        const executor = isOwner
          ? owners[Math.floor(rng() * owners.length)]
          : nonOwners[Math.floor(rng() * nonOwners.length)];

        try {
          await multiSig.connect(executor).executeTransaction(pId);
        } catch {
          // Expected rejections: threshold not met, expired, already executed, non-owner
        }
      } else {
        // Action 5: Advance time (simulating signer delay or network stall)
        const timeJump = Math.floor(rng() * 400); // 0 - 400s
        await networkHelpers.time.increase(timeJump);
      }

      // Check invariants every 10 steps to keep test fast and rigorous
      if (step % 10 === 0) {
        await assertInvariants();
      }
    }

    // Final invariant audit
    await assertInvariants();
  });
});
