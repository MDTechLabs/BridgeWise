/**
 * Usage Example — Dispatching webhook events from other BridgeWise services
 *
 * Drop this pattern into any service that wants to emit webhook events.
 * No circular dependency: WebhookModule exports WebhookService so any
 * feature module can import it freely.
 */

import { Injectable } from '@nestjs/common';
import { WebhookEvent, WebhookService } from '../index'; // adjust path

// ── Example: Gas alert service emitting webhook events ────────────────────────

@Injectable()
export class GasAlertService {
  constructor(
    // ... your other deps
    private readonly webhooks: WebhookService,
  ) {}

  async handleSpikeDetected(chainId: string, gweiValue: number): Promise<void> {
    // ... your existing logic

    // Fire & forget — webhook delivery is async via BullMQ
    await this.webhooks.dispatch({
      event: WebhookEvent.GAS_SPIKE_DETECTED,
      data: {
        chainId,
        gweiValue,
        detectedAt: new Date().toISOString(),
      },
    });
  }

  async handleGasNormalized(chainId: string, gweiValue: number): Promise<void> {
    // ... your existing logic

    await this.webhooks.dispatch({
      event: WebhookEvent.GAS_NORMALIZED,
      data: { chainId, gweiValue },
    });
  }
}

// ── AppModule wiring ──────────────────────────────────────────────────────────
//
// In your AppModule (or the feature module):
//
// @Module({
//   imports: [
//     WebhookModule,         // <-- add this
//     GasAlertModule,
//     BullModule.forRootAsync({
//       useFactory: (config: ConfigService) => ({
//         connection: {
//           host: config.get('REDIS_HOST', 'localhost'),
//           port: config.get<number>('REDIS_PORT', 6379),
//         },
//       }),
//       inject: [ConfigService],
//     }),
//   ],
// })
// export class AppModule {}

// ── Required environment variables ───────────────────────────────────────────
//
// REDIS_HOST=localhost
// REDIS_PORT=6379
// WEBHOOK_ADMIN_SECRET=<min 32 random chars>   # guards POST /webhooks/dispatch
