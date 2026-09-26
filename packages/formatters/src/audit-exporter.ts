import { EventEmitter } from 'events';
import {
  BridgeEvent,
  ExportQuery,
  ExportMetrics,
  ExporterConfig,
} from './types';

const DEFAULT_CONFIG: ExporterConfig = {
  dateFormat: 'ISO',
  includeHeader: true,
  prettyPrint: false,
};

export class AuditExporter extends EventEmitter {
  private events: BridgeEvent[] = [];
  private config: ExporterConfig;

  constructor(config?: ExporterConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  ingest(events: BridgeEvent[]): void {
    this.events.push(...events);
    this.emit('events-ingested', { count: events.length, total: this.events.length });
  }

  ingestOne(event: BridgeEvent): void {
    this.events.push(event);
    this.emit('event-ingested', { eventId: event.id });
  }

  query(query: ExportQuery): BridgeEvent[] {
    return this.events.filter((e) => {
      if (query.startTime && e.initiatedAt < query.startTime) return false;
      if (query.endTime && e.initiatedAt > query.endTime) return false;
      if (query.tokenContract && e.tokenAddress !== query.tokenContract) return false;
      if (query.walletAddress && e.sourceAddress !== query.walletAddress && e.destinationAddress !== query.walletAddress) return false;
      if (query.chainId && e.sourceChain !== query.chainId && e.destinationChain !== query.chainId) return false;
      if (query.status && e.status !== query.status) return false;
      if (query.eventType && e.eventType !== query.eventType) return false;
      return true;
    });
  }

  exportCsv(query: ExportQuery): string {
    const matched = this.query(query);
    const rows = matched.map((e) => this.eventToCsvRow(e));
    const header = this.config.includeHeader ? this.csvHeader() + '\n' : '';
    return header + rows.join('\n');
  }

  exportJson(query: ExportQuery): string {
    const matched = this.query(query);
    const payload = {
      exportedAt: Date.now(),
      query,
      metrics: this.computeMetrics(matched),
      events: matched,
    };
    return this.config.prettyPrint
      ? JSON.stringify(payload, null, 2)
      : JSON.stringify(payload);
  }

  computeMetrics(events?: BridgeEvent[]): ExportMetrics {
    const target = events || this.events;
    const volume = target.reduce((sum, e) => sum + BigInt(e.amount), 0n);
    const fees = target.reduce((sum, e) => sum + BigInt(e.fee), 0n);

    const wallets = new Set<string>();
    const tokens = new Set<string>();
    const statusBreakdown: Record<string, number> = {};
    const chainBreakdown: Record<string, number> = {};

    for (const e of target) {
      wallets.add(e.sourceAddress);
      wallets.add(e.destinationAddress);
      tokens.add(e.tokenAddress);
      statusBreakdown[e.status] = (statusBreakdown[e.status] || 0) + 1;
      chainBreakdown[e.sourceChain] = (chainBreakdown[e.sourceChain] || 0) + 1;
      chainBreakdown[e.destinationChain] = (chainBreakdown[e.destinationChain] || 0) + 1;
    }

    const timestamps = target.map((e) => e.initiatedAt).sort((a, b) => a - b);

    return {
      totalEvents: target.length,
      totalVolume: volume.toString(),
      totalFees: fees.toString(),
      uniqueWallets: wallets.size,
      uniqueTokens: tokens.size,
      timeRange: {
        start: timestamps[0] || 0,
        end: timestamps[timestamps.length - 1] || 0,
      },
      statusBreakdown,
      chainBreakdown,
    };
  }

  getEventCount(): number {
    return this.events.length;
  }

  clear(): void {
    this.events = [];
    this.emit('cleared');
  }

  private csvHeader(): string {
    return [
      'id',
      'sourceChain',
      'destinationChain',
      'transactionHash',
      'sourceAddress',
      'destinationAddress',
      'tokenSymbol',
      'tokenAddress',
      'amount',
      'fee',
      'status',
      'initiatedAt',
      'confirmedAt',
      'blockNumber',
      'eventType',
      'messageId',
    ].join(',');
  }

  private eventToCsvRow(event: BridgeEvent): string {
    return [
      this.escapeCsv(event.id),
      this.escapeCsv(event.sourceChain),
      this.escapeCsv(event.destinationChain),
      this.escapeCsv(event.transactionHash),
      this.escapeCsv(event.sourceAddress),
      this.escapeCsv(event.destinationAddress),
      this.escapeCsv(event.tokenSymbol),
      this.escapeCsv(event.tokenAddress),
      event.amount,
      event.fee,
      event.status,
      String(event.initiatedAt),
      event.confirmedAt ? String(event.confirmedAt) : '',
      String(event.blockNumber),
      event.eventType,
      event.messageId ? this.escapeCsv(event.messageId) : '',
    ].join(',');
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
