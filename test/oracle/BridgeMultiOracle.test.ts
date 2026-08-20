import { expect } from "chai";
import { network } from "hardhat";

let ethers: any;

const E18 = 10n ** 18n;
const usd = (n: string | number) => ethers.parseUnits(String(n), 18);

/** Deviation in basis points, measured against the smaller price. */
const expectedDeviationBps = (a: bigint, b: bigint): bigint => {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return ((hi - lo) * 10_000n) / lo;
};

describe("BridgeMultiOracle", () => {
  let now: number;

  before(async () => {
    ({ ethers } = await network.connect());
  });

  beforeEach(async () => {
    now = Number((await ethers.provider.getBlock("latest"))!.timestamp);
  });

  async function deployOracles(primaryPrice: bigint, fallbackPrice: bigint) {
    const Mock = await ethers.getContractFactory("MockPriceOracle");
    const primary = await Mock.deploy(primaryPrice, now, "primary");
    const fallbackOracle = await Mock.deploy(fallbackPrice, now, "fallback");
    return { primary, fallbackOracle };
  }

  async function deployAggregator(
    primaryPrice = usd(2000),
    fallbackPrice = usd(2000),
    maxDeviationBps = 200n,
    maxPriceAge = 3600n,
    highValueThreshold = usd(100_000),
  ) {
    const { primary, fallbackOracle } = await deployOracles(primaryPrice, fallbackPrice);
    const Factory = await ethers.getContractFactory("BridgeMultiOracle");
    const oracle = await Factory.deploy(
      await primary.getAddress(),
      await fallbackOracle.getAddress(),
      maxDeviationBps,
      maxPriceAge,
      highValueThreshold,
    );
    return { oracle, primary, fallbackOracle };
  }

  describe("deviation maths", () => {
    it("reports zero for identical prices", async () => {
      const { oracle } = await deployAggregator();
      expect(await oracle.calculateDeviationBps(usd(2000), usd(2000))).to.equal(0n);
    });

    it("measures against the smaller price, not the larger", async () => {
      const { oracle } = await deployAggregator();
      const a = usd(100);
      const b = usd(102);

      // Against 100 this is 200 bps. Against 102 it would flatter to 196.
      expect(await oracle.calculateDeviationBps(a, b)).to.equal(200n);
      expect(await oracle.calculateDeviationBps(a, b)).to.equal(expectedDeviationBps(a, b));
    });

    it("is symmetric in its arguments", async () => {
      const { oracle } = await deployAggregator();
      const a = usd(1999);
      const b = usd(2050);
      expect(await oracle.calculateDeviationBps(a, b)).to.equal(
        await oracle.calculateDeviationBps(b, a),
      );
    });

    it("treats a zero price as maximally deviant", async () => {
      const { oracle } = await deployAggregator();
      expect(await oracle.calculateDeviationBps(0n, usd(2000))).to.equal(2n ** 256n - 1n);
    });
  });

  describe("getValidatedPrice", () => {
    it("returns the higher price when the feeds agree", async () => {
      const { oracle } = await deployAggregator(usd(2000), usd(2010));
      const [price, deviation] = await oracle.getValidatedPrice();

      expect(price).to.equal(usd(2010));
      expect(deviation).to.equal(expectedDeviationBps(usd(2000), usd(2010)));
    });

    it("reverts with OracleDeviationExceeded past the threshold", async () => {
      // 2000 vs 2100 is 500 bps against the smaller value, over the 200 cap.
      const { oracle } = await deployAggregator(usd(2000), usd(2100));

      await expect(oracle.getValidatedPrice())
        .to.be.revertedWithCustomError(oracle, "OracleDeviationExceeded")
        .withArgs(500n, 200n);
    });

    it("accepts a deviation exactly on the threshold", async () => {
      // 2000 -> 2040 is exactly 200 bps.
      const { oracle } = await deployAggregator(usd(2000), usd(2040));
      const [, deviation] = await oracle.getValidatedPrice();
      expect(deviation).to.equal(200n);
    });

    it("rejects a stale primary feed", async () => {
      const { oracle, primary } = await deployAggregator();
      await primary.setUpdatedAt(now - 7200);

      await expect(oracle.getValidatedPrice()).to.be.revertedWithCustomError(
        oracle,
        "StalePrice",
      );
    });

    it("rejects a stale fallback feed", async () => {
      const { oracle, fallbackOracle } = await deployAggregator();
      await fallbackOracle.setUpdatedAt(now - 7200);

      await expect(oracle.getValidatedPrice()).to.be.revertedWithCustomError(
        oracle,
        "StalePrice",
      );
    });

    it("rejects a timestamp from the future", async () => {
      const { oracle, primary } = await deployAggregator();
      await primary.setUpdatedAt(now + 7200);

      await expect(oracle.getValidatedPrice()).to.be.revertedWithCustomError(
        oracle,
        "StalePrice",
      );
    });

    it("rejects a zero price", async () => {
      const { oracle, primary } = await deployAggregator();
      await primary.setPrice(0n);

      await expect(oracle.getValidatedPrice()).to.be.revertedWithCustomError(
        oracle,
        "InvalidPrice",
      );
    });
  });

  describe("validateTransfer", () => {
    it("uses the primary feed alone below the threshold", async () => {
      // Feeds disagree wildly, but the transfer is small.
      const { oracle } = await deployAggregator(usd(2000), usd(4000));
      const [valueUsd, price, isHighValue] = await oracle.validateTransfer(E18); // 1 unit

      expect(isHighValue).to.equal(false);
      expect(price).to.equal(usd(2000));
      expect(valueUsd).to.equal(usd(2000));
    });

    it("blocks a high-value transfer when the feeds disagree", async () => {
      const { oracle } = await deployAggregator(usd(2000), usd(2100));

      // 100 units at 2000 = 200_000, over the 100_000 threshold.
      await expect(oracle.validateTransfer(100n * E18)).to.be.revertedWithCustomError(
        oracle,
        "OracleDeviationExceeded",
      );
    });

    it("allows a high-value transfer when the feeds agree", async () => {
      const { oracle } = await deployAggregator(usd(2000), usd(2010));
      const [valueUsd, price, isHighValue] = await oracle.validateTransfer(100n * E18);

      expect(isHighValue).to.equal(true);
      expect(price).to.equal(usd(2010));
      expect(valueUsd).to.equal(usd(201_000));
    });

    it("treats a transfer exactly on the threshold as high value", async () => {
      const { oracle } = await deployAggregator(usd(2000), usd(2100));
      // 50 units at 2000 = exactly 100_000.
      await expect(oracle.validateTransfer(50n * E18)).to.be.revertedWithCustomError(
        oracle,
        "OracleDeviationExceeded",
      );
    });
  });

  describe("oraclesAgree", () => {
    it("is true when the feeds are close", async () => {
      const { oracle } = await deployAggregator(usd(2000), usd(2010));
      expect(await oracle.oraclesAgree()).to.equal(true);
    });

    it("is false when the feeds diverge", async () => {
      const { oracle } = await deployAggregator(usd(2000), usd(2100));
      expect(await oracle.oraclesAgree()).to.equal(false);
    });

    it("is false, rather than reverting, when a feed reverts", async () => {
      const { oracle, primary } = await deployAggregator();
      await primary.setShouldRevert(true);
      expect(await oracle.oraclesAgree()).to.equal(false);
    });

    it("is false when a feed is stale", async () => {
      const { oracle, fallbackOracle } = await deployAggregator();
      await fallbackOracle.setUpdatedAt(now - 7200);
      expect(await oracle.oraclesAgree()).to.equal(false);
    });
  });

  describe("configuration", () => {
    it("rejects a deviation cap above the hard limit", async () => {
      const { primary, fallbackOracle } = await deployOracles(usd(2000), usd(2000));
      const Factory = await ethers.getContractFactory("BridgeMultiOracle");

      await expect(
        Factory.deploy(
          await primary.getAddress(),
          await fallbackOracle.getAddress(),
          5_001n,
          3600n,
          usd(100_000),
        ),
      ).to.be.revertedWithCustomError(Factory, "InvalidConfiguration");
    });

    it("rejects the same oracle twice", async () => {
      const { primary } = await deployOracles(usd(2000), usd(2000));
      const Factory = await ethers.getContractFactory("BridgeMultiOracle");

      await expect(
        Factory.deploy(
          await primary.getAddress(),
          await primary.getAddress(),
          200n,
          3600n,
          usd(100_000),
        ),
      ).to.be.revertedWithCustomError(Factory, "InvalidConfiguration");
    });

    it("only lets the owner change the deviation cap", async () => {
      const { oracle } = await deployAggregator();
      const [, stranger] = await ethers.getSigners();

      await expect(
        oracle.connect(stranger).setMaxDeviationBps(300n),
      ).to.be.revertedWithCustomError(oracle, "Unauthorized");
    });

    it("emits on a deviation cap change", async () => {
      const { oracle } = await deployAggregator();
      await expect(oracle.setMaxDeviationBps(300n))
        .to.emit(oracle, "DeviationThresholdUpdated")
        .withArgs(300n);
    });

    it("applies a raised cap immediately", async () => {
      const { oracle } = await deployAggregator(usd(2000), usd(2100));
      await expect(oracle.getValidatedPrice()).to.be.revertedWithCustomError(
        oracle,
        "OracleDeviationExceeded",
      );

      await oracle.setMaxDeviationBps(600n);
      const [price] = await oracle.getValidatedPrice();
      expect(price).to.equal(usd(2100));
    });
  });
});

