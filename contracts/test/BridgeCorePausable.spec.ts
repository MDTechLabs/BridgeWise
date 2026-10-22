const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

describe('BridgeCore Emergency Pause Across All Entry Points (#1311)', function () {
  let bridge: any;
  let owner: any;
  let recipient: any;
  let nonOwner: any;

  beforeEach(async function () {
    [owner, recipient, nonOwner] = await ethers.getSigners();

    const BridgeFactory = await ethers.getContractFactory('BridgeCorePausable');
    bridge = await upgrades.deployProxy(BridgeFactory, [1], {
      initializer: 'initialize',
      kind: 'uups',
    });
    await bridge.waitForDeployment();
  });

  it('should allow cross-chain transfers when unpaused', async function () {
    const transferId = ethers.id('transfer-unpaused-1');
    const amount = ethers.parseEther('5.0');

    await expect(bridge.executeCrossChainTransfer(transferId, recipient.address, amount))
      .to.emit(bridge, 'TransferExecuted')
      .withArgs(transferId, recipient.address, amount);

    expect(await bridge.executedTransfers(transferId)).to.be.true;
  });

  it('should reject non-owners from triggering emergency pause', async function () {
    await expect(bridge.connect(nonOwner).pause()).to.be.revertedWithCustomError(
      bridge,
      'OwnableUnauthorizedAccount'
    );
  });

  it('should reject cross-chain transfers across all entry points when emergency pause is active', async function () {
    // 1. Trigger emergency pause
    await expect(bridge.pause())
      .to.emit(bridge, 'EmergencyPaused')
      .withArgs(owner.address);

    expect(await bridge.paused()).to.be.true;

    // 2. Attempt transfer while paused
    const transferId = ethers.id('transfer-paused-1');
    const amount = ethers.parseEther('5.0');

    await expect(
      bridge.executeCrossChainTransfer(transferId, recipient.address, amount)
    ).to.be.revertedWithCustomError(bridge, 'EnforcedPause');

    expect(await bridge.executedTransfers(transferId)).to.be.false;
  });

  it('should successfully resume execution after unpausing', async function () {
    // Pause
    await bridge.pause();
    expect(await bridge.paused()).to.be.true;

    // Unpause
    await expect(bridge.unpause())
      .to.emit(bridge, 'EmergencyUnpaused')
      .withArgs(owner.address);

    expect(await bridge.paused()).to.be.false;

    // Execute transfer post-unpause
    const transferId = ethers.id('transfer-resumed-1');
    const amount = ethers.parseEther('5.0');

    await expect(bridge.executeCrossChainTransfer(transferId, recipient.address, amount))
      .to.emit(bridge, 'TransferExecuted')
      .withArgs(transferId, recipient.address, amount);

    expect(await bridge.executedTransfers(transferId)).to.be.true;
  });
});