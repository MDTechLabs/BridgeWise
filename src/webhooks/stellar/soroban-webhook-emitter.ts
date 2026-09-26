import { createHmac, randomBytes, randomUUID } from 'crypto';
import { SorobanTransferState } from '../../state-machine/stellar/soroban-transfer-state-machine';
import { NormalizedBridgeEvent } from '../../events/aggregation/stellar';
import {
  RegisterWebhookInput,
  WebhookRegistration,
  WebhookPayload,
  WebhookDeliveryResult,
  StellarWebhookEventType,
  LIFECYCLE_EVENT_MAP,
  TransferLifecycleEventData,
} from './stellar-webhook.types';

export interface WebhookRetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
}

/**
 * Emits signed webhook payloads to registered endpoints for Soroban bridge
 * lifecycle events and generic bridge events from the event aggregator.
 *
 * Each delivered request is signed with HMAC-SHA256 so receivers can verify
 * the payload originated from BridgeWise:
 *
 *   X-BridgeWise-Signature: sha256=<hex-digest>
 *
 * Includes automatic exponential backoff retries and duplicate delivery protection.
 */
export class SorobanWebhookEmitter {
  private readonly registrations = new Map<string, WebhookRegistration>();
  private readonly deliveredPayloads = new Set<string>();
  private readonly maxTrackedDeliveries = 1000;
  private payloadCounter = 0;
  private readonly retryConfig: Required<WebhookRetryConfig>;

  constructor(
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
    retryConfig: WebhookRetryConfig = {},
  ) {
    this.retryConfig = {
      maxRetries: retryConfig.maxRetries ?? 0,
      initialDelayMs: retryConfig.initialDelayMs ?? 1000,
      backoffFactor: retryConfig.backoffFactor ?? 2,
    };
  }

  // ---------------------------------------------------------------------------
  // Registration management
  // ---------------------------------------------------------------------------

  register(input: RegisterWebhookInput): WebhookRegistration {
    const registration: WebhookRegistration = {
      id: randomUUID(),
      url: input.url,
      events: input.events,
      secret: input.secret ?? randomBytes(32).toString('hex'),
      createdAt: Date.now(),
    };

    this.registrations.set(registration.id, registration);
    return registration;
  }

  unregister(id: string): boolean {
    return this.registrations.delete(id);
  }

  list(): WebhookRegistration[] {
    return Array.from(this.registrations.values());
  }

  // ---------------------------------------------------------------------------
  // Event emission
  // ---------------------------------------------------------------------------

  async emitLifecycleEvent(
    transferId: string,
    fromState: SorobanTransferState | undefined,
    toState: SorobanTransferState,
    metadata?: Record<string, unknown>,
  ): Promise<WebhookDeliveryResult[]> {
    const eventType = LIFECYCLE_EVENT_MAP[toState];
    const data: TransferLifecycleEventData = {
      transferId,
      fromState,
      toState,
      timestamp: Date.now(),
      metadata,
    };

    return this.emit(eventType, data as unknown as Record<string, unknown>);
  }

  async emitBridgeEvent(event: NormalizedBridgeEvent): Promise<WebhookDeliveryResult[]> {
    return this.emit('bridge.event', event as unknown as Record<string, unknown>);
  }

  async emit(
    eventType: StellarWebhookEventType,
    data: Record<string, unknown>,
  ): Promise<WebhookDeliveryResult[]> {
    this.payloadCounter++;
    const payload: WebhookPayload = {
      id: `whpay_${Date.now()}_${this.payloadCounter}`,
      event: eventType,
      timestamp: Date.now(),
      data,
    };

    const subscribers = Array.from(this.registrations.values()).filter((r) =>
      r.events.includes(eventType),
    );

    return Promise.all(subscribers.map((reg) => this.deliverWithRetry(reg, payload)));
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async deliverWithRetry(
    registration: WebhookRegistration,
    payload: WebhookPayload,
  ): Promise<WebhookDeliveryResult> {
    const deliveryKey = `${payload.id}:${registration.id}`;

    // Duplicate delivery protection
    if (this.deliveredPayloads.has(deliveryKey)) {
      return {
        webhookId: registration.id,
        success: true,
        statusCode: 200,
        deliveredAt: Date.now(),
        error: 'Duplicate delivery skipped',
      };
    }

    let attempt = 0;
    let delay = this.retryConfig.initialDelayMs;
    let lastResult: WebhookDeliveryResult | null = null;

    while (attempt <= this.retryConfig.maxRetries) {
      lastResult = await this.deliver(registration, payload);
      if (lastResult.success) {
        this.trackDelivery(deliveryKey);
        return lastResult;
      }

      attempt++;
      if (attempt <= this.retryConfig.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= this.retryConfig.backoffFactor;
      }
    }

    return lastResult!;
  }

  private async deliver(
    registration: WebhookRegistration,
    payload: WebhookPayload,
  ): Promise<WebhookDeliveryResult> {
    const body = JSON.stringify(payload);
    const signature = this.sign(body, registration.secret);

    try {
      const response = await this.fetcher(registration.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BridgeWise-Signature': signature,
          'X-BridgeWise-Event': payload.event,
        },
        body,
      });

      return {
        webhookId: registration.id,
        success: response.ok,
        statusCode: response.status,
        deliveredAt: Date.now(),
      };
    } catch (error) {
      return {
        webhookId: registration.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        deliveredAt: Date.now(),
      };
    }
  }

  private trackDelivery(key: string): void {
    if (this.deliveredPayloads.has(key)) return;
    this.deliveredPayloads.add(key);
    if (this.deliveredPayloads.size > this.maxTrackedDeliveries) {
      const firstKey = this.deliveredPayloads.values().next().value;
      if (firstKey !== undefined) {
        this.deliveredPayloads.delete(firstKey);
      }
    }
  }

  private sign(body: string, secret: string): string {
    const hmac = createHmac('sha256', secret);
    hmac.update(body);
    return `sha256=${hmac.digest('hex')}`;
  }
}
