/**
 * Analytics Event Types and Interfaces for BridgeWise Telemetry
 *
 * These interfaces define the structure of analytics events captured by the SDK.
 * All events should be anonymized and GDPR-compliant.
 */

export type AnalyticsEventType =
  | 'transaction_initiated'
  | 'transaction_confirmed'
  | 'transaction_failed'
  | 'bridge_selected'
  | 'route_recommended'
  | 'fee_alert'
  | 'slippage_alert'
  | 'network_changed'
  | 'wallet_changed'
  | 'analytics_updated'
  | 'metrics_collected'
  | 'error'
  | 'custom';

export interface AnalyticsEventBase {
  eventType: AnalyticsEventType;
  timestamp: number; // Unix ms
  sessionId?: string; // Anonymized session/user id
  context?: Record<string, unknown>; // Extra context
}

export interface TransactionEvent extends AnalyticsEventBase {
  eventType:
    | 'transaction_initiated'
    | 'transaction_confirmed'
    | 'transaction_failed';
  transactionId: string;
  bridge: string;
  sourceChain: string;
  targetChain: string;
  token: string;
  amount: string;
  status?: string;
  error?: string;
}

export interface BridgeSelectionEvent extends AnalyticsEventBase {
  eventType: 'bridge_selected' | 'route_recommended';
  bridge: string;
  reason?: string;
  routeId?: string;
  fee?: string;
  slippage?: string;
}

export interface FeeSlippageAlertEvent extends AnalyticsEventBase {
  eventType: 'fee_alert' | 'slippage_alert';
  bridge: string;
  routeId?: string;
  fee?: string;
  slippage?: string;
  threshold: string;
}

export interface NetworkWalletEvent extends AnalyticsEventBase {
  eventType: 'network_changed' | 'wallet_changed';
  network?: string;
  walletAddress?: string;
}

export interface ErrorEvent extends AnalyticsEventBase {
  eventType: 'error';
  error: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export type AnalyticsEvent =
  | TransactionEvent
  | BridgeSelectionEvent
  | FeeSlippageAlertEvent
  | NetworkWalletEvent
  | ErrorEvent
  | (AnalyticsEventBase & { eventType: 'custom'; [key: string]: unknown });