describe("ChainlinkPriceOracle", () => {
  let now: number;

  before(async () => {
    ({ ethers } = await network.connect());
  });

  beforeEach(async () => {
    now = Number((await ethers.provider.getBlock("latest"))!.timestamp);
  });

  async function deployFeed(decimals: number, answer: bigint) {
    const Mock = await ethers.getContractFactory("MockChainlinkAggregator");
    const feed = await Mock.deploy(decimals, answer, now);
    const Factory = await ethers.getContractFactory("ChainlinkPriceOracle");
    const adapter = await Factory.deploy(await feed.getAddress(), "ETH/USD");
    return { feed, adapter };
  }

  it("normalises an 8-decimal feed to 18 decimals", async () => {
    const { adapter } = await deployFeed(8, 2000_0000_0000n); // 2000.00000000
    const [price] = await adapter.latestPrice();
    expect(price).to.equal(ethers.parseUnits("2000", 18));
  });

  it("passes an 18-decimal feed through unchanged", async () => {
    const { adapter } = await deployFeed(18, ethers.parseUnits("2000", 18));
    const [price] = await adapter.latestPrice();
    expect(price).to.equal(ethers.parseUnits("2000", 18));
  });

  it("rejects a non-positive answer", async () => {
    const { feed, adapter } = await deployFeed(8, 2000_0000_0000n);
    await feed.setAnswer(0n);
    await expect(adapter.latestPrice()).to.be.revertedWithCustomError(
      adapter,
      "NonPositiveAnswer",
    );
  });

  it("rejects a negative answer", async () => {
    const { feed, adapter } = await deployFeed(8, 2000_0000_0000n);
    await feed.setAnswer(-1n);
    await expect(adapter.latestPrice()).to.be.revertedWithCustomError(
      adapter,
      "NonPositiveAnswer",
    );
  });

  it("rejects a round that never settled", async () => {
    const { feed, adapter } = await deployFeed(8, 2000_0000_0000n);
    await feed.setRounds(5n, 4n);
    await expect(adapter.latestPrice()).to.be.revertedWithCustomError(
      adapter,
      "IncompleteRound",
    );
  });

  it("rejects a feed with more than 18 decimals", async () => {
    const Mock = await ethers.getContractFactory("MockChainlinkAggregator");
    const feed = await Mock.deploy(19, 1n, now);
    const Factory = await ethers.getContractFactory("ChainlinkPriceOracle");

    await expect(
      Factory.deploy(await feed.getAddress(), "bad"),
    ).to.be.revertedWithCustomError(Factory, "UnsupportedDecimals");
  });
});

