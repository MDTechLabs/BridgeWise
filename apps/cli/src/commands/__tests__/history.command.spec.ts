import { HistoryCommand } from '../history.command';

describe('HistoryCommand', () => {
  let command: HistoryCommand;

  beforeEach(() => {
    command = new HistoryCommand();
  });

  it('should return error if account option and argument are missing', async () => {
    const result = await command.execute([], {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Account address is required');
  });

  it('should fetch transactions for a valid account address', async () => {
    const account = 'GBX345EXAMPLESTELLARACCOUNTADDRESSFORTESIS12345';
    const result = await command.execute([], { account });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.length).toBeGreaterThan(0);
    expect(result.data![0].account).toBe(account);
  });

  it('should filter transactions by status', async () => {
    const account = '0x1234567890123456789012345678901234567890';
    const result = await command.execute([], { account, status: 'confirmed' });

    expect(result.success).toBe(true);
    expect(result.data?.every((tx) => tx.status === 'confirmed')).toBe(true);
  });

  it('should respect the limit option', async () => {
    const account = 'G12345';
    const result = await command.execute([], { account, limit: 1 });

    expect(result.success).toBe(true);
    expect(result.data?.length).toBe(1);
  });
});
