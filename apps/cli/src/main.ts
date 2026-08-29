#!/usr/bin/env node
import { HistoryCommand } from './commands/history.command';
import { LiquidityCommand } from './commands/liquidity.command';
import { CongestionCommand } from './commands/congestion.command';
import { CompareCommand } from './commands/compare.command';
import { StatusCommand } from './commands/status.command';
import { HelpCommand } from './commands/help.command';
import { CheckInvariantsCommand } from './commands/check-invariants.command';
import { InvariantsCommand } from './commands/invariants.command';
import { CommandRunner } from './commands/command-runner';

declare const process: { argv: string[]; exit(code?: number): void };
declare const require: { main: any };
declare const module: any;

async function bootstrap(): Promise<string> {
  const historyCommand = new HistoryCommand();
  const liquidityCommand = new LiquidityCommand();
  const congestionCommand = new CongestionCommand();
  const compareCommand = new CompareCommand();
  const statusCommand = new StatusCommand();
  const helpCommand = new HelpCommand();
  const checkInvariantsCommand = new CheckInvariantsCommand();
  const invariantsCommand = new InvariantsCommand();

  const runner = new CommandRunner(
    historyCommand,
    liquidityCommand,
    congestionCommand,
    compareCommand,
    statusCommand,
    helpCommand,
    checkInvariantsCommand,
    invariantsCommand,
  );
  runner.onModuleInit();

  const output = await runner.run(process.argv);
  console.log(output);

  // For CI/CD integration: exit with code 1 when the check-invariants command
  // detects violations (fail-on-violations defaults to true). Parse the JSON
  // output to determine exit code when the command ran with violations.
  const { commandName } = runner.parseArgv(process.argv);
  if (commandName === 'check-invariants' || commandName === 'invariants' || commandName === 'verify-invariants') {
    try {
      const result = JSON.parse(output);
      if (result && result.success === false) {
        process.exit(1);
      }
    } catch {
      // Not JSON output; try text-based detection
      if (output.startsWith('[ERROR]')) {
        process.exit(1);
      }
    }
  }

  return output;
}

if (typeof require !== 'undefined' && require.main === module) {
  bootstrap().catch((err) => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
  });
}

export { bootstrap };
