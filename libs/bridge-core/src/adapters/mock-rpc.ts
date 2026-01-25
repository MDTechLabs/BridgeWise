/**
 * Mock Stellar RPC server for integration testing
 * Simulates various scenarios and edge cases
 */

import express, { Express, Request, Response } from 'express';

export interface MockRpcConfig {
  port?: number;
  networkLatency?: number; // in ms
  failureRate?: number; // 0-1 percentage
  customResponses?: Record<string, unknown>;
}

export class MockStellarRpc {
  private app: Express;
  private server: any;
  private config: Required<MockRpcConfig>;
  private requestCount = 0;
  private failingUntil = 0; // timestamp until which requests should fail

  constructor(config: MockRpcConfig = {}) {
    this.config = {
      port: config.port || 8545,
      networkLatency: config.networkLatency || 100,
      failureRate: config.failureRate || 0,
      customResponses: config.customResponses || {},
    };

    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', ledger: this.getMockLedgerInfo() });
    });

    // Main RPC endpoint
    this.app.post('/', (req: Request, res: Response) => {
      this.handleRpcRequest(req, res);
    });

    // Horizon-compatible endpoints
    this.app.get('/ledgers', (req: Request, res: Response) => {
      this.handleHorizonLedgers(req, res);
    });

    this.app.get('/accounts/:accountId', (req: Request, res: Response) => {
      this.handleHorizonAccount(req, res);
    });
  }

  private async handleRpcRequest(req: Request, res: Response): Promise<void> {
    this.requestCount++;
    const { method, params } = req.body;

    // Simulate network latency
    if (this.config.networkLatency > 0) {
      await this.delay(this.config.networkLatency);
    }

    // Check if we should simulate a failure
    if (this.shouldFail()) {
      return this.sendError(res, -32603, 'Internal error', { requestId: this.requestCount });
    }

    // Route to specific handler
    switch (method) {
      case 'getSorobanTransaction':
        return this.handleGetSorobanTransaction(res, params);

      case 'submitTransaction':
        return this.handleSubmitTransaction(res, params);

      case 'getLatestLedger':
        return this.handleGetLatestLedger(res);

      case 'getLedger':
        return this.handleGetLedger(res, params);

      case 'getAccount':
        return this.handleGetAccount(res, params);

      case 'getContractData':
        return this.handleGetContractData(res, params);

      case 'invokeHostFunction':
        return this.handleInvokeHostFunction(res, params);

      default:
        return this.sendError(res, -32601, 'Method not found', { method });
    }
  }

  private handleGetLatestLedger(res: Response): void {
    res.json({
      jsonrpc: '2.0',
      result: {
        id: '4294967296',
        pagingToken: '18446744073709551616',
        hash: 'a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3',
        prevHash: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
        sequence: 50000000,
        closedAt: new Date().toISOString(),
        totalCoins: '50000000000.0000000',
        baseFeeInStroops: 100,
        baseReserveInStroops: 5000000,
        maxTxSetSize: 1000,
        protocolVersion: 20,
        headerXDR: 'AAAAGgAAAO8pFjM0...',
      },
      id: 'test-request',
    });
  }

  private handleGetLedger(res: Response, params: any): void {
    const ledgerId = params?.[0] || 50000000;

    res.json({
      jsonrpc: '2.0',
      result: {
        id: ledgerId.toString(),
        pagingToken: ledgerId.toString(),
        hash: 'c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4',
        prevHash: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
        sequence: ledgerId,
        closedAt: new Date(Date.now() - 5000).toISOString(),
        totalCoins: '50000000000.0000000',
        baseFeeInStroops: 100,
        baseReserveInStroops: 5000000,
        maxTxSetSize: 1000,
        protocolVersion: 20,
        headerXDR: 'AAAAGgAAAO8pFjM0...',
      },
      id: 'test-request',
    });
  }

  private handleGetAccount(res: Response, params: any): void {
    const accountId = params?.[0] || 'GBRPYHIL2CI3WHZSRXUJOUPJMSUC3SM7DM7V4T5DYKU2QC34EHJQUHOG';

    // Simulate account not found for specific test addresses
    if (accountId.includes('NOTFOUND')) {
      return this.sendError(res, -32000, 'Account not found', { accountId });
    }

    res.json({
      jsonrpc: '2.0',
      result: {
        id: accountId,
        accountId,
        balances: [
          {
            balance: '1000.0000000',
            buyingLiabilities: '0.0000000',
            sellingLiabilities: '0.0000000',
            assetType: 'native',
          },
        ],
        signers: [
          {
            weight: 1,
            key: accountId,
            type: 'ed25519_public_key',
          },
        ],
        numSubentries: 0,
        inflationDestination: null,
        homeDomain: null,
        lastModifiedLedger: 50000000,
        lastModifiedTime: Math.floor(Date.now() / 1000).toString(),
        thresholds: {
          lowThreshold: 0,
          medThreshold: 0,
          highThreshold: 0,
        },
        flags: {
          authRequired: false,
          authRevocable: false,
          authImmutable: false,
          clawbackEnabled: false,
        },
        sequenceNumber: '123456789',
        subentryCount: 0,
      },
      id: 'test-request',
    });
  }

  private handleSubmitTransaction(res: Response, params: any): void {
    const txXdr = params?.[0];

    if (!txXdr) {
      return this.sendError(res, -32602, 'Invalid params', { message: 'Transaction XDR required' });
    }

    // Simulate transaction submission
    res.json({
      jsonrpc: '2.0',
      result: {
        hash: 'e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3',
        status: 'PENDING',
        latestLedger: 50000000,
        oldestLedger: 49999900,
      },
      id: 'test-request',
    });
  }

  private handleGetSorobanTransaction(res: Response, params: any): void {
    const hash = params?.[0];

    if (!hash) {
      return this.sendError(res, -32602, 'Invalid params', { message: 'Transaction hash required' });
    }

    res.json({
      jsonrpc: '2.0',
      result: {
        status: 'SUCCESS',
        latestLedger: 50000001,
        oldestLedger: 49999900,
        resultXdr:
          'AAAAAgAAAABmzWfcQvp/fwNcrvZs0HdWxvLAIDj51MhYnzYY2RQYAAAAZGF0YQAAAAo=',
      },
      id: 'test-request',
    });
  }

  private handleGetContractData(res: Response, params: any): void {
    const contractId = params?.[0];

    if (!contractId) {
      return this.sendError(res, -32602, 'Invalid params', { message: 'Contract ID required' });
    }

    // Simulate contract not found for specific test IDs
    if (contractId.includes('NOTFOUND')) {
      return this.sendError(res, -32000, 'Contract not found', { contractId });
    }

    res.json({
      jsonrpc: '2.0',
      result: {
        xdr: 'AAAACgAAAABmzWfcQvp/fwNcrvZs0HdWxvLAIDj51MhYnzYY2RQYAAAAZGF0YQ==',
        lastModifiedLedgerSeq: 50000000,
        latestLedger: 50000000,
      },
      id: 'test-request',
    });
  }

  private handleInvokeHostFunction(res: Response, params: any): void {
    const functionXdr = params?.[0];

    if (!functionXdr) {
      return this.sendError(res, -32602, 'Invalid params', { message: 'Function XDR required' });
    }

    // Simulate contract invocation
    res.json({
      jsonrpc: '2.0',
      result: {
        transactionHash:
          'f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4',
        resultXdr: 'AAAACgAAAABmzWfcQvp/fwNcrvZs0HdWxvLAIDj51MhYnzYY2RQYAAAAZGF0YQ==',
        status: 'PENDING',
      },
      id: 'test-request',
    });
  }

  private handleHorizonLedgers(req: Request, res: Response): void {
    res.json({
      _embedded: {
        records: [
          {
            id: '4294967296',
            paging_token: '4294967296',
            hash: 'a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3',
            prev_hash: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
            sequence: 50000000,
            transaction_count: 100,
            operation_count: 500,
            closed_at: new Date().toISOString(),
            total_coins: '50000000000.0000000',
            base_fee_in_stroops: 100,
            base_reserve_in_stroops: 5000000,
            max_tx_set_size: 1000,
            protocol_version: 20,
          },
        ],
      },
    });
  }
  private handleHorizonAccount(req: Request, res: Response): void {
    const accountId = req.params.accountId;

    if (accountId.includes('NOTFOUND')) {
      res.status(404).json({
        type: 'https://stellar.org/errors/not-found',
        title: 'Resource Missing',
        status: 404,
        detail: 'The resource at the url requested was not found',
      });
      return;
    }

    res.json({
      id: accountId,
      account_id: accountId,
      balances: [
        {
          balance: '1000.0000000',
          buying_liabilities: '0.0000000',
          selling_liabilities: '0.0000000',
          asset_type: 'native',
        },
      ],
      signers: [
        {
          weight: 1,
          key: accountId,
          type: 'ed25519_public_key',
        },
      ],
      num_subentries: 0,
      inflation_destination: null,
      home_domain: null,
      last_modified_ledger: 50000000,
      last_modified_time: new Date().toISOString(),
      thresholds: {
        low_threshold: 0,
        med_threshold: 0,
        high_threshold: 0,
      },
      flags: {
        auth_required: false,
        auth_revocable: false,
        auth_immutable: false,
        clawback_enabled: false,
      },
      sequence: '123456789',
      subentry_count: 0,
    });
  }

  private shouldFail(): boolean {
    // If failure window is active, fail this request
    if (this.failingUntil > Date.now()) {
      return true;
    }

    // Otherwise, check failure rate
    return Math.random() < this.config.failureRate;
  }

  /**
   * Simulate temporary failures (e.g., network issues)
   */
  setFailureWindow(durationMs: number): void {
    this.failingUntil = Date.now() + durationMs;
  }

  /**
   * Reset to healthy state
   */
  reset(): void {
    this.failingUntil = 0;
    this.requestCount = 0;
  }

  /**
   * Get current request count
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  private sendError(res: Response, code: number, message: string, data?: unknown): void {
    res.status(200).json({
      jsonrpc: '2.0',
      error: {
        code,
        message,
        data,
      },
      id: 'test-request',
    });
  }

  private getMockLedgerInfo(): any {
    return {
      sequence: 50000000,
      hash: 'a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3',
      closedAt: new Date().toISOString(),
      baseFeeInStroops: 100,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Start the mock RPC server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        console.log(`[MockStellarRpc] Server running on port ${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the mock RPC server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the base URL of the mock RPC server
   */
  getBaseUrl(): string {
    return `http://localhost:${this.config.port}`;
  }
}