describe("UniswapV3TwapOracle", () => {
  before(async () => {
    ({ ethers } = await network.connect());
  });

  async function deployTwap(meanTick: number, decimalAdjustment = 0) {
    const Pool = await ethers.getContractFactory("MockUniswapV3Pool");
    const pool = await Pool.deploy(meanTick);
    const Factory = await ethers.getContractFactory("UniswapV3TwapOracle");
    const adapter = await Factory.deploy(
      await pool.getAddress(),
      1800,
      decimalAdjustment,
      "ETH/USDC TWAP",
    );
    return { pool, adapter };
  }

  it("derives the mean tick from cumulative observations", async () => {
    const { adapter } = await deployTwap(1000);
    expect(await adapter.meanTick()).to.equal(1000n);
  });

  it("rounds a negative mean tick down, matching Uniswap", async () => {
    const { adapter } = await deployTwap(-1000);
    expect(await adapter.meanTick()).to.equal(-1000n);
  });

  // The point of these: prove 1.0001^tick is computed correctly rather than
  // asserting whatever the contract happens to return.
  const tickCases = [0, 1, 100, 1000, 10_000, -1000, -10_000, 50_000];

  tickCases.forEach(tick => {
    it(`prices tick ${tick} within 1e-6 of 1.0001^${tick}`, async () => {
      const { adapter } = await deployTwap(tick);
      const [onChain] = await adapter.latestPrice();

      const expected = Math.pow(1.0001, tick);
      const actual = Number(ethers.formatUnits(onChain, 18));
      const relativeError = Math.abs(actual - expected) / expected;

      expect(relativeError).to.be.lessThan(1e-6);
    });
  });

  it("applies a positive decimal adjustment", async () => {
    const { adapter } = await deployTwap(0, 2);
    const [price] = await adapter.latestPrice();
    expect(price).to.equal(ethers.parseUnits("100", 18));
  });

  it("rejects a tick beyond the supported range", async () => {
    const { adapter } = await deployTwap(400_001);
    await expect(adapter.latestPrice()).to.be.revertedWithCustomError(
      adapter,
      "TickOutOfRange",
    );
  });

  it("rejects a zero averaging window", async () => {
    const Pool = await ethers.getContractFactory("MockUniswapV3Pool");
    const pool = await Pool.deploy(0);
    const Factory = await ethers.getContractFactory("UniswapV3TwapOracle");

    await expect(
      Factory.deploy(await pool.getAddress(), 0, 0, "bad"),
    ).to.be.revertedWithCustomError(Factory, "TwapPeriodZero");
  });
});

