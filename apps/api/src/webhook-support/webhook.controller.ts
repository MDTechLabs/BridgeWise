import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WebhookAdminGuard } from './guards/webhook-admin.guard';
import {
  CreateWebhookDto,
  DispatchEventDto,
  ListDeliveriesQueryDto,
  UpdateWebhookDto,
} from './dto/webhook.dto';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { Webhook } from './entities/webhook.entity';
import { WebhookService } from './webhook.service';

/**
 * @tag Webhooks
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────────────────────
 * POST   /webhooks                          Register a new webhook
 * GET    /webhooks                          List all registered webhooks
 * GET    /webhooks/:id                      Get a single webhook
 * PATCH  /webhooks/:id                      Update a webhook
 * DELETE /webhooks/:id                      Remove a webhook
 * POST   /webhooks/:id/ping                 Send a PING test event
 * GET    /webhooks/:id/deliveries           List delivery attempts
 * GET    /webhooks/:id/deliveries/:dId      Get one delivery record
 * POST   /webhooks/:id/deliveries/:dId/retry  Re-queue a failed delivery
 * POST   /webhooks/dispatch                 Dispatch an event (admin / internal)
 */
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Webhook CRUD
  // ──────────────────────────────────────────────────────────────────────────

  @Post()
  create(@Body() dto: CreateWebhookDto): Promise<Webhook> {
    return this.webhookService.create(dto);
  }

  @Get()
  findAll(): Promise<Webhook[]> {
    return this.webhookService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Webhook> {
    return this.webhookService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookDto,
  ): Promise<Webhook> {
    return this.webhookService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.webhookService.remove(id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Ping / test connectivity
  // ──────────────────────────────────────────────────────────────────────────

  @Post(':id/ping')
  @HttpCode(HttpStatus.ACCEPTED)
  ping(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.webhookService.ping(id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Delivery logs
  // ──────────────────────────────────────────────────────────────────────────

  @Get(':id/deliveries')
  listDeliveries(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListDeliveriesQueryDto,
  ): Promise<{ items: WebhookDelivery[]; total: number }> {
    return this.webhookService.listDeliveries(id, query);
  }

  @Get(':id/deliveries/:dId')
  getDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('dId', ParseUUIDPipe) dId: string,
  ): Promise<WebhookDelivery> {
    return this.webhookService.getDelivery(id, dId);
  }

  @Post(':id/deliveries/:dId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  retryDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('dId', ParseUUIDPipe) dId: string,
  ): Promise<void> {
    return this.webhookService.retryDelivery(id, dId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal / Admin dispatch
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Triggers an event broadcast to all active, subscribed webhooks.
   * Protected by WebhookAdminGuard — requires `Authorization: Bearer <WEBHOOK_ADMIN_SECRET>`.
   */
  @UseGuards(WebhookAdminGuard)
  @Post('dispatch')
  @HttpCode(HttpStatus.ACCEPTED)
  dispatch(@Body() dto: DispatchEventDto): Promise<void> {
    return this.webhookService.dispatch(dto);
  }
}
