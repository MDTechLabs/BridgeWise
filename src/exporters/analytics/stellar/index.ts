/**
 * Soroban Transfer Analytics Exporter (#460).
 *
 * Exports bridge and transfer analytics datasets for external processing.
 * Supports exporting in JSON, CSV, and Prometheus formats.
 */

export type ExportFormat = 'json' | 'csv' | 'prometheus';

export interface TransferRecord {
  transferId: string;
  sender: string;
  receiver: string;
  amount: number;
  asset: string;
  status: 'pending' | 'completed' | 'failed';
  gasUsed: number;
  txHash: string;
  timestamp: Date;
}

export interface AnalyticsDataset {
  exportedAt: Date;
  totalTransfers: number;
  totalVolume: Record<string, number>; // total volume per asset
  transfers: TransferRecord[];
}

export interface CsvExportOptions {
  delimiter?: string;
  includeHeader?: boolean;
}

export class SorobanTransferAnalyticsExporter {
  private records: TransferRecord[] = [];

  /**
   * Register a new transfer record.
   */
  recordTransfer(record: TransferRecord): void {
    this.records.push(record);
  }

  /**
   * Get all registered records.
   */
  getRecords(): TransferRecord[] {
    return this.records;
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this.records = [];
  }

  /**
   * Generate an analytics dataset.
   */
  getDataset(): AnalyticsDataset {
    const totalVolume: Record<string, number> = {};
    for (const r of this.records) {
      if (r.status === 'completed') {
        totalVolume[r.asset] = (totalVolume[r.asset] || 0) + r.amount;
      }
    }

    return {
      exportedAt: new Date(),
      totalTransfers: this.records.length,
      totalVolume,
      transfers: [...this.records],
    };
  }

  /**
   * Export the dataset in the specified format.
   */
  export(format: ExportFormat, csvOptions?: CsvExportOptions): string {
    const dataset = this.getDataset();

    switch (format) {
      case 'json':
        return this.exportJson(dataset);
      case 'csv':
        return this.exportCsv(dataset, csvOptions);
      case 'prometheus':
        return this.exportPrometheus(dataset);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private exportJson(dataset: AnalyticsDataset): string {
    return JSON.stringify(dataset, null, 2);
  }

  private exportCsv(dataset: AnalyticsDataset, options?: CsvExportOptions): string {
    const delimiter = options?.delimiter || ',';
    const includeHeader = options?.includeHeader !== false;
    const lines: string[] = [];

    if (includeHeader) {
      lines.push(
        ['transferId', 'sender', 'receiver', 'amount', 'asset', 'status', 'gasUsed', 'txHash', 'timestamp'].join(
          delimiter,
        ),
      );
    }

    for (const t of dataset.transfers) {
      const row = [
        this.escapeCsv(t.transferId, delimiter),
        this.escapeCsv(t.sender, delimiter),
        this.escapeCsv(t.receiver, delimiter),
        t.amount.toString(),
        this.escapeCsv(t.asset, delimiter),
        t.status,
        t.gasUsed.toString(),
        this.escapeCsv(t.txHash, delimiter),
        t.timestamp.toISOString(),
      ];
      lines.push(row.join(delimiter));
    }

    return lines.join('\n');
  }

  private exportPrometheus(dataset: AnalyticsDataset): string {
    let output = '';

    output += '# HELP soroban_transfers_total Total number of Soroban transfers recorded.\n';
    output += '# TYPE soroban_transfers_total counter\n';
    output += `soroban_transfers_total ${dataset.totalTransfers}\n\n`;

    // Group counts/volumes by status/asset
    const statusCounts: Record<string, number> = {};
    const assetVolumes: Record<string, number> = {};
    const assetGasUsed: Record<string, number> = {};

    for (const t of dataset.transfers) {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
      if (t.status === 'completed') {
        assetVolumes[t.asset] = (assetVolumes[t.asset] || 0) + t.amount;
      }
      assetGasUsed[t.asset] = (assetGasUsed[t.asset] || 0) + t.gasUsed;
    }

    output += '# HELP soroban_transfers_by_status_total Total transfers by status.\n';
    output += '# TYPE soroban_transfers_by_status_total counter\n';
    for (const [status, count] of Object.entries(statusCounts)) {
      output += `soroban_transfers_by_status_total{status="${status}"} ${count}\n`;
    }
    output += '\n';

    output += '# HELP soroban_transfer_volume_total Total transaction volume per asset.\n';
    output += '# TYPE soroban_transfer_volume_total counter\n';
    for (const [asset, volume] of Object.entries(assetVolumes)) {
      output += `soroban_transfer_volume_total{asset="${asset}"} ${volume}\n`;
    }
    output += '\n';

    output += '# HELP soroban_transfer_gas_used_total Total gas used by transfers per asset.\n';
    output += '# TYPE soroban_transfer_gas_used_total counter\n';
    for (const [asset, gas] of Object.entries(assetGasUsed)) {
      output += `soroban_transfer_gas_used_total{asset="${asset}"} ${gas}\n`;
    }

    return output;
  }

  private escapeCsv(value: string, delimiter: string): string {
    const clean = value.replace(/"/g, '""');
    if (clean.includes(delimiter) || clean.includes('\n') || clean.includes('"')) {
      return `"${clean}"`;
    }
    return clean;
  }
}
