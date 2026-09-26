import { SorobanEventPaginator } from '../../../../src/indexer/soroban/pagination';

describe('SorobanEventPaginator', () => {
  it('preserves order, handles empty pages, and stores the resume cursor', async () => {
    const pages = new Map([
      [undefined, { events: [1], cursor: 'one', hasMore: true }],
      ['one', { events: [], cursor: 'two', hasMore: true }],
      ['two', { events: [2, 3], hasMore: false }],
    ]);
    const paginator = new SorobanEventPaginator<number>({ pageSize: 2 });
    await expect(paginator.paginate(async ({ cursor }) => pages.get(cursor)!)).resolves.toEqual([1, 2, 3]);
    expect(paginator.getState()).toMatchObject({ cursor: undefined, pages: 3, completed: true });
  });

  it('resumes from persisted state after interruption', async () => {
    const paginator = new SorobanEventPaginator<number>({ state: { cursor: 'saved', pages: 1, completed: false } });
    const fetchPage = jest.fn().mockResolvedValue({ events: [2], hasMore: false });
    await expect(paginator.paginate(fetchPage)).resolves.toEqual([2]);
    expect(fetchPage).toHaveBeenCalledWith({ cursor: 'saved', limit: 100 });
  });
});