export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
}

export interface RpcConfig {
  ethereum: string;
  polygon: string;
  bsc: string;
  arbitrum: string;
  optimism: string;
}

export interface ApiConfig {
  apiKey: string;
  apiSecret?: string;
  baseUrl: string;
  timeout: number;
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
}

export interface AppConfig {
  nodeEnv: 'development' | 'staging' | 'production';
  database: DatabaseConfig;
  rpc: RpcConfig;
  api: ApiConfig;
  server: ServerConfig;
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
    format: 'json' | 'simple';
  };
}

export type Environment = 'development' | 'staging' | 'production';