describe("integration: Chainlink against Uniswap TWAP", () => {
  before(async () => {
    ({ ethers } = await network.connect());
  });

  it("blocks a high-value transfer when the TWAP drifts from the feed", async () => {
    const now = Number((await ethers.provider.getBlock("latest"))!.timestamp);

    // Chainlink says 1.0; the pool TWAP sits at tick 1000 (~1.105), a ~10%
    // gap, far outside a 2% tolerance.
    const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
    const feed = await Agg.deploy(8, 1_0000_0000n, now);
    const ChainlinkFactory = await ethers.getContractFactory("ChainlinkPriceOracle");
    const chainlink = await ChainlinkFactory.deploy(await feed.getAddress(), "A/USD");

    const Pool = await ethers.getContractFactory("MockUniswapV3Pool");
    const pool = await Pool.deploy(1000);
    const TwapFactory = await ethers.getContractFactory("UniswapV3TwapOracle");
    const twap = await TwapFactory.deploy(await pool.getAddress(), 1800, 0, "A/USD TWAP");

    const Factory = await ethers.getContractFactory("BridgeMultiOracle");
    const oracle = await Factory.deploy(
      await chainlink.getAddress(),
      await twap.getAddress(),
      200n,
      3600n,
      ethers.parseUnits("1000", 18),
    );

    await expect(
      oracle.validateTransfer(ethers.parseUnits("5000", 18)),
    ).to.be.revertedWithCustomError(oracle, "OracleDeviationExceeded");
  });

  it("allows a high-value transfer when both sources agree", async () => {
    const now = Number((await ethers.provider.getBlock("latest"))!.timestamp);

    // Tick 0 is exactly 1.0, matching the Chainlink answer.
    const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
    const feed = await Agg.deploy(8, 1_0000_0000n, now);
    const ChainlinkFactory = await ethers.getContractFactory("ChainlinkPriceOracle");
    const chainlink = await ChainlinkFactory.deploy(await feed.getAddress(), "A/USD");

    const Pool = await ethers.getContractFactory("MockUniswapV3Pool");
    const pool = await Pool.deploy(0);
    const TwapFactory = await ethers.getContractFactory("UniswapV3TwapOracle");
    const twap = await TwapFactory.deploy(await pool.getAddress(), 1800, 0, "A/USD TWAP");

    const Factory = await ethers.getContractFactory("BridgeMultiOracle");
    const oracle = await Factory.deploy(
      await chainlink.getAddress(),
      await twap.getAddress(),
      200n,
      3600n,
      ethers.parseUnits("1000", 18),
    );

    const [valueUsd, , isHighValue] = await oracle.validateTransfer(
      ethers.parseUnits("5000", 18),
    );
    expect(isHighValue).to.equal(true);
    expect(valueUsd).to.equal(ethers.parseUnits("5000", 18));
  });
});
