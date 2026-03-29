import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import { Webhook } from '../entities/webhook.entity';
import { DeliveryStatus } from '../enums/delivery-status.enum';
import { WebhookEvent } from '../enums/webhook-event.enum';
import { WEBHOOK_QUEUE } from '../webhook.constants';
import { WebhookService } from '../webhook.service';

// ── helpers ──────────────────────────────────────────────────────────────────

const makeWebhook = (overrides: Partial<Webhook> = {}): Webhook =>
  ({
    id: 'wh-uuid-1',
    name: 'Test Hook',
    url: 'https://example.com/hook',
    secret: 'a-very-secret-key-32chars-xxxxxxx',
    events: [],
    isActive: true,
    maxRetries: 5,
    description: null,
    deliveries: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Webhook);

const makeDelivery = (overrides: Partial<WebhookDelivery> = {}): WebhookDelivery =>
  ({
    id: 'del-uuid-1',
    webhookId: 'wh-uuid-1',
    event: WebhookEvent.PING,
    payload: {},
    status: DeliveryStatus.FAILED,
    responseStatus: null,
    responseBody: null,
    errorMessage: 'timeout',
    attempt: 3,
    nextRetryAt: null,
    deliveredAt: null,
    createdAt: new Date(),
    ...overrides,
  } as WebhookDelivery);

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockWebhookRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  update: jest.fn(),
});

const mockDeliveryRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findAndCount: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
});

