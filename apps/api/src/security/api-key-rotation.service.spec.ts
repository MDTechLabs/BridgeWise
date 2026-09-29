import { ApiKeyRotationService } from './api-key-rotation.service';
import { ApiKeyVaultService } from './api-key-vault.service';

describe('ApiKeyRotationService', () => {
  const originalVaultKey = process.env.VAULT_ENCRYPTION_KEY;
  let vault: ApiKeyVaultService;
  let rotation: ApiKeyRotationService;

  beforeEach(() => {
    process.env.VAULT_ENCRYPTION_KEY = 'synthetic-test-only-key';
    vault = new ApiKeyVaultService();
    rotation = new ApiKeyRotationService(vault);
  });

  afterAll(() => {
    if (originalVaultKey === undefined) {
      delete process.env.VAULT_ENCRYPTION_KEY;
    } else {
      process.env.VAULT_ENCRYPTION_KEY = originalVaultKey;
    }
  });

  it('rotates a credential and records the operation', async () => {
    vault.storeKey('api-key-main', 'synthetic-old-secret');

    await rotation.rotateKeyManually(
      'api-key-main',
      'synthetic-new-secret',
    );

    expect(vault.retrieveKey('api-key-main')).toBe('synthetic-new-secret');
    expect(rotation.getRotationHistory()).toHaveLength(1);
    expect(rotation.getRotationHistory()[0].keyId).toBe('api-key-main');
  });

  it('does not record a failed rotation', async () => {
    vault.storeKey('api-key-main', 'synthetic-old-secret');

    await expect(
      rotation.rotateKeyManually('api-key-main', ''),
    ).rejects.toThrow('Cannot store empty API key');

    expect(rotation.getRotationHistory()).toHaveLength(0);
    expect(vault.retrieveKey('api-key-main')).toBe('synthetic-old-secret');
    expect(vault.getKeyMetadata('api-key-main')?.isActive).toBe(true);
  });
});
