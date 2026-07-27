import { StatusCommand } from '../status.command';

describe('StatusCommand', () => {
  let command: StatusCommand;

  beforeEach(() => {
    command = new StatusCommand();
  });

  it('should return chain health status by chainId', async () => {
    const result = await command.execute([], { chainId: 148 });

    expect(result.success).toBe(true);
    expect(result.data?.chainId).toBe(148);
    expect(result.data?.chainName).toBe('Stellar');
    expect(result.data?.health).toBe('healthy');
  });
});
