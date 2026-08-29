/**
 * File: libs/ui-components/stellar/FeeEstimationWidget.tsx
 *
 * Embeddable fee estimation widget for Stellar transfers.
 * Renders fee estimates and supports dynamic updates.
 */

import React, { useState, useEffect, useCallback } from "react";

export interface FeeEstimate {
  baseFee: number;        // in stroops (1 XLM = 10,000,000 stroops)
  surcharge?: number;
  totalFee: number;
  currency: string;       // e.g. "XLM"
  estimatedAt: Date;
  ttlSeconds?: number;    // how long this estimate is valid
}

export interface FeeEstimationWidgetProps {
  /** Called to fetch a fresh fee estimate */
  fetchEstimate: () => Promise<FeeEstimate>;
  /** Auto-refresh interval in ms. Default: 15000 (15s). Set to 0 to disable. */
  refreshIntervalMs?: number;
  /** Optional className for container styling */
  className?: string;
  /** Optional label override */
  label?: string;
  /** Called when a new estimate is received */
  onEstimateUpdate?: (estimate: FeeEstimate) => void;
}

function formatFee(stroops: number, currency: string): string {
  const xlm = stroops / 10_000_000;
  return `${xlm.toFixed(7)} ${currency}`;
}

function getExpirySeconds(estimate: FeeEstimate): number | null {
  if (!estimate.ttlSeconds) return null;
  const elapsed = (Date.now() - estimate.estimatedAt.getTime()) / 1000;
  return Math.max(0, Math.floor(estimate.ttlSeconds - elapsed));
}

export const FeeEstimationWidget: React.FC<FeeEstimationWidgetProps> = ({
  fetchEstimate,
  refreshIntervalMs = 15000,
  className = "",
  label = "Estimated Transfer Fee",
  onEstimateUpdate,
}) => {
  const [estimate, setEstimate] = useState<FeeEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const loadEstimate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchEstimate();
      setEstimate(result);
      onEstimateUpdate?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch fee estimate.");
    } finally {
      setLoading(false);
    }
  }, [fetchEstimate, onEstimateUpdate]);

  // Initial load
  useEffect(() => {
    loadEstimate();
  }, [loadEstimate]);

  // Auto-refresh
  useEffect(() => {
    if (!refreshIntervalMs) return;
    const interval = setInterval(loadEstimate, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [refreshIntervalMs, loadEstimate]);

  // TTL countdown
  useEffect(() => {
    if (!estimate?.ttlSeconds) return;
    const tick = setInterval(() => {
      setSecondsLeft(getExpirySeconds(estimate));
    }, 1000);
    return () => clearInterval(tick);
  }, [estimate]);

  return (
    <div
      className={`fee-estimation-widget ${className}`}
      style={styles.container}
      role="region"
      aria-label="Fee Estimation Widget"
      aria-live="polite"
    >
      <div style={styles.header}>
        <span style={styles.label}>{label}</span>
        <button
          onClick={loadEstimate}
          disabled={loading}
          style={styles.refreshBtn}
          aria-label="Refresh fee estimate"
          title="Refresh estimate"
        >
          {loading ? "⏳" : "🔄"}
        </button>
      </div>

      {error && (
        <div style={styles.error} role="alert">
          ⚠️ {error}
        </div>
      )}

      {!error && !estimate && loading && (
        <div style={styles.skeleton} aria-busy="true">
          Fetching estimate…
        </div>
      )}

      {estimate && (
        <div style={styles.body}>
          <div style={styles.row}>
            <span style={styles.rowLabel}>Base Fee</span>
            <span style={styles.rowValue}>
              {formatFee(estimate.baseFee, estimate.currency)}
            </span>
          </div>

          {estimate.surcharge !== undefined && (
            <div style={styles.row}>
              <span style={styles.rowLabel}>Surcharge</span>
              <span style={styles.rowValue}>
                {formatFee(estimate.surcharge, estimate.currency)}
              </span>
            </div>
          )}

          <div style={{ ...styles.row, ...styles.totalRow }}>
            <span style={styles.totalLabel}>Total Fee</span>
            <span style={styles.totalValue}>
              {formatFee(estimate.totalFee, estimate.currency)}
            </span>
          </div>

          <div style={styles.meta}>
            <span>
              Updated: {estimate.estimatedAt.toLocaleTimeString()}
            </span>
            {secondsLeft !== null && (
              <span style={secondsLeft < 5 ? styles.expiringSoon : {}}>
                {" "}· Valid for {secondsLeft}s
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    padding: "16px",
    maxWidth: "360px",
    fontFamily: "sans-serif",
    background: "#fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  label: {
    fontWeight: 600,
    fontSize: "14px",
    color: "#1a202c",
  },
  refreshBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "16px",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  error: {
    color: "#c53030",
    fontSize: "13px",
    padding: "8px",
    background: "#fff5f5",
    borderRadius: "4px",
  },
  skeleton: {
    color: "#a0aec0",
    fontSize: "13px",
    fontStyle: "italic",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "13px",
    color: "#4a5568",
  },
  rowLabel: {},
  rowValue: { fontVariantNumeric: "tabular-nums" },
  totalRow: {
    borderTop: "1px solid #e2e8f0",
    paddingTop: "8px",
    marginTop: "4px",
  },
  totalLabel: { fontWeight: 700, color: "#1a202c", fontSize: "14px" },
  totalValue: {
    fontWeight: 700,
    color: "#2b6cb0",
    fontSize: "14px",
    fontVariantNumeric: "tabular-nums",
  },
  meta: {
    fontSize: "11px",
    color: "#a0aec0",
    marginTop: "4px",
  },
  expiringSoon: {
    color: "#dd6b20",
    fontWeight: 600,
  },
};

export default FeeEstimationWidget;