#!/usr/bin/env node
import { HistoryCommand } from './commands/history.command';
import { LiquidityCommand } from './commands/liquidity.command';
import { CongestionCommand } from './commands/congestion.command';
import { CompareCommand } from './commands/compare.command';
import { StatusCommand } from './commands/status.command';
import { HelpCommand } from './commands/help.command';
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

  const runner = new CommandRunner(
    historyCommand,
    liquidityCommand,
    congestionCommand,
    compareCommand,
    statusCommand,
    helpCommand,
  );
  runner.onModuleInit();

  const output = await runner.run(process.argv);
  console.log(output);
  return output;
}

if (typeof require !== 'undefined' && require.main === module) {
  bootstrap().catch((err) => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
  });
}

export { bootstrap };
