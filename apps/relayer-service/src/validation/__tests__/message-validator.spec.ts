import {
  assertValidCrossChainMessage,
  isValidAddressForChainType,
  isValidCrossChainMessage,
  resolveChainType,
  validateCrossChainMessage,
  DEFAULT_MESSAGE_VALIDATION_OPTIONS,
} from '../message-validator';
import { ChainType, CrossChainMessage, MessageStatus } from '../../types';

const EVM_ADDRESS = '0x' + '1'.repeat(40);
const STELLAR_ACCOUNT = 'G' + 'A'.repeat(55);
const STELLAR_CONTRACT = 'C' + 'A'.repeat(55);
const SOLANA_ADDRESS = 'A'.repeat(44);

function makeMessage(overrides: Partial<CrossChainMessage> = {}): CrossChainMessage {
  return {
    id: 'msg-1',
    sourceChainId: 'ethereum',
    destinationChainId: 'stellar',
    sourceTxHash: '0x' + 'a'.repeat(64),
    sourceBlockNumber: 10_000_000,
    messageType: 'lock',
    payload: '0xdeadbeef',
    sender: EVM_ADDRESS,
    recipient: STELLAR_ACCOUNT,
    createdAt: 1_700_000_000_000,
    status: 'pending',
    retryCount: 0,
    ...overrides,
  };
}

/** Replaces a field with an arbitrary runtime value, bypassing the type. */
function withField(field: string, value: unknown): unknown {
  return { ...makeMessage(), [field]: value };
}

function codesFor(message: unknown, options?: Parameters<typeof validateCrossChainMessage>[1]): string[] {
  return validateCrossChainMessage(message, options).errors.map((error) => error.code);
}

function fieldsFor(message: unknown, options?: Parameters<typeof validateCrossChainMessage>[1]): string[] {
  return validateCrossChainMessage(message, options).errors.map((error) => error.field);
}

