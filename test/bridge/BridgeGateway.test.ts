import { expect } from "chai";
import hre from "hardhat";

describe("BridgeGateway", () => {
  let ethers: any;
  let RECIPIENT: string;

  let owner: any;
  let user: any;
  let token: any;
  let wrappedToken: any;
  let srcGateway: any;
  let dstGateway: any;

  const SRC_CHAIN_ID = 1;
  const DST_CHAIN_ID = 2;
  const AMOUNT = 100n * 10n ** 18n;
  const RECIPIENT_BYTES32 = "0x" + "ab".repeat(32);
  const MSG_HASH = "0x" + "cd".repeat(32);

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    RECIPIENT = ethers.zeroPadValue("0xabcdef", 32);
  });

  const DEST_CHAIN = 1;
  const INITIAL_MINT = () => ethers.parseUnits("1000", 18);

  async function deploy() {
    const [admin, user, other] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("MockERC20");
    const token = await TokenFactory.deploy("Mock Token", "MOCK");
    await token.waitForDeployment();
    await token.mint(user.address, INITIAL_MINT());

    const VaultFactory = await ethers.getContractFactory("MockBridgeVault");
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();

    const GatewayFactory = await ethers.getContractFactory("BridgeGateway");
    const gateway = await GatewayFactory.deploy(await vault.getAddress(), admin.address);
    await gateway.waitForDeployment();

    await token.connect(user).approve(await gateway.getAddress(), ethers.MaxUint256);

    return { gateway, vault, token, admin, user, other };
  }

  describe("setMaxDepositLimit", () => {
    it("allows admin to set and update a token's cap dynamically", async () => {
      const { gateway, token, admin } = await deploy();
      const tokenAddr = await token.getAddress();

      await expect(gateway.connect(admin).setMaxDepositLimit(tokenAddr, 100))
        .to.emit(gateway, "MaxDepositLimitSet")
        .withArgs(tokenAddr, 100);
      expect(await gateway.maxDepositLimit(tokenAddr)).to.equal(100);

      await expect(gateway.connect(admin).setMaxDepositLimit(tokenAddr, 500))
        .to.emit(gateway, "MaxDepositLimitSet")
        .withArgs(tokenAddr, 500);
      expect(await gateway.maxDepositLimit(tokenAddr)).to.equal(500);
    });

    it("rejects non-admin callers", async () => {
      const { gateway, token, other } = await deploy();
      const tokenAddr = await token.getAddress();

      await expect(
        gateway.connect(other).setMaxDepositLimit(tokenAddr, 100)
      ).to.be.revertedWithCustomError(gateway, "AccessControlUnauthorizedAccount");
    });

    it("rejects the zero token address", async () => {
      const { gateway, admin } = await deploy();

      await expect(
        gateway.connect(admin).setMaxDepositLimit(ethers.ZeroAddress, 100)
      ).to.be.revertedWithCustomError(gateway, "ZeroAddress");
    });
  });

  describe("deposit", () => {
    it("reverts with DepositExceedsLimit when amount exceeds the configured cap", async () => {
      const { gateway, token, admin, user } = await deploy();
      const tokenAddr = await token.getAddress();
      const cap = ethers.parseUnits("100", 18);
      await gateway.connect(admin).setMaxDepositLimit(tokenAddr, cap);

      const amount = ethers.parseUnits("101", 18);
      await expect(
        gateway.connect(user).deposit(tokenAddr, amount, DEST_CHAIN, RECIPIENT)
      )
        .to.be.revertedWithCustomError(gateway, "DepositExceedsLimit")
        .withArgs(amount, cap);
    });

    it("allows a deposit exactly at the cap", async () => {
      const { gateway, vault, token, admin, user } = await deploy();
      const tokenAddr = await token.getAddress();
      const cap = ethers.parseUnits("100", 18);
      await gateway.connect(admin).setMaxDepositLimit(tokenAddr, cap);

      await gateway.connect(user).deposit(tokenAddr, cap, DEST_CHAIN, RECIPIENT);
      expect(await vault.recordCount()).to.equal(1n);
    });

    it("allows deposits of any size when no cap has been configured (limit == 0)", async () => {
      const { gateway, vault, token, user } = await deploy();
      const tokenAddr = await token.getAddress();
      const amount = ethers.parseUnits("999", 18);

      await gateway.connect(user).deposit(tokenAddr, amount, DEST_CHAIN, RECIPIENT);
      expect(await vault.recordCount()).to.equal(1n);
    });

    it("forwards tokens to the vault and calls lock() with the right arguments", async () => {
      const { gateway, vault, token, user } = await deploy();
      const tokenAddr = await token.getAddress();
      const vaultAddr = await vault.getAddress();
      const amount = ethers.parseUnits("50", 18);

      await gateway.connect(user).deposit(tokenAddr, amount, DEST_CHAIN, RECIPIENT);

      expect(await token.balanceOf(vaultAddr)).to.equal(amount);
      expect(await vault.recordCount()).to.equal(1n);

      const record = await vault.records(0);
      expect(record.destinationChainId).to.equal(DEST_CHAIN);
      expect(record.token).to.equal(tokenAddr);
      expect(record.amount).to.equal(amount);
      expect(record.recipient).to.equal(RECIPIENT);
    });

    it("emits DepositLocked", async () => {
      const { gateway, token, user } = await deploy();
      const tokenAddr = await token.getAddress();
      const amount = ethers.parseUnits("10", 18);

      await expect(gateway.connect(user).deposit(tokenAddr, amount, DEST_CHAIN, RECIPIENT))
        .to.emit(gateway, "DepositLocked")
        .withArgs(tokenAddr, user.address, amount, DEST_CHAIN, RECIPIENT);
    });

    it("reverts on zero amount", async () => {
      const { gateway, token, user } = await deploy();
      const tokenAddr = await token.getAddress();

      await expect(
        gateway.connect(user).deposit(tokenAddr, 0, DEST_CHAIN, RECIPIENT)
      ).to.be.revertedWithCustomError(gateway, "ZeroAmount");
    });

    it("reverts on zero token address", async () => {
      const { gateway, user } = await deploy();

      await expect(
        gateway.connect(user).deposit(ethers.ZeroAddress, 1, DEST_CHAIN, RECIPIENT)
      ).to.be.revertedWithCustomError(gateway, "ZeroAddress");
    });
  });

  describe("constructor", () => {
    it("rejects a zero vault address", async () => {
      const [admin] = await ethers.getSigners();
      const GatewayFactory = await ethers.getContractFactory("BridgeGateway");
      await expect(
        GatewayFactory.deploy(ethers.ZeroAddress, admin.address)
      ).to.be.revertedWithCustomError(GatewayFactory, "ZeroAddress");
    });

    it("rejects a zero admin address", async () => {
      const VaultFactory = await ethers.getContractFactory("MockBridgeVault");
      const vault = await VaultFactory.deploy();
      await vault.waitForDeployment();

      const GatewayFactory = await ethers.getContractFactory("BridgeGateway");
      await expect(
        GatewayFactory.deploy(await vault.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(GatewayFactory, "ZeroAddress");
    });
  });
});
