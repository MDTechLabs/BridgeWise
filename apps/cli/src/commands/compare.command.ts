import { CLICommand, CommandDefinition, CommandResult, Injectable, ParsedOptions } from './types';

export interface RouteOption {
  provider: string;
  sourceChain: string;
  destinationChain: string;
  estimatedTimeSeconds: number;
  feeUsd: number;
  liquidityUsd: number;
  congestionStatus: 'normal' | 'elevated' | 'congested' | 'severe';
  recommended: boolean;
  score: number;
}

@Injectable()
export class CompareCommand implements CLICommand {
  readonly definition: CommandDefinition = {
    name: 'compare',
    description: 'Compare bridge routes by cost, liquidity, and speed to surface recommended paths',
    usage: 'bridgewise compare --sourceChain <chain> --destinationChain <chain> [--token <symbol>] [--amount <amount>]',
    aliases: ['compare-routes', 'bridge-compare'],
    options: [
      {
        name: 'sourceChain',
        alias: 'src',
        description: 'Source chain name',
        required: true,
        defaultValue: 'Ethereum',
        type: 'string',
      },
      {
        name: 'destinationChain',
        alias: 'dst',
        description: 'Destination chain name',
        required: true,
        defaultValue: 'Stellar',
        type: 'string',
      },
      {
        name: 'token',
        alias: 't',
        description: 'Token to bridge',
        defaultValue: 'USDC',
        type: 'string',
      },
      {
        name: 'amount',
        alias: 'amt',
        description: 'Amount to bridge',
        defaultValue: 500,
        type: 'number',
      },
    ],
  };

  async execute(args: string[], options: ParsedOptions): Promise<CommandResult<RouteOption[]>> {
    const sourceChain = options.sourceChain || 'Ethereum';
    const destinationChain = options.destinationChain || 'Stellar';
    const token = (options.token || 'USDC').toUpperCase();
    const amount = Number(options.amount) || 500;

    const routes: RouteOption[] = [
      {
        provider: 'Stellar Direct Anchor Bridge',
        sourceChain,
        destinationChain,
        estimatedTimeSeconds: 45,
        feeUsd: 1.25,
        liquidityUsd: 500000,
        congestionStatus: 'normal',
        recommended: true,
        score: 96,
      },
      {
        provider: 'AllBridge Core',
        sourceChain,
        destinationChain,
        estimatedTimeSeconds: 120,
        feeUsd: 2.50,
        liquidityUsd: 300000,
        congestionStatus: 'normal',
        recommended: false,
        score: 84,
      },
      {
        provider: 'Celer cBridge',
        sourceChain,
        destinationChain,
        estimatedTimeSeconds: 300,
        feeUsd: 3.10,
        liquidityUsd: 120000,
        congestionStatus: 'elevated',
        recommended: false,
        score: 72,
      },
    ];

    routes.sort((a, b) => b.score - a.score);

    return {
      success: true,
      command: this.definition.name,
      data: routes,
      message: `Compared ${routes.length} routes for bridging ${amount} ${token} from ${sourceChain} to ${destinationChain}. Recommended: ${routes[0].provider}`,
      timestamp: new Date().toISOString(),
    };
  }
}
