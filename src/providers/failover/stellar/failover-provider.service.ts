export interface BridgeProvider {
  name: string;
  url: string;
  priority: number;
}

export interface FailoverResult {
  provider: BridgeProvider;
  failedProviders: string[];
}

export interface FailoverOptions {
  idempotent: boolean;
}

export interface ProviderCircuitStatus {
  provider: string;
  consecutiveFailures: number;
  state: 'closed' | 'open' | 'half_open';
  retryAt: number | null;
}

interface ProviderCircuit {
  consecutiveFailures: number;
  openUntil: number;
  trialInFlight: boolean;
}

export class StellarBridgeFailoverProvider {
  private readonly providers: BridgeProvider[];
  private readonly timeoutMs: number;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly now: () => number;
  private readonly circuits = new Map<string, ProviderCircuit>();

  constructor(
    providers: BridgeProvider[],
    options: number | {
      timeoutMs?: number;
      failureThreshold?: number;
      resetTimeoutMs?: number;
      now?: () => number;
    } = {},
  ) {
    this.providers = [...providers].sort((a, b) => a.priority - b.priority);
    const config = typeof options === 'number' ? { timeoutMs: options } : options;
    this.timeoutMs = config.timeoutMs ?? 5000;
    this.failureThreshold = config.failureThreshold ?? 3;
    this.resetTimeoutMs = config.resetTimeoutMs ?? 30_000;
    this.now = config.now ?? (() => Date.now());

    if (this.failureThreshold < 1) {
      throw new RangeError('failureThreshold must be at least 1');
    }
    if (this.resetTimeoutMs < 0 || this.timeoutMs < 0) {
      throw new RangeError('timeout values cannot be negative');
    }
    for (const provider of this.providers) {
      this.circuits.set(provider.name, {
        consecutiveFailures: 0,
        openUntil: 0,
        trialInFlight: false,
      });
    }
  }

  /** Execute through ordered providers. Automatic retry is restricted to idempotent calls. */
  async execute<T>(
    operation: (
      provider: BridgeProvider,
      context: { signal: AbortSignal },
    ) => Promise<T>,
    options: FailoverOptions,
  ): Promise<FailoverResult & { value: T }> {
    const failedProviders: string[] = [];
    let lastError: unknown;

    for (const provider of this.providers) {
      const circuit = this.circuits.get(provider.name)!;
      if (!this.beginAttempt(circuit)) {
        failedProviders.push(provider.name);
        continue;
      }

      try {
        const value = await this.executeWithTimeout(provider, operation);
        this.recordSuccess(circuit);
        return { provider, failedProviders, value };
      } catch (error) {
        this.recordFailure(circuit);
        failedProviders.push(provider.name);
        lastError = error;
        if (!options.idempotent) throw error;
      }
    }

    const error = new Error(
      `All bridge providers unavailable: ${failedProviders.join(', ')}`,
    );
    if (lastError !== undefined) (error as Error & { cause?: unknown }).cause = lastError;
    throw error;
  }

  /**
   * Returns the first healthy provider, detecting failures and switching to backups.
   */
  async getActiveProvider(): Promise<FailoverResult> {
    const failedProviders: string[] = [];

    for (const provider of this.providers) {
      const circuit = this.circuits.get(provider.name)!;
      if (!this.beginAttempt(circuit)) {
        failedProviders.push(provider.name);
        continue;
      }
      const healthy = await this.isHealthy(provider);
      if (healthy) {
        this.recordSuccess(circuit);
        return { provider, failedProviders };
      }
      this.recordFailure(circuit);
      failedProviders.push(provider.name);
    }

    throw new Error(`All bridge providers unavailable: ${failedProviders.join(', ')}`);
  }

  /** Marks a provider as recovered so it can be retried. */
  recover(providerName: string): void {
    const circuit = this.circuits.get(providerName);
    if (circuit) this.recordSuccess(circuit);
  }

  /** Exposes bounded operational state without endpoint URLs or credentials. */
  getCircuitStatuses(): ProviderCircuitStatus[] {
    return this.providers.map((provider) => {
      const circuit = this.circuits.get(provider.name)!;
      const open = circuit.openUntil > this.now();
      const state = open
        ? 'open'
        : circuit.openUntil > 0 || circuit.trialInFlight
          ? 'half_open'
          : 'closed';
      return {
        provider: provider.name,
        consecutiveFailures: circuit.consecutiveFailures,
        state,
        retryAt: open ? circuit.openUntil : null,
      };
    });
  }

  private beginAttempt(circuit: ProviderCircuit): boolean {
    if (circuit.openUntil > this.now()) return false;
    if (circuit.openUntil > 0 && circuit.trialInFlight) return false;
    if (circuit.openUntil > 0) circuit.trialInFlight = true;
    return true;
  }

  private recordSuccess(circuit: ProviderCircuit): void {
    circuit.consecutiveFailures = 0;
    circuit.openUntil = 0;
    circuit.trialInFlight = false;
  }

  private recordFailure(circuit: ProviderCircuit): void {
    circuit.trialInFlight = false;
    circuit.consecutiveFailures++;
    if (circuit.consecutiveFailures >= this.failureThreshold) {
      circuit.openUntil = this.now() + this.resetTimeoutMs;
    }
  }

  private async executeWithTimeout<T>(
    provider: BridgeProvider,
    operation: (
      provider: BridgeProvider,
      context: { signal: AbortSignal },
    ) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error(`Provider ${provider.name} request timed out`));
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([
        operation(provider, { signal: controller.signal }),
        timeout,
      ]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  private async isHealthy(provider: BridgeProvider): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.timeoutMs,
      );
      try {
        const res = await fetch(provider.url, { signal: controller.signal });
        return res.ok;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      return false;
    }
  }
}
