export const TRACE_ID_HEADER = 'x-trace-id';
export const TRACEPARENT_HEADER = 'traceparent';

/** Accepted inbound trace ids: 8-64 chars of letters, digits and dashes. */
export const TRACE_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** W3C trace-context: version-traceid-parentid-flags. */
export const TRACEPARENT_PATTERN = /^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/;
export const ZERO_TRACE_ID = '0'.repeat(32);

/** Identifiers used for lookup / linking. */
export const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/;
export const CHAIN_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export const MAX_TRACES = 10_000;
export const MAX_LINKS_PER_TRACE = 50;
export const MAX_STEPS_PER_TRACE = 200;
export const TRACE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_ERROR_LENGTH = 500;
export const MAX_STEP_NAME_LENGTH = 64;
