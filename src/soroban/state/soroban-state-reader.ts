export type SorobanStateValue =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[];

export interface SorobanStateReadError {
  code: 'MISSING_STATE' | 'RPC_FAILURE' | 'INVALID_INPUT';
  message: string;
}

export interface SorobanStateReadResult {
  contractId: string;
  key: string;
  value: SorobanStateValue | null;
  found: boolean;
  network?: string;
  error?: SorobanStateReadError;
}

export interface SorobanStateReaderConfig {
  cacheTtlMs?: number;
}

export class SorobanStateReader {
  private readonly cache = new Map<
    string,
    { value: SorobanStateValue | null; expiresAt: number }
  >();
  private readonly config: Required<SorobanStateReaderConfig>;

  constructor(config: SorobanStateReaderConfig = {}) {
    this.config = {
      cacheTtlMs: config.cacheTtlMs ?? 60 * 1000,
    };
  }

  async readState(
    contractId: string,
    key: string,
    options: {
      network?: string;
      readFn?: (
        contractId: string,
        key: string,
        network?: string,
      ) => Promise<SorobanStateValue | null>;
    } = {},
  ): Promise<SorobanStateReadResult> {
    const normalizedContractId = (contractId ?? '').trim();
    const normalizedKey = (key ?? '').trim();
    const network = options.network ?? 'public';

    if (!normalizedContractId || !normalizedKey) {
      return {
        contractId: normalizedContractId,
        key: normalizedKey,
        value: null,
        found: false,
        network,
        error: {
          code: 'INVALID_INPUT',
          message: 'contractId and key are required',
        },
      };
    }

    const cacheKey = `${network}:${normalizedContractId}:${normalizedKey}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        contractId: normalizedContractId,
        key: normalizedKey,
        value: cached.value,
        found: cached.value !== null,
        network,
      };
    }

    const readFn = options.readFn ?? (async () => null);

    try {
      const rawValue = await readFn(
        normalizedContractId,
        normalizedKey,
        network,
      );
      const normalizedValue = this.normalizeValue(rawValue);
      this.cache.set(cacheKey, {
        value: normalizedValue,
        expiresAt: Date.now() + this.config.cacheTtlMs,
      });

      return {
        contractId: normalizedContractId,
        key: normalizedKey,
        value: normalizedValue,
        found: normalizedValue !== null,
        network,
      };
    } catch (error) {
      return {
        contractId: normalizedContractId,
        key: normalizedKey,
        value: null,
        found: false,
        network,
        error: {
          code: 'RPC_FAILURE',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  private normalizeValue(
    value: SorobanStateValue | null | undefined,
  ): SorobanStateValue | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (Array.isArray(value) || typeof value === 'object') {
      return JSON.parse(JSON.stringify(value));
    }

    return String(value);
  }
}
