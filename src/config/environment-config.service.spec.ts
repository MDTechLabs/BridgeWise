import { EnvironmentConfigService } from './environment-config.service';

describe('EnvironmentConfigService', () => {
  let service: EnvironmentConfigService;

  beforeEach(() => {
    const originalEnv = { ...process.env };

    process.env.NODE_ENV = 'development';
    process.env.PORT = '3000';
    process.env.HOST = '0.0.0.0';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USERNAME = 'postgres';
    process.env.DB_PASSWORD = 'password';
    process.env.DB_NAME = 'testdb';
    process.env.DB_SSL = 'false';
    process.env.API_BASE_URL = 'https://api.example.com';
    process.env.API_TIMEOUT = '30000';
    process.env.RPC_ETHEREUM = 'https://eth.example.com';
    process.env.RPC_POLYGON = 'https://polygon.example.com';
    process.env.RPC_BSC = 'https://bsc.example.com';
    process.env.RPC_ARBITRUM = 'https://arbitrum.example.com';
    process.env.RPC_OPTIMISM = 'https://optimism.example.com';
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    process.env.LOG_LEVEL = 'debug';
    process.env.LOG_FORMAT = 'simple';
    process.env.API_KEY = 'test_key';

    service = new EnvironmentConfigService();

    // Restore original env after service creation
    process.env = { ...originalEnv };
  });

  describe('getConfig', () => {
    it('should return entire application configuration', () => {
      const config = service.getConfig();

      expect(config).toBeDefined();
      expect(config.nodeEnv).toBeDefined();
      expect(config.database).toBeDefined();
      expect(config.rpc).toBeDefined();
      expect(config.server).toBeDefined();
    });
  });

  describe('getSection', () => {
    it('should return specific section of configuration', () => {
      const dbConfig = service.getSection('database');

      expect(dbConfig).toBeDefined();
      expect(dbConfig.host).toBeDefined();
      expect(dbConfig.port).toBeDefined();
    });
  });

  describe('getDatabaseConfig', () => {
    it('should return database configuration', () => {
      const dbConfig = service.getDatabaseConfig();

      expect(dbConfig.host).toBe('localhost');
      expect(dbConfig.port).toBe(5432);
      expect(dbConfig.database).toBe('testdb');
    });
  });

  describe('getRpcConfig', () => {
    it('should return RPC configuration', () => {
      const rpcConfig = service.getRpcConfig();

      expect(rpcConfig.ethereum).toBeDefined();
      expect(rpcConfig.polygon).toBeDefined();
      expect(rpcConfig.bsc).toBeDefined();
    });
  });

  describe('getServerConfig', () => {
    it('should return server configuration', () => {
      const serverConfig = service.getServerConfig();

      expect(serverConfig.port).toBe(3000);
      expect(serverConfig.host).toBe('0.0.0.0');
    });
  });

  describe('getApiConfig', () => {
    it('should return API configuration', () => {
      const apiConfig = service.getApiConfig();

      expect(apiConfig.baseUrl).toBe('https://api.example.com');
      expect(apiConfig.timeout).toBe(30000);
    });
  });

  describe('getLoggingConfig', () => {
    it('should return logging configuration', () => {
      const loggingConfig = service.getLoggingConfig();

      expect(loggingConfig.level).toBe('debug');
      expect(loggingConfig.format).toBe('simple');
    });
  });

  describe('environment checks', () => {
    it('should correctly identify development environment', () => {
      expect(service.isDevelopment()).toBe(true);
      expect(service.isProduction()).toBe(false);
      expect(service.isStaging()).toBe(false);
    });

    it('should return current environment', () => {
      expect(service.getEnvironment()).toBe('development');
    });
  });

  describe('getRpcUrl', () => {
    it('should return RPC URL for specific network', () => {
      const ethRpc = service.getRpcUrl('ethereum');
      const polygonRpc = service.getRpcUrl('polygon');

      expect(ethRpc).toBe('https://eth.example.com');
      expect(polygonRpc).toBe('https://polygon.example.com');
    });
  });

  describe('feature flags', () => {
    it('should return feature flags configuration', () => {
      const features = service.getFeatures();

      expect(features.enableAnalytics).toBeDefined();
      expect(features.enableBenchmarking).toBeDefined();
    });

    it('should check if specific feature is enabled', () => {
      const isAnalyticsEnabled = service.isFeatureEnabled('enableAnalytics');

      expect(typeof isAnalyticsEnabled).toBe('boolean');
    });
  });
});
