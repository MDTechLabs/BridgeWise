/**
 * Webhook Module — E2E Integration Test
 *
 * Uses an in-memory SQLite database (better-sqlite3) so no real Postgres
 * or Redis is required during CI. BullMQ is mocked at the module level.
 */
import { HttpService } from '@nestjs/axios';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { of } from 'rxjs';
import * as request from 'supertest';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import { Webhook } from '../entities/webhook.entity';
import { WebhookEvent } from '../enums/webhook-event.enum';
import { WEBHOOK_QUEUE } from '../webhook.constants';
import { WebhookModule } from '../webhook.module';

// ── queue stub ────────────────────────────────────────────────────────────────
const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

// ── http stub ─────────────────────────────────────────────────────────────────
const mockHttpService = {
  post: jest.fn(() =>
    of({ status: 200, data: { ok: true }, headers: {}, config: { headers: {} } }),
  ),
};

// ─────────────────────────────────────────────────────────────────────────────

describe('Webhook Module (e2e)', () => {
  let app: INestApplication;
  let createdWebhookId: string;
  let createdDeliveryId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),

        // SQLite in-memory — no Docker needed
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Webhook, WebhookDelivery],
          synchronize: true,
          logging: false,
        }),

        // Register queue so the module compiles; we override the provider below
        BullModule.forRoot({ connection: { host: 'localhost' } }),
        BullModule.registerQueue({ name: WEBHOOK_QUEUE }),

        WebhookModule,
      ],
    })
      .overrideProvider(getQueueToken(WEBHOOK_QUEUE))
      .useValue(mockQueue)
      .overrideProvider(HttpService)
      .useValue(mockHttpService)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  // ── POST /webhooks ─────────────────────────────────────────────────────────

  describe('POST /webhooks', () => {
    it('201 — creates a webhook with valid payload', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks')
        .send({
          name: 'Gas Alert Hook',
          url: 'https://consumer.example.com/hook',
          secret: 'a-very-secure-secret-key',
          events: [WebhookEvent.GAS_SPIKE_DETECTED],
        })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        name: 'Gas Alert Hook',
        url: 'https://consumer.example.com/hook',
        isActive: true,
        maxRetries: 5,
      });

      createdWebhookId = res.body.id;
    });

    it('400 — rejects missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/webhooks')
        .send({ name: 'No URL' })
        .expect(400);
    });

    it('400 — rejects secrets shorter than 16 characters', async () => {
      await request(app.getHttpServer())
        .post('/webhooks')
        .send({
          name: 'Short secret',
          url: 'https://example.com/hook',
          secret: 'tooshort',
        })
        .expect(400);
    });

    it('400 — rejects unknown event types', async () => {
      await request(app.getHttpServer())
        .post('/webhooks')
        .send({
          name: 'Bad event',
          url: 'https://example.com/hook',
          secret: 'a-very-secure-secret-key',
          events: ['not.a.real.event'],
        })
        .expect(400);
    });
  });

  // ── GET /webhooks ──────────────────────────────────────────────────────────

  describe('GET /webhooks', () => {
    it('200 — returns array of webhooks', async () => {
      const res = await request(app.getHttpServer()).get('/webhooks').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── GET /webhooks/:id ──────────────────────────────────────────────────────

  describe('GET /webhooks/:id', () => {
    it('200 — returns the specific webhook', async () => {
      const res = await request(app.getHttpServer())
        .get(`/webhooks/${createdWebhookId}`)
        .expect(200);

      expect(res.body.id).toBe(createdWebhookId);
    });

    it('404 — unknown id', async () => {
      await request(app.getHttpServer())
        .get('/webhooks/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  // ── PATCH /webhooks/:id ────────────────────────────────────────────────────

  describe('PATCH /webhooks/:id', () => {
    it('200 — updates webhook name', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/webhooks/${createdWebhookId}`)
        .send({ name: 'Renamed Hook' })
        .expect(200);

      expect(res.body.name).toBe('Renamed Hook');
    });
  });

  // ── POST /webhooks/:id/ping ────────────────────────────────────────────────

  describe('POST /webhooks/:id/ping', () => {
    it('202 — queues a PING delivery', async () => {
      await request(app.getHttpServer())
        .post(`/webhooks/${createdWebhookId}/ping`)
        .expect(202);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({
          webhookId: createdWebhookId,
          payload: expect.objectContaining({ event: WebhookEvent.PING }),
        }),
        expect.any(Object),
      );
    });
  });

  // ── GET /webhooks/:id/deliveries ───────────────────────────────────────────

  describe('GET /webhooks/:id/deliveries', () => {
    it('200 — returns paginated delivery records', async () => {
      const res = await request(app.getHttpServer())
        .get(`/webhooks/${createdWebhookId}/deliveries`)
        .expect(200);

      expect(res.body).toMatchObject({ items: expect.any(Array), total: expect.any(Number) });
      if (res.body.items.length > 0) {
        createdDeliveryId = res.body.items[0].id;
      }
    });

    it('404 — unknown webhook id', async () => {
      await request(app.getHttpServer())
        .get('/webhooks/00000000-0000-0000-0000-000000000000/deliveries')
        .expect(404);
    });
  });

  // ── GET /webhooks/:id/deliveries/:dId ─────────────────────────────────────

  describe('GET /webhooks/:id/deliveries/:dId', () => {
    it('200 — returns single delivery when it exists', async () => {
      if (!createdDeliveryId) return; // no delivery created yet
      const res = await request(app.getHttpServer())
        .get(`/webhooks/${createdWebhookId}/deliveries/${createdDeliveryId}`)
        .expect(200);

      expect(res.body.id).toBe(createdDeliveryId);
    });
  });

  // ── POST /webhooks/dispatch ────────────────────────────────────────────────

  describe('POST /webhooks/dispatch', () => {
    beforeEach(() => {
      // Set the admin secret in env so the guard passes
      process.env.WEBHOOK_ADMIN_SECRET = 'admin-secret-key';
    });

    it('202 — dispatches event to subscribed active webhooks', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/dispatch')
        .set('Authorization', 'Bearer admin-secret-key')
        .send({ event: WebhookEvent.GAS_SPIKE_DETECTED, data: { chain: 'eth' } })
        .expect(202);

      // Our hook subscribes to GAS_SPIKE_DETECTED → exactly 1 delivery queued
      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({
          payload: expect.objectContaining({ event: WebhookEvent.GAS_SPIKE_DETECTED }),
        }),
        expect.any(Object),
      );
    });

    it('401 — dispatch is rejected without admin token', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/dispatch')
        .send({ event: WebhookEvent.PING })
        .expect(401);
    });
  });

  // ── DELETE /webhooks/:id ───────────────────────────────────────────────────

  describe('DELETE /webhooks/:id', () => {
    it('204 — removes the webhook', async () => {
      await request(app.getHttpServer())
        .delete(`/webhooks/${createdWebhookId}`)
        .expect(204);
    });

    it('404 — webhook no longer exists after deletion', async () => {
      await request(app.getHttpServer())
        .get(`/webhooks/${createdWebhookId}`)
        .expect(404);
    });
  });
});
