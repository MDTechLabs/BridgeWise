import { expect } from "chai";
import hre from "hardhat";

/**
 * Fuzz / property tests for BridgeRoute parameter bounds (#1310).
 *
 * Inputs come from a seeded PRNG, so every run is reproducible:
 *   FUZZ_SEED=<n>  seed (default 1310)
 *   FUZZ_RUNS=<n>  iterations per property (default 150)
 * A failing iteration reports the seed, run number and inputs; re-run with the
 * same FUZZ_SEED to replay it exactly.
 *
 * The "known gaps" block pins today's behavior where it is surprising, so a
 * fix shows up as a deliberate test change rather than a silent difference.
 */

const SEED = Number(process.env.FUZZ_SEED ?? 1310);
const RUNS = Number(process.env.FUZZ_RUNS ?? 150);

const MAX_UINT256 = 2n ** 256n - 1n;
const MAX_UINT32 = 2 ** 32 - 1;
const BPS = 10_000n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_ADDRESS = "0xffffffffffffffffffffffffffffffffffffffff";

/** mulberry32: small, fast, deterministic. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(SEED);
const int = (max: number) => Math.floor(rng() * max);
const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)];

function randBits(bits: number): bigint {
  let v = 0n;
  for (let i = 0; i < Math.ceil(bits / 32); i++) {
    v = (v << 32n) | BigInt(Math.floor(rng() * 2 ** 32));
  }
  return v & ((1n << BigInt(bits)) - 1n);
}

/** Edge values that matter for bps math and 256-bit overflow. */
const EDGE_UINT256 = [
  0n,
  1n,
  2n,
  BPS - 1n,
  BPS,
  BPS + 1n,
  2n ** 64n,
  2n ** 128n,
  2n ** 255n,
  MAX_UINT256 / BPS,
  MAX_UINT256 / BPS + 1n,
  MAX_UINT256,
] as const;

/** A uint256 drawn from edges, small values, 128-bit and full-width values. */
function anyUint256(): bigint {
  switch (int(4)) {
    case 0:
      return pick(EDGE_UINT256);
    case 1:
      return randBits(40);
    case 2:
      return randBits(128);
    default:
      return randBits(256);
  }
}

const EDGE_BPS = [0n, 1n, 9_999n, 10_000n, 10_001n, 65_535n, MAX_UINT256] as const;
/** A bps value: mostly in range (incl. both ends), sometimes just out of range or huge. */
function anyBps(): bigint {
  return int(3) === 0 ? pick(EDGE_BPS) : BigInt(int(10_001));
}
const validBps = (): bigint => (int(4) === 0 ? pick([0n, 1n, 9_999n, 10_000n]) : BigInt(int(10_001)));

const EDGE_CHAINS = [0, 1, 2, 137, MAX_UINT32 - 1, MAX_UINT32] as const;
const anyChain = (): number => (int(2) === 0 ? pick(EDGE_CHAINS) : int(MAX_UINT32 + 1));

function anyToken(): string {
  if (int(4) === 0) return pick(["0x0000000000000000000000000000000000000001", MAX_ADDRESS]);
  return "0x" + randBits(160).toString(16).padStart(40, "0");
}
const nonZeroToken = (): string => {
  const t = anyToken();
  return t === ZERO_ADDRESS ? MAX_ADDRESS : t;
};

type Outcome =
  | { kind: "ok" }
  | { kind: "slippage"; slippage: bigint }
  | { kind: "fee"; feeBps: bigint }
  | { kind: "panic" };

/** Mirrors validateRoute's checked 256-bit arithmetic and check order. */
function oracle(amount: bigint, expected: bigint, fee: bigint, maxSlip: bigint, maxFee: bigint): Outcome {
  if (amount > 0n && expected < amount) {
    const loss = (amount - expected) * BPS;
    if (loss > MAX_UINT256) return { kind: "panic" };
    const slippage = loss / amount;
    if (slippage > maxSlip) return { kind: "slippage", slippage };
  }
  if (amount > 0n) {
    const scaled = fee * BPS;
    if (scaled > MAX_UINT256) return { kind: "panic" };
    const feeBps = scaled / amount;
    if (feeBps > maxFee) return { kind: "fee", feeBps };
  }
  return { kind: "ok" };
}

