import { AuditExporter } from '../src/audit-exporter';
import { BridgeEvent } from '../src/types';

function makeEvent(overrides: Partial<BridgeEvent> = {}): BridgeEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceChain: 'ethereum',
    destinationChain: 'stellar',
    transactionHash: '0x' + 'a'.repeat(64),
    sourceAddress: '0xsender',
    destinationAddress: 'Gdestination',
    tokenSymbol: 'USDC',
    tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    amount: '1000000',
    fee: '5000',
    status: 'confirmed',
    initiatedAt: Date.now() - 3600000,
    confirmedAt: Date.now(),
    blockNumber: 12345678,
    eventType: 'lock',
    messageId: 'msg-001',
    ...overrides,
  };
}

describe('AuditExporter', () => {
  let exporter: AuditExporter;
  const mockEvents: BridgeEvent[] = [
    makeEvent({ id: 'evt-001', amount: '1000', fee: '10', status: 'confirmed', sourceChain: 'ethereum', destinationChain: 'stellar', tokenSymbol: 'USDC', initiatedAt: 1000 }),
    makeEvent({ id: 'evt-002', amount: '2000', fee: '20', status: 'confirmed', sourceChain: 'ethereum', destinationChain: 'polygon', tokenSymbol: 'USDT', initiatedAt: 2000 }),
    makeEvent({ id: 'evt-003', amount: '3000', fee: '30', status: 'failed', sourceChain: 'stellar', destinationChain: 'ethereum', tokenSymbol: 'XLM', initiatedAt: 3000 }),
    makeEvent({ id: 'evt-004', amount: '4000', fee: '40', status: 'pending', sourceChain: 'polygon', destinationChain: 'ethereum', tokenSymbol: 'MATIC', initiatedAt: 4000 }),
  ];

  beforeEach(() => {
    exporter = new AuditExporter();
  });

  afterEach(() => {
    exporter.removeAllListeners();
  });

  it('ingests events and returns correct count', () => {
    exporter.ingest(mockEvents);
    expect(exporter.getEventCount()).toBe(4);
  });

  it('ingests single event', () => {
    exporter.ingestOne(mockEvents[0]);
    expect(exporter.getEventCount()).toBe(1);
  });

  it('queries events by status', () => {
    exporter.ingest(mockEvents);
    const confirmed = exporter.query({ status: 'confirmed' });
    expect(confirmed.length).toBe(2);
  });

  it('queries events by time range', () => {
    exporter.ingest(mockEvents);
    const result = exporter.query({ startTime: 1500, endTime: 3500 });
    expect(result.length).toBe(2);
  });

  it('queries events by wallet address', () => {
    exporter.ingest([
      makeEvent({ id: 'evt-w1', sourceAddress: '0xwallet1', destinationAddress: 'Gdest1' }),
      makeEvent({ id: 'evt-w2', sourceAddress: '0xwallet2', destinationAddress: 'Gdest2' }),
    ]);
    const result = exporter.query({ walletAddress: '0xwallet1' });
    expect(result.length).toBe(1);
  });

  it('queries events by token contract', () => {
    exporter.ingest(mockEvents);
    const result = exporter.query({ tokenContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' });
    expect(result.length).toBe(1);
  });

  it('queries events by chainId', () => {
    exporter.ingest(mockEvents);
    const result = exporter.query({ chainId: 'stellar' });
    expect(result.length).toBe(3);
  });

  it('exports valid CSV', () => {
    exporter.ingest(mockEvents);
    const csv = exporter.exportCsv({});
    expect(csv).toContain('id,sourceChain,destinationChain');
    expect(csv).toContain('evt-001,ethereum,stellar');
    expect(csv).toContain('evt-003,stellar,ethereum');

    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(5);
  });

  it('exports valid JSON', () => {
    exporter.ingest(mockEvents);
    const json = exporter.exportJson({});
    const parsed = JSON.parse(json);
    expect(parsed.events.length).toBe(4);
    expect(parsed.metrics).toBeDefined();
    expect(parsed.query).toBeDefined();
    expect(parsed.exportedAt).toBeDefined();
  });

  it('exports JSON with pretty printing', () => {
    exporter = new AuditExporter({ prettyPrint: true });
    exporter.ingest(mockEvents);
    const json = exporter.exportJson({});
    expect(json).toContain('\n');
  });

  it('computes correct metrics', () => {
    exporter.ingest(mockEvents);
    const metrics = exporter.computeMetrics();
    expect(metrics.totalEvents).toBe(4);
    expect(metrics.totalVolume).toBe('10000');
    expect(metrics.totalFees).toBe('100');
    expect(metrics.uniqueWallets).toBe(4);
    expect(metrics.uniqueTokens).toBe(4);
    expect(metrics.statusBreakdown.confirmed).toBe(2);
    expect(metrics.statusBreakdown.failed).toBe(1);
    expect(metrics.statusBreakdown.pending).toBe(1);
  });

  it('computes metrics for a filtered subset', () => {
    exporter.ingest(mockEvents);
    const filtered = exporter.query({ status: 'confirmed' });
    const metrics = exporter.computeMetrics(filtered);
    expect(metrics.totalEvents).toBe(2);
    expect(metrics.totalVolume).toBe('3000');
  });

  it('emits event on ingest', () => {
    const spy = jest.fn();
    exporter.on('events-ingested', spy);
    exporter.ingest(mockEvents);
    expect(spy).toHaveBeenCalledWith({ count: 4, total: 4 });
  });

  it('emits event on ingestOne', () => {
    const spy = jest.fn();
    exporter.on('event-ingested', spy);
    exporter.ingestOne(mockEvents[0]);
    expect(spy).toHaveBeenCalledWith({ eventId: mockEvents[0].id });
  });

  it('emits cleared event on clear', () => {
    const spy = jest.fn();
    exporter.on('cleared', spy);
    exporter.clear();
    expect(spy).toHaveBeenCalled();
  });

  it('clears all events', () => {
    exporter.ingest(mockEvents);
    expect(exporter.getEventCount()).toBe(4);
    exporter.clear();
    expect(exporter.getEventCount()).toBe(0);
  });

  it('handles empty event list', () => {
    const csv = exporter.exportCsv({});
    expect(csv).toBe('');
    const json = exporter.exportJson({});
    const parsed = JSON.parse(json);
    expect(parsed.events.length).toBe(0);
  });

  it('escapes CSV fields with commas', () => {
    exporter.ingestOne(makeEvent({ id: 'evt,comma', sourceAddress: 'addr,with,comma' }));
    const csv = exporter.exportCsv({});
    expect(csv).toContain('"evt,comma"');
    expect(csv).toContain('"addr,with,comma"');
  });
});
