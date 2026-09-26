import { expect } from "chai";
import hre from "hardhat";

describe("BitmaskVerifierYul", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BitmaskVerifierYulWrapper");
    const wrapper = await Factory.deploy();
    await wrapper.waitForDeployment();
    return { wrapper, owner };
  }

  it("counts set bits correctly", async () => {
    const { wrapper } = await deploy();

    // 0b1010 = bits 1 and 3 set = 2 bits
    expect(await wrapper.countSetBits(0b1010)).to.equal(2);
    // 0b1111 = 4 bits
    expect(await wrapper.countSetBits(0b1111)).to.equal(4);
    // 0 = 0 bits
    expect(await wrapper.countSetBits(0)).to.equal(0);
    // 1 = 1 bit
    expect(await wrapper.countSetBits(1)).to.equal(1);
    // 0xFF = 8 bits
    expect(await wrapper.countSetBits(0xFF)).to.equal(8);
  });

  it("checks if a bit is set", async () => {
    const { wrapper } = await deploy();

    // bitmask = 0b1010 (bits 1 and 3)
    const bitmask = 0b1010;
    expect(await wrapper.isBitSet(bitmask, 0)).to.equal(false);
    expect(await wrapper.isBitSet(bitmask, 1)).to.equal(true);
    expect(await wrapper.isBitSet(bitmask, 2)).to.equal(false);
    expect(await wrapper.isBitSet(bitmask, 3)).to.equal(true);
  });

  it("large bitmask with many bits set", async () => {
    const { wrapper } = await deploy();

    // Bits 0, 5, 10, 15, 20 set
    const bitmask = (1 << 0) | (1 << 5) | (1 << 10) | (1 << 15) | (1 << 20);
    expect(await wrapper.countSetBits(bitmask)).to.equal(5);
    expect(await wrapper.isBitSet(bitmask, 5)).to.equal(true);
    expect(await wrapper.isBitSet(bitmask, 3)).to.equal(false);
  });
});
