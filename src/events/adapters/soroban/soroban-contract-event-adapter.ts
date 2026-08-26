/**
 * Soroban Contract Event Adapter
 *
 * Normalises raw Soroban contract events into BridgeWise transfer events.
 * Handles event-name resolution, field extraction, identifier preservation,
 * and graceful degradation for unknown or malformed event formats.
 *
 * Features:
 * - Parse Soroban contract events (topics + data)
 * - Extract transfer-related fields (from, to, amount, asset)
 * - Normalise event names to BridgeWise canonical types
 * - Preserve transaction and contract identifiers
 * - Handle unknown event formats without crashing
 * - Configurable event-type overrides
 * - Deterministic event-ID generation
 *
 * Usage:
 *   const adapter = new SorobanContractEventAdapter();
 *   const result = adapter.adapt(rawSorobanEvent);
 *   if (result) {
 *     console.log(result.event.eventType, result.event.from, result.event.to);
 *   }
 *
 *   // Batch adaptation
 *   const events = adapter.adaptMany(rawEvents);
 *
 * @module
 */

import type {
  SorobanContractEvent,
  SorobanEventTopic,
  BridgeWiseTransferEventType,
  BridgeWiseTransferEvent,
  SorobanContractEventAdapterConfig,
  SorobanEventAdaptationResult,
} from '../../types/soroban-contract-event.types';

// ─── Built-in Event-Name Mapping ─────────────────────────────────────────────

/**
 * Maps lower-cased Soroban contract event names to BridgeWise canonical types.
 */
const DEFAULT_EVENT_TYPE_MAP: Record<string, BridgeWiseTransferEventType> = {
  // Standard SEP-41 token events
  transfer: 'transfer',
  mint: 'mint',
  burn: 'burn',
  approve: 'approval',
  approval: 'approval',

  // Bridge-specific events
  lock: 'lock',
  locked: 'lock',
  unlock: 'unlock',
  unlocked: 'unlock',
  deposit: 'deposit',
  deposited: 'deposit',
  withdrawal: 'withdrawal',
  withdraw: 'withdrawal',
  withdrawn: 'withdrawal',

  // Cross-chain bridge events
  bridge_transfer: 'transfer',
  bridge_transfer_initiated: 'transfer',
  bridge_transfer_completed: 'transfer',
  cross_chain_transfer: 'transfer',

  // Common alternative names
  xfer: 'transfer',
  sent: 'transfer',
  received: 'transfer',
};

const DEFAULT_CONFIG: Required<
  Omit<SorobanContractEventAdapterConfig, 'eventTypeOverrides'>
