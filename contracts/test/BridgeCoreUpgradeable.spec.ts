const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

describe('BridgeCoreUpgradeable Storage Gap & Upgrade Safety (#1314)', function () {
  it('should successfully deploy and validate upgrade safety via UUPS proxy', async function () {
    const [owner] = await ethers.getSigners();

    const BridgeCore = await ethers.getContractFactory('BridgeCoreUpgradeable');
    
    // Deploy proxy
    const bridge = await upgrades.deployProxy(BridgeCore, [1], {
      initializer: 'initialize',
      kind: 'uups',
    });

    await bridge.waitForDeployment();
    expect(await bridge.chainId()).to.equal(1n);

    // Validate upgrade safety without state corruption
    const BridgeCoreV2 = await ethers.getContractFactory('BridgeCoreUpgradeable');
    const upgradedBridge = await upgrades.upgradeProxy(await bridge.getAddress(), BridgeCoreV2);

    expect(await upgradedBridge.chainId()).to.equal(1n);
  });
});