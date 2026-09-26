import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("YulBatchUnlocker", function () {
  let unlocker: Contract;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let rejector: Contract;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    user1 = signers[1];
    user2 = signers[2];

    const YulBatchUnlocker = await ethers.getContractFactory("YulBatchUnlocker");
    unlocker = await YulBatchUnlocker.deploy();
    await unlocker.waitForDeployment();

    // Deploy mock contract that rejects ETH
    const RejectorMock = await ethers.getContractFactory("RejectorMock");
    rejector = await RejectorMock.deploy();
    await rejector.waitForDeployment();

    // Fund the unlocker contract
    await owner.sendTransaction({
      to: await unlocker.getAddress(),
      value: ethers.parseEther("100.0"),
    });
  });

  it("should successfully batch transfer ETH to multiple recipients", async function () {
    const recipients = [user1.address, user2.address];
    const amounts = [ethers.parseEther("1.5"), ethers.parseEther("2.5")];

    const tx = await unlocker.unlockBatch(recipients, amounts);
    
    // Check that balances changed correctly
    await expect(tx).to.changeEtherBalances(
      [unlocker, user1, user2],
      [ethers.parseEther("-4.0"), ethers.parseEther("1.5"), ethers.parseEther("2.5")]
    );
  });

  it("should log UnlockFailed event for failed transfers without halting the batch", async function () {
    const rejectorAddress = await rejector.getAddress();
    
    const recipients = [
      user1.address, 
      rejectorAddress, // This one will fail
      user2.address
    ];
    
    const amounts = [
      ethers.parseEther("1.0"),
      ethers.parseEther("5.0"), // Amount to fail
      ethers.parseEther("2.0")
    ];

    // The transaction should succeed but emit an event for the failed transfer
    const tx = await unlocker.unlockBatch(recipients, amounts);

    // Assert the balances updated only for the successful ones
    await expect(tx).to.changeEtherBalances(
      [unlocker, user1, rejector, user2],
      [
        ethers.parseEther("-3.0"), // Only 1.0 + 2.0 = 3.0 was transferred successfully
        ethers.parseEther("1.0"), 
        0n, // The rejector balance stays 0
        ethers.parseEther("2.0")
      ]
    );

    // Assert that the Yul batch correctly identified the failed call and emitted the event
    await expect(tx)
      .to.emit(unlocker, "UnlockFailed")
      .withArgs(rejectorAddress, ethers.parseEther("5.0"));
  });

  it("should revert if array lengths mismatch", async function () {
    const recipients = [user1.address, user2.address];
    const amounts = [ethers.parseEther("1.0")];

    await expect(
      unlocker.unlockBatch(recipients, amounts)
    ).to.be.revertedWith("YulBatchUnlocker: Mismatched arrays");
  });
});
