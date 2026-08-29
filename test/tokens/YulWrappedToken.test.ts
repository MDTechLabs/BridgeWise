import { expect } from "chai";
import { ethers } from "hardhat";

describe("YulWrappedToken", function () {
    let yulWrappedToken: any;
    let mockToken: any;
    let owner: any;
    let bridge: any;
    let user: any;

    beforeEach(async function () {
        [owner, bridge, user] = await ethers.getSigners();

        // We use BridgeWrappedToken as the token to mint
        const MockTokenFactory = await ethers.getContractFactory("BridgeWrappedToken");
        mockToken = await MockTokenFactory.deploy("Mock Wrapped Token", "mWTKN", await bridge.getAddress(), await owner.getAddress());
        await mockToken.waitForDeployment();

        const YulWrappedTokenFactory = await ethers.getContractFactory("YulWrappedToken");
        yulWrappedToken = await YulWrappedTokenFactory.deploy(await bridge.getAddress());
        await yulWrappedToken.waitForDeployment();
        
        // Grant minter role to our YulWrappedToken handler
        const MINTER_ROLE = await mockToken.MINTER_ROLE();
        await mockToken.connect(owner).grantRole(MINTER_ROLE, await yulWrappedToken.getAddress());
    });

    it("should mint successfully when called by the bridge", async function () {
        const userAddress = await user.getAddress();
        const amount = ethers.parseEther("100");

        const tx = await yulWrappedToken.connect(bridge).mint(
            await mockToken.getAddress(),
            userAddress,
            amount
        );

        await tx.wait();

        const balance = await mockToken.balanceOf(userAddress);
        expect(balance).to.equal(amount);
    });

    it("should revert when called by unauthorized account", async function () {
        const userAddress = await user.getAddress();
        const amount = ethers.parseEther("100");

        await expect(
            yulWrappedToken.connect(user).mint(
                await mockToken.getAddress(),
                userAddress,
                amount
            )
        ).to.be.revertedWithCustomError(yulWrappedToken, "Unauthorized");
    });
    
    it("should revert when minting fails (e.g. not a minter)", async function () {
        const userAddress = await user.getAddress();
        const amount = ethers.parseEther("100");
        
        // revoke minter role
        const MINTER_ROLE = await mockToken.MINTER_ROLE();
        await mockToken.connect(owner).revokeRole(MINTER_ROLE, await yulWrappedToken.getAddress());

        await expect(
            yulWrappedToken.connect(bridge).mint(
                await mockToken.getAddress(),
                userAddress,
                amount
            )
        ).to.be.revertedWithCustomError(yulWrappedToken, "MintFailed");
    });
});
