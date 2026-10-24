const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

describe('BridgeCore Access Control Role Revocation Verification', function () {
  let bridge: any;
  let admin: any;
  let executor: any;
  let operator: any;
  let attacker: any;
  let recipient: any;

  let EXECUTOR_ROLE: string;
  let OPERATOR_ROLE: string;
  let DEFAULT_ADMIN_ROLE: string;

  beforeEach(async function () {
    [admin, executor, operator, attacker, recipient] = await ethers.getSigners();

    const BridgeFactory = await ethers.getContractFactory('BridgeCoreAccessControl');
    bridge = await upgrades.deployProxy(BridgeFactory, [1, admin.address], {
      initializer: 'initialize',
      kind: 'uups',
    });
    await bridge.waitForDeployment();

    EXECUTOR_ROLE = await bridge.EXECUTOR_ROLE();
    OPERATOR_ROLE = await bridge.OPERATOR_ROLE();
    DEFAULT_ADMIN_ROLE = await bridge.DEFAULT_ADMIN_ROLE();

    // Grant roles to distinct accounts
    await bridge.connect(admin).grantRole(EXECUTOR_ROLE, executor.address);
    await bridge.connect(admin).grantRole(OPERATOR_ROLE, operator.address);
  });

  describe('Contract-level authorization & role enforcement', function () {
    it('allows an authorized executor to execute cross-chain transfers', async function () {
      const transferId = ethers.id('transfer-exec-1');
      const amount = ethers.parseEther('10.0');

      await expect(
        bridge.connect(executor).executeCrossChainTransfer(transferId, recipient.address, amount)
      )
        .to.emit(bridge, 'TransferExecuted')
        .withArgs(transferId, recipient.address, amount);

      expect(await bridge.executedTransfers(transferId)).to.be.true;
    });

    it('rejects execution attempts by unauthorized callers', async function () {
      const transferId = ethers.id('transfer-unauth-1');
      const amount = ethers.parseEther('10.0');

      await expect(
        bridge.connect(attacker).executeCrossChainTransfer(transferId, recipient.address, amount)
      ).to.be.revertedWithCustomError(bridge, 'AccessControlUnauthorizedAccount');
    });

    it('rejects execution with invalid parameters (zero address recipient or zero amount)', async function () {
      const transferId = ethers.id('transfer-invalid-1');

      await expect(
        bridge.connect(executor).executeCrossChainTransfer(transferId, ethers.ZeroAddress, ethers.parseEther('1.0'))
      ).to.be.revertedWithCustomError(bridge, 'InvalidRecipient');

      await expect(
        bridge.connect(executor).executeCrossChainTransfer(transferId, recipient.address, 0)
      ).to.be.revertedWithCustomError(bridge, 'InvalidAmount');
    });

    it('enforces idempotency and rejects duplicate cross-chain transfer execution', async function () {
      const transferId = ethers.id('transfer-idempotent-1');
      const amount = ethers.parseEther('5.0');

      await bridge.connect(executor).executeCrossChainTransfer(transferId, recipient.address, amount);
      expect(await bridge.executedTransfers(transferId)).to.be.true;

      // Duplicate attempt should revert and emit diagnostic evidence
      await expect(
        bridge.connect(executor).executeCrossChainTransfer(transferId, recipient.address, amount)
      )
        .to.emit(bridge, 'ExecutionAttemptRejected')
        .withArgs(transferId, executor.address, 'Transfer already executed');
    });
  });

  describe('Role revocation behavior and verification', function () {
    it('successfully revokes EXECUTOR_ROLE, immediately disallowing execution', async function () {
      const transferId1 = ethers.id('transfer-before-revoke');
      const amount = ethers.parseEther('2.0');

      // Before revocation: execution succeeds
      await bridge.connect(executor).executeCrossChainTransfer(transferId1, recipient.address, amount);
      expect(await bridge.executedTransfers(transferId1)).to.be.true;

      // Admin revokes EXECUTOR_ROLE
      await bridge.connect(admin).revokeRole(EXECUTOR_ROLE, executor.address);
      expect(await bridge.hasRole(EXECUTOR_ROLE, executor.address)).to.be.false;

      // After revocation: execution immediately reverts
      const transferId2 = ethers.id('transfer-after-revoke');
      await expect(
        bridge.connect(executor).executeCrossChainTransfer(transferId2, recipient.address, amount)
      ).to.be.revertedWithCustomError(bridge, 'AccessControlUnauthorizedAccount');
    });

    it('allows operators to verify role revocation and emits diagnostic evidence', async function () {
      // Revoke role
      await bridge.connect(admin).revokeRole(EXECUTOR_ROLE, executor.address);

      // Operator verifies revocation
      await expect(bridge.connect(operator).verifyRoleRevocation(EXECUTOR_ROLE, executor.address))
        .to.emit(bridge, 'RoleRevocationVerified')
        .withArgs(EXECUTOR_ROLE, executor.address, operator.address);
    });

    it('reverts verifyRoleRevocation if the role is still active (not revoked)', async function () {
      // Role is still active for executor
      await expect(
        bridge.connect(operator).verifyRoleRevocation(EXECUTOR_ROLE, executor.address)
      )
        .to.be.revertedWithCustomError(bridge, 'RoleNotRevoked')
        .withArgs(EXECUTOR_ROLE, executor.address);
    });

    it('rejects unauthorized accounts from invoking verifyRoleRevocation', async function () {
      await bridge.connect(admin).revokeRole(EXECUTOR_ROLE, executor.address);

      await expect(
        bridge.connect(attacker).verifyRoleRevocation(EXECUTOR_ROLE, executor.address)
      ).to.be.revertedWithCustomError(bridge, 'AccessControlUnauthorizedAccount');
    });
  });

  describe('Upgrade implications and storage safety', function () {
    it('preserves access control roles, verified state, and transfer records across UUPS upgrade', async function () {
      const transferId = ethers.id('transfer-pre-upgrade');
      const amount = ethers.parseEther('15.0');

      await bridge.connect(executor).executeCrossChainTransfer(transferId, recipient.address, amount);
      expect(await bridge.executedTransfers(transferId)).to.be.true;

      // Upgrade to V2 implementation
      const BridgeV2 = await ethers.getContractFactory('BridgeCoreAccessControl');
      const upgradedBridge = await upgrades.upgradeProxy(await bridge.getAddress(), BridgeV2);

      // Verify state preservation
      expect(await upgradedBridge.chainId()).to.equal(1n);
      expect(await upgradedBridge.executedTransfers(transferId)).to.be.true;
      expect(await upgradedBridge.hasRole(EXECUTOR_ROLE, executor.address)).to.be.true;
      expect(await upgradedBridge.hasRole(OPERATOR_ROLE, operator.address)).to.be.true;
    });

    it('rejects non-admin accounts from executing upgrades', async function () {
      const BridgeV2 = await ethers.getContractFactory('BridgeCoreAccessControl');
      await expect(
        upgrades.upgradeProxy(await bridge.getAddress(), BridgeV2.connect(attacker))
      ).to.be.revertedWithCustomError(bridge, 'AccessControlUnauthorizedAccount');
    });
  });
});
