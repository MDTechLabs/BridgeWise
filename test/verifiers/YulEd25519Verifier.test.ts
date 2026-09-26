import { expect } from "chai";
import { ethers } from "hardhat";

describe("YulEd25519Verifier", function () {
    let verifier: any;
    let sha512Mock: any;
    let curveMock: any;

    beforeEach(async function () {
        const MockSHA512 = await ethers.getContractFactory("MockSHA512");
        sha512Mock = await MockSHA512.deploy();
        
        const MockCurve = await ethers.getContractFactory("MockCurveHelper");
        curveMock = await MockCurve.deploy();

        const Verifier = await ethers.getContractFactory("YulEd25519Verifier");
        verifier = await Verifier.deploy(
            await sha512Mock.getAddress(),
            await curveMock.getAddress()
        );
    });

    it("should return true for a valid signature", async function () {
        const publicKey = ethers.hexlify(ethers.randomBytes(32));
        const message = ethers.toUtf8Bytes("Test valid signature message");
        const signature = ethers.hexlify(ethers.randomBytes(64));
        
        // Setup mock hash response (64 bytes)
        const mockHash = ethers.hexlify(ethers.randomBytes(64));
        await sha512Mock.setReturnHash(mockHash);
        
        // Setup mock curve precompile response
        await curveMock.setIsValid(true);

        const result = await verifier.verify(publicKey, message, signature);
        expect(result).to.be.true;
    });

    it("should return false for an invalid signature", async function () {
        const publicKey = ethers.hexlify(ethers.randomBytes(32));
        const message = ethers.toUtf8Bytes("Test invalid signature message");
        const signature = ethers.hexlify(ethers.randomBytes(64));
        
        // Setup mock hash response (64 bytes)
        const mockHash = ethers.hexlify(ethers.randomBytes(64));
        await sha512Mock.setReturnHash(mockHash);
        
        // Setup mock curve precompile response
        await curveMock.setIsValid(false);

        const result = await verifier.verify(publicKey, message, signature);
        expect(result).to.be.false;
    });

    it("should use reduced gas for inline assembly verification", async function () {
        const publicKey = ethers.hexlify(ethers.randomBytes(32));
        const message = ethers.toUtf8Bytes("Gas benchmark message");
        const signature = ethers.hexlify(ethers.randomBytes(64));
        
        const mockHash = ethers.hexlify(ethers.randomBytes(64));
        await sha512Mock.setReturnHash(mockHash);
        await curveMock.setIsValid(true);

        const tx = await verifier.verify.populateTransaction(publicKey, message, signature);
        
        // We ensure that the inline assembly wrapper logic reduces gas
        // Normally Ed25519 logic takes >500k gas in pure Solidity. The wrapper + precompiles should be extremely cheap.
        const estimate = await ethers.provider.estimateGas(tx);
        
        // Expect gas to be very low since we just copy memory and do 2 static calls.
        expect(estimate).to.be.lessThan(50000n);
    });
});
