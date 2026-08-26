import { DestinationAccountValidatorService, AccountValidationCode } from './destination-account-validator.service';
import { encodeStrKey, StrKeyType } from './strkey.util';

function pubKey(seed = 1): string {
  return encodeStrKey(StrKeyType.ED25519_PUBLIC_KEY, new Uint8Array(32).fill(seed));
}
function muxed(seed = 2): string {
  return encodeStrKey(StrKeyType.MUXED_ACCOUNT, new Uint8Array(40).fill(seed));
}
function contract(seed = 3): string {
  return encodeStrKey(StrKeyType.CONTRACT, new Uint8Array(32).fill(seed));
}

describe('DestinationAccountValidatorService', () => {
  let service: DestinationAccountValidatorService;

  beforeEach(() => {
    service = new DestinationAccountValidatorService();
  });

  it('accepts a valid ed25519 public key', () => {
    const r = service.validate(pubKey(), { network: 'testnet' });
    expect(r.valid).toBe(true);
    expect(r.type).toBe(StrKeyType.ED25519_PUBLIC_KEY);
    expect(r.errors).toHaveLength(0);
  });

  it('accepts a valid muxed account by default', () => {
    expect(service.validate(muxed(), { network: 'public' }).valid).toBe(true);
  });

  it('rejects an empty destination', () => {
    const r = service.validate('', { network: 'testnet' });
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe(AccountValidationCode.EMPTY);
  });

  it('rejects a malformed address (bad checksum)', () => {
    const bad = pubKey().slice(0, -1) + (pubKey().endsWith('A') ? 'B' : 'A');
    const r = service.validate(bad, { network: 'testnet' });
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe(AccountValidationCode.MALFORMED);
  });

  it('rejects a non-Stellar string', () => {
    const r = service.validate('not-an-address!!', { network: 'testnet' });
    expect(r.errors[0].code).toBe(AccountValidationCode.MALFORMED);
  });

  it('rejects a contract address when only account types are allowed', () => {
    const r = service.validate(contract(), { network: 'testnet' });
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe(AccountValidationCode.UNSUPPORTED_TYPE);
  });

  it('detects a network mismatch', () => {
    const r = service.validate(pubKey(), { network: 'public', accountNetwork: 'testnet' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === AccountValidationCode.NETWORK_MISMATCH)).toBe(true);
  });

  it('isValidAccountId recognizes all StrKey account forms', () => {
    expect(service.isValidAccountId(pubKey())).toBe(true);
    expect(service.isValidAccountId(muxed())).toBe(true);
    expect(service.isValidAccountId(contract())).toBe(true);
    expect(service.isValidAccountId('bad')).toBe(false);
  });
});
