import { expect } from 'chai';
import hre from 'hardhat';

describe('BridgeGateway emergency asset disablement', () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  it('blocks new deposits for a disabled token without blocking escrow refunds', async () => {
    const [admin, user, recipient, other] = await ethers.getSigners();
    const TokenFactory = await ethers.getContractFactory(
      'contracts/test/MockERC20.sol:MockERC20',
    );
    const token = await TokenFactory.deploy('Mock Token', 'MOCK');
    await token.waitForDeployment();

    const VaultFactory = await ethers.getContractFactory('MockBridgeVault');
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();

    const GatewayFactory = await ethers.getContractFactory('BridgeGateway');
    const gateway = await GatewayFactory.deploy(
      await vault.getAddress(),
      admin.address,
    );
    await gateway.waitForDeployment();

    const EscrowFactory = await ethers.getContractFactory('FallbackEscrow');
    const escrow = await EscrowFactory.deploy(admin.address);
    await escrow.waitForDeployment();

    const amount = ethers.parseEther('10');
    const tokenAddress = await token.getAddress();
    const messageId = ethers.keccak256(ethers.toUtf8Bytes('safe-refund'));
    await token.mint(user.address, amount);
    await token.mint(admin.address, amount);
    await token.connect(admin).approve(await escrow.getAddress(), amount);
    await escrow.escrowTokens(
      messageId,
      recipient.address,
      tokenAddress,
      amount,
    );

    await expect(gateway.connect(admin).setAssetDisabled(tokenAddress, true))
      .to.emit(gateway, 'AssetDepositStatusUpdated')
      .withArgs(tokenAddress, true);

    await token.connect(user).approve(await gateway.getAddress(), amount);
    await expect(
      gateway.connect(user).deposit(tokenAddress, amount, 2, ethers.ZeroHash),
    )
      .to.be.revertedWithCustomError(gateway, 'AssetDepositsDisabled')
      .withArgs(tokenAddress);
    expect(await token.balanceOf(user.address)).to.equal(amount);
    expect(await vault.recordCount()).to.equal(0n);

    await expect(
      escrow.connect(other).claimEscrowedTokens(messageId),
    ).to.be.revertedWithCustomError(escrow, 'NotRecipient');

    await escrow.connect(recipient).claimEscrowedTokens(messageId);
    expect(await token.balanceOf(recipient.address)).to.equal(amount);
    expect(
      await escrow.getClaimableAmount(recipient.address, tokenAddress),
    ).to.equal(0n);
    const entry = await escrow.escrows(messageId);
    expect(entry.claimed).to.equal(true);
  });

  it('allows only the admin to change asset deposit status and rejects the zero address', async () => {
    const [admin, other] = await ethers.getSigners();
    const VaultFactory = await ethers.getContractFactory('MockBridgeVault');
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();

    const GatewayFactory = await ethers.getContractFactory('BridgeGateway');
    const gateway = await GatewayFactory.deploy(
      await vault.getAddress(),
      admin.address,
    );
    await gateway.waitForDeployment();

    await expect(
      gateway.connect(other).setAssetDisabled(other.address, true),
    ).to.be.revertedWithCustomError(
      gateway,
      'AccessControlUnauthorizedAccount',
    );
    await expect(
      gateway.setAssetDisabled(ethers.ZeroAddress, true),
    ).to.be.revertedWithCustomError(gateway, 'ZeroAddress');
  });
});
