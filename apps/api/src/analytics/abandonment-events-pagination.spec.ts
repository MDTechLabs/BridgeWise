import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AbandonmentTrackingController } from './abandonment-tracking.controller';
import {
  AbandonmentTrackingService,
  QuoteEventType,
} from './abandonment-tracking.service';
import { QuoteEventsQueryDto } from './dto/quote-events-query.dto';
import { MAX_PAGE_SIZE } from '../common/pagination';

describe('Quote events pagination', () => {
  let service: AbandonmentTrackingService;
  let controller: AbandonmentTrackingController;

  // Mirrors the global pipe configured in main.ts
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const parse = (query: Record<string, string>) =>
    pipe.transform(query, {
      type: 'query',
      metatype: QuoteEventsQueryDto,
    }) as Promise<QuoteEventsQueryDto>;

  const seed = (count: number) => {
    for (let i = 0; i < count; i++) {
      service.logQuoteRequested({
        sessionId: `s${i}`,
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: 'USDC',
        amount: '1',
      });
    }
  };

  beforeEach(() => {
    jest.useFakeTimers();
    service = new AbandonmentTrackingService(new EventEmitter2());
    controller = new AbandonmentTrackingController(service);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('service.getEventsPage', () => {
    it('returns the most recent events first with metadata', () => {
      seed(25);
      const { items, pagination } = service.getEventsPage({}, { page: 1, limit: 10 });
      expect(items).toHaveLength(10);
      expect(items[0].sessionId).toBe('s24');
      expect(pagination).toMatchObject({
        total: 25,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: false,
      });
    });

    it('returns a partial last page', () => {
      seed(25);
      const { items, pagination } = service.getEventsPage({}, { page: 3, limit: 10 });
      expect(items).toHaveLength(5);
      expect(items[4].sessionId).toBe('s0');
      expect(pagination.hasNextPage).toBe(false);
    });

    it('returns an empty page past the end', () => {
      seed(3);
      const { items, pagination } = service.getEventsPage({}, { page: 5, limit: 10 });
      expect(items).toEqual([]);
      expect(pagination.total).toBe(3);
    });

    it('returns an empty result when there are no events', () => {
      const { items, pagination } = service.getEventsPage({}, {});
      expect(items).toEqual([]);
      expect(pagination.totalPages).toBe(0);
    });

    it('applies filters before paginating', () => {
      seed(5);
      const result = service.getEventsPage(
        { eventType: QuoteEventType.QUOTE_EXECUTED },
        { page: 1, limit: 10 },
      );
      expect(result.pagination.total).toBe(0);
    });

    it('keeps getEvents newest-first and limited', () => {
      seed(5);
      const events = service.getEvents({ limit: 2 });
      expect(events.map((e) => e.sessionId)).toEqual(['s4', 's3']);
    });
  });

  describe('GET events (validation + controller)', () => {
    it('applies defaults for an empty query', async () => {
      seed(30);
      const result = await controller.getEvents(await parse({}));
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.count).toBe(20);
    });

    it('honours page and limit query strings', async () => {
      seed(30);
      const result = await controller.getEvents(
        await parse({ page: '2', limit: '25' }),
      );
      expect(result.count).toBe(5);
      expect(result.pagination.hasPreviousPage).toBe(true);
    });

    it.each([
      { page: '0' },
      { limit: '0' },
      { limit: String(MAX_PAGE_SIZE + 1) },
      { limit: 'many' },
      { eventType: 'nope' },
      { unknown: '1' },
    ])('rejects invalid query %p', async (query) => {
      await expect(parse(query)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
