import { NotAcceptableException } from '@nestjs/common';
import { QuoteOption } from './dto/get-quote.dto';
import { formatQuoteResponse, resolveQuoteResponseVersion } from './quote-response-version';

const quotes = [{ id: 'q1' }] as QuoteOption[];

describe('quote response versioning', () => {
  it('defaults to the legacy representation for omitted or blank headers', () => {
    expect(resolveQuoteResponseVersion()).toBe('0');
    expect(resolveQuoteResponseVersion('  ')).toBe('0');
    expect(formatQuoteResponse('0', quotes)).toBe(quotes);
  });

  it('returns the explicitly selected v1 envelope, including for an empty quote list', () => {
    expect(resolveQuoteResponseVersion(' 1 ')).toBe('1');
    expect(formatQuoteResponse('1', quotes)).toEqual({ schemaVersion: '1.0.0', quotes });
    expect(formatQuoteResponse('1', [])).toEqual({ schemaVersion: '1.0.0', quotes: [] });
  });

  it('rejects unknown and malformed versions instead of silently downgrading', () => {
    for (const value of ['2', 'v1', '1, 2']) {
      expect(() => resolveQuoteResponseVersion(value)).toThrow(NotAcceptableException);
    }
  });
});