const mockQueue = () => ({
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('WebhookService', () => {
  let service: WebhookService;
  let webhookRepo: ReturnType<typeof mockWebhookRepo>;
  let deliveryRepo: ReturnType<typeof mockDeliveryRepo>;
  let queue: ReturnType<typeof mockQueue>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: getRepositoryToken(Webhook), useFactory: mockWebhookRepo },
        { provide: getRepositoryToken(WebhookDelivery), useFactory: mockDeliveryRepo },
        { provide: getQueueToken(WEBHOOK_QUEUE), useFactory: mockQueue },
      ],
    }).compile();

    service = module.get(WebhookService);
    webhookRepo = module.get(getRepositoryToken(Webhook));
    deliveryRepo = module.get(getRepositoryToken(WebhookDelivery));
    queue = module.get(getQueueToken(WEBHOOK_QUEUE));
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates and saves a webhook with defaults applied', async () => {
      const dto = {
        name: 'My Hook',
        url: 'https://example.com/hook',
        secret: 'my-secret-key-16chars',
      };
      const created = makeWebhook();
      webhookRepo.create.mockReturnValue(created);
      webhookRepo.save.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(webhookRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          events: [],
          isActive: true,
          maxRetries: 5,
        }),
      );
      expect(result).toEqual(created);
    });

    it('respects caller-supplied events and maxRetries', async () => {
      const dto = {
        name: 'Selective Hook',
        url: 'https://example.com/hook',
        secret: 'my-secret-key-16chars',
        events: [WebhookEvent.GAS_SPIKE_DETECTED],
        maxRetries: 3,
      };
      webhookRepo.create.mockReturnValue(makeWebhook());
      webhookRepo.save.mockResolvedValue(makeWebhook());

      await service.create(dto);

      expect(webhookRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          events: [WebhookEvent.GAS_SPIKE_DETECTED],
          maxRetries: 3,
        }),
      );
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the webhook when found', async () => {
      const wh = makeWebhook();
      webhookRepo.findOne.mockResolvedValue(wh);
      expect(await service.findOne('wh-uuid-1')).toEqual(wh);
    });

    it('throws NotFoundException when not found', async () => {
      webhookRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('merges dto fields onto the entity and saves', async () => {
      const wh = makeWebhook();
      webhookRepo.findOne.mockResolvedValue(wh);
      const updated = { ...wh, name: 'Renamed' };
      webhookRepo.save.mockResolvedValue(updated);

      const result = await service.update('wh-uuid-1', { name: 'Renamed' });
      expect(result.name).toBe('Renamed');
      expect(webhookRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed' }));
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes the webhook', async () => {
      const wh = makeWebhook();
      webhookRepo.findOne.mockResolvedValue(wh);
      webhookRepo.remove.mockResolvedValue(undefined);

      await service.remove('wh-uuid-1');
      expect(webhookRepo.remove).toHaveBeenCalledWith(wh);
    });
  });

  // ── dispatch ──────────────────────────────────────────────────────────────

  describe('dispatch', () => {
    it('skips queue when no active subscribers exist', async () => {
      webhookRepo.find.mockResolvedValue([]);

      await service.dispatch({ event: WebhookEvent.PING });

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('enqueues a delivery for each subscriber', async () => {
      const hooks = [makeWebhook({ id: 'wh-1' }), makeWebhook({ id: 'wh-2' })];
      webhookRepo.find.mockResolvedValue(hooks);

      const delivery = makeDelivery();
      deliveryRepo.create.mockReturnValue(delivery);
      deliveryRepo.save.mockResolvedValue(delivery);

      await service.dispatch({ event: WebhookEvent.PING, data: { test: true } });

      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({ url: hooks[0].url }),
        expect.any(Object),
      );
    });

    it('only sends to webhooks subscribed to the event', async () => {
      const subscribed = makeWebhook({ events: [WebhookEvent.GAS_SPIKE_DETECTED] });
      const unsubscribed = makeWebhook({ id: 'wh-2', events: [WebhookEvent.USER_CREATED] });
      webhookRepo.find.mockResolvedValue([subscribed, unsubscribed]);

      const delivery = makeDelivery();
      deliveryRepo.create.mockReturnValue(delivery);
      deliveryRepo.save.mockResolvedValue(delivery);

      await service.dispatch({ event: WebhookEvent.GAS_SPIKE_DETECTED });

      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('sends to all-events webhooks (empty events array = subscribe all)', async () => {
      const catchAll = makeWebhook({ events: [] }); // empty = all
      webhookRepo.find.mockResolvedValue([catchAll]);
      deliveryRepo.create.mockReturnValue(makeDelivery());
      deliveryRepo.save.mockResolvedValue(makeDelivery());

      await service.dispatch({ event: WebhookEvent.ALERT_TRIGGERED });

      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });

  // ── ping ──────────────────────────────────────────────────────────────────

  describe('ping', () => {
    it('dispatches a PING event to the specific webhook', async () => {
      const wh = makeWebhook();
      webhookRepo.findOne.mockResolvedValue(wh);
      deliveryRepo.create.mockReturnValue(makeDelivery());
      deliveryRepo.save.mockResolvedValue(makeDelivery());

      await service.ping('wh-uuid-1');

      expect(queue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({ webhookId: 'wh-uuid-1' }),
        expect.any(Object),
      );
    });
  });

  // ── retryDelivery ─────────────────────────────────────────────────────────

  describe('retryDelivery', () => {
    it('resets attempt count and re-queues the delivery', async () => {
      const wh = makeWebhook();
      const delivery = makeDelivery({ status: DeliveryStatus.EXHAUSTED });
      webhookRepo.findOne.mockResolvedValue(wh);
      deliveryRepo.findOne.mockResolvedValue(delivery);
      deliveryRepo.update.mockResolvedValue(undefined);
      deliveryRepo.create.mockReturnValue(delivery);
      deliveryRepo.save.mockResolvedValue(delivery);

      await service.retryDelivery('wh-uuid-1', 'del-uuid-1');

      expect(deliveryRepo.update).toHaveBeenCalledWith(
        delivery.id,
        expect.objectContaining({ status: DeliveryStatus.RETRYING, attempt: 0 }),
      );
      expect(queue.add).toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown delivery', async () => {
      webhookRepo.findOne.mockResolvedValue(makeWebhook());
      deliveryRepo.findOne.mockResolvedValue(null);

      await expect(service.retryDelivery('wh-uuid-1', 'no-delivery')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── listDeliveries ────────────────────────────────────────────────────────

  describe('listDeliveries', () => {
    it('returns paginated delivery records', async () => {
      webhookRepo.findOne.mockResolvedValue(makeWebhook());
      const deliveries = [makeDelivery()];
      deliveryRepo.findAndCount.mockResolvedValue([deliveries, 1]);

      const result = await service.listDeliveries('wh-uuid-1', { page: 1, limit: 20 });

      expect(result).toEqual({ items: deliveries, total: 1 });
    });
  });
});
