import { ApiKeyVaultService } from './api-key-vault.service';

describe('ApiKeyVaultService', () => {
  const originalVaultKey = process.env.VAULT_ENCRYPTION_KEY;
  let vault: ApiKeyVaultService;

  beforeEach(() => {
    process.env.VAULT_ENCRYPTION_KEY = 'synthetic-test-only-key';
    vault = new ApiKeyVaultService();
  });

  afterAll(() => {
    if (originalVaultKey === undefined) {
      delete process.env.VAULT_ENCRYPTION_KEY;
    } else {
      process.env.VAULT_ENCRYPTION_KEY = originalVaultKey;
    }
  });

  it('stores encrypted data and retrieves the original value', () => {
    const stored = vault.storeKey('test-key', 'synthetic-provider-secret');

    expect(stored.ciphered).not.toContain('synthetic-provider-secret');
    expect(vault.retrieveKey('test-key')).toBe('synthetic-provider-secret');
    expect(vault.getKeyMetadata('test-key')?.isActive).toBe(true);
  });

  it('rejects an empty key value', () => {
    expect(() => vault.storeKey('empty-key', '  ')).toThrow(
      'Cannot store empty API key',
    );
  });

  it('rejects expired credentials', () => {
    const expiredAt = new Date(Date.now() - 1000);
    vault.storeKey('expired-key', 'synthetic-expired-secret', expiredAt);

    expect(() => vault.retrieveKey('expired-key')).toThrow('Key has expired');
  });

  it('rejects a revoked credential', () => {
    vault.storeKey('revoked-key', 'synthetic-revoked-secret');
    vault.revokeKey('revoked-key');

    expect(() => vault.retrieveKey('revoked-key')).toThrow('Key is inactive');
  });

  it('fails closed when ciphertext authentication fails', () => {
    const stored = vault.storeKey('tampered-key', 'synthetic-tamper-secret');
    stored.ciphered = '00';

    expect(vault.verifyKeyIntegrity('tampered-key')).toBe(false);
    expect(() => vault.retrieveKey('tampered-key')).toThrow(
      'Failed to decrypt key - possible tampering detected',
    );
  });
});
