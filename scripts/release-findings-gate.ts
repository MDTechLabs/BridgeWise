export type Finding = {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status: 'open' | 'fixed' | 'verified' | 'false-positive' | 'accepted-risk';
  title: string;
  owner?: string;
};

export function evaluateReleaseFindings(findings: Finding[]) {
  const blockers = findings.filter(f =>
    (f.severity === 'critical' || f.severity === 'high') &&
    !(f.status === 'verified' || f.status === 'false-positive')
  );
  return {
    ok: blockers.length === 0,
    blockers,
    summary: {
      total: findings.length,
      criticalOpen: findings.filter(f => f.severity === 'critical' && f.status !== 'verified' && f.status !== 'false-positive').length,
      highOpen: findings.filter(f => f.severity === 'high' && f.status !== 'verified' && f.status !== 'false-positive').length,
    },
  };
}
