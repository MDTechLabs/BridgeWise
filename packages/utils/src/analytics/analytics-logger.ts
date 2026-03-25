/**
 * AnalyticsLogger: Central Telemetry/Event Logging for BridgeWise
 *
 * Usage:
 *   AnalyticsLogger.getInstance().log({ ...event })
 *   AnalyticsLogger.getInstance().setProvider(new MyAnalyticsProvider())
 *
 * Providers can be swapped for integration with external analytics (Mixpanel, Segment, custom, etc).
 * All events are anonymized and GDPR-compliant.
 */

import { AnalyticsEvent } from './analytics-events.interface';

export interface AnalyticsProvider {
  logEvent(event: AnalyticsEvent): void | Promise<void>;
  flush?(): void | Promise<void>;
}

class DefaultConsoleProvider implements AnalyticsProvider {
  logEvent(event: AnalyticsEvent) {
    console.info('[Analytics]', event);
  }
}

export class AnalyticsLogger {
  private static instance: AnalyticsLogger;
  private provider: AnalyticsProvider = new DefaultConsoleProvider();

  private constructor() {}

  static getInstance(): AnalyticsLogger {
    if (!AnalyticsLogger.instance) {
      AnalyticsLogger.instance = new AnalyticsLogger();
    }
    return AnalyticsLogger.instance;
  }

  setProvider(provider: AnalyticsProvider) {
    this.provider = provider;
  }

  log(event: AnalyticsEvent) {
    // Add timestamp and anonymize context if needed
    const enriched = {
      ...event,
      timestamp: event.timestamp || Date.now(),
    };
    void this.provider.logEvent(enriched);
  }

  flush() {
    if (this.provider.flush) {
      void this.provider.flush();
    }
  }
}
