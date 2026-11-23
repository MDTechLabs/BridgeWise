import { evaluateReleaseFindings } from './release-findings-gate';

describe('release findings gate', () => {
  it('blocks unresolved critical/high', () => {
    const r = evaluateReleaseFindings([
      { id: 'F-1', severity: 'critical', status: 'open', title: 'auth bypass' },
      { id: 'F-2', severity: 'high', status: 'fixed', title: 'acct' },
    ]);
    expect(r.ok).toBe(false);
    expect(r.blockers.map(b => b.id)).toEqual(['F-1', 'F-2']);
  });

  it('allows verified/false-positive', () => {
    const r = evaluateReleaseFindings([
      { id: 'F-1', severity: 'critical', status: 'verified', title: 'x' },
      { id: 'F-2', severity: 'high', status: 'false-positive', title: 'y' },
    ]);
    expect(r.ok).toBe(true);
  });
});
