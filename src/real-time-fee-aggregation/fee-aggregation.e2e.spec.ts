import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { FeeAggregationModule } from '../src/fee-aggregation.module';

describe('FeeAggregationModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [FeeAggregationModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /quotes/compare', () => {
    it('should return quotes for a supported route (ETH→Polygon USDC)', async () => {
      const response = await request(app.getHttpServer())
        .get('/quotes/compare')
        .query({ fromChain: 1, toChain: 137, token: 'USDC', amount: '1000' })
        .expect(200);

      expect(response.body).toMatchObject({
        fromChain: 1,
        toChain: 137,
        token: 'USDC',
        amount: '1000',
        fetchedAt: expect.any(String),
        quotes: expect.any(Array),
      });

      expect(response.body.quotes.length).toBeGreaterThan(0);
    }, 15_000);

    it('should return all adapters with their status (supported or not)', async () => {
      const response = await request(app.getHttpServer())
        .get('/quotes/compare')
        .query({ fromChain: 1, toChain: 99999, token: 'USDC', amount: '500' })
        .expect(200);

      // All adapters should respond but be marked unsupported
      const allUnsupported = response.body.quotes.every(
        (q: any) => q.supported === false,
      );
      expect(allUnsupported).toBe(true);
    }, 15_000);

    it('should rank by cost when rankBy=cost', async () => {
      const response = await request(app.getHttpServer())
        .get('/quotes/compare')
        .query({ fromChain: 1, toChain: 137, token: 'USDC', amount: '1000', rankBy: 'cost' })
        .expect(200);

      const supportedQuotes = response.body.quotes.filter((q: any) => q.supported);
      if (supportedQuotes.length >= 2) {
        for (let i = 0; i < supportedQuotes.length - 1; i++) {
          expect(supportedQuotes[i].totalFeeUSD).toBeLessThanOrEqual(
            supportedQuotes[i + 1].totalFeeUSD,
          );
        }
      }
    }, 15_000);

    it('should rank by speed when rankBy=speed', async () => {
      const response = await request(app.getHttpServer())
        .get('/quotes/compare')
        .query({ fromChain: 1, toChain: 137, token: 'USDC', amount: '1000', rankBy: 'speed' })
        .expect(200);

      const supportedQuotes = response.body.quotes.filter((q: any) => q.supported);
      if (supportedQuotes.length >= 2) {
        for (let i = 0; i < supportedQuotes.length - 1; i++) {
          expect(supportedQuotes[i].estimatedArrivalTime).toBeLessThanOrEqual(
            supportedQuotes[i + 1].estimatedArrivalTime,
          );
        }
      }
    }, 15_000);

    it('should include score field when rankBy=score', async () => {
      const response = await request(app.getHttpServer())
        .get('/quotes/compare')
        .query({ fromChain: 1, toChain: 137, token: 'USDC', amount: '1000', rankBy: 'score' })
        .expect(200);

      const supportedQuotes = response.body.quotes.filter((q: any) => q.supported);
      supportedQuotes.forEach((q: any) => {
        expect(q.score).toBeDefined();
        expect(q.score).toBeGreaterThanOrEqual(0);
        expect(q.score).toBeLessThanOrEqual(100);
      });
    }, 15_000);

    it('should return 400 when fromChain is missing', async () => {
      await request(app.getHttpServer())
        .get('/quotes/compare')
        .query({ toChain: 137, token: 'USDC', amount: '1000' })
        .expect(400);
    });

    it('should return 400 when amount is missing', async () => {
      await request(app.getHttpServer())
        .get('/quotes/compare')
        .query({ fromChain: 1, toChain: 137, token: 'USDC' })
        .expect(400);
    });

    it('should return 400 for invalid rankBy value', async () => {
      await request(app.getHttpServer())
        .get('/quotes/compare')
        .query({ fromChain: 1, toChain: 137, token: 'USDC', amount: '1000', rankBy: 'invalid' })
        .expect(400);
    });

    it('should handle token case-insensitively', async () => {
      const response = await request(app.getHttpServer())
        .get('/quotes/compare')
        .query({ fromChain: 1, toChain: 137, token: 'usdc', amount: '1000' })
        .expect(200);

      expect(response.body.token).toBe('USDC');
    }, 15_000);

    it('should have valid ISO fetchedAt timestamp', async () => {
      const response = await request(app.getHttpServer())
        .get('/quotes/compare')
        .query({ fromChain: 1, toChain: 137, token: 'USDC', amount: '1000' })
        .expect(200);

      const fetchedAt = new Date(response.body.fetchedAt);
      expect(fetchedAt).toBeInstanceOf(Date);
      expect(isNaN(fetchedAt.getTime())).toBe(false);
    }, 15_000);
  });
});
