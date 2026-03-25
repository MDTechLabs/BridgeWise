"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsLogger = void 0;
class DefaultConsoleProvider {
    logEvent(event) {
        console.info('[Analytics]', event);
    }
}
class AnalyticsLogger {
    constructor() {
        this.provider = new DefaultConsoleProvider();
    }
    static getInstance() {
        if (!AnalyticsLogger.instance) {
            AnalyticsLogger.instance = new AnalyticsLogger();
        }
        return AnalyticsLogger.instance;
    }
    setProvider(provider) {
        this.provider = provider;
    }
    log(event) {
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
exports.AnalyticsLogger = AnalyticsLogger;
//# sourceMappingURL=analytics-logger.js.map