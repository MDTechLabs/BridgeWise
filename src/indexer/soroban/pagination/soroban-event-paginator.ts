export interface SorobanEventPage<T> { events: T[]; cursor?: string; hasMore?: boolean; }
export interface EventPageRequest { cursor?: string; limit: number; }
export interface EventPaginationState { cursor?: string; pages: number; completed: boolean; }
export interface SorobanEventPaginatorOptions { pageSize?: number; state?: EventPaginationState; maxPages?: number; }

/** Cursor paginator that preserves RPC order and can resume after interruption. */
export class SorobanEventPaginator<T> {
  readonly pageSize: number;
  private state: EventPaginationState;
  private readonly maxPages: number;

  constructor(options: SorobanEventPaginatorOptions = {}) {
    this.pageSize = options.pageSize ?? 100;
    if (!Number.isInteger(this.pageSize) || this.pageSize < 1) throw new Error('pageSize must be positive.');
    this.maxPages = options.maxPages ?? Number.MAX_SAFE_INTEGER;
    this.state = { pages: 0, completed: false, ...options.state };
  }

  getState(): EventPaginationState { return { ...this.state }; }

  async paginate(fetchPage: (request: EventPageRequest) => Promise<SorobanEventPage<T>>): Promise<T[]> {
    const result: T[] = [];
    let cursor = this.state.cursor;
    let pages = 0;
    while (!this.state.completed && pages < this.maxPages) {
      const page = await fetchPage({ cursor, limit: this.pageSize });
      result.push(...page.events);
      pages++;
      this.state.pages++;
      this.state.cursor = page.cursor;
      if (!page.hasMore || !page.cursor) { this.state.completed = true; break; }
      cursor = page.cursor;
    }
    return result;
  }
}