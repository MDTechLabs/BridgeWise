import * as fs from 'fs';
import * as path from 'path';
import { EnvironmentLoader } from './env-loader';

describe('EnvironmentLoader', () => {
  let testDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    testDir = path.join(__dirname, '.test-env');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    // Clear relevant env vars
    delete process.env.TEST_VAR;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    // Restore env
    process.env = { ...originalEnv };
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('load', () => {
    it('should load variables from .env file', () => {
      const envContent = 'TEST_VAR=hello\nNODE_ENV=development';
      fs.writeFileSync(path.join(testDir, '.env'), envContent);

      const loader = new EnvironmentLoader(testDir);
      loader.load();

      expect(process.env.TEST_VAR).toBe('hello');
      expect(process.env.NODE_ENV).toBe('development');
    });

    it('should skip comments and empty lines', () => {
      const envContent = `
# This is a comment
TEST_VAR=value1

# Another comment
TEST_VAR2=value2
`;
      fs.writeFileSync(path.join(testDir, '.env'), envContent);

      const loader = new EnvironmentLoader(testDir);
      loader.load();

      expect(process.env.TEST_VAR).toBe('value1');
      expect(process.env.TEST_VAR2).toBe('value2');
    });

    it('should handle quoted values', () => {
      const envContent = `
STRING_VAR="hello world"
SINGLE_QUOTE='single quoted'
UNQUOTED=value
`;
      fs.writeFileSync(path.join(testDir, '.env'), envContent);

      const loader = new EnvironmentLoader(testDir);
      loader.load();

      expect(process.env.STRING_VAR).toBe('hello world');
      expect(process.env.SINGLE_QUOTE).toBe('single quoted');
      expect(process.env.UNQUOTED).toBe('value');
    });

    it('should handle environment-specific overrides', () => {
      fs.writeFileSync(
        path.join(testDir, '.env'),
        'NODE_ENV=development\nVAR1=base',
      );
      fs.writeFileSync(
        path.join(testDir, '.env.development'),
        'VAR1=dev-override',
      );

      process.env.NODE_ENV = 'development';
      const loader = new EnvironmentLoader(testDir);
      loader.load();

      expect(process.env.VAR1).toBe('base');
    });

    it('should not override already set environment variables', () => {
      process.env.TEST_VAR = 'already-set';
      fs.writeFileSync(path.join(testDir, '.env'), 'TEST_VAR=from-file');

      const loader = new EnvironmentLoader(testDir);
      loader.load();

      expect(process.env.TEST_VAR).toBe('already-set');
    });

    it('should only load once', () => {
      fs.writeFileSync(path.join(testDir, '.env'), 'TEST_VAR=value1');

      const loader = new EnvironmentLoader(testDir);
      loader.load();
      const firstValue = process.env.TEST_VAR;

      fs.writeFileSync(path.join(testDir, '.env'), 'TEST_VAR=value2');
      loader.load();
      const secondValue = process.env.TEST_VAR;

      expect(firstValue).toBe('value1');
      expect(secondValue).toBe('value1');
    });
  });

  describe('static methods', () => {
    it('should identify environment correctly', () => {
      process.env.NODE_ENV = 'production';
      expect(EnvironmentLoader.getEnvironment()).toBe('production');
      expect(EnvironmentLoader.isProduction()).toBe(true);
      expect(EnvironmentLoader.isStaging()).toBe(false);
      expect(EnvironmentLoader.isDevelopment()).toBe(false);
    });

    it('should default to development', () => {
      delete process.env.NODE_ENV;
      expect(EnvironmentLoader.getEnvironment()).toBe('development');
      expect(EnvironmentLoader.isDevelopment()).toBe(true);
    });
  });
});
