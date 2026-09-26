// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title RebalancingVault
 * @notice Tracks per-network liquidity reserves against target ratios, emits a
 *         rebalancing signal when skew exceeds the configured threshold, and
 *         pays keeper incentives for executing cross-chain rebalance transfers.
 */
contract RebalancingVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant SKEW_THRESHOLD_BPS = 3_000; // >30%

    uint256 public keeperRewardBps = 50; // 0.5% default, owner-configurable, capped at 10%

    IERC20 public immutable asset;

    struct NetworkPool {
        uint256 reserve;         // tracked reserve for this network
        uint256 targetRatioBps;  // target share of total liquidity (bps)
        bool supported;
    }

    mapping(uint256 => NetworkPool) public pools;
    uint256[] public supportedNetworks;
    uint256 public totalReserves;
    uint256 public keeperRewardPool;

    event NetworkAdded(uint256 indexed networkId, uint256 targetRatioBps);
    event TargetRatioUpdated(uint256 indexed networkId, uint256 oldRatioBps, uint256 newRatioBps);
    event ReserveUpdated(uint256 indexed networkId, uint256 oldReserve, uint256 newReserve);
    event RebalanceSignal(uint256 indexed networkId, uint256 currentRatioBps, uint256 targetRatioBps, uint256 skewBps);
    event RebalanceExecuted(uint256 indexed fromNetwork, uint256 indexed toNetwork, uint256 amount, address indexed keeper, uint256 reward);
    event KeeperRewardPoolFunded(uint256 amount);
    event KeeperRewardBpsUpdated(uint256 oldBps, uint256 newBps);

    error NetworkNotSupported(uint256 networkId);
    error NetworkAlreadySupported(uint256 networkId);
    error InvalidRatio();
    error InsufficientReserve(uint256 networkId, uint256 requested, uint256 available);
    error InsufficientRewardPool();
    error ZeroAmount();

    constructor(address _asset) Ownable(msg.sender) {
        require(_asset != address(0), "asset=0");
        asset = IERC20(_asset);
    }

    // ------------------------------------------------------------------
    // Admin: network + ratio configuration
    // ------------------------------------------------------------------

    function addNetwork(uint256 networkId, uint256 targetRatioBps) external onlyOwner {
        if (pools[networkId].supported) revert NetworkAlreadySupported(networkId);
        if (targetRatioBps == 0 || targetRatioBps > BPS_DENOMINATOR) revert InvalidRatio();

        pools[networkId] = NetworkPool({reserve: 0, targetRatioBps: targetRatioBps, supported: true});
        supportedNetworks.push(networkId);

        emit NetworkAdded(networkId, targetRatioBps);
    }

    function setTargetRatio(uint256 networkId, uint256 newRatioBps) external onlyOwner {
        NetworkPool storage pool = pools[networkId];
        if (!pool.supported) revert NetworkNotSupported(networkId);
        if (newRatioBps == 0 || newRatioBps > BPS_DENOMINATOR) revert InvalidRatio();

        uint256 old = pool.targetRatioBps;
        pool.targetRatioBps = newRatioBps;

        emit TargetRatioUpdated(networkId, old, newRatioBps);
    }

    function setKeeperRewardBps(uint256 newBps) external onlyOwner {
        require(newBps <= 1_000, "reward too high"); // 10% cap
        uint256 old = keeperRewardBps;
        keeperRewardBps = newBps;
        emit KeeperRewardBpsUpdated(old, newBps);
    }

    // ------------------------------------------------------------------
    // Reserve tracking
    // ------------------------------------------------------------------

    /**
     * @notice Reports the latest reserve for a network (e.g. from the relayer
     *         service after a bridge tx settles). Recomputes skew and emits
     *         a RebalanceSignal if the network is out of bounds.
     */
    function updateReserve(uint256 networkId, uint256 newReserve) external onlyOwner {
        NetworkPool storage pool = pools[networkId];
        if (!pool.supported) revert NetworkNotSupported(networkId);

        uint256 old = pool.reserve;
        totalReserves = totalReserves - old + newReserve;
        pool.reserve = newReserve;

        emit ReserveUpdated(networkId, old, newReserve);

        _checkAndEmitSkew(networkId);
    }

    function currentRatioBps(uint256 networkId) public view returns (uint256) {
        if (totalReserves == 0) return 0;
        return (pools[networkId].reserve * BPS_DENOMINATOR) / totalReserves;
    }

    function skewBps(uint256 networkId) public view returns (uint256) {
        uint256 current = currentRatioBps(networkId);
        uint256 target = pools[networkId].targetRatioBps;
        return current >= target ? current - target : target - current;
    }

    function isSkewed(uint256 networkId) public view returns (bool) {
        return skewBps(networkId) > SKEW_THRESHOLD_BPS;
    }

    function _checkAndEmitSkew(uint256 networkId) internal {
        uint256 skew = skewBps(networkId);
        if (skew > SKEW_THRESHOLD_BPS) {
            emit RebalanceSignal(networkId, currentRatioBps(networkId), pools[networkId].targetRatioBps, skew);
        }
    }

    // ------------------------------------------------------------------
    // Keeper incentives + rebalance execution
    // ------------------------------------------------------------------

    function fundKeeperRewardPool(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        asset.safeTransferFrom(msg.sender, address(this), amount);
        keeperRewardPool += amount;
        emit KeeperRewardPoolFunded(amount);
    }

    /**
     * @notice Called by a keeper to rebalance liquidity from an overweight
     *         network to an underweight one. Updates accounting reserves,
     *         sends the principal + reward to the keeper (who bridges the
     *         principal on to `toNetwork`), and pays out of the reward pool.
     */
    function executeRebalance(
        uint256 fromNetwork,
        uint256 toNetwork,
        uint256 amount
    ) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        NetworkPool storage from = pools[fromNetwork];
        NetworkPool storage to = pools[toNetwork];
        if (!from.supported) revert NetworkNotSupported(fromNetwork);
        if (!to.supported) revert NetworkNotSupported(toNetwork);
        if (from.reserve < amount) revert InsufficientReserve(fromNetwork, amount, from.reserve);

        require(currentRatioBps(fromNetwork) > from.targetRatioBps, "source not overweight");
        require(currentRatioBps(toNetwork) < to.targetRatioBps, "destination not underweight");

        uint256 reward = (amount * keeperRewardBps) / BPS_DENOMINATOR;
        if (reward > keeperRewardPool) revert InsufficientRewardPool();

        from.reserve -= amount;
        to.reserve += amount;
        keeperRewardPool -= reward;

        asset.safeTransfer(msg.sender, amount + reward);

        emit RebalanceExecuted(fromNetwork, toNetwork, amount, msg.sender, reward);

        _checkAndEmitSkew(fromNetwork);
        _checkAndEmitSkew(toNetwork);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function getSupportedNetworks() external view returns (uint256[] memory) {
        return supportedNetworks;
    }

    function getPool(uint256 networkId) external view returns (uint256 reserve, uint256 targetRatioBps, bool supported) {
        NetworkPool storage pool = pools[networkId];
        return (pool.reserve, pool.targetRatioBps, pool.supported);
    }
}