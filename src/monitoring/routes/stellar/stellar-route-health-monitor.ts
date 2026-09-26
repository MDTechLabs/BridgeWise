import { EventEmitter } from 'events';

export type RouteHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'outage';

export interface RouteHealthState {
  routeId: string;
  status: RouteHealthStatus;
  availability: number;
  consecutiveFailures: number;
  lastChecked?: Date;
  lastLatencyMs?: number;
  lastErrorMessage?: string;
}

export interface RouteProbeResult {
  available: boolean;
  availability?: number;
  latencyMs?: number;
  errorMessage?: string;
}

export type RouteProbe = () => Promise<RouteProbeResult>;

export interface StellarRouteHealthMonitorConfig {
  checkIntervalMs?: number;
  timeoutMs?: number;
  unhealthyThreshold?: number;
  degradedAvailabilityThreshold?: number;
  latencyThresholdMs?: number;
}

export interface RouteHealthAlert {
  routeId: string;
  status: RouteHealthStatus;
  message: string;
  timestamp: Date;
  availability: number;
  latencyMs?: number;
}

export interface RouteStatusChange {
  routeId: string;
  previousStatus: RouteHealthStatus;
  currentStatus: RouteHealthStatus;
  availability: number;
  lastLatencyMs?: number;
  lastErrorMessage?: string;
  timestamp: Date;
}

