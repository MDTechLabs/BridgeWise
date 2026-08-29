/**
 * Strict, zero-dependency chain configuration validator. (Issue #729)
 *
 * Complements the existing configuration utilities in this package with a
 * strict validator that returns descriptive, field-level errors, so a malformed
 * network configuration fails fast at startup instead of causing runtime
 * relayer panics and failed RPC connections during multi-chain sync.
 *
 * It intentionally has no external dependencies (no Zod/Ajv) so it can run in
 * any context without additional install steps.
 */

/** http(s) or ws(s) RPC endpoint. */
const RPC_URL_REGEX = /^(https?|wss?):\/\/[^\s]+$/i;
/** 0x-prefixed, 40 hex character EVM address. */
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  bridgeRegistryAddress: string;
  confirmationDepth: number;
}

export interface ValidationIssue {
  /** Dot-path to the offending field (e.g. `rpcUrl`, `ethereum.chainId`). */
  path: string;
  message: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors: ValidationIssue[];
}

const ALLOWED_KEYS: ReadonlyArray<keyof ChainConfig> = [
  "name",
  "chainId",
  "rpcUrl",
  "bridgeRegistryAddress",
  "confirmationDepth",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate a single chain configuration, returning descriptive field errors. */
export function validateChainConfig(input: unknown): ValidationResult<ChainConfig> {
  if (!isObject(input)) {
    return {
      success: false,
      errors: [{ path: "(root)", message: "chain config must be an object" }],
    };
  }

  const errors: ValidationIssue[] = [];
  const { name, chainId, rpcUrl, bridgeRegistryAddress, confirmationDepth } = input;

  if (typeof name !== "string" || name.trim().length === 0) {
    errors.push({ path: "name", message: "name is required and must be a non-empty string" });
  }

  if (typeof chainId !== "number" || !Number.isInteger(chainId) || chainId <= 0) {
    errors.push({ path: "chainId", message: "chainId must be a positive integer" });
  }

  if (typeof rpcUrl !== "string" || !RPC_URL_REGEX.test(rpcUrl)) {
    errors.push({ path: "rpcUrl", message: "rpcUrl must be a valid http(s) or ws(s) URL" });
  }

  if (typeof bridgeRegistryAddress !== "string" || !EVM_ADDRESS_REGEX.test(bridgeRegistryAddress)) {
    errors.push({
      path: "bridgeRegistryAddress",
      message: "bridgeRegistryAddress must be a 0x-prefixed 40-hex EVM address",
    });
  }

  if (
    typeof confirmationDepth !== "number" ||
    !Number.isInteger(confirmationDepth) ||
    confirmationDepth < 0
  ) {
    errors.push({ path: "confirmationDepth", message: "confirmationDepth must be an integer >= 0" });
  }

  // Reject unknown keys so a typo (e.g. `rcpUrl`) is surfaced, not silently ignored.
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.includes(key as keyof ChainConfig)) {
      errors.push({ path: key, message: `unknown field "${key}"` });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      name: name as string,
      chainId: chainId as number,
      rpcUrl: rpcUrl as string,
      bridgeRegistryAddress: bridgeRegistryAddress as string,
      confirmationDepth: confirmationDepth as number,
    },
    errors: [],
  };
}

/**
 * Validate a map of `chainKey -> ChainConfig`. Errors from every chain are
 * aggregated with the chain key prefixed onto each field path.
 */
export function validateChainConfigMap(
  input: Record<string, unknown>
): ValidationResult<Record<string, ChainConfig>> {
  const data: Record<string, ChainConfig> = {};
  const errors: ValidationIssue[] = [];

  for (const [chainKey, value] of Object.entries(input)) {
    const result = validateChainConfig(value);
    if (result.success && result.data) {
      data[chainKey] = result.data;
    } else {
      for (const issue of result.errors) {
        errors.push({ path: `${chainKey}.${issue.path}`, message: issue.message });
      }
    }
  }

  return {
    success: errors.length === 0,
    data: errors.length === 0 ? data : undefined,
    errors,
  };
}

/**
 * Validate a chain configuration map at application startup, throwing a single
 * descriptive error that lists every problem found.
 */
export function assertValidChainConfigMap(
  input: Record<string, unknown>
): Record<string, ChainConfig> {
  const result = validateChainConfigMap(input);
  if (!result.success || !result.data) {
    const details = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Invalid chain configuration:\n${details}`);
  }
  return result.data;
}
