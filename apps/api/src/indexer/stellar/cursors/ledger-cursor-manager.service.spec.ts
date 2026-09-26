import { LedgerCursorManagerService, CursorProgressionError } from './ledger-cursor-manager.service';

describe('LedgerCursorManagerService', () => {
  let mgr: LedgerCursorManagerService;
  beforeEach(() => {
    mgr = new LedgerCursorManagerService();
  });

  it('starts with no cursor and resumes from the default', () => {
    expect(mgr.getCursor('bridge')).toBeUndefined();
    expect(mgr.resumeLedger('bridge', 100)).toBe(100);
  });

  it('advances forward and resumes from the next ledger', () => {
    mgr.advance('bridge', 500);
    expect(mgr.getCursor('bridge')?.lastLedger).toBe(500);
    expect(mgr.resumeLedger('bridge')).toBe(501);
  });

  it('rejects backward or equal progression', () => {
    mgr.advance('bridge', 500);
    expect(() => mgr.advance('bridge', 500)).toThrow(CursorProgressionError);
    expect(() => mgr.advance('bridge', 400)).toThrow(CursorProgressionError);
  });

  it('rejects invalid ledger values', () => {
    expect(() => mgr.advance('bridge', -1)).toThrow(CursorProgressionError);
    expect(() => mgr.advance('bridge', 1.5)).toThrow(CursorProgressionError);
  });

  it('recover() can rewind the cursor to a known-good ledger', () => {
    mgr.advance('bridge', 500);
    const c = mgr.recover('bridge', 300);
    expect(c.lastLedger).toBe(300);
    expect(mgr.resumeLedger('bridge')).toBe(301);
  });

  it('persists cursors via an injected store', () => {
    const map = new Map();
    const store = { get: (n: string) => map.get(n), set: (c: any) => map.set(c.name, c) };
    const withStore = new LedgerCursorManagerService(store);
    withStore.advance('x', 10);
    expect(map.get('x').lastLedger).toBe(10);
  });
});
