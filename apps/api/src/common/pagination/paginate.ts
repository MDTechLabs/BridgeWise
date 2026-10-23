import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './pagination.constants';
import {
  PaginatedResult,
  PaginationMeta,
  PaginationParams,
} from './pagination.types';

function toPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

/**
 * Coerce untrusted page/limit input into safe values: missing, non-integer or
 * non-positive values fall back to defaults and limit is capped at MAX_PAGE_SIZE.
 */
export function normalizePagination(input?: {
  page?: unknown;
  limit?: unknown;
}): PaginationParams {
  const page = toPositiveInt(input?.page, DEFAULT_PAGE);
  const limit = Math.min(
    toPositiveInt(input?.limit, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  return { page, limit };
}

export function buildPaginationMeta(
  total: number,
  { page, limit }: PaginationParams,
): PaginationMeta {
  const safeTotal = Math.max(0, Math.floor(total));
  const totalPages = Math.ceil(safeTotal / limit);
  return {
    total: safeTotal,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}

/** Slice an in-memory collection into a page and attach pagination metadata. */
export function paginate<T>(
  items: readonly T[],
  input?: { page?: unknown; limit?: unknown },
): PaginatedResult<T> {
  const params = normalizePagination(input);
  const start = (params.page - 1) * params.limit;
  return {
    items: items.slice(start, start + params.limit),
    pagination: buildPaginationMeta(items.length, params),
  };
}
