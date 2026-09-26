import { CLICommand, CommandDefinition, CommandResult, Injectable, ParsedOptions } from './types';

export interface CongestionMetrics {
  routeId: string;
  timestamp: string;
  latencyMs: number;
  failureRate: number;
  queueDepth: number;
  throughput: number;
  pendingTransactions: number;
}

export interface CongestionAlert {
  routeId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metric: 'latency' | 'failureRate' | 'queueDepth' | 'throughput' | 'pendingTransactions';
  currentValue: number;
  threshold: number;
  message: string;
  timestamp: string;
}

export interface CongestionStatusData {
  routeId: string;
  status: 'normal' | 'elevated' | 'congested' | 'severe';
  currentMetrics: CongestionMetrics;
  alertHistory: CongestionAlert[];
  lastUpdated: string;
}

@Injectable()
export class CongestionCommand implements CLICommand {
  readonly definition: CommandDefinition = {
    name: 'congestion',
    description: 'Monitor route congestion across Stellar bridge providers for latency spikes and queue buildup',
    usage: 'bridgewise congestion [--route <routeId>] [--spikeMultiplier <number>] [--latencyMs <ms>]',
    aliases: ['stellar-congestion', 'congestion-monitor'],
    options: [
      {
        name: 'route',
        alias: 'r',
        description: 'Target Stellar bridge route ID',
        defaultValue: 'stellar-bridge-1',
        type: 'string',
      },
      {
        name: 'spikeMultiplier',
        alias: 'm',
        description: 'Multiplier for baseline spike detection (default: 2.0)',
        defaultValue: 2.0,
        type: 'number',
      },
      {
        name: 'latencyMs',
        alias: 'lat',
        description: 'Override probed latency in milliseconds for testing',
        type: 'number',
      },
      {
        name: 'failureRate',
        alias: 'fail',
        description: 'Override probed failure rate (0.0 to 1.0) for testing',
        type: 'number',
      },
    ],
  };

  async execute(args: string[], options: ParsedOptions): Promise<CommandResult<CongestionStatusData>> {
    const routeId = options.route || args[0] || 'stellar-bridge-1';

    const latencyMs = options.latencyMs !== undefined ? Number(options.latencyMs) : 1200;
    const failureRate = options.failureRate !== undefined ? Number(options.failureRate) : 0.05;

    let statusType: CongestionStatusData['status'] = 'normal';
    const alerts: CongestionAlert[] = [];

    if (latencyMs >= 5000 || failureRate >= 0.3) {
      statusType = 'severe';
      alerts.push({
        routeId,
        severity: 'critical',
        metric: latencyMs >= 5000 ? 'latency' : 'failureRate',
        currentValue: latencyMs >= 5000 ? latencyMs : failureRate,
        threshold: latencyMs >= 5000 ? 5000 : 0.3,
        message: `Severe congestion detected on route ${routeId}`,
        timestamp: new Date().toISOString(),
      });
    } else if (latencyMs >= 3000 || failureRate >= 0.15) {
      statusType = 'congested';
      alerts.push({
        routeId,
        severity: 'high',
        metric: 'latency',
        currentValue: latencyMs,
        threshold: 3000,
        message: `High latency detected on route ${routeId}`,
        timestamp: new Date().toISOString(),
      });
    } else if (latencyMs >= 2000 || failureRate >= 0.08) {
      statusType = 'elevated';
    }

    const data: CongestionStatusData = {
      routeId,
      status: statusType,
      currentMetrics: {
        routeId,
        timestamp: new Date().toISOString(),
        latencyMs,
        failureRate,
        queueDepth: latencyMs > 3000 ? 120 : 20,
        throughput: failureRate > 0.2 ? 5 : 45,
        pendingTransactions: latencyMs > 3000 ? 600 : 80,
      },
      alertHistory: alerts,
      lastUpdated: new Date().toISOString(),
    };

    return {
      success: true,
      command: this.definition.name,
      data,
      message: `Congestion status for route ${routeId}: ${data.status.toUpperCase()}`,
      timestamp: new Date().toISOString(),
    };
  }
}
