import { expect } from 'chai';
import hre from 'hardhat';

const TRANSFER_SELECTOR = '0xa9059cbb';

const CHAIN_PROFILES = [
  { chainId: 1, name: 'ethereum', confirmations: 2, maxAge: 600 },
  { chainId: 137, name: 'polygon', confirmations: 3, maxAge: 300 },
  { chainId: 42161, name: 'arbitrum', confirmations: 1, maxAge: 120 },
  { chainId: 148, name: 'stellar-evm-bridge', confirmations: 4, maxAge: 900 },
];

describe('SignerPolicy — chain profiles and token behavior', () => {
  let ethers: any;
  let networkHelpers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    networkHelpers = connection.networkHelpers;
    await networkHelpers.mine(8);
  });

  function id(n: number): string {
    return ethers.zeroPadValue(ethers.toBeHex(n), 32);
  }

  async function deploy() {
    const [admin, executor, signer, recipient] = await ethers.getSigners();
    const PolicyFactory = await ethers.getContractFactory('SignerPolicy');
    const policy = await PolicyFactory.deploy(
      admin.address,
      CHAIN_PROFILES.map((profile) => profile.chainId),
      CHAIN_PROFILES.map((profile) => ({
        enabled: true,
        requiredConfirmations: profile.confirmations,
        maxSimulationAge: profile.maxAge,
      })),
    );
    await policy.waitForDeployment();

    const ExecutorFactory =
      await ethers.getContractFactory('MockPolicyExecutor');
    const executorContract = await ExecutorFactory.deploy(
      await policy.getAddress(),
    );
    await executorContract.waitForDeployment();

    const TokenFactory = await ethers.getContractFactory('MockPolicyToken');
    const token = await TokenFactory.deploy(signer.address, 1000n);
    await token.waitForDeployment();

    await policy
      .connect(admin)
      .setExecutor(await executorContract.getAddress(), true);
    await policy.connect(admin).setSigner(signer.address, true);
    await policy.connect(admin).allowMethod(signer.address, TRANSFER_SELECTOR);
    await token
      .connect(signer)
      .transfer(await executorContract.getAddress(), 500n);
    return {
      policy,
      executorContract,
      token,
      admin,
      executor,
      signer,
      recipient,
    };
  }

  async function record(
    policy: any,
    admin: any,
    signer: any,
    token: any,
    chainId: number,
    operationId: string,
  ) {
    const currentBlock = await ethers.provider.getBlockNumber();
    const latest = await ethers.provider.getBlock('latest');
    const required = Number(
      (await policy.chainConfig(chainId)).requiredConfirmations,
    );
    await policy
      .connect(admin)
      .recordSimulation(
        operationId,
        signer.address,
        chainId,
        await token.getAddress(),
        TRANSFER_SELECTOR,
        id(5000),
        currentBlock - required,
        latest.timestamp,
        required,
      );
  }

  function transferCalldata(token: any, recipient: string, amount: bigint) {
    return token.interface.encodeFunctionData('transfer', [recipient, amount]);
  }

  it('enforces the policy before moving tokens on every supported chain profile', async () => {
    const fixture = await deploy();
    const { policy, executorContract, token, admin, signer, recipient } =
      fixture;
    const tokenAddress = await token.getAddress();
    const data = transferCalldata(token, recipient.address, 100n);

    for (let i = 0; i < CHAIN_PROFILES.length; i++) {
      const profile = CHAIN_PROFILES[i];
      const operationId = id(100 + i);
      await policy
        .connect(admin)
        .allowDestination(signer.address, profile.chainId, tokenAddress);
      await record(policy, admin, signer, token, profile.chainId, operationId);

      const before = await token.balanceOf(recipient.address);
      const receipt = await (
        await executorContract.execute(
          operationId,
          signer.address,
          profile.chainId,
          tokenAddress,
          TRANSFER_SELECTOR,
          id(5000),
          tokenAddress,
          data,
        )
      ).wait();
      expect(await token.balanceOf(recipient.address)).to.equal(before + 100n);
      expect(await policy.totalAuthorized()).to.equal(BigInt(i + 1));
      console.log(
        `      [chain ${profile.name}] gas for gated token transfer: ${receipt!.gasUsed.toString()}`,
      );

      await expect(
        executorContract.execute(
          operationId,
          signer.address,
          profile.chainId,
          tokenAddress,
          TRANSFER_SELECTOR,
          id(5000),
          tokenAddress,
          data,
        ),
      ).to.be.revertedWithCustomError(policy, 'MessageReplayed');
      expect(await token.balanceOf(recipient.address)).to.equal(before + 100n);
      expect(await policy.totalAuthorized()).to.equal(BigInt(i + 1));
    }
  });

  it('leaves no partial state change when the underlying token transfer reverts, and allows retry', async () => {
    const fixture = await deploy();
    const { policy, executorContract, token, admin, signer, recipient } =
      fixture;
    const tokenAddress = await token.getAddress();
    const operationId = id(200);
    await policy
      .connect(admin)
      .allowDestination(signer.address, 1, tokenAddress);
    await record(policy, admin, signer, token, 1, operationId);

    const tooMuch = transferCalldata(token, recipient.address, 1001n);
    await expect(
      executorContract.execute(
        operationId,
        signer.address,
        1,
        tokenAddress,
        TRANSFER_SELECTOR,
        id(5000),
        tokenAddress,
        tooMuch,
      ),
    ).to.be.revertedWith('insufficient balance');
    expect(await token.balanceOf(recipient.address)).to.equal(0n);
    expect(await policy.totalAuthorized()).to.equal(0n);
    expect((await policy.simulationFor(operationId)).consumed).to.equal(false);

    await token.connect(signer).transfer(recipient.address, 200n);
    const data = transferCalldata(token, recipient.address, 100n);
    await expect(
      executorContract.execute(
        operationId,
        signer.address,
        1,
        tokenAddress,
        TRANSFER_SELECTOR,
        id(5000),
        tokenAddress,
        data,
      ),
    ).to.emit(policy, 'AuthorizationGranted');
    expect(await policy.totalAuthorized()).to.equal(1n);
    expect(await token.balanceOf(recipient.address)).to.equal(300n);
  });

  it('fails closed on a chain reorganization or partial unavailability', async () => {
    const fixture = await deploy();
    const { policy, executorContract, token, admin, signer, recipient } =
      fixture;
    const tokenAddress = await token.getAddress();
    const data = transferCalldata(token, recipient.address, 50n);

    const currentBlock = await ethers.provider.getBlockNumber();
    const latest = await ethers.provider.getBlock('latest');
    await policy
      .connect(admin)
      .allowDestination(signer.address, 1, tokenAddress);
    await policy.connect(admin).setChainConfig(1, {
      enabled: true,
      requiredConfirmations: 50,
      maxSimulationAge: 600,
    });
    await policy
      .connect(admin)
      .recordSimulation(
        id(300),
        signer.address,
        1,
        tokenAddress,
        TRANSFER_SELECTOR,
        id(5000),
        currentBlock,
        latest.timestamp,
        50,
      );

    await expect(
      executorContract.execute(
        id(300),
        signer.address,
        1,
        tokenAddress,
        TRANSFER_SELECTOR,
        id(5000),
        tokenAddress,
        data,
      ),
    ).to.be.revertedWithCustomError(policy, 'ConfirmationsNotMet');
    expect(await token.balanceOf(recipient.address)).to.equal(0n);

    await policy.connect(admin).setChainConfig(1, {
      enabled: false,
      requiredConfirmations: 2,
      maxSimulationAge: 600,
    });
    await networkHelpers.mine(3);
    await expect(
      executorContract.execute(
        id(300),
        signer.address,
        1,
        tokenAddress,
        TRANSFER_SELECTOR,
        id(5000),
        tokenAddress,
        data,
      ),
    ).to.be.revertedWithCustomError(policy, 'ChainDisabled');
    expect(await token.balanceOf(recipient.address)).to.equal(0n);
    expect(await policy.totalAuthorized()).to.equal(0n);
  });
});
