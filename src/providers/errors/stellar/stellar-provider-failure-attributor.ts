import type { StellarBridgeProviderError } from '../../stellar/interfaces/stellar-bridge-provider-adapter.interface';
import type { StellarProviderDependencyGraph } from '../../dependencies/stellar/dependency-graph';
import type {
  DependencyHealth,
  DependencyKind,
  DependencyStatus,
} from '../../dependencies/stellar/types';
import type {
  AttributeProviderFailureContext,
  ProviderDependencyAttribution,
  ProviderFailureAttribution,
  ProviderFailureClass,
} from './types';

const STATUS_SEVERITY: Record<DependencyStatus, number> = {
  healthy: 0,
  unknown: 1,
  degraded: 2,
  unhealthy: 3,
};

const FAILURE_CLASS_KINDS: Partial<
  Record<ProviderFailureClass, DependencyKind[]>
> = {
  rpc: ['rpc', 'horizon'],
  liquidity: ['liquidity'],
  execution: ['contract'],
  availability: ['rpc', 'horizon', 'contract', 'liquidity', 'api', 'indexer'],
};

const RPC_SIGNALS =
  /\b(timeout|timed\s*out|rpc|horizon|network|connection|socket|unavailable\s*endpoint|rate\s*limit)\b/i;
const LIQUIDITY_SIGNALS =
  /\b(liquidity|insufficient\s*liquidity|insufficient\s*funds|balance\s*unavailable|liquidity\s*provider)\b/i;
const CONFIG_SIGNALS =
  /\b(unsupported|invalid\s*request|invalid\s*parameter|configuration|route\s*not\s*supported)\b/i;

const SENSITIVE_DETAIL_KEYS = new Set([
  'authorization',
  'apikey',
  'api_key',
  'token',
  'secret',
  'password',
  'credentials',
  'signedurl',
  'signed_url',
]);

const PRIMARY_CODE_CLASS: Record<
  StellarBridgeProviderError['code'],
  ProviderFailureClass | 'ambiguous'
> = {
  PROVIDER_UNAVAILABLE: 'availability',
  UNSUPPORTED_ROUTE: 'configuration',
  INVALID_REQUEST: 'configuration',
  EXECUTION_FAILED: 'execution',
  STATUS_FAILED: 'execution',
  TIMEOUT: 'rpc',
  RATE_LIMITED: 'rpc',
  UNKNOWN: 'unknown',
  QUOTE_FAILED: 'ambiguous',
  ROUTE_FAILED: 'ambiguous',
};

export class StellarProviderFailureAttributor {
  attribute(
    error: StellarBridgeProviderError,
    context: AttributeProviderFailureContext = {},
  ): ProviderFailureAttribution {
    const failureClass = this.classifyFailureClass(error);
    const dependency = context.dependencyGraph
      ? this.selectFailingDependency(
          context.dependencyGraph,
          error.providerId,
          failureClass,
        )
      : undefined;

    return {
      failureClass,
      dependency,
      details: this.buildDetails(error, context.rawError),
    };
  }

  private classifyFailureClass(
    error: StellarBridgeProviderError,
  ): ProviderFailureClass {
    const primary = PRIMARY_CODE_CLASS[error.code];

    if (primary !== 'ambiguous') {
      return primary;
    }

    const signalText = this.collectSignalText(error);

    if (error.code === 'QUOTE_FAILED') {
      if (LIQUIDITY_SIGNALS.test(signalText)) return 'liquidity';
      if (RPC_SIGNALS.test(signalText)) return 'rpc';
      if (CONFIG_SIGNALS.test(signalText)) return 'configuration';
      return 'unknown';
    }

    if (RPC_SIGNALS.test(signalText)) return 'rpc';
    if (CONFIG_SIGNALS.test(signalText)) return 'configuration';
    return 'unknown';
  }

  private collectSignalText(error: StellarBridgeProviderError): string {
    const parts = [error.message];

    if (error.details) {
      for (const [key, value] of Object.entries(error.details)) {
        if (SENSITIVE_DETAIL_KEYS.has(key.toLowerCase())) continue;
        if (typeof value === 'string' || typeof value === 'number') {
          parts.push(String(value));
        }
      }
    }

    return parts.join(' ');
  }

  private selectFailingDependency(
    graph: StellarProviderDependencyGraph,
    providerId: string,
    failureClass: ProviderFailureClass,
  ): ProviderDependencyAttribution | undefined {
    let failing: DependencyHealth[];

    try {
      failing = graph.providerHealth(providerId).failing;
    } catch {
      return undefined;
    }

    if (failing.length === 0) {
      return undefined;
    }

    const preferredKinds = FAILURE_CLASS_KINDS[failureClass] ?? [];
    const ranked = [...failing].sort((left, right) => {
      const leftDependency = graph.getDependency(left.dependencyId);
      const rightDependency = graph.getDependency(right.dependencyId);

      const leftScore = this.dependencyScore(
        left,
        leftDependency?.kind,
        leftDependency?.critical ?? false,
        preferredKinds,
      );
      const rightScore = this.dependencyScore(
        right,
        rightDependency?.kind,
        rightDependency?.critical ?? false,
        preferredKinds,
      );

      return rightScore - leftScore;
    });

    const selected = ranked[0];
    const dependency = graph.getDependency(selected.dependencyId);

    if (!dependency) {
      return undefined;
    }

    return {
      dependencyId: selected.dependencyId,
      kind: dependency.kind,
      label: dependency.label,
      status: selected.status,
      reason: selected.reason,
    };
  }

  private dependencyScore(
    health: DependencyHealth,
    kind: DependencyKind | undefined,
    critical: boolean,
    preferredKinds: DependencyKind[],
  ): number {
    const statusScore = STATUS_SEVERITY[health.status] * 100;
    const kindScore = kind && preferredKinds.includes(kind) ? 10 : 0;
    const criticalScore = critical ? 1 : 0;

    return statusScore + kindScore + criticalScore;
  }

  private buildDetails(
    error: StellarBridgeProviderError,
    rawError?: unknown,
  ): Record<string, unknown> | undefined {
    const details = { ...(error.details ?? {}) };

    if (details.providerErrorCode === undefined) {
      const providerErrorCode = this.extractProviderErrorCode(rawError);
      if (providerErrorCode !== undefined) {
        details.providerErrorCode = providerErrorCode;
      }
    }

    return Object.keys(details).length > 0 ? details : undefined;
  }

  private extractProviderErrorCode(rawError: unknown): string | undefined {
    if (!rawError || typeof rawError !== 'object') {
      return undefined;
    }

    const candidate = rawError as Record<string, unknown>;
    const code =
      candidate.code ?? candidate.errorCode ?? candidate.providerCode;

    if (typeof code === 'string' && code.length > 0) {
      return code;
    }

    if (typeof code === 'number') {
      return String(code);
    }

    return undefined;
  }
}
