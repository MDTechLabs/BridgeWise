import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('Smart Contract Event Schema Compatibility (#1312)', function () {
  let bridgeContract: any;
  let bridgeFactory: any;

  before(async function () {
    bridgeFactory = await ethers.getContractFactory('BridgeCoreUpgradeable');
    bridgeContract = await bridgeFactory.deploy();
    await bridgeContract.waitForDeployment();
  });

  it('should verify TransferExecuted event signature and topic hash match expected ABI definition', async function () {
    // Expected canonical event signature string
    const expectedEventSignature = 'TransferExecuted(bytes32,address,uint256)';
    const expectedTopicHash = ethers.id(expectedEventSignature);

    // Extract event fragment from contract interface
    const eventFragment = bridgeContract.interface.getEvent('TransferExecuted');
    
    expect(eventFragment).to.not.be.undefined;
    expect(eventFragment.name).to.equal('TransferExecuted');
    
    // Verify topic hash
    expect(eventFragment.topicHash).to.equal(expectedTopicHash);

    // Verify inputs (types and indexed flags)
    expect(eventFragment.inputs.length).to.equal(3);
    
    // transferId (bytes32, indexed)
    expect(eventFragment.inputs[0].name).to.equal('transferId');
    expect(eventFragment.inputs[0].type).to.equal('bytes32');
    expect(eventFragment.inputs[0].indexed).to.be.true;

    // recipient (address, indexed)
    expect(eventFragment.inputs[1].name).to.equal('recipient');
    expect(eventFragment.inputs[1].type).to.equal('address');
    expect(eventFragment.inputs[1].indexed).to.be.true;

    // amount (uint256, unindexed)
    expect(eventFragment.inputs[2].name).to.equal('amount');
    expect(eventFragment.inputs[2].type).to.equal('uint256');
    expect(eventFragment.inputs[2].indexed).to.be.false;
  });

  it('should correctly parse and decode emitted event logs from transactions', async function () {
    const [owner, recipient] = await ethers.getSigners();
    
    // Initialize contract
    await bridgeContract.initialize(1);

    const transferId = ethers.id('test-cross-chain-transfer-1');
    const amount = ethers.parseEther('10.0');

    // Execute transfer and capture transaction receipt
    const tx = await bridgeContract.executeCrossChainTransfer(transferId, recipient.address, amount);
    const receipt = await tx.wait();

    // Parse logs using contract interface
    const parsedLogs = receipt.logs
      .map((log: any) => {
        try {
          return bridgeContract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter((log: any) => log !== null);

    expect(parsedLogs.length).to.equal(1);
    const transferEvent = parsedLogs[0];

    expect(transferEvent.name).to.equal('TransferExecuted');
    expect(transferEvent.args.transferId).to.equal(transferId);
    expect(transferEvent.args.recipient).to.equal(recipient.address);
    expect(transferEvent.args.amount).to.equal(amount);
  });
});