import { RpcFailoverService, AllEndpointsFailedError, RpcEndpoint } from './rpc-failover.service';

const endpoints: RpcEndpoint[] = [
  { id: 'primary', url: 'https://primary.example' },
  { id: 'secondary', url: 'https://secondary.example' },
];

describe('RpcFailoverService', () => {
  let clock: number;
  beforeEach(() => {
    clock = 0;
  });
  const make = () => new RpcFailoverService(endpoints, { cooldownMs: 1000 }, () => clock);

  it('uses the primary endpoint when healthy', async () => {
    const svc = make();
    const used: string[] = [];
    const result = await svc.execute(async (e) => {
      used.push(e.id);
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(used).toEqual(['primary']);
    expect(svc.getActiveEndpoint()?.id).toBe('primary');
  });

  it('fails over to the secondary endpoint when the primary errors', async () => {
    const svc = make();
    const used: string[] = [];
    const result = await svc.execute(async (e) => {
      used.push(e.id);
      if (e.id === 'primary') throw new Error('down');
      return 'recovered';
    });
    expect(result).toBe('recovered');
    expect(used).toEqual(['primary', 'secondary']);
    // Primary is now bypassed within its cooldown.
    expect(svc.getActiveEndpoint()?.id).toBe('secondary');
  });

  it('throws when every endpoint fails', async () => {
    const svc = make();
    await expect(
      svc.execute(async () => {
        throw new Error('boom');
      }),
    ).rejects.toBeInstanceOf(AllEndpointsFailedError);
  });

  it('recovers a downed endpoint after the cooldown elapses', async () => {
    const svc = make();
    await svc.execute(async (e) => {
      if (e.id === 'primary') throw new Error('down');
      return 'ok';
    });
    expect(svc.getActiveEndpoint()?.id).toBe('secondary');
    clock += 1000; // cooldown elapsed
    expect(svc.getActiveEndpoint()?.id).toBe('primary');
  });
});
