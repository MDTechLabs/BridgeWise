import { randomUUID } from 'node:crypto';
import {
  TRACE_ID_PATTERN,
  TRACEPARENT_PATTERN,
  ZERO_TRACE_ID,
} from './trace-correlation.constants';

type HeaderValue = string | string[] | undefined;

const first = (value: HeaderValue): string | undefined =>
  (Array.isArray(value) ? value[0] : value)?.trim();

/**
 * Resolve the trace id for an inbound request. Prefers a well-formed
 * `X-Trace-Id`, then a W3C `traceparent`, and otherwise generates a fresh id.
 * Malformed values are ignored (never echoed) so clients cannot inject
 * arbitrary strings into logs or response headers.
 */
export function resolveTraceId(headers: {
  'x-trace-id'?: HeaderValue;
  traceparent?: HeaderValue;
}): string {
  const explicit = first(headers['x-trace-id']);
  if (explicit && TRACE_ID_PATTERN.test(explicit)) return explicit.toLowerCase();

  const parent = first(headers.traceparent)?.toLowerCase();
  const match = parent ? TRACEPARENT_PATTERN.exec(parent) : null;
  if (match && match[1] !== ZERO_TRACE_ID) return match[1];

  return randomUUID();
}
