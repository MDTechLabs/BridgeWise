import { EnvironmentValidator, ENV_SCHEMA } from './env-schema';

describe('EnvironmentValidator', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset to a clean state
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('validate', () => {
    it('should pass validation for development environment with required vars', () => {
      process.env.DB_HOST = 'localhost';
      process.env.DB_USERNAME = 'postgres';
      process.env.DB_PASSWORD = 'password';
      process.env.DB_NAME = 'test_db';
      process.env.API_KEY = 'test_key';
      process.env.RPC_ETHEREUM = 'https://eth.example.com';
      process.env.RPC_POLYGON = 'https://polygon.example.com';
      process.env.RPC_BSC = 'https://bsc.example.com';
      process.env.RPC_ARBITRUM = 'https://arbitrum.example.com';
      process.env.RPC_OPTIMISM = 'https://optimism.example.com';
      process.env.NODE_ENV = 'development';

      const result = EnvironmentValidator.validate('development');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when required variables are missing', () => {
      delete process.env.DB_HOST;
      delete process.env.DB_USERNAME;

      const result = EnvironmentValidator.validate('development');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.key === 'DB_HOST')).toBe(true);
    });

    it('should validate number types', () => {
      process.env.PORT = 'not-a-number';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USERNAME = 'user';
      process.env.DB_PASSWORD = 'pass';
      process.env.DB_NAME = 'db';
      process.env.API_KEY = 'key';

      const result = EnvironmentValidator.validate('development');

      const portError = result.errors.find((e) => e.key === 'PORT');
      expect(portError).toBeDefined();
    });

    it('should validate URL types', () => {
      process.env.RPC_ETHEREUM = 'not-a-url';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USERNAME = 'user';
      process.env.DB_PASSWORD = 'pass';
      process.env.DB_NAME = 'db';
      process.env.API_KEY = 'key';

      const result = EnvironmentValidator.validate('development');

      const uriError = result.errors.find((e) => e.key === 'RPC_ETHEREUM');
      expect(uriError).toBeDefined();
    });

    it('should validate boolean types', () => {
      process.env.DB_SSL = 'maybe';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USERNAME = 'user';
      process.env.DB_PASSWORD = 'pass';
      process.env.DB_NAME = 'db';
      process.env.API_KEY = 'key';

      const result = EnvironmentValidator.validate('development');

      const boolError = result.errors.find((e) => e.key === 'DB_SSL');
      expect(boolError).toBeDefined();
    });

    it('should validate allowed values', () => {
      process.env.NODE_ENV = 'invalid_env';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USERNAME = 'user';
      process.env.DB_PASSWORD = 'pass';
      process.env.DB_NAME = 'db';
      process.env.API_KEY = 'key';

      const result = EnvironmentValidator.validate('development');

      const envError = result.errors.find((e) => e.key === 'NODE_ENV');
      expect(envError).toBeDefined();
    });

    it('should provide warnings for production configuration', () => {
      process.env.DB_HOST = 'localhost';
      process.env.DB_USERNAME = 'user';
      process.env.DB_PASSWORD = 'pass';
      process.env.DB_NAME = 'db';
      process.env.API_KEY = 'key';
      process.env.RPC_ETHEREUM = 'https://eth.example.com';
      process.env.RPC_POLYGON = 'https://polygon.example.com';
      process.env.RPC_BSC = 'https://bsc.example.com';
      process.env.RPC_ARBITRUM = 'https://arbitrum.example.com';
      process.env.RPC_OPTIMISM = 'https://optimism.example.com';
      process.env.VAULT_ENCRYPTION_KEY = 'key';

      const result = EnvironmentValidator.validate('production');

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should require VAULT_ENCRYPTION_KEY in production', () => {
      delete process.env.VAULT_ENCRYPTION_KEY;
      process.env.DB_HOST = 'localhost';
      process.env.DB_USERNAME = 'user';
      process.env.DB_PASSWORD = 'pass';
      process.env.DB_NAME = 'db';
      process.env.API_KEY = 'key';
      process.env.RPC_ETHEREUM = 'https://eth.example.com';
      process.env.RPC_POLYGON = 'https://polygon.example.com';
      process.env.RPC_BSC = 'https://bsc.example.com';
      process.env.RPC_ARBITRUM = 'https://arbitrum.example.com';
      process.env.RPC_OPTIMISM = 'https://optimism.example.com';

      const result = EnvironmentValidator.validate('production');

      expect(result.errors.some((e) => e.key === 'VAULT_ENCRYPTION_KEY')).toBe(
        true,
      );
    });
  });

  describe('generateReport', () => {
    it('should generate an environment report', () => {
      process.env.NODE_ENV = 'development';

      const report = EnvironmentValidator.generateReport();

      expect(report.environment).toBe('development');
      expect(report.timestamp).toBeDefined();
      expect(report.variables).toBeDefined();
      expect(report.total).toBeGreaterThan(0);
      expect(report.configured).toBeDefined();
    });

    it('should redact sensitive values in report', () => {
      process.env.API_KEY = 'secret_key_value';

      const report = EnvironmentValidator.generateReport();

      const apiKeyVar = report.variables.find((v) => v.name === 'API_KEY');
      expect(apiKeyVar?.currentValue).toBe('***REDACTED***');
    });
  });
});
