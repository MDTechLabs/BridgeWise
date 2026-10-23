import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ReviewFlagService, RaiseFlagInput } from './review-flag.service';
import { MAX_FLAGS, MAX_NOTE_LENGTH } from './review-flag.constants';

const input = (over: Partial<RaiseFlagInput> = {}): RaiseFlagInput => ({
  subjectType: 'transaction',
  subjectId: 'tx-100',
  reason: 'high_value',
  severity: 'medium',
  createdBy: 'risk-engine',
  ...over,
});

describe('ReviewFlagService', () => {
  let service: ReviewFlagService;

  beforeEach(() => {
    service = new ReviewFlagService();
  });

  describe('raise', () => {
    it('creates an open flag with an initial history entry', () => {
      const { flag, created } = service.raise(input({ note: 'over threshold' }));
      expect(created).toBe(true);
      expect(flag).toMatchObject({ status: 'open', source: 'manual', note: 'over threshold' });
      expect(flag.history).toEqual([
        expect.objectContaining({ from: null, to: 'open', actor: 'risk-engine' }),
      ]);
    });

    it('returns the existing active flag instead of duplicating', () => {
      const first = service.raise(input());
      const second = service.raise(input());
      expect(second.created).toBe(false);
      expect(second.flag.id).toBe(first.flag.id);
      expect(service.size()).toBe(1);
    });

    it('raises the severity of an existing flag but never lowers it', () => {
      service.raise(input({ severity: 'medium' }));
      expect(service.raise(input({ severity: 'critical' })).flag.severity).toBe('critical');
      expect(service.raise(input({ severity: 'low' })).flag.severity).toBe('critical');
    });

    it('allows a new flag once the previous one is cleared', () => {
      const { flag } = service.raise(input());
      service.transition(flag.id, 'cleared', 'analyst-1', 'false positive');
      const again = service.raise(input());
      expect(again.created).toBe(true);
      expect(again.flag.id).not.toBe(flag.id);
    });

    it('treats a different reason or subject as a separate flag', () => {
      service.raise(input());
      expect(service.raise(input({ reason: 'sanctions_screening' })).created).toBe(true);
      expect(service.raise(input({ subjectId: 'tx-200' })).created).toBe(true);
    });

    it.each([
      { subjectType: 'bogus' },
      { reason: 'bogus' },
      { severity: 'bogus' },
      { subjectId: '' },
      { subjectId: 'has space' },
      { subjectId: 'x'.repeat(129) },
      { createdBy: '' },
      { createdBy: 'bad actor!' },
      { note: 'x'.repeat(MAX_NOTE_LENGTH + 1) },
    ])('rejects invalid input %p', (over) => {
      expect(() => service.raise(input(over as any))).toThrow(BadRequestException);
    });

    it('accepts a note at the maximum length', () => {
      expect(() => service.raise(input({ note: 'x'.repeat(MAX_NOTE_LENGTH) }))).not.toThrow();
    });

    it('refuses new flags when the store is full rather than evicting', () => {
      for (let i = 0; i < MAX_FLAGS; i++) {
        service.raise(input({ subjectId: `tx-${i}` }));
      }
      expect(() => service.raise(input({ subjectId: 'overflow' }))).toThrow(ServiceUnavailableException);
      expect(service.size()).toBe(MAX_FLAGS);
    }, 30_000);
  });

  describe('transition', () => {
    it('walks the review workflow and records history', () => {
      const { flag } = service.raise(input());
      service.transition(flag.id, 'under_review', 'analyst-1');
      service.transition(flag.id, 'escalated', 'analyst-1', 'needs MLRO sign-off');
      const done = service.transition(flag.id, 'cleared', 'mlro-1', 'cleared after review');

      expect(done.status).toBe('cleared');
      expect(done.history.map((h) => h.to)).toEqual(['open', 'under_review', 'escalated', 'cleared']);
      expect(done.history[3]).toMatchObject({ from: 'escalated', actor: 'mlro-1' });
    });

    it('requires a note for escalated and cleared but not under_review', () => {
      const { flag } = service.raise(input());
      expect(() => service.transition(flag.id, 'cleared', 'a1')).toThrow(BadRequestException);
      expect(() => service.transition(flag.id, 'escalated', 'a1', '   ')).toThrow(BadRequestException);
      expect(() => service.transition(flag.id, 'under_review', 'a1')).not.toThrow();
    });

    it('treats cleared as terminal', () => {
      const { flag } = service.raise(input());
      service.transition(flag.id, 'cleared', 'a1', 'ok');
      expect(() => service.transition(flag.id, 'open', 'a1')).toThrow(ConflictException);
      expect(() => service.transition(flag.id, 'under_review', 'a1')).toThrow(ConflictException);
    });

    it('rejects disallowed and no-op transitions', () => {
      const { flag } = service.raise(input());
      expect(() => service.transition(flag.id, 'open', 'a1')).toThrow(ConflictException);
    });

    it('rejects unknown ids, statuses and invalid actors', () => {
      const { flag } = service.raise(input());
      expect(() => service.transition('missing', 'cleared', 'a1', 'n')).toThrow(NotFoundException);
      expect(() => service.transition(flag.id, 'bogus' as any, 'a1')).toThrow(BadRequestException);
      expect(() => service.transition(flag.id, 'under_review', '')).toThrow(BadRequestException);
    });

    it('leaves the flag untouched when a transition is rejected', () => {
      const { flag } = service.raise(input());
      expect(() => service.transition(flag.id, 'cleared', 'a1')).toThrow();
      const stored = service.get(flag.id);
      expect(stored.status).toBe('open');
      expect(stored.history).toHaveLength(1);
    });
  });

  describe('list', () => {
    beforeEach(() => {
      service.raise(input({ subjectId: 'tx-1', severity: 'low' }));
      service.raise(input({ subjectId: 'tx-2', severity: 'high', reason: 'sanctions_screening' }));
      service.raise(input({ subjectType: 'account', subjectId: 'acct-1', severity: 'critical' }));
    });

    it('returns newest first with pagination metadata', () => {
      const { items, pagination } = service.list({}, { page: 1, limit: 2 });
      expect(items.map((f) => f.subjectId)).toEqual(['acct-1', 'tx-2']);
      expect(pagination).toMatchObject({ total: 3, totalPages: 2, hasNextPage: true });
    });

    it('filters by each field', () => {
      expect(service.list({ subjectType: 'account' }).pagination.total).toBe(1);
      expect(service.list({ reason: 'sanctions_screening' }).pagination.total).toBe(1);
      expect(service.list({ severity: 'low' }).pagination.total).toBe(1);
      expect(service.list({ subjectId: 'tx-1' }).pagination.total).toBe(1);
      expect(service.list({ status: 'cleared' }).pagination.total).toBe(0);
    });

    it('returns copies that cannot mutate stored flags', () => {
      const { items } = service.list();
      items[0].status = 'cleared';
      items[0].history.length = 0;
      expect(service.get(items[0].id).status).toBe('open');
      expect(service.get(items[0].id).history).toHaveLength(1);
    });
  });

  describe('requiresReview / getActiveFlags', () => {
    it('is false for unflagged subjects', () => {
      expect(service.requiresReview('transaction', 'unknown')).toBe(false);
    });

    it('is false for low/medium severity (below the blocking threshold)', () => {
      service.raise(input({ severity: 'medium' }));
      expect(service.requiresReview('transaction', 'tx-100')).toBe(false);
    });

    it('is true at the blocking severity and above while active', () => {
      const { flag } = service.raise(input({ severity: 'high' }));
      expect(service.requiresReview('transaction', 'tx-100')).toBe(true);
      service.transition(flag.id, 'under_review', 'a1');
      expect(service.requiresReview('transaction', 'tx-100')).toBe(true);
      service.transition(flag.id, 'escalated', 'a1', 'n');
      expect(service.requiresReview('transaction', 'tx-100')).toBe(true);
    });

    it('is false once cleared', () => {
      const { flag } = service.raise(input({ severity: 'critical' }));
      service.transition(flag.id, 'cleared', 'a1', 'ok');
      expect(service.requiresReview('transaction', 'tx-100')).toBe(false);
      expect(service.getActiveFlags('transaction', 'tx-100')).toEqual([]);
    });

    it('does not leak across subject types', () => {
      service.raise(input({ severity: 'critical' }));
      expect(service.requiresReview('account', 'tx-100')).toBe(false);
    });

    it('rejects a malformed subject id', () => {
      expect(() => service.requiresReview('transaction', 'bad id')).toThrow(BadRequestException);
    });
  });
});
