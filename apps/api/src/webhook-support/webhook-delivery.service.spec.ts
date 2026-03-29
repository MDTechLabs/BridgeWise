import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import { DeliveryStatus } from '../enums/delivery-status.enum';
import { WebhookEvent } from '../enums/webhook-event.enum';
import { WebhookDeliveryJobData } from '../interfaces/webhook-payload.interface';
import { WebhookDeliveryService } from '../webhook-delivery.service';
import { WebhookSignatureService } from '../webhook-signature.service';

const makeJob = (overrides: Partial<WebhookDeliveryJobData> = {}): WebhookDeliveryJobData => ({
  webhookId: 'wh-1',
  deliveryId: 'del-1',
  url: 'https://consumer.example.com/hook',
  secret: 'super-secret-key-16chars',
  attempt: 0,
  payload: {
    id: 'payload-uuid',
    event: WebhookEvent.PING,
    createdAt: new Date().toISOString(),
    data: {},
  },
  ...overrides,
});

const makeAxiosResponse = (status: number, data: unknown = {}): AxiosResponse =>
  ({
    status,
    data,
    headers: {},
    config: { headers: {} } as any,
    statusText: String(status),
  } as AxiosResponse);

describe('WebhookDeliveryService', () => {
  let service: WebhookDeliveryService;
  let httpService: jest.Mocked<HttpService>;
  let deliveryRepo: { update: jest.Mock };
  let signatureService: WebhookSignatureService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryService,
        WebhookSignatureService,
        {
          provide: HttpService,
          useValue: { post: jest.fn() },
        },
        {
          provide: getRepositoryToken(WebhookDelivery),
          useValue: { update: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(WebhookDeliveryService);
    httpService = module.get(HttpService);
    deliveryRepo = module.get(getRepositoryToken(WebhookDelivery));
    signatureService = module.get(WebhookSignatureService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── successful delivery ───────────────────────────────────────────────────

  describe('deliver — success path', () => {
    it('sends POST with correct headers and marks delivery as SUCCESS', async () => {
      const job = makeJob();
      httpService.post.mockReturnValue(of(makeAxiosResponse(200, { ok: true })));

      await service.deliver(job);

      expect(httpService.post).toHaveBeenCalledWith(
        job.url,
        job.payload,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-BridgeWise-Delivery': 'del-1',
            'X-BridgeWise-Event': WebhookEvent.PING,
          }),
        }),
      );

      expect(deliveryRepo.update).toHaveBeenLastCalledWith(
        'del-1',
        expect.objectContaining({ status: DeliveryStatus.SUCCESS }),
      );
    });

    it('includes a valid HMAC-SHA256 signature header', async () => {
      const job = makeJob();
      httpService.post.mockReturnValue(of(makeAxiosResponse(201)));

      await service.deliver(job);

      const callArgs = httpService.post.mock.calls[0];
      const headers = callArgs[2].headers as Record<string, string>;
      const sig = headers['X-BridgeWise-Signature'];

      const expectedSig = signatureService.sign(
        JSON.stringify(job.payload),
        job.secret,
      );
      expect(sig).toBe(expectedSig);
    });

    it('accepts any 2xx status code', async () => {
      for (const status of [200, 201, 202, 204]) {
        deliveryRepo.update.mockResolvedValue(undefined);
        httpService.post.mockReturnValue(of(makeAxiosResponse(status)));
        await expect(service.deliver(makeJob())).resolves.not.toThrow();
      }
    });
  });

  // ── failed delivery (HTTP error) ──────────────────────────────────────────

  describe('deliver — HTTP error path', () => {
    it('throws and marks delivery FAILED on non-2xx response', async () => {
      const job = makeJob();
      httpService.post.mockReturnValue(of(makeAxiosResponse(500, 'Internal Server Error')));

      await expect(service.deliver(job)).rejects.toThrow(/500/);

      expect(deliveryRepo.update).toHaveBeenLastCalledWith(
        'del-1',
        expect.objectContaining({ status: DeliveryStatus.FAILED, responseStatus: 500 }),
      );
    });

    it('throws and records error message on network failure', async () => {
      const job = makeJob();
      const networkError = Object.assign(new Error('ECONNREFUSED'), { isAxiosError: true });
      httpService.post.mockReturnValue(throwError(() => networkError));

      await expect(service.deliver(job)).rejects.toThrow('ECONNREFUSED');

      expect(deliveryRepo.update).toHaveBeenLastCalledWith(
        'del-1',
        expect.objectContaining({
          status: DeliveryStatus.FAILED,
          errorMessage: expect.stringContaining('ECONNREFUSED'),
        }),
      );
    });
  });

  // ── markExhausted ─────────────────────────────────────────────────────────

  describe('markExhausted', () => {
    it('sets status to EXHAUSTED with error summary', async () => {
      await service.markExhausted('del-1', 'connection refused');

      expect(deliveryRepo.update).toHaveBeenCalledWith(
        'del-1',
        expect.objectContaining({
          status: DeliveryStatus.EXHAUSTED,
          errorMessage: expect.stringContaining('connection refused'),
        }),
      );
    });
  });
});
