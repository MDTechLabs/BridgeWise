# Oracle Decimal Scaling and Precision Configuration Specification

- **Workstream**: Oracle, Liquidity and Asset Risk
- **Repository**: `MDTechLabs/BridgeWise`
- **Specification Version**: `1.0.0`
- **Applicable Issue**: #1477 (Validate oracle decimal scaling and precision at configuration time)
- **Status**: Normative / Production Hardened

---

## 1. Executive Summary & Objectives

Cross-chain bridge contracts rely on price oracles (such as Chainlink aggregators, Uniswap V3 TWAP pools, and aggregated multi-oracles) to calculate asset valuations, enforce high-value dual-oracle gates, determine slippage tolerance, and compute dynamic bridge protocol fees.

A catastrophic vulnerability arises if oracle adapters or aggregators accept invalid, out-of-range, uninitialized, or mismatched decimal scaling and precision configurations at deployment or configuration time. Specifically:
1. **Decimal Truncation & Division Loss**: Adapters configured with $> 18$ decimals require division when scaling to standard 18-decimal precision, discarding significant digits and allowing attackers to understate transfer value.
2. **Zero-Decimal Misconfigurations**: Aggregators configured with 0 decimals cannot represent fractional unit valuations, creating integer truncation vulnerabilities.
3. **Uninitialized or Broken Feeds**: Aggregators deployed pointing to uninitialized round sequences (`roundId == 0`, `answeredInRound < roundId`, or `answer <= 0`) cause in-flight transfers to revert or deadlock.
4. **Mismatched TWAP Decimal Adjustment**: Uniswap V3 pools with improper `decimalAdjustment` ($\Delta d = d_0 - d_1$) produce orders-of-magnitude mispricing or overflow when raised to fractional powers.
5. **Divergent Dual Feeds at Configuration**: Configuring multi-oracles whose initial feed prices disagree beyond `maxDeviationBps` indicates immediate oracle corruption or mispairing.

This specification establishes normative, configuration-time validation for all price oracle adapters, aggregators, and decimal normalizers.

---

## 2. Normative Invariants

| Invariant ID | Name | Description |
| :--- | :--- | :--- |
| `OD-1` | **Bounded Decimal Range** | Every oracle adapter feed must have decimals $d \in [1, 18]$. Feeds with 0 or $> 18$ decimals are rejected at configuration time. |
| `OD-2` | **Configuration Liveness Probe** | Oracle contracts and adapters must probe underlying feeds at configuration time (`latestRoundData()` / `latestPrice()`), ensuring non-zero positive prices and settled rounds. |
| `OD-3` | **Exact 18-Decimal Normalization** | All oracle adapters conforming to `IPriceOracle` must output prices strictly normalized to 18 decimal places ($\text{price} \times 10^{18 - d}$). |
| `OD-4` | **Precision Underflow Protection** | Configuration-time validation enforces minimum price precision ($\ge \text{minPricePrecision}$) and maximum price limits to prevent underflow or overflow in downstream math. |
| `OD-5` | **Initial Pair Agreement Check** | When configuring multi-oracles, primary and fallback feeds must be active, fresh, and agree within `maxDeviationBps` at configuration time. |
| `OD-6` | **Bounded TWAP Decimal Adjustment** | For TWAP oracles, `decimalAdjustment` must be strictly bounded in $[-18, 18]$, preventing exponentiation and scaling overflow. |

---

## 3. Scope & System Architecture

### Affected Contracts and Components
- `contracts/oracle/ChainlinkPriceOracle.sol`: Validates aggregator address, decimal bounds ($1 \le d \le 18$), and probes initial round data at deployment.
- `contracts/oracle/UniswapV3TwapOracle.sol`: Validates pool address, bounded `decimalAdjustment`, and probes observe ticks.
- `contracts/oracle/BridgeMultiOracle.sol`: Configuration-time validation of oracle addresses, freshness, precision, and initial agreement.
- `scripts/oracle-precision-scaling.ts`: Executable reference model for oracle decimal scaling and precision verification.
- `scripts/oracle-precision-scaling.spec.ts`: Test suite verifying boundary, adversarial, and valid oracle configuration scenarios.

### Authorization Boundaries
- **DEFAULT_ADMIN_ROLE / Owner**: Only authorized owner/governance accounts may set or update oracle feeds.
- **Untrusted Feeds & Relayers**: Inputs from RPCs, oracles, or relayer reports must never bypass validation.

---

## 4. Versioned Chain Profiles

| Chain Identifier | Name | Standard Price Decimals | Max Feed Decimals | Min Supported Price ($10^{18}$) | Max Price Age | Parameter Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `evm:1` | Ethereum Mainnet | 18 | 18 | $10^6$ ($0.000001) | 3600s | `oracle-risk/1.0.0` |
| `evm:137` | Polygon PoS | 18 | 18 | $10^6$ ($0.000001) | 1800s | `oracle-risk/1.0.0` |
| `evm:56` | BNB Smart Chain | 18 | 18 | $10^6$ ($0.000001) | 1800s | `oracle-risk/1.0.0` |
| `evm:42161` | Arbitrum One | 18 | 18 | $10^6$ ($0.000001) | 3600s | `oracle-risk/1.0.0` |
| `evm:10` | OP Mainnet | 18 | 18 | $10^6$ ($0.000001) | 3600s | `oracle-risk/1.0.0` |
| `evm:8453` | Base | 18 | 18 | $10^6$ ($0.000001) | 3600s | `oracle-risk/1.0.0` |
| `soroban:stellar` | Stellar Soroban | 18 | 18 | $10^6$ ($0.000001) | 300s | `oracle-risk/1.0.0` |

---

## 5. Security and Operational Guidelines

- **Adversarial Input Handling**: Non-positive, zero, stale, or future timestamps revert immediately.
- **Fail-Safe Behavior**: If an oracle configuration check fails, configuration transaction reverts atomically, leaving prior trusted configuration unchanged.
- **Emergency Recovery**: Governance may switch oracles via timelocked configuration changes after independent parameter verification.
