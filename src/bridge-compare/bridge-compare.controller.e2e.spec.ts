import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { BridgeCompareModule } from '../src/bridge-compare/bridge-compare.module';

describe('BridgeCompareController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [BridgeCompareModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── GET /bridge-compare/providers ───────────────────────────────────────────

  describe('GET /bridge-compare/providers', () => {
    it('returns 200 with array of providers', () => {
      return request(app.getHttpServer())
        .get('/bridge-compare/providers')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0].id).toBeDefined();
          expect(res.body[0].supportedChains).toBeDefined();
        });
    });
  });

  // ─── GET /bridge-compare/quotes ──────────────────────────────────────────────

  describe('GET /bridge-compare/quotes', () => {
    it('returns 200 with ranked quotes for valid params', () => {
      return request(app.getHttpServer())
        .get('/bridge-compare/quotes')
        .query({
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
          sourceToken: 'USDC',
          amount: 100,
          rankingMode: 'balanced',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.quotes).toBeDefined();
          expect(Array.isArray(res.body.quotes)).toBe(true);
          expect(res.body.bestRoute).toBeDefined();
          expect(res.body.rankingMode).toBe('balanced');
        });
    });

    it('returns 400 for missing required params', () => {
      return request(app.getHttpServer())
        .get('/bridge-compare/quotes')
        .query({ sourceChain: 'ethereum' }) // missing required fields
        .expect(400);
    });

    it('returns 400 for invalid ranking mode', () => {
      return request(app.getHttpServer())
        .get('/bridge-compare/quotes')
        .query({
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
          sourceToken: 'USDC',
          amount: 100,
          rankingMode: 'ultra-fast', // invalid enum
        })
        .expect(400);
    });

    it('returns 400 for negative amount', () => {
      return request(app.getHttpServer())
        .get('/bridge-compare/quotes')
        .query({
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
          sourceToken: 'USDC',
          amount: -50,
        })
        .expect(400);
    });

    it('quotes are ranked by position', async () => {
      const res = await request(app.getHttpServer())
        .get('/bridge-compare/quotes')
        .query({
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
          sourceToken: 'USDC',
          amount: 100,
        })
        .expect(200);

      const quotes: any[] = res.body.quotes;
      for (let i = 0; i < quotes.length - 1; i++) {
        expect(quotes[i].rankingPosition).toBeLessThan(quotes[i + 1].rankingPosition);
      }
    });

    it('supports lowest-cost ranking mode', () => {
      return request(app.getHttpServer())
        .get('/bridge-compare/quotes')
        .query({
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
          sourceToken: 'USDC',
          amount: 500,
          rankingMode: 'lowest-cost',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.rankingMode).toBe('lowest-cost');
        });
    });

    it('supports fastest ranking mode', () => {
      return request(app.getHttpServer())
        .get('/bridge-compare/quotes')
        .query({
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
          sourceToken: 'USDC',
          amount: 100,
          rankingMode: 'fastest',
        })
        .expect(200);
    });

    it('returns 404 for unsupported token pair', () => {
      return request(app.getHttpServer())
        .get('/bridge-compare/quotes')
        .query({
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
          sourceToken: 'TOTALLY_FAKE_TOKEN_XYZ',
          amount: 100,
        })
        .expect(404);
    });
  });

  // ─── GET /bridge-compare/quotes/:bridgeId ────────────────────────────────────

  describe('GET /bridge-compare/quotes/:bridgeId', () => {
    it('returns 200 with specific route', async () => {
      // First get all quotes to pick a real bridgeId
      const allRes = await request(app.getHttpServer())
        .get('/bridge-compare/quotes')
        .query({
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
          sourceToken: 'USDC',
          amount: 100,
        });

      const bridgeId = allRes.body.quotes[0].bridgeId;

      return request(app.getHttpServer())
        .get(`/bridge-compare/quotes/${bridgeId}`)
        .query({
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
          sourceToken: 'USDC',
          amount: 100,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.bridgeId).toBe(bridgeId);
        });
    });

    it('returns 404 for unknown bridgeId', () => {
      return request(app.getHttpServer())
        .get('/bridge-compare/quotes/nonexistent-bridge-xyz')
        .query({
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
          sourceToken: 'USDC',
          amount: 100,
        })
        .expect(404);
    });
  });
});
