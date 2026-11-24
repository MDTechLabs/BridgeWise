import { expect } from 'chai';
import hre from 'hardhat';

describe('BridgeCoreAccessControl operator compromise recovery', () => {
  let ethers: any;
  let bridge: any;
  let admin: any;
  let executor: any;
  let compromisedOperator: any;
  let trustedOperator: any;
  let recipient: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  beforeEach(async () => {
    [admin, executor, compromisedOperator, trustedOperator, recipient] =
      await ethers.getSigners();

    const implementationFactory = await ethers.getContractFactory(
      'BridgeCoreAccessControl',
    );
    const implementation = await implementationFactory.deploy();
    await implementation.waitForDeployment();

    const initData = implementationFactory.interface.encodeFunctionData(
      'initialize',
      [1, admin.address],
    );
    const proxyFactory = await ethers.getContractFactory('ERC1967ProxyHarness');
    const proxy = await proxyFactory.deploy(
      await implementation.getAddress(),
      initData,
    );
    await proxy.waitForDeployment();

    bridge = implementationFactory.attach(await proxy.getAddress());
    await bridge.grantRole(await bridge.EXECUTOR_ROLE(), executor.address);
    await bridge.grantRole(
      await bridge.OPERATOR_ROLE(),
      compromisedOperator.address,
    );
  });

  it('revokes a compromised operator, verifies the revocation with a trusted operator, and resumes execution', async () => {
    const operatorRole = await bridge.OPERATOR_ROLE();
    const executorRole = await bridge.EXECUTOR_ROLE();

    await bridge.revokeRole(operatorRole, compromisedOperator.address);
    await bridge.grantRole(operatorRole, trustedOperator.address);

    await expect(
      bridge
        .connect(compromisedOperator)
        .verifyRoleRevocation(operatorRole, compromisedOperator.address),
    ).to.be.revertedWithCustomError(bridge, 'AccessControlUnauthorizedAccount');

    await expect(
      bridge
        .connect(trustedOperator)
        .verifyRoleRevocation(operatorRole, compromisedOperator.address),
    )
      .to.emit(bridge, 'RoleRevocationVerified')
      .withArgs(
        operatorRole,
        compromisedOperator.address,
        trustedOperator.address,
      );

    const transferId = ethers.id('transfer-after-operator-recovery');
    const amount = ethers.parseEther('2');
    await bridge
      .connect(executor)
      .executeCrossChainTransfer(transferId, recipient.address, amount);
    expect(await bridge.executedTransfers(transferId)).to.equal(true);
    expect(await bridge.hasRole(executorRole, executor.address)).to.equal(true);
  });
});
