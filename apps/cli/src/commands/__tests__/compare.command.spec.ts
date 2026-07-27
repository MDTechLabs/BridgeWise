import { CompareCommand } from '../compare.command';

describe('CompareCommand', () => {
  let command: CompareCommand;

  beforeEach(() => {
    command = new CompareCommand();
  });

  it('should compare routes and rank highest score route first', async () => {
    const result = await command.execute([], {
      sourceChain: 'Ethereum',
      destinationChain: 'Stellar',
      token: 'USDC',
      amount: 500,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.length).toBeGreaterThan(0);
    expect(result.data![0].recommended).toBe(true);
  });
});
