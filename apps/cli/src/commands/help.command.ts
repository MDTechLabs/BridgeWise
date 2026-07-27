import { CLICommand, CommandDefinition, CommandResult, Injectable, ParsedOptions } from './types';

@Injectable()
export class HelpCommand implements CLICommand {
  private commandsList: CommandDefinition[] = [];

  readonly definition: CommandDefinition = {
    name: 'help',
    description: 'Display usage instructions and options for BridgeWise CLI commands',
    usage: 'bridgewise help [command_name]',
    aliases: ['--help', '-h'],
    options: [
      {
        name: 'command',
        description: 'Specific command name to view detailed help for',
        type: 'string',
      },
    ],
  };

  setRegisteredCommands(definitions: CommandDefinition[]): void {
    this.commandsList = definitions;
  }

  async execute(args: string[], options: ParsedOptions): Promise<CommandResult<string>> {
    const targetCommandName = options.command || args[0];

    if (targetCommandName) {
      const targetDef = this.commandsList.find(
        (cmd) => cmd.name === targetCommandName || (cmd.aliases && cmd.aliases.includes(targetCommandName)),
      );

      if (targetDef) {
        let helpText = `Command: ${targetDef.name}\n`;
        helpText += `Description: ${targetDef.description}\n`;
        helpText += `Usage: ${targetDef.usage}\n`;
        if (targetDef.aliases && targetDef.aliases.length > 0) {
          helpText += `Aliases: ${targetDef.aliases.join(', ')}\n`;
        }
        if (targetDef.options && targetDef.options.length > 0) {
          helpText += `Options:\n`;
          for (const opt of targetDef.options) {
            const aliasStr = opt.alias ? `-${opt.alias}, ` : '';
            const reqStr = opt.required ? ' (required)' : '';
            const defaultStr = opt.defaultValue !== undefined ? ` [default: ${opt.defaultValue}]` : '';
            helpText += `  ${aliasStr}--${opt.name}${reqStr}${defaultStr}: ${opt.description}\n`;
          }
        }
        return {
          success: true,
          command: this.definition.name,
          data: helpText,
          timestamp: new Date().toISOString(),
        };
      }
    }

    let generalHelp = `BridgeWise CLI - Multi-Chain Cross-Bridge Toolkit\n\n`;
    generalHelp += `Available Commands:\n`;
    for (const cmd of this.commandsList) {
      generalHelp += `  ${cmd.name.padEnd(14)} ${cmd.description}\n`;
    }
    generalHelp += `\nGlobal Options:\n`;
    generalHelp += `  --format       Output format (text | json) [default: text]\n`;
    generalHelp += `  --help, -h     Show command help\n`;
    generalHelp += `\nRun 'bridgewise help <command>' for specific command usage.\n`;

    return {
      success: true,
      command: this.definition.name,
      data: generalHelp,
      timestamp: new Date().toISOString(),
    };
  }
}
