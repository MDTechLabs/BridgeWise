import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("OptimisticDisputeEngine", function () {
    let engine: any;
    let token: any;
    let owner: any;
    let proposer: any;
    let challenger: any;

    const collateralAmount = ethers.parseEther("100");
    const challengePeriod = 3 * 24 * 60 * 60; // 3 days

    beforeEach(async function () {
        [owner, proposer, challenger] = await ethers.getSigners();

        const TokenFactory = await ethers.getContractFactory("MockERC20");
        token = await TokenFactory.deploy("Mock Token", "MTK");

        const EngineFactory = await ethers.getContractFactory("OptimisticDisputeEngine");
        engine = await EngineFactory.deploy(await token.getAddress(), collateralAmount, challengePeriod);

        await token.mint(proposer.address, ethers.parseEther("1000"));
        await token.connect(proposer).approve(await engine.getAddress(), ethers.MaxUint256);
    });

    it("should allow state proposal submission with collateral lockup", async function () {
        const stateRoot = ethers.randomBytes(32);
        
        await expect(engine.connect(proposer).proposeState(stateRoot))
            .to.emit(engine, "ProposalSubmitted");

        const proposal = await engine.proposals(0);
        expect(proposal.proposer).to.equal(proposer.address);
        expect(proposal.stateRoot).to.equal(ethers.hexlify(stateRoot));

        expect(await token.balanceOf(await engine.getAddress())).to.equal(collateralAmount);
    });

    it("should correctly settle undisputed state updates after window expiration", async function () {
        const stateRoot = ethers.randomBytes(32);
        await engine.connect(proposer).proposeState(stateRoot);

        await time.increase(challengePeriod + 1);

        const initialBalance = await token.balanceOf(proposer.address);
        
        await expect(engine.finalizeState(0))
            .to.emit(engine, "ProposalFinalized");

        const finalBalance = await token.balanceOf(proposer.address);
        expect(finalBalance - initialBalance).to.equal(collateralAmount);
        
        const proposal = await engine.proposals(0);
        expect(proposal.finalized).to.be.true;
    });

    it("should slash invalid proposer stakes and reward successful challengers upon valid dispute", async function () {
        const stateRoot = ethers.randomBytes(32);
        await engine.connect(proposer).proposeState(stateRoot);

        const proof = ethers.randomBytes(64);
        
        const initialChallengerBalance = await token.balanceOf(challenger.address);

        await expect(engine.connect(challenger).disputeState(0, proof))
            .to.emit(engine, "ProposalDisputed");

        const finalChallengerBalance = await token.balanceOf(challenger.address);
        expect(finalChallengerBalance - initialChallengerBalance).to.equal(collateralAmount);

        const proposal = await engine.proposals(0);
        expect(proposal.disputed).to.be.true;
    });

    it("should fail to finalize a disputed proposal", async function () {
        const stateRoot = ethers.randomBytes(32);
        await engine.connect(proposer).proposeState(stateRoot);

        const proof = ethers.randomBytes(64);
        await engine.connect(challenger).disputeState(0, proof);

        await time.increase(challengePeriod + 1);

        await expect(engine.finalizeState(0)).to.be.revertedWith("Cannot finalize disputed");
    });
});
