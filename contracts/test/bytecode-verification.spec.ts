import { ethers } from 'hardhat';
import { expect } from 'chai';
import { verifyDeploymentBytecode } from '../scripts/verify-bytecode';

describe('Smart Contract Bytecode Verification (#1313)', function () {
  it('should successfully verify deployed contract bytecode against local artifacts', async function () {
    const [deployer] = await ethers.getSigners();

    // Deploy test contract
    const BridgeCore = await ethers.getContractFactory('BridgeCoreUpgradeable');
    const bridge = await BridgeCore.deploy();
    await bridge.waitForDeployment();
    const address = await bridge.getAddress();

    // Verify bytecode
    const isValid = await verifyDeploymentBytecode(address, 'BridgeCoreUpgradeable');
    expect(isValid).to.be.true;
  });

  it('should reject verification if contract address has no code', async function () {
    const dummyAddress = '0x000000000000000000000000000000000000dead';
    let errorCaught = false;

    try {
      await verifyDeploymentBytecode(dummyAddress, 'BridgeCoreUpgradeable');
    } catch (err) {
      errorCaught = true;
    }

    expect(errorCaught).to.be.true;
  });
});