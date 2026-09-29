import { inspect } from 'node:util';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  SDK_DEBUG_MODULE_OPTIONS,
  SDK_DEBUG_LOG_LEVELS,
  SDK_DEBUG_FORMAT,
  SDK_DEBUG_TRANSPORT,
} from './sdk-debug.constants';
import {
  SdkDebugLogEntry,
  SdkDebugLogLevel,
  SdkDebugMemoryInfo,
  SdkDebugModuleOptions,
  SdkDebugStats,
  SdkDebugSystemInfo,
} from './sdk-debug.types';
import {
  colorize,
  generateId,
  isLevelEnabled,
  levelColor,
  sanitize,
  shouldSample,
  toMB,
} from './sdk-debug.utils';

@Injectable()
export class SdkDebugService {
  private readonly nestLogger = new Logger(SdkDebugService.name);
  private readonly systemInfo: SdkDebugSystemInfo;
  private readonly stats: SdkDebugStats;

  constructor(
    @Inject(SDK_DEBUG_MODULE_OPTIONS)
    private readonly options: SdkDebugModuleOptions,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {
    this.systemInfo = {
      hostname: os.hostname(),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
    };

    this.stats = {
      totalLogs: 0,
      logsByLevel: {
        verbose: 0,
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
      },
      logsByEvent: {},
      averageRequestDurationMs: 0,
      errorRate: 0,
      sampledOut: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  verbose(
    event: string,
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    this.emit(SDK_DEBUG_LOG_LEVELS.VERBOSE, event, message, meta);
  }

  debug(event: string, message: string, meta?: Record<string, unknown>): void {
    this.emit(SDK_DEBUG_LOG_LEVELS.DEBUG, event, message, meta);
  }

  info(event: string, message: string, meta?: Record<string, unknown>): void {
    this.emit(SDK_DEBUG_LOG_LEVELS.INFO, event, message, meta);
  }

  warn(event: string, message: string, meta?: Record<string, unknown>): void {
    this.emit(SDK_DEBUG_LOG_LEVELS.WARN, event, message, meta);
  }

  error(
    event: string,
    message: string,
    error?: Error | unknown,
    meta?: Record<string, unknown>,
  ): void {
    const errorInfo =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: this.options.includeStackTrace ? error.stack : undefined,
            code: (error as NodeJS.ErrnoException).code,
          }
        : error
          ? {
              name: 'UnknownError',
              message: typeof error === 'string' ? error : inspect(error),
            }
          : undefined;

    this.emit(SDK_DEBUG_LOG_LEVELS.ERROR, event, message, meta, errorInfo);
  }

  /**
   * Start a timed operation. Returns a finish() function that logs the result.
   */
  time(
    event: string,
    label: string,
    meta?: Record<string, unknown>,
  ): (resultMeta?: Record<string, unknown>) => void {
    const start = Date.now();
    const traceId = generateId('trace');

    this.debug(event, `⏱  START ${label}`, { traceId, ...meta });

    return (resultMeta?: Record<string, unknown>) => {
      const duration = Date.now() - start;
      this.updateAverageRequestDuration(duration);
      this.debug(event, `⏱  END ${label} [${duration}ms]`, {
        traceId,
        duration,
        ...resultMeta,
      });
    };
  }

  /**
   * Wrap an async fn with automatic start/end/error debug logs.
   */
  async trace<T>(
    event: string,
    label: string,
    fn: () => Promise<T>,
    meta?: Record<string, unknown>,
  ): Promise<T> {
    const finish = this.time(event, label, meta);
    try {
      const result = await fn();
      finish({ success: true });
      return result;
    } catch (err) {
      finish({ success: false });
      this.error(event, `TRACE ERROR: ${label}`, err, meta);
      throw err;
    }
  }

  /** Retrieve runtime stats */
  getStats(): Readonly<SdkDebugStats> {
    return { ...this.stats };
  }

  /** Check if debug is active */
  get isEnabled(): boolean {
    return this.options.enabled;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private emit(
    level: SdkDebugLogLevel,
    event: string,
    message: string,
    meta?: Record<string, unknown>,
    errorInfo?: SdkDebugLogEntry['error'],
  ): void {
    if (!this.options.enabled) return;

    const minLevel = this.options.level ?? SDK_DEBUG_LOG_LEVELS.DEBUG;
    if (!isLevelEnabled(level, minLevel)) return;

    const suppressedEvents = this.options.suppressedEvents ?? [];
    if (suppressedEvents.includes(event)) return;

    const samplingRate = this.options.samplingRate ?? 1;
    if (!shouldSample(samplingRate)) {
      this.stats.sampledOut++;
      return;
    }

    const entry = this.buildEntry(level, event, message, meta, errorInfo);

    this.updateStats(entry);
    this.dispatch(entry);
  }

  private buildEntry(
    level: SdkDebugLogLevel,
    event: string,
    message: string,
    meta?: Record<string, unknown>,
    errorInfo?: SdkDebugLogEntry['error'],
  ): SdkDebugLogEntry {
    const sensitiveKeys = this.options.sensitiveKeys ?? [];
    const maxDepth = this.options.maxDepth ?? 8;
    const maxStringLength = this.options.maxStringLength ?? 2048;

    const mergedMeta = {
      ...this.options.globalMeta,
      ...meta,
    };

    const sanitizedMeta = sanitize(
      mergedMeta,
      sensitiveKeys,
      maxDepth,
      maxStringLength,
    ) as Record<string, unknown>;

    const entry: SdkDebugLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      namespace: this.options.namespace,
      event,
      message,
      meta: Object.keys(sanitizedMeta).length ? sanitizedMeta : undefined,
      error: errorInfo,
    };

    if (this.options.includeSystemInfo) {
      entry.system = this.systemInfo;
    }

    if (this.options.includeMemoryUsage) {
      entry.memory = this.captureMemory();
    }

    return entry;
  }

  private dispatch(entry: SdkDebugLogEntry): void {
    const transports = this.options.transports ?? [
      { type: SDK_DEBUG_TRANSPORT.CONSOLE },
    ];

    for (const transport of transports) {
      try {
        switch (transport.type) {
          case SDK_DEBUG_TRANSPORT.CONSOLE:
            this.writeConsole(entry);
            break;

          case SDK_DEBUG_TRANSPORT.FILE:
            if (transport.filePath) this.writeFile(entry, transport.filePath);
            break;

          case SDK_DEBUG_TRANSPORT.HTTP:
            if (transport.endpoint)
              this.writeHttp(entry, transport.endpoint, transport.headers);
            break;

          case SDK_DEBUG_TRANSPORT.CUSTOM:
            if (transport.handler) {
              Promise.resolve(transport.handler(entry)).catch((err) =>
                this.nestLogger.error('Custom transport error', err),
              );
            }
            break;
        }
      } catch (err) {
        this.nestLogger.error(`Transport ${transport.type} failed`, err);
      }
    }

    if (this.options.emitEvents && this.eventEmitter) {
      this.eventEmitter.emit(entry.event, entry);
    }
  }

  // ---------------------------------------------------------------------------
  // Transport implementations
  // ---------------------------------------------------------------------------

  private writeConsole(entry: SdkDebugLogEntry): void {
    const format = this.options.format ?? SDK_DEBUG_FORMAT.PRETTY;
    const useColor = this.options.colorize !== false;

    if (format === SDK_DEBUG_FORMAT.JSON) {
      process.stdout.write(JSON.stringify(entry) + '\n');
      return;
    }

    if (format === SDK_DEBUG_FORMAT.COMPACT) {
      const ns = entry.namespace ? `[${entry.namespace}] ` : '';
      const dur = entry.duration ? ` (${entry.duration}ms)` : '';
      process.stdout.write(
        `${entry.timestamp} ${entry.level.toUpperCase()} ${ns}${entry.event}: ${entry.message}${dur}\n`,
      );
      return;
    }

    // Pretty format
    const ts = useColor ? colorize(entry.timestamp, 'gray') : entry.timestamp;
    const lvl = useColor
      ? colorize(
          entry.level.toUpperCase().padEnd(7),
          levelColor(entry.level),
          'bold',
        )
      : entry.level.toUpperCase().padEnd(7);
    const ns = entry.namespace
      ? useColor
        ? colorize(`[${entry.namespace}]`, 'magenta')
        : `[${entry.namespace}]`
      : '';
    const evt = useColor ? colorize(entry.event, 'cyan') : entry.event;
    const msg = useColor
      ? colorize(entry.message, 'white', 'bold')
      : entry.message;

    let line = `${ts} ${lvl} ${ns} ${evt} → ${msg}`;

    if (entry.meta && Object.keys(entry.meta).length) {
      const metaStr = this.options.prettyPrint
        ? '\n' + JSON.stringify(entry.meta, null, 2)
        : ' ' + JSON.stringify(entry.meta);
      line += useColor ? colorize(metaStr, 'dim') : metaStr;
    }

    if (entry.error) {
      const errStr = `\n  ERROR: ${entry.error.name}: ${entry.error.message}`;
      line += useColor ? colorize(errStr, 'red') : errStr;
      if (entry.error.stack) {
        const stackStr = '\n' + entry.error.stack;
        line += useColor ? colorize(stackStr, 'gray') : stackStr;
      }
    }

    if (entry.memory) {
      line += useColor
        ? colorize(
            ` [heap: ${entry.memory.heapUsedMB}/${entry.memory.heapTotalMB} MB]`,
            'dim',
          )
        : ` [heap: ${entry.memory.heapUsedMB}/${entry.memory.heapTotalMB} MB]`;
    }

    process.stdout.write(line + '\n');
  }

  private writeFile(entry: SdkDebugLogEntry, filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
  }

  private writeHttp(
    entry: SdkDebugLogEntry,
    endpoint: string,
    headers?: Record<string, string>,
  ): void {
    // Fire-and-forget — non-blocking
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(entry),
    }).catch((err) =>
      this.nestLogger.warn(`HTTP transport failed: ${err.message}`),
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private captureMemory(): SdkDebugMemoryInfo {
    const m = process.memoryUsage();
    return {
      heapUsedMB: toMB(m.heapUsed),
      heapTotalMB: toMB(m.heapTotal),
      externalMB: toMB(m.external),
      rssMB: toMB(m.rss),
    };
  }

  private updateStats(entry: SdkDebugLogEntry): void {
    this.stats.totalLogs++;
    this.stats.logsByLevel[entry.level]++;
    this.stats.logsByEvent[entry.event] =
      (this.stats.logsByEvent[entry.event] ?? 0) + 1;

    if (entry.level === SDK_DEBUG_LOG_LEVELS.ERROR) {
      this.stats.errorRate =
        this.stats.logsByLevel.error / this.stats.totalLogs;
    }
  }

  private updateAverageRequestDuration(duration: number): void {
    const prev = this.stats.averageRequestDurationMs;
    const count = this.stats.logsByEvent['sdk.request.end'] ?? 1;
    this.stats.averageRequestDurationMs =
      (prev * (count - 1) + duration) / count;
  }
}
