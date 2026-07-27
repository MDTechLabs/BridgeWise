import { CLICommand, CommandResult, Injectable, OutputFormat, ParsedOptions } from './types';
import { HistoryCommand } from './history.command';
import { LiquidityCommand } from './liquidity.command';
import { CongestionCommand } from './congestion.command';
import { CompareCommand } from './compare.command';
import { StatusCommand } from './status.command';
import { HelpCommand } from './help.command';

@Injectable()
export class CommandRunner {
  private readonly commandMap = new Map<string, CLICommand>();

  constructor(
    private readonly historyCommand: HistoryCommand,
    private readonly liquidityCommand: LiquidityCommand,
    private readonly congestionCommand: CongestionCommand,
    private readonly compareCommand: CompareCommand,
    private readonly statusCommand: StatusCommand,
    private readonly helpCommand: HelpCommand,
  ) {}

  onModuleInit() {
    this.registerCommands([
      this.historyCommand,
      this.liquidityCommand,
      this.congestionCommand,
      this.compareCommand,
      this.statusCommand,
      this.helpCommand,
    ]);

    const definitions = Array.from(this.commandMap.values())
      .map((cmd) => cmd.definition)
      .filter((def, index, self) => self.findIndex((d) => d.name === def.name) === index);

    this.helpCommand.setRegisteredCommands(definitions);
  }

  registerCommands(commands: CLICommand[]): void {
    for (const cmd of commands) {
      this.commandMap.set(cmd.definition.name.toLowerCase(), cmd);
      if (cmd.definition.aliases) {
        for (const alias of cmd.definition.aliases) {
          this.commandMap.set(alias.toLowerCase(), cmd);
        }
      }
    }
  }

  parseArgv(argv: string[]): { commandName: string; args: string[]; options: ParsedOptions; format: OutputFormat } {
    const raw = argv.slice(2); // Skip node and script paths if passed full process.argv
    const args: string[] = [];
    const options: ParsedOptions = {};
    let format: OutputFormat = 'text';

    let commandName = 'help';
    let i = 0;

    while (i < raw.length) {
      const token = raw[i];

      if (token.startsWith('--')) {
        const key = token.slice(2);
        if (key === 'format') {
          format = (raw[i + 1] === 'json' ? 'json' : 'text') as OutputFormat;
          i += 2;
          continue;
        }

        if (i + 1 < raw.length && !raw[i + 1].startsWith('-')) {
          options[key] = raw[i + 1];
          i += 2;
        } else {
          options[key] = true;
          i += 1;
        }
      } else if (token.startsWith('-')) {
        const key = token.slice(1);
        if (i + 1 < raw.length && !raw[i + 1].startsWith('-')) {
          options[key] = raw[i + 1];
          i += 2;
        } else {
          options[key] = true;
          i += 1;
        }
      } else {
        if (!commandName || commandName === 'help') {
          if (this.commandMap.has(token.toLowerCase()) || token.toLowerCase() === 'help') {
            commandName = token;
          } else if (args.length === 0 && !commandName) {
            commandName = token;
          } else {
            args.push(token);
          }
        } else {
          args.push(token);
        }
        i += 1;
      }
    }

    // Map short aliases (e.g. -a => options.account)
    if (commandName && this.commandMap.has(commandName.toLowerCase())) {
      const cmdDef = this.commandMap.get(commandName.toLowerCase())!.definition;
      if (cmdDef.options) {
        for (const optDef of cmdDef.options) {
          if (optDef.alias && options[optDef.alias] !== undefined && options[optDef.name] === undefined) {
            options[optDef.name] = options[optDef.alias];
          }
          if (options[optDef.name] === undefined && optDef.defaultValue !== undefined) {
            options[optDef.name] = optDef.defaultValue;
          }
        }
      }
    }

    return { commandName, args, options, format };
  }

  async run(argv: string[]): Promise<string> {
    const { commandName, args, options, format } = this.parseArgv(argv);
    const targetCmd = this.commandMap.get((commandName || 'help').toLowerCase());

    if (!targetCmd) {
      const errResult: CommandResult = {
        success: false,
        command: commandName,
        error: `Unknown command '${commandName}'. Run 'bridgewise help' for list of commands.`,
        timestamp: new Date().toISOString(),
      };
      return this.formatOutput(errResult, format);
    }

    try {
      const result = await targetCmd.execute(args, options);
      return this.formatOutput(result, format);
    } catch (err: any) {
      const errResult: CommandResult = {
        success: false,
        command: commandName,
        error: err?.message || 'Execution error encountered',
        timestamp: new Date().toISOString(),
      };
      return this.formatOutput(errResult, format);
    }
  }

  formatOutput(result: CommandResult, format: OutputFormat): string {
    if (format === 'json') {
      return JSON.stringify(result, null, 2);
    }

    if (!result.success) {
      return `[ERROR] (${result.command}): ${result.error || 'Command failed'}`;
    }

    if (typeof result.data === 'string') {
      return result.data;
    }

    let output = `[SUCCESS] (${result.command}): ${result.message || 'Operation complete'}\n`;
    output += JSON.stringify(result.data, null, 2);
    return output;
  }
}
