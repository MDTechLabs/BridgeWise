# Pull Request Documentation

**PR Title:**
`feat(cli): implement multi-chain bridge command system for BridgeWise CLI`

**PR Description:**
```markdown
## Description
Implements a multi-command CLI application for BridgeWise under `apps/cli/src/commands/`. This package provides command-line tools for querying transaction history across Stellar and EVM chains, checking cross-bridge token liquidity, monitoring Stellar route congestion, comparing cross-chain bridge routes, and checking blockchain network health.

## Changes Made
- **CLI Package Infrastructure**: Created `apps/cli/package.json`, `tsconfig.json`, `jest.config.js`, and `main.ts` executable binary entry point.
- **Command Dispatcher & Core System**:
  - `apps/cli/src/commands/types.ts`: Defined `CLICommand`, `CommandDefinition`, `CommandResult`, and `ParsedOptions` interfaces.
  - `apps/cli/src/commands/command-runner.ts`: Implemented argument parser, option mapper, command dispatcher, and JSON/Text output formatter.
  - `apps/cli/src/commands/commands.module.ts`: Provided NestJS module encapsulating CLI command services.
- **CLI Command Modules**:
  - `HistoryCommand` (`history`): Queries multi-chain transaction history for Stellar and EVM accounts (`--account`, `--status`, `--sort`, `--limit`).
  - `LiquidityCommand` (`liquidity`): Evaluates token liquidity across source and destination chains to verify transfer route viability (`--token`, `--sourceChain`, `--destinationChain`, `--amount`).
  - `CongestionCommand` (`congestion`): Monitors Stellar bridge route metrics (latency, failure rate, queue depth, throughput, pending transactions) and generates severity alerts (`--route`, `--latencyMs`, `--failureRate`).
  - `CompareCommand` (`compare`): Compares cross-chain bridge routes by cost, speed, liquidity, and score, surfacing recommended paths (`--sourceChain`, `--destinationChain`, `--token`, `--amount`).
  - `StatusCommand` (`status`): Checks operational status and health metrics for target blockchain networks (`--chainId`, `--chainName`).
  - `HelpCommand` (`help`): Formats usage instructions, option flags, and descriptions.
- **Testing & Verification**:
  - Added unit test suite in `apps/cli/src/commands/__tests__/` covering argument parsing, execution logic, error handling, and output formatting.
  - Verified 13/13 passing unit tests and zero-error TypeScript build.

## Acceptance Criteria Met
- [x] Implemented CLI commands module under `apps/cli/src/commands/`.
- [x] Multi-chain transaction history, liquidity monitoring, congestion monitoring, route comparison, and network status commands supported.
- [x] Configurable `--format json` and human-readable text output modes.
- [x] Comprehensive unit tests created and passing.
```
