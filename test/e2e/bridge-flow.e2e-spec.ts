import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../apps/api/src/config/config.module';
import { ConfigService } from '../apps/api/src/config/config.service';
import { SecurityModule } from '../apps/api/src/security/security.module';
import { TransactionsModule } from '../apps/api/src/transactions/transactions.module';
import { Transaction } from '../apps/api/src/transactions/entities/transaction.entity';
import { WalletModule } from '../apps/api/src/wallet/wallet.module';
import { WalletSession } from '../apps/api/src/wallet/entities/wallet-session.entity';

describe('Bridge Flow E2E', () => {
  let app: INestApplication;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        SecurityModule,
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Transaction, WalletSession],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Transaction, WalletSession]),
        TransactionsModule,
        WalletModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    configService = moduleFixture.get<ConfigService>(ConfigService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Full Bridge Flow - Stellar Payment', () => {
    let transactionId: string;

    it('should create a Stellar payment transaction', async () => {
      const response = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          type: 'stellar-payment',
          metadata: {
            sourceAccount: 'GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD',
            destinationAccount: 'GBRPYHIL2CI3WHZSRJQEMQ5CPQIS2TCCQ7OXJGGUFR7XUWVEPSWR47U',
            amount: '100',
            asset: 'native',
            memo: 'Cross-chain transfer',
          },
          totalSteps: 3,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.type).toBe('stellar-payment');
      expect(response.body.status).toBe('pending');
      expect(response.body.currentStep).toBe(0);
      expect(response.body.totalSteps).toBe(3);
      
      transactionId = response.body.id;
    });

    it('should retrieve the created transaction', async () => {
      const response = await request(app.getHttpServer())
        .get(`/transactions/${transactionId}`)
        .expect(200);

      expect(response.body.id).toBe(transactionId);
      expect(response.body.type).toBe('stellar-payment');
      expect(response.body.metadata).toHaveProperty('sourceAccount');
      expect(response.body.metadata).toHaveProperty('destinationAccount');
    });

    it('should advance transaction to step 1', async () => {
      const response = await request(app.getHttpServer())
        .put(`/transactions/${transactionId}/advance`)
        .send({
          signature: 'TAQCSRX2RIDJNHFYFZXPGXWRWQUXNZKICH57C4YKHUYATFLBMUUPAA2DWS5PDVLXP6GQ6SDFGJJWMKHW',
        })
        .expect(200);

      expect(response.body.currentStep).toBe(1);
      expect(response.body.status).toBe('in-progress');
    });

    it('should advance transaction to step 2', async () => {
      const response = await request(app.getHttpServer())
        .put(`/transactions/${transactionId}/advance`)
        .send({
          fee: '1.5',
        })
        .expect(200);

      expect(response.body.currentStep).toBe(2);
      expect(response.body.status).toBe('in-progress');
    });

    it('should complete the transaction on final step', async () => {
      const response = await request(app.getHttpServer())
        .put(`/transactions/${transactionId}/advance`)
        .send({
          txHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        })
        .expect(200);

      expect(response.body.currentStep).toBe(3);
      expect(response.body.status).toBe('completed');
      expect(response.body).toHaveProperty('completedAt');
    });
  });

  describe('Full Bridge Flow - Hop Protocol', () => {
    let transactionId: string;

    it('should create a Hop bridge transaction', async () => {
      const response = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          type: 'hop-bridge',
          metadata: {
            token: 'USDC',
            amount: '500',
            sourceChain: 'ethereum',
            destinationChain: 'polygon',
            recipient: '0x742d35Cc6634C0532925a3b844Bc328e8f94D5dC',
            deadline: 1000000000,
            amountOutMin: '490',
          },
          totalSteps: 4,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.type).toBe('hop-bridge');
      expect(response.body.status).toBe('pending');
      
      transactionId = response.body.id;
    });

    it('should advance through all Hop bridge steps', async () => {
      // Step 1: Fee estimation
      await request(app.getHttpServer())
        .put(`/transactions/${transactionId}/advance`)
        .send({ fee: '2.5', gasLimit: '200000' })
        .expect(200);

      // Step 2: Approval
      await request(app.getHttpServer())
        .put(`/transactions/${transactionId}/advance`)
        .send({ approvalTxHash: '0xabc123...' })
        .expect(200);

      // Step 3: Bridge transaction
      await request(app.getHttpServer())
        .put(`/transactions/${transactionId}/advance`)
        .send({ bridgeTxHash: '0xdef456...' })
        .expect(200);

      // Step 4: Completion
      const response = await request(app.getHttpServer())
        .put(`/transactions/${transactionId}/advance`)
        .send({ finalTxHash: '0xghi789...' })
        .expect(200);

      expect(response.body.status).toBe('completed');
      expect(response.body.currentStep).toBe(4);
    });
  });

  describe('Full Bridge Flow - LayerZero', () => {
    let transactionId: string;

    it('should create a LayerZero transaction', async () => {
      const response = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          type: 'layerzero-omnichain',
          metadata: {
            token: 'USDT',
            amount: '1000',
            sourceChainId: 101,
            destinationChainId: 102,
            recipient: '0x9e4c14403d7d2a8f5bD10b2c7c1e0d0e0d0e0d0e',
          },
          totalSteps: 3,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.type).toBe('layerzero-omnichain');
      
      transactionId = response.body.id;
    });

    it('should complete LayerZero transaction flow', async () => {
      // Step 1: Quote
      await request(app.getHttpServer())
        .put(`/transactions/${transactionId}/advance`)
        .send({ quote: { fee: '3.0', estimatedTime: 300 } })
        .expect(200);

      // Step 2: Send
      await request(app.getHttpServer())
        .put(`/transactions/${transactionId}/advance`)
        .send({ sendTxHash: '0xlayerzero123' })
        .expect(200);

      // Step 3: Receive
      const response = await request(app.getHttpServer())
        .put(`/transactions/${transactionId}/advance`)
        .send({ receiveTxHash: '0xlayerzero456' })
        .expect(200);

      expect(response.body.status).toBe('completed');
    });
  });

  describe('Error Handling - Invalid Transaction', () => {
    it('should return 404 for non-existent transaction', async () => {
      await request(app.getHttpServer())
        .get('/transactions/invalid-id')
        .expect(404);
    });

    it('should return 400 for invalid transaction creation', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          type: 'invalid-type',
          metadata: {},
        })
        .expect(400);
    });

    it('should handle transaction failure', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          type: 'stellar-payment',
          metadata: {
            sourceAccount: 'GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD',
            destinationAccount: 'GBRPYHIL2CI3WHZSRJQEMQ5CPQIS2TCCQ7OXJGGUFR7XUWVEPSWR47U',
            amount: '100',
          },
          totalSteps: 3,
        })
        .expect(201);

      const transactionId = createResponse.body.id;

      await request(app.getHttpServer())
        .put(`/transactions/${transactionId}`)
        .send({
          status: 'failed',
          error: 'Insufficient funds',
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/transactions/${transactionId}`)
        .expect(200);

      expect(response.body.status).toBe('failed');
      expect(response.body.error).toBe('Insufficient funds');
    });
  });

  describe('Configuration and Security', () => {
    it('should have config service available', () => {
      expect(configService).toBeDefined();
      expect(configService.isDevelopment).toBe(true);
    });

    it('should not expose secrets in config', () => {
      const config = configService.all;
      
      // These should be empty strings, not actual secrets
      expect(config.api.apiKey).toBe('');
      expect(config.api.apiSecret).toBe('');
      expect(config.database.password).toBe('');
    });

    it('should retrieve secrets via vault methods only', () => {
      // Vault methods should work (even with test data)
      expect(typeof configService.getApiKey).toBe('function');
      expect(typeof configService.getApiSecret).toBe('function');
      expect(typeof configService.getDatabasePassword).toBe('function');
    });
  });
});