> = {
  preserveUnknownEvents: true,
  defaultAsset: 'XLM',
};

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class SorobanContractEventAdapter {
  private readonly config: Required<
    Omit<SorobanContractEventAdapterConfig, 'eventTypeOverrides'>
  >;
  private readonly eventTypeMap: Record<string, BridgeWiseTransferEventType>;

  constructor(config: SorobanContractEventAdapterConfig = {}) {
    this.config = {
      preserveUnknownEvents:
        config.preserveUnknownEvents ?? DEFAULT_CONFIG.preserveUnknownEvents,
      defaultAsset: config.defaultAsset ?? DEFAULT_CONFIG.defaultAsset,
    };

    // Merge built-in mapping with user overrides
    this.eventTypeMap = {
      ...DEFAULT_EVENT_TYPE_MAP,
      ...(config.eventTypeOverrides ?? {}),
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Adapt a single raw Soroban contract event into a normalised
   * BridgeWise transfer event.
   *
   * Returns `null` when the event cannot be parsed and
   * `preserveUnknownEvents` is disabled.
   */
  adapt(raw: SorobanContractEvent): SorobanEventAdaptationResult | null {
    const warnings: string[] = [];

    try {
      const eventName = this.extractEventName(raw, warnings);
      const eventType = this.resolveEventType(eventName);
      const recognised = eventType !== 'unknown';

      const fields = this.extractTransferFields(raw, warnings);

      const event: BridgeWiseTransferEvent = {
        eventId: this.generateEventId(raw),
        eventType,
        rawEventName: eventName,
        from: fields.from,
        to: fields.to,
        amount: fields.amount,
        asset: fields.asset,
        transactionHash: raw.transactionHash,
        contractId: raw.contractId,
        ledger: raw.ledger,
        timestamp: raw.ledgerClosedAt,
        eventIndex: raw.eventIndex ?? 0,
        payload: this.buildPayload(raw, fields),
      };

      // If unknown and we should not preserve, drop it
      if (!recognised && !this.config.preserveUnknownEvents) {
        return null;
      }

      return { event, recognised, warnings };
    } catch (err) {
      // Last-resort safety net — never throw
      if (!this.config.preserveUnknownEvents) {
        return null;
      }

      warnings.push(
        `Adapter caught unexpected error: ${(err as Error).message}`,
      );

      const event = this.buildFallbackEvent(raw, warnings);
      return { event, recognised: false, warnings };
    }
  }

  /**
   * Adapt a batch of raw Soroban contract events.
   * Events that cannot be parsed are filtered out (or included as
   * 'unknown' depending on configuration).
   */
  adaptMany(rawEvents: SorobanContractEvent[]): SorobanEventAdaptationResult[] {
    const results: SorobanEventAdaptationResult[] = [];
    for (const raw of rawEvents) {
      const result = this.adapt(raw);
      if (result) {
        results.push(result);
      }
    }
    return results;
  }

  /**
   * Resolve a raw event name to its canonical BridgeWise type.
   */
  resolveEventType(eventName: string): BridgeWiseTransferEventType {
    const key = eventName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return this.eventTypeMap[key] ?? 'unknown';
  }

  /**
   * Register additional event-name → type mappings at runtime.
   */
  registerEventTypeMapping(
    mappings: Record<string, BridgeWiseTransferEventType>,
  ): void {
    for (const [name, type] of Object.entries(mappings)) {
      this.eventTypeMap[name.toLowerCase().replace(/[^a-z0-9_]/g, '_')] = type;
    }
  }

  /**
   * Get the current event-type mapping (for inspection / debugging).
   */
  getEventTypeMapping(): Record<string, BridgeWiseTransferEventType> {
    return { ...this.eventTypeMap };
  }

  // ─── Event-Name Extraction ─────────────────────────────────────────────

  /**
   * Extract the event name from the topics array.
   *
   * Soroban convention: topic[0] is the event name encoded as a Symbol.
   * Falls back to data.eventName, data.type, or the raw eventType field.
   */
  private extractEventName(
    raw: SorobanContractEvent,
    warnings: string[],
  ): string {
    // Primary: topic[0] value (Symbol type)
    if (raw.topics && raw.topics.length > 0) {
      const firstTopic = raw.topics[0];
      const name = this.safeString(firstTopic?.value);
      if (name.length > 0) {
        return name;
      }
    }

    // Fallback 1: data.eventName
    if (raw.data && typeof raw.data.eventName === 'string') {
      return raw.data.eventName;
    }

    // Fallback 2: data.type
    if (raw.data && typeof raw.data.type === 'string') {
      return raw.data.type;
    }

    // Fallback 3: raw.eventType (RPC-level hint)
    if (raw.eventType && typeof raw.eventType === 'string') {
      return raw.eventType;
    }

    warnings.push('Could not extract event name from topics or data');
    return 'unknown';
  }

  // ─── Transfer-Field Extraction ─────────────────────────────────────────

  /**
   * Extract transfer-related fields from the event data and topics.
   * Tries multiple common field-name conventions used by Soroban contracts.
   */
  private extractTransferFields(
    raw: SorobanContractEvent,
    warnings: string[],
  ): ExtractedFields {
    const data = raw.data ?? {};
    const topics = raw.topics ?? [];

    return {
      from: this.extractAddress(
        data,
        topics,
        ['from', 'sender', 'source', 'from_address', 'sender_address'],
        1,
        warnings,
        'from',
      ),
      to: this.extractAddress(
        data,
        topics,
        ['to', 'recipient', 'destination', 'to_address', 'recipient_address'],
        2,
        warnings,
        'to',
      ),
      amount: this.extractAmount(data, topics, warnings),
      asset: this.extractAsset(data, topics, warnings),
    };
  }

  /**
   * Extract an address from data fields or topic values.
   */
  private extractAddress(
    data: Record<string, unknown>,
    topics: SorobanEventTopic[],
    fieldNames: string[],
    topicIndex: number,
    warnings: string[],
    label: string,
  ): string {
    // Try data fields first
    for (const fieldName of fieldNames) {
      const value = data[fieldName];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
      // Handle nested address objects (e.g. { from: { address: "G..." } })
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = (value as Record<string, unknown>).address;
        if (typeof nested === 'string' && nested.length > 0) {
          return nested;
        }
      }
    }

    // Fall back to topic value
    if (topics.length > topicIndex) {
      const val = this.safeString(topics[topicIndex]?.value);
      if (val.length > 0) {
        return val;
      }
    }

    warnings.push(
      `Could not extract '${label}' address from event data or topics`,
    );
    return '';
  }

  /**
   * Extract the transfer amount from data or topics.
   */
  private extractAmount(
    data: Record<string, unknown>,
    topics: SorobanEventTopic[],
    warnings: string[],
  ): string {
    // Try common field names
    const amountFields = ['amount', 'value', 'quantity', 'amt'];
    for (const field of amountFields) {
      const raw = data[field];
      if (raw != null) {
        const normalised = this.normaliseAmount(raw);
        if (normalised !== '0') {
          return normalised;
        }
      }
    }

    // Fall back to topic[3] (common for transfer events: name, from, to, amount)
    if (topics.length > 3) {
      const topic = topics[3];
      if (topic && topic.value != null) {
        const normalised = this.normaliseAmount(topic.value);
        if (normalised !== '0') {
          return normalised;
        }
      }
    }

    warnings.push('Could not extract amount from event data or topics');
    return '0';
  }

  /**
   * Extract the asset identifier from data or topics.
   */
  private extractAsset(
    data: Record<string, unknown>,
    topics: SorobanEventTopic[],
    warnings: string[],
  ): string {
    const assetFields = [
      'asset',
      'asset_id',
      'assetId',
      'token',
      'token_id',
      'tokenId',
      'contract',
    ];
    for (const field of assetFields) {
      const value = data[field];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }

    // Fall back to topic[4] if present
    if (topics.length > 4) {
      const val = this.safeString(topics[4]?.value);
      if (val.length > 0) {
        return val;
      }
    }

    // No explicit asset — use default
    warnings.push(
      `Could not extract asset; defaulting to '${this.config.defaultAsset}'`,
    );
    return this.config.defaultAsset;
  }

  /**
   * Normalise an amount value to a decimal string.
   * Handles numbers, bigint-like strings, and objects with an `amount` field.
   */
  private normaliseAmount(raw: unknown): string {
    if (typeof raw === 'string') {
      // Strip whitespace and validate
      const trimmed = raw.trim();
      if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return trimmed;
      }
      // Try parsing as bigint string (e.g. "10000000" stroops)
      if (/^\d+$/.test(trimmed)) {
        return trimmed;
      }
      return '0';
    }

    if (typeof raw === 'number') {
      return String(raw);
    }

    if (typeof raw === 'bigint') {
      return raw.toString();
    }

    // Handle objects like { amount: "100", decimals: 7 }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const obj = raw as Record<string, unknown>;
      if (obj.amount != null) {
        return this.normaliseAmount(obj.amount);
      }
      if (obj.value != null) {
        return this.normaliseAmount(obj.value);
      }
    }

    return '0';
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  /**
   * Safely convert an unknown value to a trimmed string.
   * Returns empty string for null, undefined, objects, and arrays
   * to avoid `[object Object]` stringification.
   */
  private safeString(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'object') return '';
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(value).trim();
  }

  // ─── Identifier Generation ─────────────────────────────────────────────

  /**
   * Generate a deterministic event ID from the transaction hash and
   * event index. This ensures the same event always produces the same ID.
   */
  private generateEventId(raw: SorobanContractEvent): string {
    const idx = raw.eventIndex ?? 0;
    return `soroban_evt:${raw.transactionHash}:${idx}`;
  }

  // ─── Payload Construction ──────────────────────────────────────────────

  /**
   * Build the normalised payload, merging extracted fields with the
   * original raw data for downstream consumers.
   */
  private buildPayload(
    raw: SorobanContractEvent,
    fields: ExtractedFields,
  ): Record<string, unknown> {
    return {
      // Extracted fields (normalised)
      from: fields.from,
      to: fields.to,
      amount: fields.amount,
      asset: fields.asset,

      // Original data preserved for downstream consumers
      originalData: raw.data,
      originalTopics: raw.topics?.map((t) => ({
        type: t.type,
        value: t.value,
      })),

      // Provenance
      sourceContract: raw.contractId,
      transactionHash: raw.transactionHash,
      ledger: raw.ledger,
      eventIndex: raw.eventIndex ?? 0,
    };
  }

  // ─── Fallback Event ────────────────────────────────────────────────────

  /**
   * Build a best-effort fallback event when the adapter encounters
   * an unexpected error during adaptation.
   */
  private buildFallbackEvent(
    raw: SorobanContractEvent,
    warnings: string[],
  ): BridgeWiseTransferEvent {
    return {
      eventId: this.generateEventId(raw),
      eventType: 'unknown',
      rawEventName: 'unknown',
      from: '',
      to: '',
      amount: '0',
      asset: this.config.defaultAsset,
      transactionHash: raw.transactionHash ?? '',
      contractId: raw.contractId ?? '',
      ledger: raw.ledger ?? 0,
      timestamp: raw.ledgerClosedAt ?? 0,
      eventIndex: raw.eventIndex ?? 0,
      payload: {
        originalData: raw.data ?? {},
        originalTopics: raw.topics ?? [],
        sourceContract: raw.contractId ?? '',
        transactionHash: raw.transactionHash ?? '',
        ledger: raw.ledger ?? 0,
        eventIndex: raw.eventIndex ?? 0,
        warnings,
      },
    };
  }
}

// ─── Internal Types ──────────────────────────────────────────────────────────

interface ExtractedFields {
  from: string;
  to: string;
  amount: string;
  asset: string;
}

// ─── Singleton Convenience ───────────────────────────────────────────────────

/**
 * Pre-configured singleton adapter with default settings.
 */
export const sorobanContractEventAdapter = new SorobanContractEventAdapter();
