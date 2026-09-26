import { CongestionCommand } from '../congestion.command';

describe('CongestionCommand', () => {
  let command: CongestionCommand;

  beforeEach(() => {
    command = new CongestionCommand();
  });

  it('should return normal congestion status for healthy latency', async () => {
    const result = await command.execute([], {
      route: 'stellar-bridge-1',
      latencyMs: 1200,
      failureRate: 0.02,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.routeId).toBe('stellar-bridge-1');
    expect(result.data?.status).toBe('normal');
  });

  it('should report elevated/congested status when high latency is probed', async () => {
    const result = await command.execute([], {
      route: 'stellar-bridge-1',
      latencyMs: 6000,
      failureRate: 0.35,
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).not.toBe('normal');
  });
});
