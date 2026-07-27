import { LiquidityCommand } from '../liquidity.command';

describe('LiquidityCommand', () => {
  let command: LiquidityCommand;

  beforeEach(() => {
    command = new LiquidityCommand();
  });

  it('should return optimal liquidity for reasonable amounts', async () => {
    const result = await command.execute([], {
      token: 'USDC',
      sourceChain: 'Ethereum',
      destinationChain: 'Stellar',
      amount: 1000,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.status).toBe('optimal');
    expect(result.data?.token).toBe('USDC');
  });

  it('should return warning when transfer exceeds safe single-tx threshold', async () => {
    const result = await command.execute([], {
      token: 'USDC',
      sourceChain: 'Ethereum',
      destinationChain: 'Stellar',
      amount: 200000,
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('low_liquidity_warning');
  });

  it('should return failure when amount exceeds total destination liquidity', async () => {
    const result = await command.execute([], {
      token: 'USDC',
      sourceChain: 'Ethereum',
      destinationChain: 'Stellar',
      amount: 9999999,
    });

    expect(result.success).toBe(false);
    expect(result.data?.status).toBe('insufficient_liquidity');
  });
});
