import { expect } from "chai";
import { ethers } from "hardhat";

describe("AddressUtils", () => {
  let addressUtils: any;

  before(async () => {
    const factory = await ethers.getContractFactory("AddressUtils");
    // Libraries need to be linked; for testing we deploy via a helper contract
    // that exposes the library functions. Alternatively, use inline assembly tests.
    addressUtils = await factory.deploy();
    await addressUtils.waitForDeployment();
  });

  describe("bytes32ToAddress", () => {
    it("converts a clean 32-byte value to a 20-byte address", async () => {
      const addr = ethers.getAddress("0x1234567890AbcdEF1234567890aBcdef12345678");
      const padded = ethers.zeroPadValue(addr, 32);
      const result = await addressUtils.bytes32ToAddress(padded);
      expect(result).to.equal(addr);
    });

    it("converts a zero bytes32 to the zero address", async () => {
      const result = await addressUtils.bytes32ToAddress(ethers.ZeroHash);
      expect(result).to.equal(ethers.ZeroAddress);
    });

    it("reverts when upper 12 bytes are non-zero", async () => {
      const dirty = "0x0000000000000000000000011234567890AbcdEF1234567890aBcdef12345678";
      await expect(
        addressUtils.bytes32ToAddress(dirty)
      ).to.be.revertedWith("InvalidAddressMapping");
    });

    it("reverts when a high byte is set", async () => {
      const dirty = "0xff00000000000000000000001234567890AbcdEF1234567890aBcdef12345678";
      await expect(
        addressUtils.bytes32ToAddress(dirty)
      ).to.be.revertedWith("InvalidAddressMapping");
    });
  });

  describe("addressToBytes32", () => {
    it("left-pads a 20-byte address with zeroes", async () => {
      const addr = ethers.getAddress("0x1234567890AbcdEF1234567890aBcdef12345678");
      const result = await addressUtils.addressToBytes32(addr);
      expect(result).to.equal(ethers.zeroPadValue(addr, 32));
    });

    it("converts the zero address to zero bytes32", async () => {
      const result = await addressUtils.addressToBytes32(ethers.ZeroAddress);
      expect(result).to.equal(ethers.ZeroHash);
    });
  });

  describe("round-trip", () => {
    it("bytes32ToAddress(addressToBytes32(addr)) == addr", async () => {
      const addr = ethers.getAddress("0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B");
      const padded = await addressUtils.addressToBytes32(addr);
      const roundTripped = await addressUtils.bytes32ToAddress(padded);
      expect(roundTripped).to.equal(addr);
    });
  });
});
