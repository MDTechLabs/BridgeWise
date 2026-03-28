import { ConfigFactory } from './config-factory';
import { EnvironmentLoader } from './env-loader';

describe('ConfigFactory', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'development';
    delete process.env.VAULT_ENCRYPTION_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('create', () => {
    it('should create development configuration', () => {
      process.env.NODE_ENV = 'development';
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

      const config = ConfigFactory.create();

      expect(config.nodeEnv).toBe('development');
      expect(config.database.host).toBe('localhost');
      expect(config.database.port).toBe(5432);
      expect(config.server.port).toBe(3000);
      expect(config.logging.level).toBe('debug');
    });

    it('should throw error if required env vars are missing', () => {
      delete process.env.DB_HOST;

      expect(() => ConfigFactory.create()).toThrow();
    });

    it('should apply environment-specific overrides', () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_HOST = 'prod-host';
      process.env.DB_USERNAME = 'prod_user';
      process.env.DB_PASSWORD = 'prod_pass';
      process.env.DB_NAME = 'prod_db';
      process.env.DB_SSL = 'true';
      process.env.API_KEY = 'prod_key';
      process.env.RPC_ETHEREUM = 'https://eth.example.com';
      process.env.RPC_POLYGON = 'https://polygon.example.com';
      process.env.RPC_BSC = 'https://bsc.example.com';
      process.env.RPC_ARBITRUM = 'https://arbitrum.example.com';
      process.env.RPC_OPTIMISM = 'https://optimism.example.com';
      process.env.VAULT_ENCRYPTION_KEY = 'vault-key';
      process.env.FORCE_HTTPS = 'true';

      const config = ConfigFactory.create();

      expect(config.database.ssl).toBe(true);
      expect(config.database.synchronize).toBe(false);
      expect(config.logging.format).toBe('json');
      expect(config.server.forceHttps).toBe(true);
    });

    it('should parse CORS origins correctly', () => {
      process.env.NODE_ENV = 'development';
      process.env.CORS_ORIGIN =
        'https://app.example.com,https://api.example.com';
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

      const config = ConfigFactory.create();

      expect(Array.isArray(config.server.cors.origin)).toBe(true);
      expect(config.server.cors.origin).toContain('https://app.example.com');
      expect(config.server.cors.origin).toContain('https://api.example.com');
    });

    it('should handle wildcard CORS origin', () => {
      process.env.NODE_ENV = 'development';
      process.env.CORS_ORIGIN = '*';
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

      const config = ConfigFactory.create();

      expect(config.server.cors.origin).toBe('*');
    });

    it('should use environment variable values for RPC URLs', () => {
      process.env.NODE_ENV = 'development';
      process.env.RPC_ETHEREUM = 'https://custom-eth.example.com';
      process.env.RPC_POLYGON = 'https://custom-polygon.example.com';
      process.env.RPC_BSC = 'https://custom-bsc.example.com';
      process.env.RPC_ARBITRUM = 'https://custom-arbitrum.example.com';
      process.env.RPC_OPTIMISM = 'https://custom-optimism.example.com';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USERNAME = 'postgres';
      process.env.DB_PASSWORD = 'password';
      process.env.DB_NAME = 'test_db';
      process.env.API_KEY = 'test_key';

      const config = ConfigFactory.create();

      expect(config.rpc.ethereum).toBe('https://custom-eth.example.com');
      expect(config.rpc.polygon).toBe('https://custom-polygon.example.com');
      expect(config.rpc.bsc).toBe('https://custom-bsc.example.com');
      expect(config.rpc.arbitrum).toBe('https://custom-arbitrum.example.com');
      expect(config.rpc.optimism).toBe('https://custom-optimism.example.com');
    });

    it('should handle feature flags', () => {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_ANALYTICS = 'true';
      process.env.ENABLE_BENCHMARKING = 'true';
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

      const config = ConfigFactory.create();

      expect(config.features.enableAnalytics).toBe(true);
      expect(config.features.enableBenchmarking).toBe(true);
    });

    it('should enable bridge-specific flags by default', () => {
      process.env.NODE_ENV = 'development';
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
      // Leave bridge flags unset to confirm they default to true
      delete process.env.ENABLE_BRIDGE_COMPARE;
      delete process.env.ENABLE_GAS_ESTIMATION;
      delete process.env.ENABLE_REAL_TIME_FEES;
      delete process.env.ENABLE_BRIDGE_DISCOVERY;
      delete process.env.ENABLE_RELIABILITY_SCORE;

      const config = ConfigFactory.create();

      expect(config.features.enableBridgeCompare).toBe(true);
      expect(config.features.enableGasEstimation).toBe(true);
      expect(config.features.enableRealTimeFees).toBe(true);
      expect(config.features.enableBridgeDiscovery).toBe(true);
      expect(config.features.enableReliabilityScore).toBe(true);
    });

    it('should disable bridge flags when set to false', () => {
      process.env.NODE_ENV = 'development';
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
      process.env.ENABLE_BRIDGE_COMPARE = 'false';
      process.env.ENABLE_RELIABILITY_SCORE = 'false';

      const config = ConfigFactory.create();

      expect(config.features.enableBridgeCompare).toBe(false);
      expect(config.features.enableReliabilityScore).toBe(false);
      // Unaffected flags stay on
      expect(config.features.enableGasEstimation).toBe(true);
    });
  });
});
