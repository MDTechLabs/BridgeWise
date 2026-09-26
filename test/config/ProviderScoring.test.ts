import { expect } from "chai";
import hre from "hardhat";

describe("ProviderScoring", () => {
  let ethers: any;
  let owner: any;
  let scoring: any;
  let provider: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    [owner, provider] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const Factory = await ethers.getContractFactory("ProviderScoring");
    scoring = await Factory.deploy(owner.address, 5000, 3);
    await scoring.waitForDeployment();
  });

  describe("scoring", () => {
    it("scores a provider and updates eligibility", async () => {
      await scoring.scoreProvider(provider.address, 8000, 7000, 9000, 6000);
      expect(await scoring.isEligible(provider.address)).to.equal(true);
    });

    it("excludes provider below threshold", async () => {
      await scoring.scoreProvider(provider.address, 4000, 3000, 2000, 1000);
      expect(await scoring.isEligible(provider.address)).to.equal(false);
    });

    it("excludes provider after max failures", async () => {
      await scoring.scoreProvider(provider.address, 8000, 8000, 8000, 8000);
      expect(await scoring.isEligible(provider.address)).to.equal(true);

      for (let i = 0; i < 3; i++) {
        await scoring.recordFailure(provider.address);
      }
      expect(await scoring.isEligible(provider.address)).to.equal(false);
    });

    it("recomputes eligibility after re-scoring", async () => {
      await scoring.scoreProvider(provider.address, 4000, 3000, 2000, 1000);
      expect(await scoring.isEligible(provider.address)).to.equal(false);

      await scoring.scoreProvider(provider.address, 8000, 8000, 8000, 8000);
      expect(await scoring.isEligible(provider.address)).to.equal(true);
    });

    it("returns composite score", async () => {
      await scoring.scoreProvider(provider.address, 8000, 6000, 7000, 9000);
      expect(await scoring.getCompositeScore(provider.address)).to.equal(7500);
    });
  });
});
