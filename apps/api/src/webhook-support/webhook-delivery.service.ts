import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosError } from 'axios';
import { firstValueFrom, timeout } from 'rxjs';
import { Repository } from 'typeorm';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { DeliveryStatus } from './enums/delivery-status.enum';
import { WebhookDeliveryJobData } from './interfaces/webhook-payload.interface';
import { WebhookSignatureService } from './webhook-signature.service';

const DELIVERY_TIMEOUT_MS = 10_000; // 10 s
const MAX_RESPONSE_BODY = 2_048;    // 2 KiB stored

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly signatureService: WebhookSignatureService,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
  ) {}

  /**
   * Executes one HTTP delivery attempt.
   * Throws on failure so BullMQ can handle retries / backoff.
   */
  async deliver(job: WebhookDeliveryJobData): Promise<void> {
    const { deliveryId, url, secret, payload, attempt } = job;

    const body = JSON.stringify(payload);
    const signature = this.signatureService.sign(body, secret);

    this.logger.log(
      `Attempting delivery ${deliveryId} → ${url} (attempt #${attempt + 1})`,
    );

    await this.deliveryRepo.update(deliveryId, {
      status: DeliveryStatus.RETRYING,
      attempt: attempt + 1,
    });

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(url, payload, {
            headers: {
              'Content-Type': 'application/json',
              'X-BridgeWise-Signature': signature,
              'X-BridgeWise-Event': payload.event,
              'X-BridgeWise-Delivery': deliveryId,
            },
            validateStatus: () => true, // handle all statuses ourselves
          })
          .pipe(timeout(DELIVERY_TIMEOUT_MS)),
      );

      const responseBody =
        typeof response.data === 'string'
          ? response.data.slice(0, MAX_RESPONSE_BODY)
          : JSON.stringify(response.data).slice(0, MAX_RESPONSE_BODY);

      const success = response.status >= 200 && response.status < 300;

      await this.deliveryRepo.update(deliveryId, {
        status: success ? DeliveryStatus.SUCCESS : DeliveryStatus.FAILED,
        responseStatus: response.status,
        responseBody,
        deliveredAt: success ? new Date() : null,
        errorMessage: success
          ? null
          : `HTTP ${response.status}: ${responseBody}`,
      });

      if (!success) {
        throw new Error(
          `Webhook consumer returned ${response.status} for delivery ${deliveryId}`,
        );
      }

      this.logger.log(`Delivery ${deliveryId} succeeded (HTTP ${response.status})`);
    } catch (error) {
      const isAxiosError = (error as AxiosError).isAxiosError;
      const message = isAxiosError
        ? `Network error: ${(error as AxiosError).message}`
        : (error as Error).message;

      this.logger.warn(`Delivery ${deliveryId} failed: ${message}`);

      await this.deliveryRepo.update(deliveryId, {
        status: DeliveryStatus.FAILED,
        errorMessage: message.slice(0, 1_000),
      });

      throw error; // re-throw → BullMQ retries
    }
  }

  /** Mark a delivery as permanently exhausted (called by processor on final fail) */
  async markExhausted(deliveryId: string, errorMessage: string): Promise<void> {
    await this.deliveryRepo.update(deliveryId, {
      status: DeliveryStatus.EXHAUSTED,
      errorMessage: `Exhausted all retries. Last error: ${errorMessage}`.slice(0, 1_000),
    });
    this.logger.error(`Delivery ${deliveryId} exhausted all retry attempts`);
  }
}
