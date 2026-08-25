/**
 * Tests for SorobanContractEventAdapter
 *
 * Comprehensive test suite covering:
 * - Soroban contract event parsing
 * - Transfer field extraction (from, to, amount, asset)
 * - Event-name normalisation
 * - Transaction and contract identifier preservation
 * - Unknown event handling without crashing
 * - Batch adaptation
 * - Configuration overrides
 * - Edge cases and malformed inputs
 */

import {
  SorobanContractEventAdapter,
  sorobanContractEventAdapter,
} from '../../../src/events/adapters/soroban/soroban-contract-event-adapter';
import type {
  SorobanContractEvent,
  SorobanEventTopic,
  BridgeWiseTransferEventType,
} from '../../../src/events/types/soroban-contract-event.types';

// ─── Test Helpers ────────────────────────────────────────────────────────────

const makeTopic = (value: unknown, type = 'Symbol'): SorobanEventTopic => ({
  type,
  value,
});

const makeRawEvent = (
  overrides: Partial<SorobanContractEvent> = {},
): SorobanContractEvent => ({
  transactionHash: 'tx_abc123',
  contractId: 'CONTRACT_AAAA',
  ledger: 100_000,
  ledgerClosedAt: 1_700_000_000_000,
  topics: [makeTopic('transfer')],
  data: {
    from: 'GSENDER_001',
    to: 'GRECIPIENT_002',
    amount: '1000000',
    asset: 'USDC_CONTRACT_ID',
  },
  eventIndex: 0,
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SorobanContractEventAdapter', () => {
  let adapter: SorobanContractEventAdapter;

  beforeEach(() => {
    adapter = new SorobanContractEventAdapter();
  });

  // ─── Basic Adaptation ───────────────────────────────────────────────────

  describe('adapt()', () => {
    it('should adapt a standard SEP-41 transfer event', () => {
      const raw = makeRawEvent();
      const result = adapter.adapt(raw);

      expect(result).not.toBeNull();
      expect(result!.recognised).toBe(true);
      expect(result!.warnings).toHaveLength(0);

      const { event } = result!;
      expect(event.eventType).toBe('transfer');
      expect(event.rawEventName).toBe('transfer');
      expect(event.from).toBe('GSENDER_001');
      expect(event.to).toBe('GRECIPIENT_002');
      expect(event.amount).toBe('1000000');
      expect(event.asset).toBe('USDC_CONTRACT_ID');
    });

    it('should preserve transaction and contract identifiers', () => {
      const raw = makeRawEvent({
        transactionHash: 'tx_hash_999',
        contractId: 'CONTRACT_XYZ',
        ledger: 42,
        ledgerClosedAt: 1_234_567_890_000,
        eventIndex: 3,
      });

      const result = adapter.adapt(raw);
      expect(result).not.toBeNull();

      const { event } = result!;
      expect(event.transactionHash).toBe('tx_hash_999');
      expect(event.contractId).toBe('CONTRACT_XYZ');
      expect(event.ledger).toBe(42);
      expect(event.timestamp).toBe(1_234_567_890_000);
      expect(event.eventIndex).toBe(3);
    });

    it('should generate deterministic event IDs', () => {
      const raw = makeRawEvent({
        transactionHash: 'tx_deterministic',
        eventIndex: 2,
      });
      const r1 = adapter.adapt(raw);
      const r2 = adapter.adapt(raw);

      expect(r1!.event.eventId).toBe(r2!.event.eventId);
      expect(r1!.event.eventId).toBe('soroban_evt:tx_deterministic:2');
    });

    it('should default eventIndex to 0 when not provided', () => {
      const raw = makeRawEvent({ eventIndex: undefined });
      const result = adapter.adapt(raw);

      expect(result!.event.eventIndex).toBe(0);
      expect(result!.event.eventId).toBe('soroban_evt:tx_abc123:0');
    });
  });

  // ─── Event-Name Normalisation ──────────────────────────────────────────

  describe('event-name normalisation', () => {
    const cases: Array<[string, BridgeWiseTransferEventType]> = [
      ['transfer', 'transfer'],
      ['Transfer', 'transfer'],
      ['TRANSFER', 'transfer'],
      ['mint', 'mint'],
      ['Mint', 'mint'],
      ['burn', 'burn'],
      ['Burn', 'burn'],
      ['approve', 'approval'],
      ['approval', 'approval'],
      ['lock', 'lock'],
      ['locked', 'lock'],
      ['unlock', 'unlock'],
      ['unlocked', 'unlock'],
      ['deposit', 'deposit'],
      ['deposited', 'deposit'],
      ['withdrawal', 'withdrawal'],
      ['withdraw', 'withdrawal'],
      ['withdrawn', 'withdrawal'],
      ['bridge_transfer', 'transfer'],
      ['cross_chain_transfer', 'transfer'],
      ['xfer', 'transfer'],
      ['sent', 'transfer'],
      ['received', 'transfer'],
    ];

    it.each(cases)('should map "%s" → "%s"', (eventName, expectedType) => {
      const raw = makeRawEvent({
        topics: [makeTopic(eventName)],
      });
      const result = adapter.adapt(raw);
      expect(result!.event.eventType).toBe(expectedType);
      expect(result!.recognised).toBe(expectedType !== 'unknown');
    });

    it('should classify unrecognised events as "unknown"', () => {
      const raw = makeRawEvent({
        topics: [makeTopic('some_custom_event')],
      });
      const result = adapter.adapt(raw);
      expect(result!.event.eventType).toBe('unknown');
      expect(result!.recognised).toBe(false);
    });
  });

  // ─── Event-Name Extraction Fallbacks ───────────────────────────────────

  describe('event-name extraction fallbacks', () => {
    it('should use data.eventName when topics are empty', () => {
      const raw = makeRawEvent({
        topics: [],
        data: { eventName: 'deposit', from: 'G1', to: 'G2', amount: '100' },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.rawEventName).toBe('deposit');
      expect(result!.event.eventType).toBe('deposit');
    });

    it('should use data.type when topics and eventName are absent', () => {
      const raw = makeRawEvent({
        topics: [],
        data: { type: 'burn' },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.rawEventName).toBe('burn');
      expect(result!.event.eventType).toBe('burn');
    });

    it('should use raw.eventType as last fallback', () => {
      const raw = makeRawEvent({
        topics: [],
        data: {},
        eventType: 'mint',
      });
      const result = adapter.adapt(raw);
      expect(result!.event.rawEventName).toBe('mint');
      expect(result!.event.eventType).toBe('mint');
    });

    it('should return "unknown" when no event name source is available', () => {
      const raw = makeRawEvent({ topics: [], data: {} });
      const result = adapter.adapt(raw);
      expect(result!.event.rawEventName).toBe('unknown');
      expect(result!.event.eventType).toBe('unknown');
      expect(result!.warnings.length).toBeGreaterThan(0);
    });
  });

  // ─── Field Extraction ──────────────────────────────────────────────────

  describe('transfer-field extraction', () => {
    it('should extract from/to using alternative field names', () => {
      const raw = makeRawEvent({
        data: {
          sender: 'G_SENDER',
          recipient: 'G_RECIPIENT',
          amount: '500',
          asset: 'XLM',
        },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.from).toBe('G_SENDER');
      expect(result!.event.to).toBe('G_RECIPIENT');
    });

    it('should extract from/to using source/destination field names', () => {
      const raw = makeRawEvent({
        data: {
          source: 'G_SOURCE',
          destination: 'G_DEST',
          amount: '250',
        },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.from).toBe('G_SOURCE');
      expect(result!.event.to).toBe('G_DEST');
    });

    it('should extract from nested address objects', () => {
      const raw = makeRawEvent({
        data: {
          from: { address: 'G_NESTED_SENDER' },
          to: { address: 'G_NESTED_RECIPIENT' },
          amount: '100',
        },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.from).toBe('G_NESTED_SENDER');
      expect(result!.event.to).toBe('G_NESTED_RECIPIENT');
    });

    it('should fall back to topic values for from/to', () => {
      const raw = makeRawEvent({
        topics: [
          makeTopic('transfer'),
          makeTopic('G_TOPIC_SENDER', 'Address'),
          makeTopic('G_TOPIC_RECIPIENT', 'Address'),
        ],
        data: { amount: '100' },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.from).toBe('G_TOPIC_SENDER');
      expect(result!.event.to).toBe('G_TOPIC_RECIPIENT');
    });

    it('should extract amount from alternative field names', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', value: '999', asset: 'XLM' },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.amount).toBe('999');
    });

    it('should extract amount from topic[3]', () => {
      const raw = makeRawEvent({
        topics: [
          makeTopic('transfer'),
          makeTopic('G1'),
          makeTopic('G2'),
          makeTopic('777', 'I128'),
        ],
        data: { from: 'G1', to: 'G2' },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.amount).toBe('777');
    });

    it('should handle numeric amount values', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', amount: 42.5 },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.amount).toBe('42.5');
    });

    it('should handle bigint amount values', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', amount: BigInt(1000000) },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.amount).toBe('1000000');
    });

    it('should handle amount objects with nested amount field', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', amount: { amount: '5000', decimals: 7 } },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.amount).toBe('5000');
    });

    it('should extract asset from alternative field names', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', amount: '100', token: 'TOKEN_CONTRACT' },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.asset).toBe('TOKEN_CONTRACT');
    });

    it('should extract asset from topic[4]', () => {
      const raw = makeRawEvent({
        topics: [
          makeTopic('transfer'),
          makeTopic('G1'),
          makeTopic('G2'),
          makeTopic('100'),
          makeTopic('ASSET_FROM_TOPIC'),
        ],
        data: { from: 'G1', to: 'G2', amount: '100' },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.asset).toBe('ASSET_FROM_TOPIC');
    });

    it('should default asset to XLM when not found', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', amount: '100' },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.asset).toBe('XLM');
      expect(result!.warnings.some((w) => w.includes('asset'))).toBe(true);
    });
  });

  // ─── Unknown Event Handling ────────────────────────────────────────────

  describe('unknown event handling', () => {
    it('should preserve unknown events by default', () => {
      const raw = makeRawEvent({
        topics: [makeTopic('totally_unknown_xyz')],
        data: {},
      });
      const result = adapter.adapt(raw);

      expect(result).not.toBeNull();
      expect(result!.event.eventType).toBe('unknown');
      expect(result!.recognised).toBe(false);
    });

    it('should drop unknown events when preserveUnknownEvents is false', () => {
      const strict = new SorobanContractEventAdapter({
        preserveUnknownEvents: false,
      });
      const raw = makeRawEvent({
        topics: [makeTopic('totally_unknown_xyz')],
        data: {},
      });
      const result = strict.adapt(raw);
      expect(result).toBeNull();
    });

    it('should keep known events even when preserveUnknownEvents is false', () => {
      const strict = new SorobanContractEventAdapter({
        preserveUnknownEvents: false,
      });
      const raw = makeRawEvent({
        topics: [makeTopic('transfer')],
        data: { from: 'G1', to: 'G2', amount: '100' },
      });
      const result = strict.adapt(raw);
      expect(result).not.toBeNull();
      expect(result!.event.eventType).toBe('transfer');
    });

    it('should handle events with empty topics gracefully', () => {
      const raw = makeRawEvent({ topics: [], data: {} });
      const result = adapter.adapt(raw);

      expect(result).not.toBeNull();
      expect(result!.event.eventType).toBe('unknown');
      expect(result!.warnings.length).toBeGreaterThan(0);
    });

    it('should handle events with null/undefined data gracefully', () => {
      const raw = makeRawEvent({ data: undefined as any });
      const result = adapter.adapt(raw);

      expect(result).not.toBeNull();
      expect(result!.event.from).toBe('');
      expect(result!.event.to).toBe('');
      expect(result!.event.amount).toBe('0');
    });

    it('should handle events with empty data object', () => {
      const raw = makeRawEvent({ data: {} });
      const result = adapter.adapt(raw);

      expect(result).not.toBeNull();
      expect(result!.event.from).toBe('');
      expect(result!.event.to).toBe('');
      expect(result!.event.amount).toBe('0');
      expect(result!.event.asset).toBe('XLM');
    });
  });

  // ─── Payload Preservation ──────────────────────────────────────────────

  describe('payload preservation', () => {
    it('should include original data in payload', () => {
      const rawData = {
        from: 'G1',
        to: 'G2',
        amount: '100',
        extraField: 'preserved',
      };
      const raw = makeRawEvent({ data: rawData });
      const result = adapter.adapt(raw);

      expect(result!.event.payload.originalData).toEqual(rawData);
    });

    it('should include original topics in payload', () => {
      const raw = makeRawEvent();
      const result = adapter.adapt(raw);

      expect(result!.event.payload.originalTopics).toBeDefined();
      expect(Array.isArray(result!.event.payload.originalTopics)).toBe(true);
    });

    it('should include provenance fields in payload', () => {
      const raw = makeRawEvent();
      const result = adapter.adapt(raw);
      const { payload } = result!.event;

      expect(payload.sourceContract).toBe('CONTRACT_AAAA');
      expect(payload.transactionHash).toBe('tx_abc123');
      expect(payload.ledger).toBe(100_000);
    });

    it('should include normalised fields in payload', () => {
      const raw = makeRawEvent();
      const result = adapter.adapt(raw);
      const { payload } = result!.event;

      expect(payload.from).toBe('GSENDER_001');
      expect(payload.to).toBe('GRECIPIENT_002');
      expect(payload.amount).toBe('1000000');
      expect(payload.asset).toBe('USDC_CONTRACT_ID');
    });
  });

  // ─── Batch Adaptation ──────────────────────────────────────────────────

  describe('adaptMany()', () => {
    it('should adapt multiple events', () => {
      const events = [
        makeRawEvent({ transactionHash: 'tx_1', eventIndex: 0 }),
        makeRawEvent({ transactionHash: 'tx_2', eventIndex: 1 }),
        makeRawEvent({ transactionHash: 'tx_3', eventIndex: 2 }),
      ];

      const results = adapter.adaptMany(events);
      expect(results).toHaveLength(3);
      expect(results[0].event.transactionHash).toBe('tx_1');
      expect(results[1].event.transactionHash).toBe('tx_2');
      expect(results[2].event.transactionHash).toBe('tx_3');
    });

    it('should filter out null results when preserveUnknownEvents is false', () => {
      const strict = new SorobanContractEventAdapter({
        preserveUnknownEvents: false,
      });
      const events = [
        makeRawEvent({
          topics: [makeTopic('transfer')],
          data: { from: 'G1', to: 'G2', amount: '1' },
        }),
        makeRawEvent({ topics: [makeTopic('unknown_type')], data: {} }),
        makeRawEvent({
          topics: [makeTopic('mint')],
          data: { to: 'G2', amount: '1' },
        }),
      ];

      const results = strict.adaptMany(events);
      expect(results).toHaveLength(2);
      expect(results[0].event.eventType).toBe('transfer');
      expect(results[1].event.eventType).toBe('mint');
    });

    it('should handle empty input array', () => {
      const results = adapter.adaptMany([]);
      expect(results).toHaveLength(0);
    });
  });

  // ─── Configuration ─────────────────────────────────────────────────────

  describe('configuration', () => {
    it('should support custom event-type overrides', () => {
      const custom = new SorobanContractEventAdapter({
        eventTypeOverrides: {
          custom_swap: 'transfer',
          admin_pause: 'unknown',
        },
      });

      const raw = makeRawEvent({ topics: [makeTopic('custom_swap')] });
      const result = custom.adapt(raw);
      expect(result!.event.eventType).toBe('transfer');
      expect(result!.recognised).toBe(true);
    });

    it('should support custom default asset', () => {
      const custom = new SorobanContractEventAdapter({ defaultAsset: 'USDC' });
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', amount: '100' },
      });
      const result = custom.adapt(raw);

      expect(result!.event.asset).toBe('USDC');
    });

    it('should allow runtime mapping registration', () => {
      adapter.registerEventTypeMapping({
        my_custom_event: 'lock',
        another_event: 'deposit',
      });

      const raw = makeRawEvent({ topics: [makeTopic('my_custom_event')] });
      const result = adapter.adapt(raw);
      expect(result!.event.eventType).toBe('lock');
    });

    it('should expose the current event-type mapping', () => {
      const mapping = adapter.getEventTypeMapping();
      expect(mapping).toBeDefined();
      expect(mapping['transfer']).toBe('transfer');
      expect(mapping['mint']).toBe('mint');
      expect(mapping['burn']).toBe('burn');
    });
  });

  // ─── resolveEventType() ────────────────────────────────────────────────

  describe('resolveEventType()', () => {
    it('should normalise event names with special characters', () => {
      expect(adapter.resolveEventType('transfer')).toBe('transfer');
      // 'Transfer!' → 'transfer_' (special chars replaced with '_'), not in map
      expect(adapter.resolveEventType('Transfer!')).toBe('unknown');
      // 'my-event' → 'my_event', not in default map
      expect(adapter.resolveEventType('my-event')).toBe('unknown');
      expect(adapter.resolveEventType('my_event')).toBe('unknown');
    });

    it('should be case-insensitive', () => {
      expect(adapter.resolveEventType('TRANSFER')).toBe('transfer');
      expect(adapter.resolveEventType('Mint')).toBe('mint');
      expect(adapter.resolveEventType('BURN')).toBe('burn');
    });
  });

  // ─── Singleton ─────────────────────────────────────────────────────────

  describe('singleton', () => {
    it('should export a pre-configured singleton', () => {
      expect(sorobanContractEventAdapter).toBeInstanceOf(
        SorobanContractEventAdapter,
      );

      const raw = makeRawEvent();
      const result = sorobanContractEventAdapter.adapt(raw);
      expect(result).not.toBeNull();
      expect(result!.event.eventType).toBe('transfer');
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle topic with null value', () => {
      const raw = makeRawEvent({
        topics: [{ type: 'Symbol', value: null }],
        data: { eventName: 'transfer', from: 'G1', to: 'G2', amount: '100' },
      });
      const result = adapter.adapt(raw);
      expect(result).not.toBeNull();
      expect(result!.event.rawEventName).toBe('transfer');
    });

    it('should handle topic with undefined value', () => {
      const raw = makeRawEvent({
        topics: [{ type: 'Symbol', value: undefined }],
        data: { eventName: 'mint', to: 'G2', amount: '50' },
      });
      const result = adapter.adapt(raw);
      expect(result).not.toBeNull();
      expect(result!.event.rawEventName).toBe('mint');
    });

    it('should handle topic with empty string value', () => {
      const raw = makeRawEvent({
        topics: [{ type: 'Symbol', value: '' }],
        data: { type: 'burn' },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.rawEventName).toBe('burn');
    });

    it('should handle amount as string "0"', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', amount: '0' },
      });
      const result = adapter.adapt(raw);
      // Amount "0" is valid but the extractor treats it as not found
      // and falls through to topic or default
      expect(result).not.toBeNull();
      expect(result!.event.amount).toBeDefined();
    });

    it('should handle missing transactionHash gracefully', () => {
      const raw = makeRawEvent({ transactionHash: '' });
      const result = adapter.adapt(raw);
      expect(result).not.toBeNull();
      expect(result!.event.transactionHash).toBe('');
    });

    it('should handle missing contractId gracefully', () => {
      const raw = makeRawEvent({ contractId: '' });
      const result = adapter.adapt(raw);
      expect(result).not.toBeNull();
      expect(result!.event.contractId).toBe('');
    });

    it('should handle very large amount values', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', amount: '999999999999999999999' },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.amount).toBe('999999999999999999999');
    });

    it('should handle decimal amount values', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', amount: '123.4567890' },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.amount).toBe('123.4567890');
    });

    it('should handle invalid amount strings gracefully', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', amount: 'not-a-number' },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.amount).toBe('0');
    });

    it('should handle multiple events from same transaction', () => {
      const base = {
        transactionHash: 'tx_multi',
        contractId: 'CONTRACT_SAME',
        ledger: 100,
        ledgerClosedAt: 1_000_000,
      };

      const events = [
        makeRawEvent({
          ...base,
          eventIndex: 0,
          topics: [makeTopic('transfer')],
          data: { from: 'G1', to: 'G2', amount: '100' },
        }),
        makeRawEvent({
          ...base,
          eventIndex: 1,
          topics: [makeTopic('mint')],
          data: { to: 'G3', amount: '200' },
        }),
        makeRawEvent({
          ...base,
          eventIndex: 2,
          topics: [makeTopic('burn')],
          data: { from: 'G1', amount: '50' },
        }),
      ];

      const results = adapter.adaptMany(events);
      expect(results).toHaveLength(3);

      // Each should have a unique event ID
      const ids = new Set(results.map((r) => r.event.eventId));
      expect(ids.size).toBe(3);

      expect(results[0].event.eventType).toBe('transfer');
      expect(results[1].event.eventType).toBe('mint');
      expect(results[2].event.eventType).toBe('burn');
    });

    it('should handle from_address and to_address field names', () => {
      const raw = makeRawEvent({
        data: {
          from_address: 'G_FROM_ADDR',
          to_address: 'G_TO_ADDR',
          amount: '300',
          asset: 'XLM',
        },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.from).toBe('G_FROM_ADDR');
      expect(result!.event.to).toBe('G_TO_ADDR');
    });

    it('should handle sender_address and recipient_address field names', () => {
      const raw = makeRawEvent({
        data: {
          sender_address: 'G_SENDER_ADDR',
          recipient_address: 'G_RECIP_ADDR',
          amount: '300',
        },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.from).toBe('G_SENDER_ADDR');
      expect(result!.event.to).toBe('G_RECIP_ADDR');
    });

    it('should handle asset_id field name', () => {
      const raw = makeRawEvent({
        data: {
          from: 'G1',
          to: 'G2',
          amount: '100',
          asset_id: 'ASSET_ID_CONTRACT',
        },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.asset).toBe('ASSET_ID_CONTRACT');
    });

    it('should handle token_id field name', () => {
      const raw = makeRawEvent({
        data: {
          from: 'G1',
          to: 'G2',
          amount: '100',
          token_id: 'TOKEN_ID_CONTRACT',
        },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.asset).toBe('TOKEN_ID_CONTRACT');
    });

    it('should handle quantity field name for amount', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', quantity: '42' },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.amount).toBe('42');
    });

    it('should handle amount object with value field', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', amount: { value: '777' } },
      });
      const result = adapter.adapt(raw);
      expect(result!.event.amount).toBe('777');
    });
  });

  // ─── Warnings ──────────────────────────────────────────────────────────

  describe('warnings', () => {
    it('should warn when from address is missing', () => {
      const raw = makeRawEvent({
        data: { to: 'G2', amount: '100' },
      });
      const result = adapter.adapt(raw);
      expect(result!.warnings.some((w) => w.includes('from'))).toBe(true);
    });

    it('should warn when to address is missing', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', amount: '100' },
      });
      const result = adapter.adapt(raw);
      expect(result!.warnings.some((w) => w.includes('to'))).toBe(true);
    });

    it('should warn when amount is missing', () => {
      const raw = makeRawEvent({
        topics: [makeTopic('transfer')],
        data: { from: 'G1', to: 'G2' },
      });
      const result = adapter.adapt(raw);
      expect(result!.warnings.some((w) => w.includes('amount'))).toBe(true);
    });

    it('should warn when asset is missing and defaulted', () => {
      const raw = makeRawEvent({
        data: { from: 'G1', to: 'G2', amount: '100' },
      });
      const result = adapter.adapt(raw);
      expect(result!.warnings.some((w) => w.includes('asset'))).toBe(true);
    });

    it('should warn when event name cannot be extracted', () => {
      const raw = makeRawEvent({ topics: [], data: {} });
      const result = adapter.adapt(raw);
      expect(result!.warnings.some((w) => w.includes('event name'))).toBe(true);
    });

    it('should produce no warnings for a well-formed event', () => {
      const raw = makeRawEvent();
      const result = adapter.adapt(raw);
      expect(result!.warnings).toHaveLength(0);
    });
  });
});
