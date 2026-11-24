/** Supported EVM RPC Capabilities discovered dynamically per chain/endpoint. */
export interface EvmRpcCapabilities {
  /** EIP-1559 dynamic fee transactions (eth_feeHistory, maxFeePerGas). */
  eip1559: boolean;
  /** EIP-4844 blob-carrying transactions (eth_blobBaseFee). */
  eip4844: boolean;
  /** Debug & transaction trace methods (debug_traceTransaction, debug_traceCall). */
  debugTrace: boolean;
  /** eth_call state overrides (account state & bytecode override). */
  stateOverride: boolean;
  /** Batch JSON-RPC request support. */
  batchRpc: boolean;
  /** Finalized and safe block tags support (eth_getBlockByNumber with finalized). */
  finalityTags: boolean;
  /** Conditional transaction submission (e.g. eth_sendRawTransactionConditional). */
  conditionalSubmission: boolean;
  /** WebSocket event subscription support. */
  wsSubscriptions: boolean;
}

export type EndpointStatus = 'healthy' | 'degraded' | 'unreachable' | 'chain_mismatch';

export interface ChainRpcCapabilityProfile {
  chainId: number;
  /** Redacted endpoint URL safe for logs/metrics (API keys, query tokens, auth stripped). */
  sanitizedEndpoint: string;
  capabilities: EvmRpcCapabilities;
  status: EndpointStatus;
  latencyMs: number;
  blockNumber: number;
  lastDiscoveredAt: number;
  maxBatchSize: number;
  failureReason?: string;
}

export interface RpcDiscoveryConfig {
  /** Discovery cache TTL in milliseconds. Default: 60,000 (1 min). */
  cacheTtlMs?: number;
  /** Discovery probe timeout in milliseconds. Default: 5,000. */
  timeoutMs?: number;
  /** Injected clock for deterministic testing. */
  now?: () => number;
}

export interface JsonRpcClient {
  call(method: string, params: unknown[]): Promise<unknown>;
}

export class ChainIdMismatchError extends Error {
  constructor(expectedChainId: number, actualChainId: number, endpoint: string) {
    super(`Chain ID mismatch for ${endpoint}: expected ${expectedChainId}, got ${actualChainId}`);
    this.name = 'ChainIdMismatchError';
  }
}

/**
 * Strips secrets, private keys, query API keys, and basic auth from RPC endpoint URLs
 * before logging or exposing them in metrics/audits.
 */
export function sanitizeEndpoint(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = '[REDACTED]';
      parsed.password = '';
    }
    // Redact query parameter credentials (e.g., ?apiKey=..., ?token=..., ?key=...)
    const keysToRedact: string[] = [];
    parsed.searchParams.forEach((_val: string, key: string) => {
      if (/key|token|secret|auth|pass|cred/i.test(key)) {
        keysToRedact.push(key);
      }
    });
    for (const key of keysToRedact) {
      parsed.searchParams.set(key, '[REDACTED]');
    }
    // Redact path-based API keys (e.g. infura / alchemy / quicknode v3/API_KEY)
    const pathParts = parsed.pathname.split('/');
    parsed.pathname = pathParts
      .map((part) => (/^[a-fA-F0-9]{32,}$|^[a-zA-Z0-9_-]{24,}$/.test(part) ? '[REDACTED]' : part))
      .join('/');
    return parsed.toString().replace('//%5BREDACTED%5D@', '//[REDACTED]@');
  } catch {
    // If not a valid URL, replace any secret-looking hex/alphanumeric sequences
    return url.replace(/([?&][a-zA-Z0-9_-]+=[^&]+)/g, '?credentials=[REDACTED]');
  }
}

/**
 * Chain-Specific RPC Capability Discovery Service.
 *
 * Discovers and records EVM node RPC capabilities per chain and endpoint.
 * Features:
 * - Chain boundary preservation: profiles are strictly keyed by (chainId, endpoint).
 * - Concurrency control & deduplication: in-flight discovery requests for the same target
 *   are shared, preventing duplicate probes.
 * - Robust input validation: responses from external RPCs are treated as untrusted.
 * - Auditable safety: endpoint URLs and errors are sanitized to exclude private keys and tokens.
 */
export class ChainRpcCapabilityDiscoveryService {
  private readonly profiles = new Map<string, ChainRpcCapabilityProfile>();
  private readonly inFlight = new Map<string, Promise<ChainRpcCapabilityProfile>>();
  private readonly cacheTtlMs: number;
  private readonly now: () => number;

  constructor(config: RpcDiscoveryConfig = {}) {
    this.cacheTtlMs = config.cacheTtlMs ?? 60_000;
    this.now = config.now ?? Date.now;
  }

  private profileKey(chainId: number, endpoint: string): string {
    return `${chainId}:${sanitizeEndpoint(endpoint)}`;
  }

  /**
   * Retrieves an existing cached profile if valid, or null.
   */
  getCachedProfile(chainId: number, endpoint: string): ChainRpcCapabilityProfile | null {
    const key = this.profileKey(chainId, endpoint);
    const cached = this.profiles.get(key);
    if (!cached) return null;
    if (this.now() - cached.lastDiscoveredAt > this.cacheTtlMs) {
      return null; // Expired
    }
    return cached;
  }

