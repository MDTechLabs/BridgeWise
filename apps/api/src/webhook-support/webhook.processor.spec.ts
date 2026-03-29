import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { WebhookEvent } from '../enums/webhook-event.enum';
import { WebhookDeliveryJobData } from '../interfaces/webhook-payload.interface';
import { WebhookDeliveryService } from '../webhook-delivery.service';
import { WebhookProcessor } from '../webhook.processor';

const makeJob = (overrides: Partial<Job<WebhookDeliveryJobData>> = {}) =>
  ({
    id: 'job-uuid-1',
    name: 'deliver',
    attemptsMade: 0,
    opts: { attempts: 5 },
    data: {
      webhookId: 'wh-1',
      deliveryId: 'del-1',
      url: 'https://consumer.example.com/hook',
      secret: 'secret-key-16chars',
      attempt: 0,
      payload: {
        id: 'payload-uuid',
        event: WebhookEvent.PING,
        createdAt: new Date().toISOString(),
        data: {},
      },
    },
    ...overrides,
  } as unknown as Job<WebhookDeliveryJobData>);

describe('WebhookProcessor', () => {
  let processor: WebhookProcessor;
  let deliveryService: jest.Mocked<WebhookDeliveryService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookProcessor,
        {
          provide: WebhookDeliveryService,
          useValue: {
            deliver: jest.fn().mockResolvedValue(undefined),
            markExhausted: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    processor = module.get(WebhookProcessor);
    deliveryService = module.get(WebhookDeliveryService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── process ───────────────────────────────────────────────────────────────

  describe('process', () => {
    it('calls deliveryService.deliver with job data + current attempt count', async () => {
      const job = makeJob({ attemptsMade: 2 });
      await processor.process(job);

      expect(deliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 2 }),
      );
    });

    it('propagates errors from deliveryService (so BullMQ can retry)', async () => {
      deliveryService.deliver.mockRejectedValue(new Error('Network timeout'));
      const job = makeJob();
      await expect(processor.process(job)).rejects.toThrow('Network timeout');
    });
  });

  // ── onFailed ──────────────────────────────────────────────────────────────

  describe('onFailed', () => {
    it('calls markExhausted when this is the final attempt', async () => {
      const job = makeJob({ attemptsMade: 5, opts: { attempts: 5 } });
      await processor.onFailed(job, new Error('deadline exceeded'));

      expect(deliveryService.markExhausted).toHaveBeenCalledWith(
        'del-1',
        'deadline exceeded',
      );
    });

    it('does NOT call markExhausted when retries remain', async () => {
      const job = makeJob({ attemptsMade: 2, opts: { attempts: 5 } });
      await processor.onFailed(job, new Error('temporary glitch'));

      expect(deliveryService.markExhausted).not.toHaveBeenCalled();
    });
  });
});
