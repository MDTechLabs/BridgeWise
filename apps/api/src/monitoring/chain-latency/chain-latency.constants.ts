/** Samples older than this are dropped. */
export const RETENTION_MS = 24 * 60 * 60 * 1000;

/** Per-chain ring buffer size; oldest samples are evicted first. */
export const MAX_SAMPLES_PER_CHAIN = 5000;

/** Cap on distinct chains so unknown identifiers cannot grow memory without bound. */
export const MAX_TRACKED_CHAINS = 64;

export const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
export const MIN_WINDOW_MS = 60 * 1000;
export const MAX_WINDOW_MS = RETENTION_MS;

export const DEFAULT_SERIES_BUCKETS = 12;
export const MAX_SERIES_BUCKETS = 60;

/** Chain identifiers: lower-case alphanumerics, dash and underscore. */
export const CHAIN_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** Histogram upper bounds in ms (an overflow bucket is appended). */
export const HISTOGRAM_BOUNDS_MS = [100, 250, 500, 1000, 2500, 5000, 10000];

export const STATUS_THRESHOLDS = {
  healthy: { p95Ms: 2000, errorRate: 0.05 },
  degraded: { p95Ms: 5000, errorRate: 0.2 },
};
