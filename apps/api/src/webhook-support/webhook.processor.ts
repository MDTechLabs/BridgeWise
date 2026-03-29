import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WebhookDeliveryJobData } from './interfaces/webhook-payload.interface';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WEBHOOK_QUEUE } from './webhook.constants';

@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly deliveryService: WebhookDeliveryService) {
    super();
  }

  async process(job: Job<WebhookDeliveryJobData>): Promise<void> {
    this.logger.debug(`Processing job ${job.id} (attempt ${job.attemptsMade + 1})`);
    await this.deliveryService.deliver({ ...job.data, attempt: job.attemptsMade });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<WebhookDeliveryJobData>, error: Error): Promise<void> {
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);

    if (isLastAttempt) {
      this.logger.error(
        `Job ${job.id} permanently failed after ${job.attemptsMade} attempts: ${error.message}`,
      );
      await this.deliveryService.markExhausted(job.data.deliveryId, error.message);
    } else {
      this.logger.warn(
        `Job ${job.id} failed (attempt ${job.attemptsMade}), will retry: ${error.message}`,
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.debug(`Job ${job.id} completed successfully`);
  }
}
