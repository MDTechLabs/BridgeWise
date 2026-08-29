import type {
  ContractHealthCheck,
  ContractHealthResult,
  ContractHealthStatus,
  HealthCheckOptions,
  SorobanContractConfig,
  SorobanContractProbe,
} from './types';

export const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Reject if `promise` has not settled within `timeoutMs`.
 *
 * A probe that hangs is a failure mode in its own right — an integration that
 * never answers is not healthy, and without a bound the whole health check
 * would hang with it.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * A readable message for anything that can be thrown.
 *
 * `String(error)` on a plain object yields `[object Object]`, which tells an
 * operator reading a health report nothing at all.
 */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error) ?? 'Unknown error';
  } catch {
    return 'Unknown error';
  }
}

/**
 * Health-check one Soroban contract integration (#1067).
 *
 * Four checks, run in order, because each one is only meaningful if the
 * previous passed:
 *
 * 1. **Availability** — does the contract exist? Nothing else can be
 *    interpreted if it does not, so the remaining checks are skipped rather
 *    than reported as failures they cannot fairly be blamed for.
 * 2. **Network** — did the *expected* network answer? A contract that responds
 *    from the wrong network is worse than one that does not respond at all:
 *    the integration looks healthy while reading someone else's state.
 * 3. **Interface** — are the methods the integration calls actually there?
 * 4. **Read** — do safe reads succeed, and return something sensible?
 *
 * Severity is graded rather than binary. A missing method or a wrong network
 * is `unhealthy` — the integration cannot work. A failing read on an
 * otherwise correct contract is `degraded` — the wiring is right and the
 * fault may be transient.
 */
export async function checkSorobanContractHealth(
  config: SorobanContractConfig,
  probe: SorobanContractProbe,
  options: HealthCheckOptions = {},
): Promise<ContractHealthResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, now = Date.now } = options;

  const startedAt = now();
  const checks: ContractHealthCheck[] = [];
  const missingMethods: string[] = [];

  const timed = async (
    name: ContractHealthCheck['name'],
    run: () => Promise<{ ok: boolean; message: string }>,
  ): Promise<boolean> => {
    const from = now();

    try {
      const outcome = await run();

      checks.push({ name, ...outcome, durationMs: now() - from });

      return outcome.ok;
    } catch (error) {
      checks.push({
        name,
        ok: false,
        message: messageOf(error),
        durationMs: now() - from,
      });

      return false;
    }
  };

  const skip = (name: ContractHealthCheck['name'], message: string) => {
    checks.push({ name, ok: false, message, durationMs: 0, skipped: true });
  };

  // ── 1. Availability ────────────────────────────────────────────────────
  let reportedNetwork: string | undefined;

  const available = await timed('availability', async () => {
    const info = await withTimeout(
      probe.getContractInfo(config.id),
      timeoutMs,
      'availability check',
    );

    reportedNetwork = info.network;

    return info.exists
      ? { ok: true, message: `Contract ${config.id} is present` }
      : { ok: false, message: `Contract ${config.id} was not found` };
  });

  if (!available) {
    // Everything below asks a question about a contract that is not there.
    skip('network', 'Skipped: contract unavailable');
    skip('interface', 'Skipped: contract unavailable');
    skip('read', 'Skipped: contract unavailable');

    return {
      contractId: config.id,
      name: config.name,
      network: config.network,
      status: 'unhealthy',
      checks,
      missingMethods: [...config.expectedMethods],
      checkedAt: startedAt,
      totalDurationMs: now() - startedAt,
    };
  }

  // ── 2. Network ─────────────────────────────────────────────────────────
  const networkOk = await timed('network', async () => {
    if (!reportedNetwork) {
      return {
        ok: true,
        message: 'Probe did not report a network; assuming configured network',
      };
    }

    return reportedNetwork === config.network
      ? { ok: true, message: `Answered on ${reportedNetwork}` }
      : {
          ok: false,
          message: `Configured for ${config.network} but answered on ${reportedNetwork}`,
        };
  });

  // ── 3. Interface ───────────────────────────────────────────────────────
  const interfaceOk = await timed('interface', async () => {
    const methods = await withTimeout(
      probe.listMethods(config.id),
      timeoutMs,
      'interface check',
    );
    const present = new Set(methods);

    for (const expected of config.expectedMethods) {
      if (!present.has(expected)) missingMethods.push(expected);
    }

    return missingMethods.length === 0
      ? {
          ok: true,
          message: `All ${config.expectedMethods.length} expected method(s) present`,
        }
      : {
          ok: false,
          message: `Missing method(s): ${missingMethods.join(', ')}`,
        };
  });

  // ── 4. Reads ───────────────────────────────────────────────────────────
  const probes = config.readProbes ?? [];

  const readsOk =
    probes.length === 0
      ? (skip('read', 'Skipped: no read probes configured'), true)
      : await timed('read', async () => {
          const failures: string[] = [];

          for (const readProbe of probes) {
            try {
              const value = await withTimeout(
                probe.callRead(config.id, readProbe.method, readProbe.args),
                timeoutMs,
                `read ${readProbe.method}`,
              );

              const rejection = readProbe.expect?.(value);

              if (rejection) failures.push(`${readProbe.method}: ${rejection}`);
            } catch (error) {
              failures.push(`${readProbe.method}: ${messageOf(error)}`);
            }
          }

          return failures.length === 0
            ? { ok: true, message: `${probes.length} read probe(s) succeeded` }
            : { ok: false, message: failures.join('; ') };
        });

  // A contract on the wrong network, or missing methods the integration
  // calls, cannot work at all. A failing read on an otherwise correct
  // contract may be transient.
  let status: ContractHealthStatus;

  if (!networkOk || !interfaceOk) status = 'unhealthy';
  else if (!readsOk) status = 'degraded';
  else status = 'healthy';

  return {
    contractId: config.id,
    name: config.name,
    network: config.network,
    status,
    checks,
    missingMethods,
    checkedAt: startedAt,
    totalDurationMs: now() - startedAt,
  };
}
