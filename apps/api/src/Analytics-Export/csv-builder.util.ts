import { Injectable } from '@nestjs/common';
import { CsvBuildOptions, CsvColumn } from './export-options.interface';
import { AnalyticsRecord } from './analytics-record.interface';

@Injectable()
export class CsvBuilderUtil {
  private readonly DEFAULT_NULL = '';

  /**
   * Build a complete CSV string from an array of records.
   */
  build(records: AnalyticsRecord[], options: CsvBuildOptions): string {
    const lines: string[] = [];

    if (options.includeHeader) {
      lines.push(this.buildHeader(options.columns, options.delimiter));
    }

    for (const record of records) {
      lines.push(this.buildRow(record, options));
    }

    return lines.join('\n');
  }

  /**
   * Stream records as CSV lines (generator for memory-efficient large exports).
   */
  *stream(
    records: AnalyticsRecord[],
    options: CsvBuildOptions,
  ): Generator<string> {
    if (options.includeHeader) {
      yield this.buildHeader(options.columns, options.delimiter) + '\n';
    }

    for (const record of records) {
      yield this.buildRow(record, options) + '\n';
    }
  }

  /**
   * Build the header row.
   */
  buildHeader(columns: CsvColumn[], delimiter: string): string {
    return columns
      .map((col) => this.escapeField(col.header, delimiter))
      .join(delimiter);
  }

  /**
   * Build a single data row.
   */
  buildRow(record: AnalyticsRecord, options: CsvBuildOptions): string {
    const { columns, delimiter, nullPlaceholder } = options;

    return columns
      .map((col) => {
        const rawValue = this.getNestedValue(
          record as unknown as Record<string, unknown>,
          col.key,
        );
        let formatted: string;

        if (rawValue === null || rawValue === undefined) {
          formatted = nullPlaceholder ?? this.DEFAULT_NULL;
        } else if (col.formatter) {
          formatted = col.formatter(rawValue, record);
        } else {
          formatted = this.defaultFormat(rawValue);
        }

        return this.escapeField(formatted, delimiter);
      })
      .join(delimiter);
  }

  /**
   * Escape a CSV field value (wrap in quotes if it contains delimiter, quotes, or newlines).
   */
  escapeField(value: string, delimiter: string): string {
    const needsQuoting =
      value.includes(delimiter) ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r');

    if (needsQuoting) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Access deeply nested object properties via dot-notation key.
   * e.g. 'metadata.baseFee'
   */
  getNestedValue(obj: Record<string, unknown>, key: string): unknown {
    return key.split('.').reduce<unknown>((acc, part) => {
      if (acc !== null && acc !== undefined && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, obj as unknown);
  }

  /**
   * Default formatter: converts values to strings.
   */
  private defaultFormat(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Calculate estimated file size in bytes for a CSV string.
   */
  estimateSize(csv: string): number {
    return Buffer.byteLength(csv, 'utf8');
  }

  /**
   * Format a date according to the requested format.
   */
  formatDate(
    date: Date | string,
    format: 'iso' | 'unix' | 'locale',
    timezone = 'UTC',
  ): string {
    const d = typeof date === 'string' ? new Date(date) : date;

    switch (format) {
      case 'unix':
        return String(Math.floor(d.getTime() / 1000));
      case 'locale':
        return d.toLocaleString('en-US', { timeZone: timezone });
      case 'iso':
      default:
        return d.toISOString();
    }
  }
}
