import { CLICommand, CommandDefinition, CommandResult, Injectable, ParsedOptions } from './types';

export interface LiquidityData {
  token: string;
  sourceChain: string;
  destinationChain: string;
  availableLiquiditySource: number;
  availableLiquidityDestination: number;
  maxTransferSize: number;
  isViable: boolean;
  status: 'optimal' | 'low_liquidity_warning' | 'insufficient_liquidity';
  recommendation: string;
}

@Injectable()
export class LiquidityCommand implements CLICommand {
  readonly definition: CommandDefinition = {
    name: 'liquidity',
    description: 'Monitor cross-bridge token liquidity for route viability checks',
    usage: 'bridgewise liquidity --token <symbol> --sourceChain <chain> --destinationChain <chain> [--amount <amount>]',
    aliases: ['liquidity-check', 'liquidity-monitor'],
    options: [
      {
        name: 'token',
        alias: 't',
        description: 'Token symbol (e.g., USDC, XLM, ETH)',
        required: true,
        defaultValue: 'USDC',
        type: 'string',
      },
      {
        name: 'sourceChain',
        alias: 'src',
        description: 'Source chain name (e.g., Ethereum, Stellar, Polygon)',
        required: true,
        defaultValue: 'Ethereum',
        type: 'string',
      },
      {
        name: 'destinationChain',
        alias: 'dst',
        description: 'Destination chain name (e.g., Stellar, Ethereum)',
        required: true,
        defaultValue: 'Stellar',
        type: 'string',
      },
      {
        name: 'amount',
        alias: 'amt',
        description: 'Desired transfer amount to evaluate route viability',
        defaultValue: 1000,
        type: 'number',
      },
    ],
  };

  async execute(args: string[], options: ParsedOptions): Promise<CommandResult<LiquidityData>> {
    const token = (options.token || 'USDC').toUpperCase();
    const sourceChain = options.sourceChain || 'Ethereum';
    const destinationChain = options.destinationChain || 'Stellar';
    const amount = Number(options.amount) || 1000;

    // Standard simulated liquidity profiles
    const sourceLiquidity = token === 'USDC' ? 500000 : 150000;
    const destLiquidity = token === 'USDC' ? 250000 : 80000;
    const maxTransferSize = Math.min(sourceLiquidity, destLiquidity) * 0.5;

    let isViable = true;
    let status: LiquidityData['status'] = 'optimal';
    let recommendation = 'High liquidity available. Route is highly viable.';

    if (amount > destLiquidity) {
      isViable = false;
      status = 'insufficient_liquidity';
      recommendation = `Requested amount (${amount}) exceeds destination chain liquidity (${destLiquidity}).`;
    } else if (amount > maxTransferSize) {
      status = 'low_liquidity_warning';
      recommendation = `Requested amount (${amount}) exceeds single-tx recommended safety limit (${maxTransferSize}). Slippage warning!`;
    }

    const data: LiquidityData = {
      token,
      sourceChain,
      destinationChain,
      availableLiquiditySource: sourceLiquidity,
      availableLiquidityDestination: destLiquidity,
      maxTransferSize,
      isViable,
      status,
      recommendation,
    };

    return {
      success: isViable,
      command: this.definition.name,
      data,
      message: `Liquidity check complete for ${token} from ${sourceChain} to ${destinationChain}`,
      timestamp: new Date().toISOString(),
    };
  }
}
