import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from '../src/analytics/analytics.module';
import { BridgeAnalytics } from '../src/analytics/entities/bridge-analytics.entity';

describe('AnalyticsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [BridgeAnalytics],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([BridgeAnalytics]),
        AnalyticsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/bridge-analytics', () => {
    it('should return empty analytics initially', () => {
      return request(app.getHttpServer())
        .get('/api/v1/bridge-analytics')
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toEqual([]);
          expect(res.body.total).toBe(0);
          expect(res.body.page).toBe(1);
        });
    });

    it('should support pagination', () => {
      return request(app.getHttpServer())
        .get('/api/v1/bridge-analytics?page=1&limit=10')
        .expect(200)
        .expect((res) => {
          expect(res.body.limit).toBe(10);
          expect(res.body.totalPages).toBe(0);
        });
    });

    it('should filter by bridge name', () => {
      return request(app.getHttpServer())
        .get('/api/v1/bridge-analytics?bridgeName=hop')
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toEqual([]);
        });
    });
  });

  describe('GET /api/v1/bridge-analytics/routes/:bridge/:source/:dest', () => {
    it('should return empty analytics for non-existent route', () => {
      return request(app.getHttpServer())
        .get('/api/v1/bridge-analytics/routes/hop/ethereum/polygon')
        .expect(200)
        .expect((res) => {
          expect(res.body.bridgeName).toBe('hop');
          expect(res.body.totalTransfers).toBe(0);
          expect(res.body.successRate).toBe(0);
        });
    });

    it('should support token filter', () => {
      return request(app.getHttpServer())
        .get('/api/v1/bridge-analytics/routes/hop/ethereum/polygon?token=USDC')
        .expect(200)
        .expect((res) => {
          expect(res.body.token).toBe('USDC');
        });
    });
  });

  describe('GET /api/v1/bridge-analytics/trends/:bridge/:source/:dest', () => {
    it('should return time series data', () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      return request(app.getHttpServer())
        .get(
          `/api/v1/bridge-analytics/trends/hop/ethereum/polygon?granularity=day&startDate=${startDate}&endDate=${endDate}`,
        )
        .expect(200)
        .expect((res) => {
          expect(res.body.bridgeName).toBe('hop');
          expect(res.body.granularity).toBe('day');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should require all query parameters', () => {
      return request(app.getHttpServer())
        .get('/api/v1/bridge-analytics/trends/hop/ethereum/polygon')
        .expect(400);
    });
  });

  describe('GET /api/v1/bridge-analytics/top-performing', () => {
    it('should return top performing bridges', () => {
      return request(app.getHttpServer())
        .get('/api/v1/bridge-analytics/top-performing')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('byVolume');
          expect(res.body).toHaveProperty('bySuccessRate');
          expect(res.body).toHaveProperty('bySpeed');
          expect(res.body).toHaveProperty('generatedAt');
        });
    });

    it('should support limit parameter', () => {
      return request(app.getHttpServer())
        .get('/api/v1/bridge-analytics/top-performing?limit=5')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body.byVolume)).toBe(true);
        });
    });
  });

  describe('GET /api/v1/bridge-analytics/slippage/:bridge/:source/:dest', () => {
    it('should return slippage statistics or message', () => {
      return request(app.getHttpServer())
        .get('/api/v1/bridge-analytics/slippage/hop/ethereum/polygon')
        .expect(200)
        .expect((res) => {
          // Either returns stats or a message if no data
          expect(
            res.body.message || res.body.averageSlippagePercent !== undefined,
          ).toBeTruthy();
        });
    });
  });

  describe('GET /api/v1/bridge-analytics/insights/user-activity', () => {
    it('should return user activity insights', () => {
      return request(app.getHttpServer())
        .get('/api/v1/bridge-analytics/insights/user-activity')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('totalTransfers');
          expect(res.body).toHaveProperty('popularRoutes');
          expect(res.body).toHaveProperty('generatedAt');
        });
    });
  });

  describe('GET /api/v1/bridge-analytics/admin/recalculate', () => {
    it('should trigger analytics recalculation', () => {
      return request(app.getHttpServer())
        .get('/api/v1/bridge-analytics/admin/recalculate')
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe('Analytics recalculation completed successfully');
        });
    });
  });
});