export class StellarRouteHealthMonitor extends EventEmitter {
  private readonly config: Required<StellarRouteHealthMonitorConfig>;
  private readonly probes = new Map<string, RouteProbe>();
  private readonly routeStates = new Map<string, RouteHealthState>();
  private readonly activeAlerts = new Map<string, RouteHealthAlert>();
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: StellarRouteHealthMonitorConfig = {}) {
    super();
    this.config = {
      checkIntervalMs: config.checkIntervalMs ?? 30000,
      timeoutMs: config.timeoutMs ?? 5000,
      unhealthyThreshold: config.unhealthyThreshold ?? 3,
      degradedAvailabilityThreshold: config.degradedAvailabilityThreshold ?? 0.8,
      latencyThresholdMs: config.latencyThresholdMs ?? 2000,
    };
  }

  registerRoute(routeId: string, probe: RouteProbe): void {
    this.probes.set(routeId, probe);
    if (!this.routeStates.has(routeId)) {
      this.routeStates.set(routeId, {
        routeId,
        status: 'healthy',
        availability: 1,
        consecutiveFailures: 0,
      });
    }
  }

  unregisterRoute(routeId: string): boolean {
    this.routeStates.delete(routeId);
    return this.probes.delete(routeId);
  }

  reset(): void {
    this.stopMonitoring();
    this.probes.clear();
    this.routeStates.clear();
  }

  getRouteHealth(routeId: string): RouteHealthState | null {
    return this.routeStates.get(routeId) || null;
  }

  getAllRouteHealth(): RouteHealthState[] {
    return Array.from(this.routeStates.values());
  }

  isRouteDisabled(routeId: string): boolean {
    const state = this.routeStates.get(routeId);
    return !!state && (state.status === 'outage' || state.availability === 0);
  }

  startMonitoring(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(() => {
      void this.checkAll();
    }, this.config.checkIntervalMs);

    void this.checkAll();
  }

  stopMonitoring(): void {
    if (!this.checkInterval) {
      return;
    }

    clearInterval(this.checkInterval);
    this.checkInterval = null;
  }

  async checkAll(): Promise<void> {
    const routeIds = Array.from(this.probes.keys());
    await Promise.all(routeIds.map((routeId) => this.checkRoute(routeId)));
  }

  async checkRoute(routeId: string): Promise<RouteHealthState | null> {
    const probe = this.probes.get(routeId);
    if (!probe) {
      return null;
    }

    let result: RouteProbeResult;
    try {
      result = await this.withTimeout(
        probe(),
        this.config.timeoutMs,
        `Route probe timed out for route ${routeId}`,
      );
    } catch (error: any) {
      result = {
        available: false,
        availability: 0,
        errorMessage: error?.message || String(error),
      };
    }

    const previousState = this.routeStates.get(routeId);
    const state: RouteHealthState = previousState
      ? { ...previousState }
      : {
          routeId,
          status: 'healthy',
          availability: 1,
          consecutiveFailures: 0,
        };

    state.lastChecked = new Date();
    state.lastLatencyMs = result.latencyMs;
    state.lastErrorMessage = result.errorMessage;

    if (result.available) {
      state.consecutiveFailures = 0;
      state.availability = result.availability ?? 1;

      const isLatencyHigh =
        result.latencyMs !== undefined &&
        result.latencyMs > this.config.latencyThresholdMs;

      state.status =
        state.availability < this.config.degradedAvailabilityThreshold || isLatencyHigh
          ? 'degraded'
          : 'healthy';
    } else {
      state.consecutiveFailures += 1;
      state.availability = 0;
      state.status = state.consecutiveFailures >= this.config.unhealthyThreshold
        ? 'outage'
        : 'unhealthy';
    }

    this.routeStates.set(routeId, state);

    if (!previousState || previousState.status !== state.status) {
      this.emitStatusChange(routeId, previousState, state);
    }

    this.updateAlerts(routeId, state);

    return state;
  }

  private updateAlerts(routeId: string, state: RouteHealthState): void {
    const existingAlert = this.activeAlerts.get(routeId);

    if (state.status !== 'healthy') {
      if (!existingAlert || existingAlert.status !== state.status) {
        const alert: RouteHealthAlert = {
          routeId,
          status: state.status,
          message: this.getHealthMessage(state),
          timestamp: new Date(),
          availability: state.availability,
          latencyMs: state.lastLatencyMs,
        };
        this.activeAlerts.set(routeId, alert);
        this.emit('alert', alert);
      }
    } else if (existingAlert) {
      this.activeAlerts.delete(routeId);
      this.emit('alert_resolved', {
        routeId,
        timestamp: new Date(),
        message: `Route ${routeId} has recovered and is now healthy.`,
      });
    }
  }

  private getHealthMessage(state: RouteHealthState): string {
    switch (state.status) {
      case 'outage':
        return `Route ${state.routeId} is experiencing an outage after ${state.consecutiveFailures} consecutive failures.`;
      case 'unhealthy':
        return `Route ${state.routeId} is unhealthy: ${state.lastErrorMessage || 'Service unreachable'}.`;
      case 'degraded':
        if (state.availability < this.config.degradedAvailabilityThreshold) {
          return `Route ${state.routeId} performance is degraded: availability ${(
            state.availability * 100
          ).toFixed(1)}% is below threshold.`;
        }
        return `Route ${state.routeId} performance is degraded: latency ${state.lastLatencyMs}ms exceeds threshold.`;
      default:
        return `Route ${state.routeId} status changed to ${state.status}.`;
    }
  }

  private emitStatusChange(
    routeId: string,
    previousState: RouteHealthState | undefined,
    currentState: RouteHealthState,
  ): void {
    const event = {
      routeId,
      previousStatus: previousState?.status ?? 'healthy',
      currentStatus: currentState.status,
      availability: currentState.availability,
      lastLatencyMs: currentState.lastLatencyMs,
      lastErrorMessage: currentState.lastErrorMessage,
      timestamp: new Date(),
    } as RouteStatusChange;

    this.emit('status-change', event);

    if (currentState.status === 'outage') {
      this.emit('outage', event);
    } else if (currentState.status === 'degraded') {
      this.emit('degraded', event);
    } else if (currentState.status === 'unhealthy') {
      this.emit('unhealthy', event);
    } else if (currentState.status === 'healthy' && previousState?.status !== 'healthy') {
      this.emit('recovered', event);
    }
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timeout);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }
}
