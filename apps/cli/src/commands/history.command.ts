import { CLICommand, CommandDefinition, CommandResult, Injectable, ParsedOptions } from './types';

export interface TransactionRecord {
  id: string;
  account: string;
  chain: string;
  token: string;
  amount: string;
  status: 'confirmed' | 'pending' | 'failed';
  txHash: string;
  timestamp: string;
}

@Injectable()
export class HistoryCommand implements CLICommand {
  readonly definition: CommandDefinition = {
    name: 'history',
    description: 'Query multi-chain transaction history for Stellar and EVM bridge flows',
    usage: 'bridgewise history --account <account_address> [--status confirmed|pending|failed] [--sort asc|desc]',
    aliases: ['tx-history', 'history-list'],
    options: [
      {
        name: 'account',
        alias: 'a',
        description: 'Account address (Stellar G... address or EVM 0x... address)',
        required: true,
        type: 'string',
      },
      {
        name: 'status',
        alias: 's',
        description: 'Filter transaction status (confirmed, pending, failed, or all)',
        defaultValue: 'all',
        type: 'string',
      },
      {
        name: 'sort',
        alias: 'o',
        description: 'Sort order by timestamp (asc or desc)',
        defaultValue: 'desc',
        type: 'string',
      },
      {
        name: 'limit',
        alias: 'l',
        description: 'Maximum number of transactions to return',
        defaultValue: 10,
        type: 'number',
      },
    ],
  };

  async execute(args: string[], options: ParsedOptions): Promise<CommandResult<TransactionRecord[]>> {
    const account = options.account || args[0];
    if (!account) {
      return {
        success: false,
        command: this.definition.name,
        error: 'Account address is required. Specify via --account <address> or as first argument.',
        timestamp: new Date().toISOString(),
      };
    }

    const statusFilter = (options.status || 'all').toLowerCase();
    const sortOrder = (options.sort || 'desc').toLowerCase();
    const limit = Number(options.limit) || 10;

    // Simulate multi-chain transactions for given account
    const isStellar = account.startsWith('G') || account.length === 56;
    const chainType = isStellar ? 'Stellar' : 'Ethereum';

    const mockTransactions: TransactionRecord[] = [
      {
        id: 'tx-101',
        account,
        chain: chainType,
        token: 'USDC',
        amount: '250.00',
        status: 'confirmed',
        txHash: isStellar ? 'hash_stellar_019a8f' : '0x7a8b9c0d1e2f3a4b5c6d',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'tx-102',
        account,
        chain: isStellar ? 'Ethereum' : 'Stellar',
        token: 'XLM',
        amount: '1200.00',
        status: 'confirmed',
        txHash: '0x8f7e6d5c4b3a2f1e0d9c',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: 'tx-103',
        account,
        chain: chainType,
        token: 'ETH',
        amount: '0.45',
        status: 'pending',
        txHash: '0x1234567890abcdef1234',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
      },
      {
        id: 'tx-104',
        account,
        chain: chainType,
        token: 'USDT',
        amount: '100.00',
        status: 'failed',
        txHash: '0x99887766554433221100',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
      },
    ];

    let filtered = mockTransactions;
    if (statusFilter !== 'all') {
      filtered = mockTransactions.filter((tx) => tx.status === statusFilter);
    }

    filtered.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });

    const resultData = filtered.slice(0, limit);

    return {
      success: true,
      command: this.definition.name,
      data: resultData,
      message: `Retrieved ${resultData.length} transaction(s) for account ${account}`,
      timestamp: new Date().toISOString(),
    };
  }
}
