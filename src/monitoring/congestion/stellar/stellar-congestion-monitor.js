"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StellarCongestionMonitor = void 0;
const events_1 = require("events");
const DEFAULT_CONFIG = {
    checkIntervalMs: 30_000,
    timeoutMs: 5_000,
    historyWindowSize: 100,
    spikeMultiplier: 2.0,
    minDataPoints: 5,
    thresholds: {
        latencyMs: 5_000,
        failureRate: 0.3,
        queueDepth: 100,
        throughput: 10,
        pendingTransactions: 500,
    },
};
class StellarCongestionMonitor extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.probes = new Map();
        this.metricsHistory = new Map();
        this.statuses = new Map();
        this.activeAlerts = new Map();
        this.checkInterval = null;
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
            thresholds: {
                ...DEFAULT_CONFIG.thresholds,
                ...config.thresholds,
            },
        };
    }
    registerRoute(routeId, probe) {
        this.probes.set(routeId, probe);
        if (!this.metricsHistory.has(routeId)) {
            this.metricsHistory.set(routeId, []);
        }
        if (!this.statuses.has(routeId)) {
            this.statuses.set(routeId, {
                routeId,
                status: 'normal',
                currentMetrics: this.createEmptyMetrics(routeId),
                alertHistory: [],
                lastUpdated: new Date(),
            });
        }
    }
    unregisterRoute(routeId) {
        this.metricsHistory.delete(routeId);
        this.statuses.delete(routeId);
        this.activeAlerts.delete(routeId);
        return this.probes.delete(routeId);
    }
    reset() {
        this.stopMonitoring();
        this.probes.clear();
        this.metricsHistory.clear();
        this.statuses.clear();
        this.activeAlerts.clear();
    }
    getRouteStatus(routeId) {
        return this.statuses.get(routeId) || null;
    }
    getAllStatuses() {
        return Array.from(this.statuses.values());
    }
    getActiveAlerts(routeId) {
        return this.statuses.get(routeId)?.alertHistory.filter(a => !a.resolvedAt) || [];
    }
    getAllActiveAlerts() {
        const alerts = [];
        for (const status of this.statuses.values()) {
            alerts.push(...status.alertHistory.filter(a => !a.resolvedAt));
        }
        return alerts;
    }
    startMonitoring() {
        if (this.checkInterval) {
            return;
        }
        this.checkInterval = setInterval(() => {
            void this.checkAll();
        }, this.config.checkIntervalMs);
        void this.checkAll();
    }
    stopMonitoring() {
        if (!this.checkInterval) {
            return;
        }
        clearInterval(this.checkInterval);
        this.checkInterval = null;
    }
    async checkAll() {
        const routeIds = Array.from(this.probes.keys());
        await Promise.all(routeIds.map((routeId) => this.checkRoute(routeId)));
    }
    async checkRoute(routeId) {
        const probe = this.probes.get(routeId);
        if (!probe) {
            return null;
        }
        let result;
        try {
            result = await this.withTimeout(probe(), this.config.timeoutMs, `Congestion probe timed out for route ${routeId}`);
        }
        catch (error) {
            result = {
                latencyMs: this.config.timeoutMs,
                failureRate: 1.0,
                queueDepth: 0,
                throughput: 0,
                pendingTransactions: 0,
            };
        }
        const metrics = {
            routeId,
            timestamp: new Date(),
            latencyMs: result.latencyMs,
            failureRate: result.failureRate,
            queueDepth: result.queueDepth,
            throughput: result.throughput,
            pendingTransactions: result.pendingTransactions,
        };
        this.recordMetrics(routeId, metrics);
        const previousStatus = this.statuses.get(routeId)?.status || 'normal';
        const status = this.evaluateCongestionStatus(routeId, metrics);
        this.updateStatus(routeId, metrics, status);
        const currentStatus = this.statuses.get(routeId);
        if (previousStatus !== currentStatus.status) {
            this.emitStatusChange(currentStatus);
        }
        this.detectAndGenerateAlerts(routeId, metrics, currentStatus);
        return currentStatus;
    }
    updateThresholds(thresholds) {
        this.config.thresholds = {
            ...this.config.thresholds,
            ...thresholds,
        };
    }
    getThresholds() {
        return this.config.thresholds;
    }
    createEmptyMetrics(routeId) {
        return {
            routeId,
            timestamp: new Date(),
            latencyMs: 0,
            failureRate: 0,
            queueDepth: 0,
            throughput: 0,
            pendingTransactions: 0,
        };
    }
    recordMetrics(routeId, metrics) {
        const history = this.metricsHistory.get(routeId);
        if (!history) {
            return;
        }
        history.push(metrics);
        while (history.length > this.config.historyWindowSize) {
            history.shift();
        }
    }
    evaluateCongestionStatus(routeId, metrics) {
        const thresholds = this.config.thresholds;
        const breachCount = this.countThresholdBreaches(metrics, thresholds);
        if (breachCount >= 3) {
            return 'severe';
        }
        if (breachCount >= 2) {
            return 'congested';
        }
        if (breachCount >= 1) {
            return 'elevated';
        }
        if (this.detectSpike(routeId)) {
            return 'elevated';
        }
        return 'normal';
    }
    countThresholdBreaches(metrics, thresholds) {
        let count = 0;
        if (metrics.latencyMs > thresholds.latencyMs)
            count++;
        if (metrics.failureRate > thresholds.failureRate)
            count++;
        if (metrics.queueDepth > thresholds.queueDepth)
            count++;
        if (metrics.throughput < thresholds.throughput)
            count++;
        if (metrics.pendingTransactions > thresholds.pendingTransactions)
            count++;
        return count;
    }
    detectSpike(routeId) {
        const history = this.metricsHistory.get(routeId);
        if (!history || history.length < this.config.minDataPoints) {
            return false;
        }
        const current = history[history.length - 1];
        const historical = history.slice(0, -1);
        const avgLatency = historical.reduce((sum, m) => sum + m.latencyMs, 0) / historical.length;
        if (current.latencyMs > avgLatency * this.config.spikeMultiplier) {
            return true;
        }
        const avgFailureRate = historical.reduce((sum, m) => sum + m.failureRate, 0) / historical.length;
        if (avgFailureRate > 0 && current.failureRate > avgFailureRate * this.config.spikeMultiplier) {
            return true;
        }
        const avgQueueDepth = historical.reduce((sum, m) => sum + m.queueDepth, 0) / historical.length;
        if (avgQueueDepth > 0 && current.queueDepth > avgQueueDepth * this.config.spikeMultiplier) {
            return true;
        }
        return false;
    }
    updateStatus(routeId, metrics, status) {
        const existing = this.statuses.get(routeId);
        if (!existing) {
            return;
        }
        const updated = {
            ...existing,
            status,
            currentMetrics: metrics,
            lastUpdated: new Date(),
        };
        this.statuses.set(routeId, updated);
    }
    detectAndGenerateAlerts(routeId, metrics, status) {
        const thresholds = this.config.thresholds;
        const existingAlertKey = this.activeAlerts.get(routeId)?.metric;
        const thresholdChecks = [
            {
                metric: 'latency',
                currentValue: metrics.latencyMs,
                threshold: thresholds.latencyMs,
                exceeds: metrics.latencyMs > thresholds.latencyMs,
                severity: this.getLatencySeverity(metrics.latencyMs, thresholds.latencyMs),
                message: (v, t) => `Latency spike detected: ${v.toFixed(0)}ms exceeds threshold of ${t}ms`,
            },
            {
                metric: 'failureRate',
                currentValue: metrics.failureRate,
                threshold: thresholds.failureRate,
                exceeds: metrics.failureRate > thresholds.failureRate,
                severity: this.getRateSeverity(metrics.failureRate, thresholds.failureRate),
                message: (v, t) => `Failure rate elevated: ${(v * 100).toFixed(1)}% exceeds threshold of ${(t * 100).toFixed(1)}%`,
            },
            {
                metric: 'queueDepth',
                currentValue: metrics.queueDepth,
                threshold: thresholds.queueDepth,
                exceeds: metrics.queueDepth > thresholds.queueDepth,
                severity: this.getValueSeverity(metrics.queueDepth, thresholds.queueDepth),
                message: (v, t) => `Queue depth elevated: ${v.toFixed(0)} exceeds threshold of ${t}`,
            },
            {
                metric: 'throughput',
                currentValue: metrics.throughput,
                threshold: thresholds.throughput,
                exceeds: metrics.throughput < thresholds.throughput,
                severity: this.getThroughputSeverity(metrics.throughput, thresholds.throughput),
                message: (v, t) => `Throughput dropped: ${v.toFixed(0)} below threshold of ${t}`,
            },
            {
                metric: 'pendingTransactions',
                currentValue: metrics.pendingTransactions,
                threshold: thresholds.pendingTransactions,
                exceeds: metrics.pendingTransactions > thresholds.pendingTransactions,
                severity: this.getValueSeverity(metrics.pendingTransactions, thresholds.pendingTransactions),
                message: (v, t) => `Pending transactions elevated: ${v.toFixed(0)} exceeds threshold of ${t}`,
            },
        ];
        for (const check of thresholdChecks) {
            if (!check.exceeds) {
                continue;
            }
            const alertKey = `${routeId}-${check.metric}`;
            const existing = this.activeAlerts.get(alertKey);
            if (!existing) {
                const alert = {
                    routeId,
                    severity: check.severity,
                    metric: check.metric,
                    currentValue: check.currentValue,
                    threshold: check.threshold,
                    message: check.message(check.currentValue, check.threshold),
                    timestamp: new Date(),
                };
                this.activeAlerts.set(alertKey, alert);
                status.alertHistory.push(alert);
                this.emitAlert(alert);
            }
            else {
                existing.currentValue = check.currentValue;
            }
        }
        const resolvedAlerts = [];
        for (const [key, alert] of this.activeAlerts.entries()) {
            if (alert.routeId !== routeId) {
                continue;
            }
            const check = thresholdChecks.find(c => c.metric === alert.metric);
            if (!check || !check.exceeds) {
                alert.resolvedAt = new Date();
                resolvedAlerts.push(key);
            }
        }
        for (const key of resolvedAlerts) {
            this.activeAlerts.delete(key);
        }
    }
    getLatencySeverity(value, threshold) {
        const ratio = value / threshold;
        if (ratio >= 3)
            return 'critical';
        if (ratio >= 2)
            return 'high';
        if (ratio >= 1.5)
            return 'medium';
        return 'low';
    }
    getRateSeverity(value, threshold) {
        const ratio = value / threshold;
        if (ratio >= 2)
            return 'critical';
        if (ratio >= 1.5)
            return 'high';
        if (ratio >= 1.2)
            return 'medium';
        return 'low';
    }
    getValueSeverity(value, threshold) {
        const ratio = value / threshold;
        if (ratio >= 5)
            return 'critical';
        if (ratio >= 3)
            return 'high';
        if (ratio >= 2)
            return 'medium';
        return 'low';
    }
    getThroughputSeverity(value, threshold) {
        const ratio = threshold / value;
        if (ratio >= 5)
            return 'critical';
        if (ratio >= 3)
            return 'high';
        if (ratio >= 2)
            return 'medium';
        return 'low';
    }
    emitAlert(alert) {
        this.emit('alert', alert);
        if (this.config.onAlert) {
            this.config.onAlert(alert);
        }
    }
    emitStatusChange(status) {
        this.emit('status-change', status);
        if (this.config.onStatusChange) {
            this.config.onStatusChange(status);
        }
    }
    withTimeout(promise, timeoutMs, timeoutMessage) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(timeoutMessage));
            }, timeoutMs);
            promise
                .then((value) => {
                clearTimeout(timeout);
                resolve(value);
            })
                .catch((error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
}
exports.StellarCongestionMonitor = StellarCongestionMonitor;
//# sourceMappingURL=stellar-congestion-monitor.js.map