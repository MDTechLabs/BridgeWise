/**
 * Soroban Contract Event Types
 *
 * Type definitions for raw Soroban contract events as emitted by the
 * Stellar network, and the normalized BridgeWise transfer event model
 * used throughout the platform.
 *
 * @module
 */

// ─── Raw Soroban Contract Event ──────────────────────────────────────────────

/**
 * Represents a raw Soroban contract event as returned by the Stellar
 * Soroban RPC or Horizon API.
 */
export interface SorobanContractEvent {
  /** Transaction hash that produced this event */
  transactionHash: string;
  /** Contract address that emitted the event */
  contractId: string;
  /** Ledger sequence number where the event was recorded */
  ledger: number;
  /** Ledger close timestamp (ms since epoch) */
  ledgerClosedAt: number;
  /**
   * Event topics — an array of typed values.
   * Topic 0 is convention the event name (as a Symbol).
   * Remaining topics are indexed parameters.
   */
  topics: SorobanEventTopic[];
  /** Event data payload (decoded or raw) */
  data: Record<string, unknown>;
  /**
   * Optional event type hint from the RPC layer
   * (e.g. "contract", "system", "diagnostic").
   */
  eventType?: string;
  /** 0-based index of the event within the transaction */
  eventIndex?: number;
}

/**
 * A single topic value within a Soroban contract event.
 * Topics can carry strings, numbers, addresses, or opaque buffers.
 */
export interface SorobanEventTopic {
  /** Soroban type tag (e.g. "Symbol", "Address", "U128", "Bytes") */
  type: string;
  /** Decoded value */
  value: unknown;
}

// ─── Normalized BridgeWise Transfer Event ────────────────────────────────────

/**
 * Canonical event types recognised by BridgeWise after normalisation.
 */
export type BridgeWiseTransferEventType =
  | 'transfer'
  | 'mint'
  | 'burn'
  | 'approval'
  | 'lock'
  | 'unlock'
  | 'deposit'
  | 'withdrawal'
  | 'unknown';

/**
 * Normalized transfer event used across BridgeWise modules.
 * Every Soroban contract event is mapped to this shape by the adapter.
 */
export interface BridgeWiseTransferEvent {
  /** Deterministic event identifier (derived from tx hash + index) */
  eventId: string;
  /** Normalized event type */
  eventType: BridgeWiseTransferEventType;
  /** Original event name as emitted by the contract (lower-cased) */
  rawEventName: string;
  /** Sender / source address */
  from: string;
  /** Recipient / destination address */
  to: string;
  /** Transfer amount as a decimal string (preserves precision) */
  amount: string;
  /** Asset identifier — contract address or native asset code */
  asset: string;
  /** Transaction hash that produced the event */
  transactionHash: string;
  /** Contract that emitted the event */
  contractId: string;
  /** Ledger sequence number */
  ledger: number;
  /** Ledger close timestamp (ms since epoch) */
  timestamp: number;
  /** 0-based index within the transaction */
  eventIndex: number;
  /** The full normalised payload (includes extracted + original fields) */
  payload: Record<string, unknown>;
}

// ─── Adapter Configuration ───────────────────────────────────────────────────

/**
 * Configuration for the Soroban contract event adapter.
 */
export interface SorobanContractEventAdapterConfig {
  /**
   * Additional event-name → normalised-type mappings.
   * Keys are lower-cased event names; values are normalised types.
   * These are merged with the built-in mapping.
   */
  eventTypeOverrides?: Record<string, BridgeWiseTransferEventType>;
  /**
   * When true, events that cannot be parsed are returned with
   * eventType 'unknown' and best-effort fields instead of being
   * silently dropped. Default: true.
   */
  preserveUnknownEvents?: boolean;
  /**
   * Default asset to use when no asset can be extracted.
   * Default: "XLM".
   */
  defaultAsset?: string;
}

// ─── Adapter Result ──────────────────────────────────────────────────────────

/**
 * Result of adapting a single Soroban contract event.
 */
export interface SorobanEventAdaptationResult {
  /** The normalised transfer event */
  event: BridgeWiseTransferEvent;
  /** Whether the event was recognised as a known type */
  recognised: boolean;
  /** Warnings generated during adaptation (e.g. missing fields) */
  warnings: string[];
}