  /**
   * Discovers RPC capabilities for a given chain and endpoint using a JSON-RPC client.
   * Concurrently dedupes probes to prevent duplicate load.
   */
  async discover(
    chainId: number,
    endpoint: string,
    client: JsonRpcClient,
  ): Promise<ChainRpcCapabilityProfile> {
    const key = this.profileKey(chainId, endpoint);
    const cached = this.getCachedProfile(chainId, endpoint);
    if (cached) return cached;

    // Concurrency deduplication
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing;

    const discoveryPromise = this.performDiscovery(chainId, endpoint, client)
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, discoveryPromise);
    return discoveryPromise;
  }

  private async performDiscovery(
    chainId: number,
    endpoint: string,
    client: JsonRpcClient,
  ): Promise<ChainRpcCapabilityProfile> {
    const sanitized = sanitizeEndpoint(endpoint);
    const startTime = this.now();

    try {
      // Step 1: Verify chain ID to preserve chain boundary and prevent replay/cross-chain execution
      const reportedChainIdRaw = await client.call('eth_chainId', []);
      const reportedChainId = typeof reportedChainIdRaw === 'string'
        ? parseInt(reportedChainIdRaw, 16)
        : Number(reportedChainIdRaw);

      if (!Number.isFinite(reportedChainId) || reportedChainId !== chainId) {
        const errorProfile: ChainRpcCapabilityProfile = {
          chainId,
          sanitizedEndpoint: sanitized,
          capabilities: this.defaultCapabilities(false),
          status: 'chain_mismatch',
          latencyMs: this.now() - startTime,
          blockNumber: 0,
          lastDiscoveredAt: this.now(),
          maxBatchSize: 0,
          failureReason: `Chain ID mismatch: expected ${chainId}, received ${reportedChainId}`,
        };
        this.profiles.set(this.profileKey(chainId, endpoint), errorProfile);
        throw new ChainIdMismatchError(chainId, reportedChainId, sanitized);
      }

      // Step 2: Fetch current block number
      const blockNumberRaw = await client.call('eth_blockNumber', []);
      const blockNumber = typeof blockNumberRaw === 'string'
        ? parseInt(blockNumberRaw, 16)
        : Number(blockNumberRaw) || 0;

      // Step 3: Probe EIP-1559 support via eth_feeHistory
      let eip1559 = false;
      try {
        const feeHistory = await client.call('eth_feeHistory', [1, 'latest', [50]]);
        eip1559 = !!(feeHistory && typeof feeHistory === 'object');
      } catch {
        eip1559 = false;
      }

      // Step 4: Probe EIP-4844 blob base fee
      let eip4844 = false;
      try {
        const blobFee = await client.call('eth_blobBaseFee', []);
        eip4844 = blobFee !== undefined && blobFee !== null;
      } catch {
        eip4844 = false;
      }

      // Step 5: Probe Finality tags (eth_getBlockByNumber with 'finalized')
      let finalityTags = false;
      try {
        const finalizedBlock = await client.call('eth_getBlockByNumber', ['finalized', false]);
        finalityTags = !!(finalizedBlock && typeof finalizedBlock === 'object');
      } catch {
        finalityTags = false;
      }

      // Step 6: Probe state override capability via eth_call
      let stateOverride = false;
      try {
        // Safe probe: call zero address with state override empty
        const callResult = await client.call('eth_call', [
          { to: '0x0000000000000000000000000000000000000000', data: '0x' },
          'latest',
          {},
        ]);
        stateOverride = callResult !== undefined;
      } catch {
        stateOverride = false;
      }

      // Step 7: Probe debug trace
      let debugTrace = false;
      try {
        // Non-destructive probe
        await client.call('debug_traceCall', [
          { to: '0x0000000000000000000000000000000000000000', data: '0x' },
          'latest',
          { tracer: 'callTracer' },
        ]);
        debugTrace = true;
      } catch {
        debugTrace = false;
      }

      const latencyMs = Math.max(1, this.now() - startTime);
      const isWs = sanitized.startsWith('ws://') || sanitized.startsWith('wss://');

      const profile: ChainRpcCapabilityProfile = {
        chainId,
        sanitizedEndpoint: sanitized,
        capabilities: {
          eip1559,
          eip4844,
          debugTrace,
          stateOverride,
          batchRpc: true,
          finalityTags,
          conditionalSubmission: false,
          wsSubscriptions: isWs,
        },
        status: 'healthy',
        latencyMs,
        blockNumber,
        lastDiscoveredAt: this.now(),
        maxBatchSize: 100,
      };

      this.profiles.set(this.profileKey(chainId, endpoint), profile);
      return profile;
    } catch (err: unknown) {
      if (err instanceof ChainIdMismatchError) throw err;

      const latencyMs = Math.max(1, this.now() - startTime);
      const errorMessage = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';

      const degradedProfile: ChainRpcCapabilityProfile = {
        chainId,
        sanitizedEndpoint: sanitized,
        capabilities: this.defaultCapabilities(false),
        status: 'unreachable',
        latencyMs,
        blockNumber: 0,
        lastDiscoveredAt: this.now(),
        maxBatchSize: 0,
        failureReason: errorMessage.replace(/([?&][a-zA-Z0-9_-]+=[^&]+)/g, '[REDACTED]'),
      };

      this.profiles.set(this.profileKey(chainId, endpoint), degradedProfile);
      return degradedProfile;
    }
  }

  /**
   * Resets the discovery cache for a given chain or all chains.
   */
  clearCache(chainId?: number): void {
    if (chainId === undefined) {
      this.profiles.clear();
      return;
    }
    for (const [key, profile] of this.profiles.entries()) {
      if (profile.chainId === chainId) {
        this.profiles.delete(key);
      }
    }
  }

  private defaultCapabilities(defaultValue: boolean): EvmRpcCapabilities {
    return {
      eip1559: defaultValue,
      eip4844: defaultValue,
      debugTrace: defaultValue,
      stateOverride: defaultValue,
      batchRpc: defaultValue,
      finalityTags: defaultValue,
      conditionalSubmission: defaultValue,
      wsSubscriptions: defaultValue,
    };
  }
}
