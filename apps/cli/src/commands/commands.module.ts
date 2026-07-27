import { HistoryCommand } from './history.command';
import { LiquidityCommand } from './liquidity.command';
import { CongestionCommand } from './congestion.command';
import { CompareCommand } from './compare.command';
import { StatusCommand } from './status.command';
import { HelpCommand } from './help.command';
import { CommandRunner } from './command-runner';

declare const require: any;

let ModuleDecorator: any;
try {
  ModuleDecorator = require('@nestjs/common').Module;
} catch {
  ModuleDecorator = (options: any) => (target: any) => target;
}

@ModuleDecorator({
  providers: [
    HistoryCommand,
    LiquidityCommand,
    CongestionCommand,
    CompareCommand,
    StatusCommand,
    HelpCommand,
    CommandRunner,
  ],
  exports: [
    HistoryCommand,
    LiquidityCommand,
    CongestionCommand,
    CompareCommand,
    StatusCommand,
    HelpCommand,
    CommandRunner,
  ],
})
export class CommandsModule {}
