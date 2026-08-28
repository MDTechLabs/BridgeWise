// ─── Soroban contract integration health (#1067) ──────────────────────────────

/** Overall verdict for one contract integration. */
export type ContractHealthStatus =
  'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/** The individual checks that make up a verdict. */
export type ContractCheckName =
  'availability' | 'network' | 'interface' | 'read';

export type SorobanNetwork = 'mainnet' | 'testnet' | 'futurenet' | 'local';

/** A read that is safe to execute against a live contract. */
export interface ReadProbe {
  /** Contract method to invoke. Must be side-effect free. */
  method: string;
  args?: readonly unknown[];
  /**
   * Optional assertion on the returned value. Return a reason to fail the
   * probe, or `null`/`undefined` to accept it.
   *
   * A read that returns *something* is weaker evidence than a read that
   * returns something sensible — a contract can answer while being wired to
   * the wrong asset.
   */
  expect?: (value: unknown) => string | null | undefined;
}

export interface SorobanContractConfig {
  /** Contract id (`C…`). */
  id: string;
  /** Human name used in reports. */
  name: string;
  /** Network this integration is configured against. */
  network: SorobanNetwork;
  /** Methods the integration relies on. */
  expectedMethods: readonly string[];
  /** Safe reads used to prove the contract actually answers. */
  readProbes?: readonly ReadProbe[];
}

/**
 * The RPC surface a health check needs.
 *
 * Injected rather than constructed so a check can run against a real Soroban
 * RPC client, a recorded fixture, or a stub in tests without this module
 * knowing which.
 */
export interface SorobanContractProbe {
  /** Whether the contract exists, and which network answered. */
  getContractInfo(
    contractId: string,
  ): Promise<{ exists: boolean; network?: string }>;
  /** Method names exposed by the contract's spec. */
  listMethods(contractId: string): Promise<readonly string[]>;
  /** Execute a read-only call. */
  callRead(
    contractId: string,
    method: string,
    args?: readonly unknown[],
  ): Promise<unknown>;
}

export interface ContractHealthCheck {
  name: ContractCheckName;
  ok: boolean;
  /** Why it failed, or what it confirmed. */
  message: string;
  durationMs: number;
  /** Set when the check was not run because an earlier one made it moot. */
  skipped?: boolean;
}

export interface ContractHealthResult {
  contractId: string;
  name: string;
  network: SorobanNetwork;
  status: ContractHealthStatus;
  checks: ContractHealthCheck[];
  /** Expected methods the contract does not expose. */
  missingMethods: string[];
  /** Epoch ms at which the check ran. */
  checkedAt: number;
  totalDurationMs: number;
}

export interface HealthCheckOptions {
  /** Per-check timeout. Default 5000ms. */
  timeoutMs?: number;
  /** Injectable clock, for deterministic tests. */
  now?: () => number;
}
