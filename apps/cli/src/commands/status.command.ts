import { CLICommand, CommandDefinition, CommandResult, Injectable, ParsedOptions } from './types';
import { StatusChecker, TransactionStatusResult } from '../../../../libs/sdk/src/status-checker';

@Injectable()
export class StatusCommand implements CLICommand {
  private readonly statusChecker = new StatusChecker();

  readonly definition: CommandDefinition = {
    name: 'status',
    description: 'Check full cross-chain lifecycle status of a bridged transaction',
    usage: 'bridgewise status <txHash> [--source-chain <chain>]',
    aliases: ['tx-status', 'bridge-status', 'chain-status'],
    options: [
      {
        name: 'sourceChain',
        alias: 's',
        description: 'Source blockchain network (e.g. Ethereum, Stellar, Polygon)',
        type: 'string',
      },
      {
        name: 'hash',
        alias: 'h',
        description: 'Transaction hash',
        type: 'string',
      },
    ],
  };

  async execute(args: string[], options: ParsedOptions): Promise<CommandResult<TransactionStatusResult>> {
    const txHash = (args[0] && !args[0].startsWith('-'))
      ? args[0]
      : options.txHash || options.hash || options.h || options['source-chain-hash'];

    if (!txHash) {
      return {
        success: false,
        command: this.definition.name,
        error: 'Transaction hash is required. Usage: bridgewise status <txHash> [--source-chain <chain>]',
        timestamp: new Date().toISOString(),
      };
    }

    const sourceChain = options['source-chain'] || options.sourceChain || options.s || options.source_chain;

    try {
      const data = await this.statusChecker.checkStatus(txHash, { sourceChain });
      const tableOutput = this.formatTerminalTable(data);

      return {
        success: true,
        command: this.definition.name,
        data,
        message: tableOutput,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        success: false,
        command: this.definition.name,
        error: err?.message || `Failed to check transaction status for ${txHash}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Generates a colorized terminal table summary for cross-chain transaction milestones.
   */
  public formatTerminalTable(data: TransactionStatusResult): string {
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const cyan = '\x1b[36m';
    const green = '\x1b[32m';
    const yellow = '\x1b[33m';
    const red = '\x1b[31m';
    const gray = '\x1b[90m';

    const getStatusBadge = (status: string) => {
      switch (status.toLowerCase()) {
        case 'completed':
        case 'relayed':
          return `${green}${bold}✔ ${status.toUpperCase()}${reset}`;
        case 'in_progress':
        case 'committed':
        case 'pending':
          return `${yellow}${bold}⏳ ${status.toUpperCase()}${reset}`;
        case 'failed':
          return `${red}${bold}✖ ${status.toUpperCase()}${reset}`;
        default:
          return `${gray}${status.toUpperCase()}${reset}`;
      }
    };

    let table = `\n${cyan}${bold}================================================================================${reset}\n`;
    table += `${cyan}${bold}           BRIDGEWISE CROSS-CHAIN TRANSACTION LIFECYCLE STATUS                  ${reset}\n`;
    table += `${cyan}${bold}================================================================================${reset}\n`;
    table += `${bold}Tx Hash:${reset}     ${data.txHash}\n`;
    table += `${bold}Route:${reset}       ${data.sourceChain} -> ${data.destinationChain}\n`;
    table += `${bold}Lifecycle:${reset}   ${getStatusBadge(data.status)}\n`;
    table += `${bold}Timestamp:${reset}   ${data.timestamp}\n`;
    table += `${cyan}--------------------------------------------------------------------------------${reset}\n`;
    table += `${bold}LIFECYCLE MILESTONES${reset}\n`;
    table += `${cyan}--------------------------------------------------------------------------------${reset}\n`;
    table += `${bold}| Milestone                | Status       | Details${reset}\n`;
    table += `${cyan}--------------------------------------------------------------------------------${reset}\n`;

    for (const m of data.milestones) {
      const namePad = m.name.padEnd(24, ' ');
      const badge = getStatusBadge(m.status).padEnd(20, ' ');
      const details = m.details || '';
      table += `| ${namePad} | ${badge} | ${details}\n`;
    }

    table += `${cyan}================================================================================${reset}\n`;
    return table;
  }
}
