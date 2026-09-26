/**
 * Structured logger with correlation ID tracking and operational metrics collector for BridgeWise API.
 */

export interface LogContext {
  correlationId: string;
  service: string;
  [key: string]: unknown;
}

export class StructuredLogger {
  private serviceName: string;

  constructor(serviceName: string = 'bridgewise-api') {
    this.serviceName = serviceName;
  }

  public info(message: string, context: Partial<LogContext> = {}): void {
    const logPayload = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: context.service || this.serviceName,
      correlationId: context.correlationId || 'none',
      message,
      ...context,
    };
    console.log(JSON.stringify(logPayload));
  }

  public error(message: string, error?: Error, context: Partial<LogContext> = {}): void {
    const logPayload = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      service: context.service || this.serviceName,
      correlationId: context.correlationId || 'none',
      message,
      error: error ? { message: error.message, stack: error.stack } : undefined,
      ...context,
    };
    console.error(JSON.stringify(logPayload));
  }
}

export class BridgeMetricsCollector {
  private metricsMap: Map<string, number> = new Map();

  public recordBridgeOperation(operation: string, latencyMs: number, success: boolean): void {
    const counterKey = `bridge_op_${operation}_${success ? 'success' : 'failure'}`;
    const currentCount = this.metricsMap.get(counterKey) || 0;
    this.metricsMap.set(counterKey, currentCount + 1);

    const latencyKey = `bridge_op_${operation}_latency_ms`;
    this.metricsMap.set(latencyKey, latencyMs);
  }

  public getMetricsSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const [key, val] of this.metricsMap.entries()) {
      summary[key] = val;
    }
    return summary;
  }
}
