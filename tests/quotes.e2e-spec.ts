import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { QuotesModule } from '../apps/api/src/quotes/quotes.module';

describe('QuotesController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [QuotesModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /quotes - returns 200 with sorted quote options on valid request', async () => {
    const response = await request(app.getHttpServer())
      .post('/quotes')
      .send({
        fromChain: 'ethereum',
        toChain: 'stellar',
        fromToken: 'USDC',
        amount: '100',
      })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);

    // Verify quotes are sorted by netOutputAmount descending
    for (let i = 0; i < response.body.length - 1; i++) {
      const current = parseFloat(response.body[i].netOutputAmount);
      const next = parseFloat(response.body[i + 1].netOutputAmount);
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  it('POST /quotes - returns 400 when missing required parameters', async () => {
    await request(app.getHttpServer())
      .post('/quotes')
      .send({
        fromChain: 'ethereum',
      })
      .expect(400);
  });
});
