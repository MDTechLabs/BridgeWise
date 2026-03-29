import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { Webhook } from './entities/webhook.entity';
import { WebhookController } from './webhook.controller';
import { WEBHOOK_QUEUE } from './webhook.constants';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookProcessor } from './webhook.processor';
import { WebhookService } from './webhook.service';
import { WebhookSignatureService } from './webhook-signature.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook, WebhookDelivery]),

    BullModule.registerQueue({
      name: WEBHOOK_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 86_400 },
        removeOnFail: false,
      },
    }),

    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 3,
    }),
  ],

  controllers: [WebhookController],

  providers: [
    WebhookService,
    WebhookDeliveryService,
    WebhookSignatureService,
    WebhookProcessor,
  ],

  exports: [
    WebhookService,       // expose dispatch() to other modules
    WebhookSignatureService,
  ],
})
export class WebhookModule {}
