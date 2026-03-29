import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
  CreateWebhookDto,
  DispatchEventDto,
  ListDeliveriesQueryDto,
  UpdateWebhookDto,
} from './dto/webhook.dto';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { Webhook } from './entities/webhook.entity';
import { DeliveryStatus } from './enums/delivery-status.enum';
import { WebhookEvent } from './enums/webhook-event.enum';
import {
  WebhookDeliveryJobData,
  WebhookPayload,
} from './interfaces/webhook-payload.interface';
import { WEBHOOK_QUEUE } from './webhook.constants';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepo: Repository<Webhook>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    @InjectQueue(WEBHOOK_QUEUE)
    private readonly webhookQueue: Queue<WebhookDeliveryJobData>,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // CRUD
  // ──────────────────────────────────────────────────────────────────────────

  async create(dto: CreateWebhookDto): Promise<Webhook> {
    const webhook = this.webhookRepo.create({
      ...dto,
      events: dto.events ?? [],
      isActive: dto.isActive ?? true,
      maxRetries: dto.maxRetries ?? 5,
    });
    return this.webhookRepo.save(webhook);
  }

  async findAll(): Promise<Webhook[]> {
    return this.webhookRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Webhook> {
    const webhook = await this.webhookRepo.findOne({ where: { id } });
    if (!webhook) throw new NotFoundException(`Webhook ${id} not found`);
    return webhook;
  }

  async update(id: string, dto: UpdateWebhookDto): Promise<Webhook> {
    const webhook = await this.findOne(id);
    Object.assign(webhook, dto);
    return this.webhookRepo.save(webhook);
  }

  async remove(id: string): Promise<void> {
    const webhook = await this.findOne(id);
    await this.webhookRepo.remove(webhook);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Deliveries
  // ──────────────────────────────────────────────────────────────────────────

  async listDeliveries(
    webhookId: string,
    query: ListDeliveriesQueryDto,
  ): Promise<{ items: WebhookDelivery[]; total: number }> {
    await this.findOne(webhookId); // 404 guard

    const [items, total] = await this.deliveryRepo.findAndCount({
      where: { webhookId },
      order: { createdAt: 'DESC' },
      skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
      take: query.limit ?? 20,
    });

    return { items, total };
  }

  async getDelivery(webhookId: string, deliveryId: string): Promise<WebhookDelivery> {
    await this.findOne(webhookId);
    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId, webhookId },
    });
    if (!delivery) throw new NotFoundException(`Delivery ${deliveryId} not found`);
    return delivery;
  }

  /** Manually re-queue a failed delivery */
  async retryDelivery(webhookId: string, deliveryId: string): Promise<void> {
    const webhook = await this.findOne(webhookId);
    const delivery = await this.getDelivery(webhookId, deliveryId);

    await this.deliveryRepo.update(delivery.id, {
      status: DeliveryStatus.RETRYING,
      attempt: 0,
    });

    await this.enqueueDelivery(webhook, delivery, delivery.payload as WebhookPayload, 0);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Event dispatch
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Dispatches an event to all active, subscribed webhooks.
   * Call this from any service that emits domain events.
   */
  async dispatch(dto: DispatchEventDto): Promise<void> {
    const subscribers = await this.findSubscribers(dto.event);

    if (!subscribers.length) {
      this.logger.debug(`No subscribers for event "${dto.event}"`);
      return;
    }

    const payload: WebhookPayload = {
      id: randomUUID(),
      event: dto.event,
      createdAt: new Date().toISOString(),
      data: dto.data ?? {},
    };

    await Promise.all(
      subscribers.map((webhook) => this.scheduleDelivery(webhook, payload)),
    );
  }

  /**
   * Sends a PING event to a single webhook (used to test connectivity).
   */
  async ping(id: string): Promise<void> {
    const webhook = await this.findOne(id);
    await this.scheduleDelivery(webhook, {
      id: randomUUID(),
      event: WebhookEvent.PING,
      createdAt: new Date().toISOString(),
      data: { message: 'Webhook ping test' },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────────────────

  private async findSubscribers(event: WebhookEvent): Promise<Webhook[]> {
    const all = await this.webhookRepo.find({ where: { isActive: true } });
    return all.filter(
      (w) => !w.events.length || w.events.includes(event),
    );
  }

  private async scheduleDelivery(
    webhook: Webhook,
    payload: WebhookPayload,
  ): Promise<void> {
    const delivery = this.deliveryRepo.create({
      webhookId: webhook.id,
      event: payload.event,
      payload: payload as unknown as Record<string, unknown>,
      status: DeliveryStatus.PENDING,
      attempt: 0,
    });

    const saved = await this.deliveryRepo.save(delivery);
    await this.enqueueDelivery(webhook, saved, payload, 0);
  }

  private async enqueueDelivery(
    webhook: Webhook,
    delivery: WebhookDelivery,
    payload: WebhookPayload,
    attempt: number,
  ): Promise<void> {
    const jobData: WebhookDeliveryJobData = {
      webhookId: webhook.id,
      deliveryId: delivery.id,
      url: webhook.url,
      secret: webhook.secret,
      payload,
      attempt,
    };

    await this.webhookQueue.add('deliver', jobData, {
      attempts: webhook.maxRetries,
      backoff: {
        type: 'exponential',
        delay: 5_000, // 5 s → 10 s → 20 s …
      },
      removeOnComplete: { age: 86_400 }, // keep 24 h
      removeOnFail: false,
    });

    this.logger.log(
      `Queued delivery ${delivery.id} for webhook ${webhook.id} (event: ${payload.event})`,
    );
  }
}