/** Largest loss (or fee) for which floor(x * 10000 / amount) <= maxBps. */
const largestAllowed = (amount: bigint, maxBps: bigint): bigint => ((maxBps + 1n) * amount - 1n) / BPS;

const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

describe("BridgeRoute fuzz: route parameter bounds (#1310)", function () {
  this.timeout(180_000);

  let ethers: any;
  let owner: any;
  let attacker: any;
  let route: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    [owner, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BridgeRoute");
    route = await Factory.deploy(owner.address);
    await route.waitForDeployment();
  });

  /** Runs `body` RUNS times; any failure is re-thrown with seed, run number and inputs. */
  async function fuzz<I>(gen: () => I, body: (input: I) => Promise<void>) {
    for (let run = 0; run < RUNS; run++) {
      const input = gen();
      try {
        await body(input);
      } catch (err: any) {
        err.message = `[FUZZ_SEED=${SEED} run=${run} inputs=${show(input)}] ${err.message}`;
        throw err;
      }
    }
  }

  async function snapshot(src: number, dst: number, token: string) {
    const r = await route.routes(src, dst, token);
    return {
      supported: r.supported,
      maxSlippageBps: r.maxSlippageBps,
      maxFeeBps: r.maxFeeBps,
      assetCompatible: r.assetCompatible,
      exposureLimit: r.exposureLimit,
    };
  }

  describe("setRoute bounds", () => {
    it("accepts exactly bps in [0, 10000] and stores them unchanged; rejects anything larger without touching state", async () => {
      await fuzz(
        () => ({
          src: anyChain(),
          dst: anyChain(),
          token: nonZeroToken(),
          supported: int(2) === 0,
          slip: anyBps(),
          fee: anyBps(),
          exposure: anyUint256(),
        }),
        async ({ src, dst, token, supported, slip, fee, exposure }) => {
          // Known starting config so "unchanged" is observable.
          await route.setRoute(src, dst, token, true, 7, 8, 9);
          const before = await snapshot(src, dst, token);

          const call = route.setRoute(src, dst, token, supported, slip, fee, exposure);
          if (slip > BPS || fee > BPS) {
            await expect(call).to.be.revertedWithCustomError(route, "ZeroAmount");
            expect(await snapshot(src, dst, token)).to.deep.equal(before);
          } else {
            await expect(call)
              .to.emit(route, "RouteConfigured")
              .withArgs(src, dst, ethers.getAddress(token), supported);
            const after = await snapshot(src, dst, token);
            expect(after.supported).to.equal(supported);
            expect(after.maxSlippageBps).to.equal(slip);
            expect(after.maxFeeBps).to.equal(fee);
            expect(after.exposureLimit).to.equal(exposure);
            expect(after.assetCompatible).to.equal(true);
          }
        }
      );
    });

    it("pins the 10000 bps boundary exactly: 10000 passes, 10001 fails, for each field", async () => {
      const token = nonZeroToken();
      await route.setRoute(1, 2, token, true, 10_000, 10_000, 0);
      await expect(route.setRoute(1, 2, token, true, 10_001, 10_000, 0)).to.be.revertedWithCustomError(route, "ZeroAmount");
      await expect(route.setRoute(1, 2, token, true, 10_000, 10_001, 0)).to.be.revertedWithCustomError(route, "ZeroAmount");
      await expect(route.setRoute(1, 2, token, true, MAX_UINT256, 0, 0)).to.be.revertedWithCustomError(route, "ZeroAmount");
      await expect(route.setRoute(1, 2, token, true, 0, MAX_UINT256, 0)).to.be.revertedWithCustomError(route, "ZeroAmount");
    });

    it("rejects the zero token for any other parameters, and reports it before the bps check", async () => {
      await fuzz(
        () => ({ src: anyChain(), dst: anyChain(), slip: anyBps(), fee: anyBps(), exposure: anyUint256() }),
        async ({ src, dst, slip, fee, exposure }) => {
          await expect(route.setRoute(src, dst, ZERO_ADDRESS, true, slip, fee, exposure)).to.be.revertedWithCustomError(
            route,
            "ZeroAddress"
          );
        }
      );
    });

    it("is admin-only for any parameters, and the access check wins over validation", async () => {
      await fuzz(
        () => ({ src: anyChain(), dst: anyChain(), token: anyToken(), slip: anyBps(), fee: anyBps() }),
        async ({ src, dst, token, slip, fee }) => {
          await expect(
            route.connect(attacker).setRoute(src, dst, token, true, slip, fee, 0)
          ).to.be.revertedWithCustomError(route, "AccessControlUnauthorizedAccount");
          await expect(
            route.connect(attacker).setAssetCompatible(src, dst, token, false)
          ).to.be.revertedWithCustomError(route, "AccessControlUnauthorizedAccount");
        }
      );
    });

    it("setAssetCompatible rejects the zero token and only toggles the asset flag", async () => {
      await expect(route.setAssetCompatible(1, 2, ZERO_ADDRESS, false)).to.be.revertedWithCustomError(
        route,
        "ZeroAddress"
      );
      await fuzz(
        () => ({ src: anyChain(), dst: anyChain(), token: nonZeroToken(), compatible: int(2) === 0 }),
        async ({ src, dst, token, compatible }) => {
          await route.setRoute(src, dst, token, true, 100, 200, 300);
          const before = await snapshot(src, dst, token);
          await route.setAssetCompatible(src, dst, token, compatible);
          const after = await snapshot(src, dst, token);
          expect(after).to.deep.equal({ ...before, assetCompatible: compatible });
        }
      );
    });
  });

  describe("validateRoute bounds", () => {
    it("matches an exact model of slippage/fee limits and 256-bit overflow for arbitrary inputs", async () => {
      await fuzz(
        () => {
          const maxSlip = validBps();
          const maxFee = validBps();
          const amount = anyUint256();
          let expected = anyUint256();
          let fee = anyUint256();
          // Steer a share of runs to exactly the allowed edge and one past it.
          if (amount > 0n && amount < 2n ** 200n && int(2) === 0) {
            const lossEdge = largestAllowed(amount, maxSlip);
            const feeEdge = largestAllowed(amount, maxFee);
            const lossPick = int(2) === 0 ? lossEdge : lossEdge + 1n;
            expected = lossPick > amount ? 0n : amount - lossPick;
            fee = int(2) === 0 ? feeEdge : feeEdge + 1n;
          }
          return { maxSlip, maxFee, amount, expected, fee };
        },
        async ({ maxSlip, maxFee, amount, expected, fee }) => {
          const token = "0x0000000000000000000000000000000000000abc";
          await route.setRoute(1, 2, token, true, maxSlip, maxFee, 0);
          const call = route.validateRoute(1, 2, token, amount, expected, fee);
          const want = oracle(amount, expected, fee, maxSlip, maxFee);
          switch (want.kind) {
            case "ok":
              expect(await call).to.equal(true);
              break;
            case "slippage":
              await expect(call)
                .to.be.revertedWithCustomError(route, "SlippageExceeded")
                .withArgs(want.slippage, maxSlip);
              break;
            case "fee":
              await expect(call)
                .to.be.revertedWithCustomError(route, "FeeExceedsLimit")
                .withArgs(want.feeBps, maxFee);
              break;
            case "panic":
              // Overflow must fail closed (revert), never wrap around and pass.
              await expect(call).to.be.revertedWithPanic(0x11);
              break;
          }
        }
      );
    });

    it("is monotonic: a higher expected amount or a lower fee never turns a pass into a failure", async () => {
      await fuzz(
        () => {
          const amount = randBits(90) + 1n;
          return {
            maxSlip: validBps(),
            maxFee: validBps(),
            amount,
            expected: randBits(91) % (amount * 2n),
            fee: randBits(90),
            moreExpected: randBits(60),
            lessFee: randBits(60),
          };
        },
        async ({ maxSlip, maxFee, amount, expected, fee, moreExpected, lessFee }) => {
          const token = "0x0000000000000000000000000000000000000abd";
          await route.setRoute(1, 2, token, true, maxSlip, maxFee, 0);
          const passes = async (e: bigint, f: bigint) => {
            try {
              return (await route.validateRoute(1, 2, token, amount, e, f)) === true;
            } catch {
              return false;
            }
          };
          if (await passes(expected, fee)) {
            expect(await passes(expected + moreExpected, fee), "higher expected").to.equal(true);
            expect(await passes(expected, fee > lessFee ? fee - lessFee : 0n), "lower fee").to.equal(true);
          }
        }
      );
    });

    it("never validates a route that was not configured for exactly that (src, dst, token)", async () => {
      await fuzz(
        () => ({ a: [anyChain(), anyChain(), nonZeroToken()] as const, b: [anyChain(), anyChain(), anyToken()] as const }),
        async ({ a, b }) => {
          await route.setRoute(a[0], a[1], a[2], false, 10_000, 10_000, 0); // configured but unsupported
          const sameKey = a[0] === b[0] && a[1] === b[1] && a[2].toLowerCase() === b[2].toLowerCase();
          if (!sameKey) {
            // Skip keys an earlier iteration may have enabled; assert on never-supported ones only.
            const existing = await route.routes(b[0], b[1], b[2]);
            if (!existing.supported) {
              expect(await route.isRouteSupported(b[0], b[1], b[2])).to.equal(false);
              await expect(route.validateRoute(b[0], b[1], b[2], 1000, 1000, 0)).to.be.revertedWithCustomError(
                route,
                "RouteNotSupported"
              );
            }
          }
          // Direction matters: enabling a -> b does not enable b -> a.
          await route.setRoute(a[0], a[1], a[2], true, 10_000, 10_000, 0);
          if (a[0] !== a[1]) {
            const reverse = await route.routes(a[1], a[0], a[2]);
            if (!reverse.supported) {
              expect(await route.isRouteSupported(a[1], a[0], a[2])).to.equal(false);
            }
          }
        }
      );
    });

    it("fails closed on an unsupported or asset-incompatible route regardless of amounts", async () => {
      const token = "0x0000000000000000000000000000000000000abe";
      await route.setRoute(1, 2, token, false, 10_000, 10_000, 0);
      await fuzz(
        () => ({ amount: anyUint256(), expected: anyUint256(), fee: anyUint256() }),
        async ({ amount, expected, fee }) => {
          await expect(route.validateRoute(1, 2, token, amount, expected, fee)).to.be.revertedWithCustomError(
            route,
            "RouteNotSupported"
          );
        }
      );
      await route.setRoute(1, 2, token, true, 10_000, 10_000, 0);
      await route.setAssetCompatible(1, 2, token, false);
      await fuzz(
        () => ({ amount: anyUint256(), expected: anyUint256(), fee: anyUint256() }),
        async ({ amount, expected, fee }) => {
          await expect(route.validateRoute(1, 2, token, amount, expected, fee)).to.be.revertedWithCustomError(
            route,
            "AssetIncompatible"
          );
        }
      );
    });
  });

  /**
   * Behavior that is surprising today. These pin the CURRENT behavior so any
   * fix is a conscious test update. See docs/contracts/route-parameter-fuzzing.md.
   */
  describe("known gaps (current behavior, not endorsed)", () => {
    const token = "0x0000000000000000000000000000000000000abf";

    it("gap 1: a zero amount skips the slippage and fee checks entirely", async () => {
      await route.setRoute(1, 2, token, true, 0, 0, 0);
      await fuzz(
        () => ({ expected: anyUint256(), fee: anyUint256() }),
        async ({ expected, fee }) => {
          expect(await route.validateRoute(1, 2, token, 0, expected, fee)).to.equal(true);
        }
      );
    });

    it("gap 2: exposureLimit is stored but never enforced by validateRoute", async () => {
      await route.setRoute(1, 2, token, true, 10_000, 10_000, 1);
      expect(await route.validateRoute(1, 2, token, MAX_UINT256 / BPS, MAX_UINT256 / BPS, 0)).to.equal(true);
    });

    it("gap 3: re-running setRoute silently re-enables a token an admin marked asset-incompatible", async () => {
      await route.setRoute(1, 2, token, true, 100, 100, 0);
      await route.setAssetCompatible(1, 2, token, false);
      await route.setRoute(1, 2, token, true, 100, 100, 0);
      expect((await route.routes(1, 2, token)).assetCompatible).to.equal(true);
    });

    it("gap 4: chain ids are unbounded; same-chain and chain 0 routes can be enabled", async () => {
      await route.setRoute(5, 5, token, true, 100, 100, 0);
      await route.setRoute(0, 0, token, true, 100, 100, 0);
      expect(await route.isRouteSupported(5, 5, token)).to.equal(true);
      expect(await route.isRouteSupported(0, 0, token)).to.equal(true);
    });

    it("gap 5: out-of-range bps reverts with the misleading ZeroAmount error", async () => {
      await expect(route.setRoute(1, 2, token, true, 10_001, 0, 0)).to.be.revertedWithCustomError(route, "ZeroAmount");
    });
  });
});
