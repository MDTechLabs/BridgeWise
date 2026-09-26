import {
  ContractAuthorizationValidatorService,
  AuthRequirement,
  AuthorizationEntry,
  AuthValidationCode,
} from './contract-authorization-validator.service';

const req: AuthRequirement = {
  contractId: 'C_CONTRACT',
  functionName: 'transfer',
  authorizer: 'G_ALICE',
  requiresSignature: true,
  requiresNonce: true,
  requiresExpiration: true,
};

function fullEntry(): AuthorizationEntry {
  return {
    contractId: 'C_CONTRACT',
    functionName: 'transfer',
    authorizer: 'G_ALICE',
    signature: 'sig',
    nonce: 42,
    expirationLedger: 1000,
  };
}

describe('ContractAuthorizationValidatorService', () => {
  let service: ContractAuthorizationValidatorService;
  beforeEach(() => {
    service = new ContractAuthorizationValidatorService();
  });

  it('passes when all requirements are satisfied', () => {
    const r = service.validate([req], [fullEntry()]);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.missing).toHaveLength(0);
  });

  it('detects a completely missing authorization', () => {
    const r = service.validate([req], []);
    expect(r.valid).toBe(false);
    expect(r.missing).toHaveLength(1);
    expect(r.errors[0].code).toBe(AuthValidationCode.MISSING_AUTHORIZATION);
  });

  it('detects a missing signature', () => {
    const entry = { ...fullEntry(), signature: undefined };
    const r = service.validate([req], [entry]);
    expect(r.errors.some((e) => e.code === AuthValidationCode.MISSING_SIGNATURE)).toBe(true);
  });

  it('detects a missing nonce and expiration', () => {
    const entry = { ...fullEntry(), nonce: undefined, expirationLedger: undefined };
    const r = service.validate([req], [entry]);
    const codes = r.errors.map((e) => e.code);
    expect(codes).toContain(AuthValidationCode.MISSING_NONCE);
    expect(codes).toContain(AuthValidationCode.MISSING_EXPIRATION);
  });

  it('flags a malformed entry', () => {
    const bad = { contractId: '', functionName: '', authorizer: '' } as AuthorizationEntry;
    const r = service.validate([req], [bad]);
    expect(r.errors.some((e) => e.code === AuthValidationCode.MALFORMED_ENTRY)).toBe(true);
  });

  it('prepare() returns only the missing requirements', () => {
    const missing = service.prepare([req], []);
    expect(missing).toEqual([req]);
    expect(service.prepare([req], [fullEntry()])).toHaveLength(0);
  });
});
