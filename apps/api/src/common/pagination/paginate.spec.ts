import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  buildPaginationMeta,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  normalizePagination,
  paginate,
  PaginationQueryDto,
} from './index';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('pagination', () => {
  describe('normalizePagination', () => {
    it('applies defaults when input is missing', () => {
      expect(normalizePagination()).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE });
    });

    it('accepts numeric strings', () => {
      expect(normalizePagination({ page: '3', limit: '10' })).toEqual({
        page: 3,
        limit: 10,
      });
    });

    it('caps limit at MAX_PAGE_SIZE', () => {
      expect(normalizePagination({ limit: 100000 }).limit).toBe(MAX_PAGE_SIZE);
    });

    it.each([0, -5, 1.5, NaN, 'abc', null])(
      'falls back to defaults for invalid value %p',
      (bad) => {
        expect(normalizePagination({ page: bad, limit: bad })).toEqual({
          page: 1,
          limit: DEFAULT_PAGE_SIZE,
        });
      },
    );
  });

  describe('buildPaginationMeta', () => {
    it('computes flags for a middle page', () => {
      expect(buildPaginationMeta(95, { page: 2, limit: 10 })).toEqual({
        total: 95,
        page: 2,
        limit: 10,
        totalPages: 10,
        hasNextPage: true,
        hasPreviousPage: true,
      });
    });

    it('reports no pages for an empty collection', () => {
      const meta = buildPaginationMeta(0, { page: 1, limit: 10 });
      expect(meta.totalPages).toBe(0);
      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPreviousPage).toBe(false);
    });

    it('clamps negative totals to zero', () => {
      expect(buildPaginationMeta(-3, { page: 1, limit: 10 }).total).toBe(0);
    });
  });

  describe('paginate', () => {
    it('returns the first page', () => {
      const result = paginate(range(25), { page: 1, limit: 10 });
      expect(result.items).toEqual(range(10));
      expect(result.pagination.hasNextPage).toBe(true);
      expect(result.pagination.hasPreviousPage).toBe(false);
    });

    it('returns a partial last page', () => {
      const result = paginate(range(25), { page: 3, limit: 10 });
      expect(result.items).toEqual([21, 22, 23, 24, 25]);
      expect(result.pagination.hasNextPage).toBe(false);
      expect(result.pagination.totalPages).toBe(3);
    });

    it('returns an empty page beyond the last without throwing', () => {
      const result = paginate(range(5), { page: 9, limit: 10 });
      expect(result.items).toEqual([]);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.hasPreviousPage).toBe(true);
    });

    it('handles an empty collection', () => {
      const result = paginate([], {});
      expect(result.items).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it('never returns more than MAX_PAGE_SIZE items', () => {
      const result = paginate(range(500), { limit: 500 });
      expect(result.items).toHaveLength(MAX_PAGE_SIZE);
    });

    it('does not mutate the source array', () => {
      const source = range(5);
      paginate(source, { page: 1, limit: 2 });
      expect(source).toEqual(range(5));
    });
  });

  describe('PaginationQueryDto', () => {
    const check = (raw: Record<string, unknown>) =>
      validate(plainToInstance(PaginationQueryDto, raw));

    it('accepts an empty query', async () => {
      expect(await check({})).toHaveLength(0);
    });

    it('accepts boundary values', async () => {
      expect(await check({ page: '1', limit: String(MAX_PAGE_SIZE) })).toHaveLength(0);
    });

    it.each([
      { page: '0' },
      { page: '-1' },
      { page: '1.5' },
      { limit: '0' },
      { limit: String(MAX_PAGE_SIZE + 1) },
      { limit: 'abc' },
    ])('rejects %p', async (raw) => {
      expect((await check(raw)).length).toBeGreaterThan(0);
    });
  });
});
