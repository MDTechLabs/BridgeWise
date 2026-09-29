import { NotAcceptableException } from '@nestjs/common';
import { QuoteOption } from './dto/get-quote.dto';

export const QUOTE_RESPONSE_VERSION_HEADER = 'X-Quote-Response-Version';
export type QuoteResponseVersion = '0' | '1';

export interface QuoteResponseV1 {
  schemaVersion: '1.0.0';
  quotes: QuoteOption[];
}

/** Resolve the requested representation. Version 0 is the legacy bare array. */
export function resolveQuoteResponseVersion(
  requestedVersion?: string,
): QuoteResponseVersion {
  if (requestedVersion === undefined || requestedVersion.trim() === '') return '0';
  const normalized = requestedVersion.trim();
  if (normalized === '0' || normalized === '1') return normalized;
  throw new NotAcceptableException(
    `Unsupported quote response version '${normalized}'. Supported versions: 0, 1.`,
  );
}

export function formatQuoteResponse(
  version: QuoteResponseVersion,
  quotes: QuoteOption[],
): QuoteOption[] | QuoteResponseV1 {
  return version === '1' ? { schemaVersion: '1.0.0', quotes } : quotes;
}