describe('validateCrossChainMessage', () => {
  describe('well-formed messages', () => {
    it('accepts a complete message', () => {
      const result = validateCrossChainMessage(makeMessage());
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('accepts a message with every optional field populated', () => {
      const result = validateCrossChainMessage(
        makeMessage({
          sourceLogIndex: 3,
          tokenAddress: EVM_ADDRESS,
          amount: '1000000',
          maxGasLimit: '21000',
          lastError: 'prior attempt reverted',
        }),
      );
      expect(result.errors).toEqual([]);
    });

    it('accepts a message with every optional field omitted', () => {
      const message = makeMessage();
      delete message.sourceLogIndex;
      delete message.tokenAddress;
      delete message.amount;
      delete message.maxGasLimit;
      delete message.lastError;
      expect(validateCrossChainMessage(message).errors).toEqual([]);
    });

    it.each<MessageStatus>(['pending', 'queued', 'processing', 'submitted', 'confirmed', 'failed', 'expired'])(
      'accepts the %s status',
      (status) => {
        expect(validateCrossChainMessage(makeMessage({ status })).errors).toEqual([]);
      },
    );

    it.each<[string, string]>([
      ['EVM 0x-prefixed hash', '0x' + 'f'.repeat(64)],
      ['Stellar bare hex hash', 'a'.repeat(64)],
      ['base64 hash', '3q2+7w=='],
    ])('accepts a %s', (_label, sourceTxHash) => {
      expect(validateCrossChainMessage(makeMessage({ sourceTxHash })).errors).toEqual([]);
    });
  });

  describe('non-object input', () => {
    it.each<[string, unknown]>([
      ['null', null],
      ['undefined', undefined],
      ['a number', 42],
      ['a string', 'msg-1'],
      ['a boolean', true],
      ['an array', [{ id: 'msg-1' }]],
    ])('rejects %s', (_label, input) => {
      const result = validateCrossChainMessage(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual([
        { field: '_', code: 'NOT_AN_OBJECT', message: 'Message must be an object' },
      ]);
    });

    it('rejects an empty object', () => {
      const result = validateCrossChainMessage({});
      expect(result.valid).toBe(false);
      expect(codesFor({})).toEqual(
        expect.arrayContaining([
          'MISSING_MESSAGE_ID',
          'MISSING_SOURCE_CHAIN_ID',
          'MISSING_DESTINATION_CHAIN_ID',
          'MISSING_SOURCE_TX_HASH',
          'MISSING_SOURCE_BLOCK_NUMBER',
          'MISSING_MESSAGE_TYPE',
          'MISSING_PAYLOAD',
          'MISSING_SENDER',
          'MISSING_RECIPIENT',
          'MISSING_CREATED_AT',
          'INVALID_STATUS',
          'INVALID_RETRY_COUNT',
        ]),
      );
    });
  });

  describe('malformed scalar fields', () => {
    it.each<[string, unknown, string]>([
      ['missing', undefined, 'MISSING_MESSAGE_ID'],
      ['null', null, 'MISSING_MESSAGE_ID'],
      ['blank', '   ', 'MISSING_MESSAGE_ID'],
      ['a number', 7, 'INVALID_MESSAGE_ID'],
      ['an object', {}, 'INVALID_MESSAGE_ID'],
    ])('rejects a %s id', (_label, value, code) => {
      expect(codesFor(withField('id', value))).toContain(code);
    });

    it('rejects an id longer than the configured maximum', () => {
      expect(codesFor(makeMessage({ id: 'x'.repeat(201) }))).toContain('MESSAGE_ID_TOO_LONG');
      expect(validateCrossChainMessage(makeMessage({ id: 'x'.repeat(200) })).errors).toEqual([]);
    });

    it('honours a custom maxIdLength', () => {
      expect(codesFor(makeMessage({ id: 'x'.repeat(11) }), { maxIdLength: 10 })).toContain(
        'MESSAGE_ID_TOO_LONG',
      );
    });

    it.each<[string, unknown, string]>([
      ['missing', undefined, 'MISSING_SOURCE_CHAIN_ID'],
      ['blank', '\t\n', 'MISSING_SOURCE_CHAIN_ID'],
      ['a number', 1, 'INVALID_SOURCE_CHAIN_ID'],
    ])('rejects a %s sourceChainId', (_label, value, code) => {
      expect(codesFor(withField('sourceChainId', value))).toContain(code);
    });

    it.each<[string, unknown, string]>([
      ['missing', undefined, 'MISSING_DESTINATION_CHAIN_ID'],
      ['blank', ' ', 'MISSING_DESTINATION_CHAIN_ID'],
      ['a boolean', false, 'INVALID_DESTINATION_CHAIN_ID'],
    ])('rejects a %s destinationChainId', (_label, value, code) => {
      expect(codesFor(withField('destinationChainId', value))).toContain(code);
    });

    it('rejects a message routed to its own source chain', () => {
      const result = validateCrossChainMessage(makeMessage({ destinationChainId: 'ethereum' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'destinationChainId', code: 'SAME_SOURCE_AND_DESTINATION' }),
      );
    });

    it('compares chain ids after trimming, so padding cannot smuggle a match past', () => {
      expect(codesFor(makeMessage({ destinationChainId: ' ethereum ' }))).toContain(
        'SAME_SOURCE_AND_DESTINATION',
      );
    });

    it.each<[string, unknown, string]>([
      ['missing', undefined, 'MISSING_SOURCE_TX_HASH'],
      ['blank', '  ', 'MISSING_SOURCE_TX_HASH'],
      ['punctuated', 'not-a-hash!!', 'INVALID_SOURCE_TX_HASH'],
      ['odd length hex', '0xabc', 'INVALID_SOURCE_TX_HASH'],
      ['bare 0x', '0x', 'INVALID_SOURCE_TX_HASH'],
      ['interior whitespace', '0xaa bb', 'INVALID_SOURCE_TX_HASH'],
      ['a number', 1, 'MISSING_SOURCE_TX_HASH'],
    ])('rejects a %s sourceTxHash', (_label, value, code) => {
      expect(codesFor(withField('sourceTxHash', value))).toContain(code);
    });

    it.each<[string, unknown]>([
      ['missing', undefined],
      ['null', null],
      ['negative', -1],
      ['fractional', 1.5],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['a numeric string', '10000000'],
    ])('rejects a %s sourceBlockNumber', (_label, value) => {
      const result = validateCrossChainMessage(withField('sourceBlockNumber', value));
      expect(result.valid).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain(
        value === undefined || value === null ? 'MISSING_SOURCE_BLOCK_NUMBER' : 'INVALID_SOURCE_BLOCK_NUMBER',
      );
    });

    it.each<[string, unknown, string]>([
      ['negative', -1, 'INVALID_SOURCE_LOG_INDEX'],
      ['fractional', 0.5, 'INVALID_SOURCE_LOG_INDEX'],
      ['a numeric string', '0', 'INVALID_SOURCE_LOG_INDEX'],
    ])('rejects a %s sourceLogIndex', (_label, value, code) => {
      expect(codesFor(withField('sourceLogIndex', value))).toContain(code);
    });

    it('accepts sourceLogIndex zero, the first log of a transaction', () => {
      expect(validateCrossChainMessage(makeMessage({ sourceLogIndex: 0 })).errors).toEqual([]);
    });

    it('rejects a missing messageType', () => {
      expect(codesFor(withField('messageType', undefined))).toContain('MISSING_MESSAGE_TYPE');
    });

    it('rejects an over-long messageType', () => {
      expect(codesFor(makeMessage({ messageType: 'x'.repeat(65) }))).toContain('INVALID_MESSAGE_TYPE');
      expect(validateCrossChainMessage(makeMessage({ messageType: 'x'.repeat(64) })).errors).toEqual([]);
    });

    it('rejects a missing createdAt', () => {
      expect(codesFor(withField('createdAt', undefined))).toContain('MISSING_CREATED_AT');
    });

    it.each<[string, unknown]>([
      ['negative', -1],
      ['fractional', 1.5],
      ['NaN', Number.NaN],
      ['a string', '1700000000000'],
    ])('rejects a %s createdAt', (_label, value) => {
      expect(codesFor(withField('createdAt', value))).toContain('INVALID_CREATED_AT');
    });

    it.each<[string, unknown]>([
      ['unknown', 'in-flight'],
      ['wrong case', 'PENDING'],
      ['a number', 1],
      ['missing', undefined],
    ])('rejects a %s status', (_label, value) => {
      expect(codesFor(withField('status', value))).toContain('INVALID_STATUS');
    });

    it.each<[string, unknown]>([
      ['negative', -1],
      ['fractional', 1.5],
      ['a string', '0'],
      ['missing', undefined],
    ])('rejects a %s retryCount', (_label, value) => {
      expect(codesFor(withField('retryCount', value))).toContain('INVALID_RETRY_COUNT');
    });

    it('rejects a non-string lastError', () => {
      expect(codesFor(withField('lastError', { code: 500 }))).toContain('INVALID_LAST_ERROR');
    });
  });

  describe('malformed sender and recipient', () => {
    it.each<[string, string, unknown, string]>([
      ['sender', 'sender', undefined, 'MISSING_SENDER'],
      ['sender', 'sender', '   ', 'MISSING_SENDER'],
      ['sender', 'sender', 42, 'INVALID_SENDER'],
      ['recipient', 'recipient', undefined, 'MISSING_RECIPIENT'],
      ['recipient', 'recipient', '', 'MISSING_RECIPIENT'],
      ['recipient', 'recipient', [], 'INVALID_RECIPIENT'],
    ])('rejects a malformed %s', (_label, field, value, code) => {
      expect(codesFor(withField(field, value))).toContain(code);
    });
  });

  describe('malformed payload', () => {
    it.each<[string, unknown, string]>([
      ['missing', undefined, 'MISSING_PAYLOAD'],
      ['empty', '', 'MISSING_PAYLOAD'],
      ['bare 0x prefix', '0x', 'MISSING_PAYLOAD'],
      ['a number', 1, 'MISSING_PAYLOAD'],
    ])('rejects a %s payload', (_label, value, code) => {
      expect(codesFor(withField('payload', value))).toContain(code);
    });

    it('rejects non-hex characters after the 0x prefix', () => {
      const result = validateCrossChainMessage(withField('payload', '0xzzzz'));
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'payload', code: 'INVALID_PAYLOAD' }),
      );
    });

    it('rejects hex with an odd number of characters', () => {
      const result = validateCrossChainMessage(withField('payload', '0xabc'));
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'payload', code: 'ODD_LENGTH_HEX_PAYLOAD' }),
      );
    });

    it('accepts the shortest valid hex payload', () => {
      expect(validateCrossChainMessage(withField('payload', '0x00')).errors).toEqual([]);
    });

    it('accepts a non-hex payload for chains that do not use hex encoding', () => {
      expect(validateCrossChainMessage(withField('payload', 'AAAAAA==')).errors).toEqual([]);
    });

    it('rejects a payload beyond the configured maximum', () => {
      const oversized = '0x' + 'ab'.repeat(11);
      expect(codesFor(withField('payload', oversized), { maxPayloadLength: 10 })).toContain('PAYLOAD_TOO_LARGE');
    });
  });

  describe('malformed amount and gas fields', () => {
    it.each<[string, unknown, string]>([
      ['negative', '-1', 'INVALID_AMOUNT'],
      ['fractional', '1.5', 'INVALID_AMOUNT'],
      ['scientific notation', '1e18', 'INVALID_AMOUNT'],
      ['hex', '0xff', 'INVALID_AMOUNT'],
      ['blank', '  ', 'MISSING_AMOUNT'],
      ['a number', 1000, 'INVALID_AMOUNT'],
    ])('rejects a %s amount', (_label, value, code) => {
      expect(codesFor(withField('amount', value))).toContain(code);
    });

    it('accepts a zero amount, which zero-value transfers rely on', () => {
      expect(validateCrossChainMessage(makeMessage({ amount: '0' })).errors).toEqual([]);
    });

    it('accepts a very large amount without precision loss', () => {
      const huge = '9'.repeat(78);
      expect(validateCrossChainMessage(makeMessage({ amount: huge })).errors).toEqual([]);
    });

    it('rejects a zero maxGasLimit', () => {
      expect(codesFor(withField('maxGasLimit', '0'))).toContain('INVALID_MAX_GAS_LIMIT');
    });

    it.each<[string, unknown]>([
      ['negative', '-1'],
      ['blank', ' '],
      ['a number', 21000],
      ['hex', '0x5208'],
    ])('rejects a %s maxGasLimit', (_label, value) => {
      expect(codesFor(withField('maxGasLimit', value))).toContain('INVALID_MAX_GAS_LIMIT');
    });

    it('rejects a maxGasLimit wider than a uint256, which no chain accepts', () => {
      expect(codesFor(withField('maxGasLimit', '1'.repeat(79)))).toContain('INVALID_MAX_GAS_LIMIT');
      expect(validateCrossChainMessage(withField('maxGasLimit', '1'.repeat(78))).errors).toEqual([]);
    });
  });

  describe('error reporting', () => {
    it('reports every malformed field in one pass', () => {
      const result = validateCrossChainMessage({
        id: '',
        sourceChainId: 'ethereum',
        destinationChainId: 'ethereum',
        sourceTxHash: 'nope!',
        sourceBlockNumber: -1,
        payload: '0xabc',
        sender: 5,
        recipient: '',
        amount: 'lots',
        createdAt: 'now',
        status: 'inflight',
        retryCount: -2,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(10);
    });

    it('attributes each error to the field that caused it', () => {
      expect(fieldsFor(withField('amount', '-1'))).toEqual(['amount']);
      expect(fieldsFor(withField('maxGasLimit', '-1'))).toEqual(['maxGasLimit']);
    });

    it('gives every error a human readable message', () => {
      const result = validateCrossChainMessage(withField('id', 42));
      expect(result.errors[0].message).toEqual(expect.stringContaining('id must be a string'));
    });

    it('does not report the same code twice for one field', () => {
      const codes = codesFor(withField('sourceBlockNumber', -1));
      expect(codes.filter((code) => code === 'INVALID_SOURCE_BLOCK_NUMBER')).toHaveLength(1);
    });
  });

  describe('chain-specific address formats', () => {
    const evmMessage = (overrides: Partial<CrossChainMessage> = {}): CrossChainMessage =>
      makeMessage({ sourceChainId: 'ethereum', destinationChainId: 'polygon', ...overrides });

    it('is not enforced by default', () => {
      expect(DEFAULT_MESSAGE_VALIDATION_OPTIONS.enforceAddressFormat).toBe(false);
      expect(validateCrossChainMessage(evmMessage({ sender: 'not-an-address' })).valid).toBe(true);
    });

    it('accepts correctly formatted addresses when enforced', () => {
      expect(
        validateCrossChainMessage(
          evmMessage({ sender: EVM_ADDRESS, recipient: EVM_ADDRESS, tokenAddress: EVM_ADDRESS }),
          { enforceAddressFormat: true },
        ).errors,
      ).toEqual([]);
    });

    it('rejects a sender that is not an EVM address on an EVM source chain', () => {
      const result = validateCrossChainMessage(evmMessage({ sender: 'G' + 'A'.repeat(55) }), {
        enforceAddressFormat: true,
      });
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'sender', code: 'INVALID_ADDRESS_FORMAT' }),
      );
    });

    it('rejects a recipient that is not a Stellar address on a Stellar destination chain', () => {
      const result = validateCrossChainMessage(
        makeMessage({ sourceChainId: 'polygon', destinationChainId: 'stellar', recipient: 'not-a-strkey' }),
        { enforceAddressFormat: true },
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'recipient', code: 'INVALID_ADDRESS_FORMAT' }),
      );
    });

    it('rejects a malformed token address', () => {
      const result = validateCrossChainMessage(evmMessage({ tokenAddress: '0x123' }), {
        enforceAddressFormat: true,
      });
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'tokenAddress', code: 'INVALID_TOKEN_ADDRESS' }),
      );
    });

    it('leaves the recipient unconstrained when the destination chain is unknown to this build', () => {
      const result = validateCrossChainMessage(
        makeMessage({ sourceChainId: 'ethereum', destinationChainId: 'unlisted-chain', recipient: 'opaque' }),
        { enforceAddressFormat: true },
      );
      expect(result.errors).toEqual([]);
    });

    it('still reports structural problems when only address format is enforced', () => {
      const result = validateCrossChainMessage(withField('payload', '0xabc'), { enforceAddressFormat: true });
      expect(codesFor(withField('payload', '0xabc'), { enforceAddressFormat: true })).toContain(
        'ODD_LENGTH_HEX_PAYLOAD',
      );
      expect(result.errors.map((e) => e.field)).toContain('payload');
    });

    it('does not double-report a field that is both missing and the wrong shape', () => {
      const result = validateCrossChainMessage(
        withField('sender', undefined),
        { enforceAddressFormat: true },
      );
      expect(result.errors.filter((e) => e.field === 'sender')).toHaveLength(1);
    });
  });

  describe('resolveChainType', () => {
    it.each<[string, ChainType]>([
      ['ethereum', 'evm'],
      ['Ethereum', 'evm'],
      ['  polygon  ', 'evm'],
      ['arbitrum', 'evm'],
      ['stellar', 'soroban'],
      ['soroban', 'soroban'],
      ['solana', 'solana'],
    ])('resolves %s to %s', (chainId, expected) => {
      expect(resolveChainType(chainId)).toBe(expected);
    });

    it.each<[string, unknown]>([
      ['an unknown chain', 'some-new-chain'],
      ['an empty string', ''],
      ['a number', 1],
      ['undefined', undefined],
    ])('returns undefined for %s', (_label, chainId) => {
      expect(resolveChainType(chainId)).toBeUndefined();
    });
  });

  describe('isValidAddressForChainType', () => {
    it('validates EVM addresses', () => {
      expect(isValidAddressForChainType(EVM_ADDRESS, 'evm')).toBe(true);
      expect(isValidAddressForChainType('0x' + '1'.repeat(39), 'evm')).toBe(false);
      expect(isValidAddressForChainType('0x' + '1'.repeat(41), 'evm')).toBe(false);
      expect(isValidAddressForChainType('1'.repeat(40), 'evm')).toBe(false);
    });

    it('validates Stellar accounts and contracts', () => {
      expect(isValidAddressForChainType(STELLAR_ACCOUNT, 'soroban')).toBe(true);
      expect(isValidAddressForChainType(STELLAR_CONTRACT, 'soroban')).toBe(true);
      expect(isValidAddressForChainType('G' + 'A'.repeat(54), 'soroban')).toBe(false);
      expect(isValidAddressForChainType('X' + 'A'.repeat(55), 'soroban')).toBe(false);
    });

    it('rejects a lower-case Stellar StrKey', () => {
      expect(isValidAddressForChainType(STELLAR_ACCOUNT.toLowerCase(), 'soroban')).toBe(false);
    });

    it('validates Solana base58 addresses', () => {
      expect(isValidAddressForChainType(SOLANA_ADDRESS, 'solana')).toBe(true);
      expect(isValidAddressForChainType('A'.repeat(31), 'solana')).toBe(false);
    });

    it('fails open for a chain type this build does not know', () => {
      // Unreachable from TypeScript, since ChainType is a closed union, but the
      // package is published as JavaScript too. A chain added ahead of this
      // build must not have its messages rejected outright.
      expect(isValidAddressForChainType('whatever', 'aptos' as ChainType)).toBe(true);
    });
  });

  describe('type guard and assertion helpers', () => {
    it('narrows a valid message', () => {
      const message: unknown = makeMessage();
      expect(isValidCrossChainMessage(message)).toBe(true);
      expect(message as CrossChainMessage).toHaveProperty('destinationChainId', 'stellar');
    });

    it('rejects a malformed message', () => {
      expect(isValidCrossChainMessage(withField('id', 42))).toBe(false);
    });

    it('passes through a valid message', () => {
      expect(() => assertValidCrossChainMessage(makeMessage())).not.toThrow();
    });

    it('names the offending fields when it throws', () => {
      expect(() => assertValidCrossChainMessage(withField('payload', '0xabc'))).toThrow(
        /payload: ODD_LENGTH_HEX_PAYLOAD/,
      );
    });

    it('summarises every offending field in the thrown message', () => {
      expect(() => assertValidCrossChainMessage({})).toThrow(/id: MISSING_MESSAGE_ID/);
    });
  });
});
