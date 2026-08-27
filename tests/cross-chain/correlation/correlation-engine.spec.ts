import { CrossChainTransferCorrelationEngine } from '../../../src/cross-chain/correlation';

describe('CrossChainTransferCorrelationEngine', () => {
  let now = 1000;
  const clock = () => now;
  let engine: CrossChainTransferCorrelationEngine;

  beforeEach(() => {
    now = 1000;
    engine = new CrossChainTransferCorrelationEngine({ now: clock });
  });

  it('creates a correlation and links the source transaction', () => {
    const record = engine.create({
      chain: 'stellar',
      txHash: 'tx-source-1',
      linkedAt: now,
    });

    expect(record.correlationId).toBeDefined();
    expect(record.source?.txHash).toBe('tx-source-1');
    expect(record.status).toBe('source_linked');
  });

  it('links a destination transaction and advances status', () => {
    const record = engine.create({
      chain: 'stellar',
      txHash: 'tx-source-1',
      linkedAt: now,
    });

    now = 1100;
    engine.linkDestination(record.correlationId, {
      chain: 'evm',
      txHash: 'tx-dest-1',
      linkedAt: now,
    });

    const updated = engine.get(record.correlationId);
    expect(updated?.destination?.txHash).toBe('tx-dest-1');
    expect(updated?.status).toBe('destination_linked');
  });

  it('completes and persists correlation state', () => {
    const record = engine.create({
      chain: 'evm',
      txHash: 'tx-a',
      linkedAt: now,
    });

    engine.linkDestination(record.correlationId, {
      chain: 'stellar',
      txHash: 'tx-b',
      linkedAt: now,
    });
    engine.complete(record.correlationId);

    expect(engine.get(record.correlationId)?.status).toBe('completed');
  });

  it('returns null for an unknown correlation id', () => {
    expect(engine.get('missing')).toBeNull();
  });
});
