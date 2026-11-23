import {
  AuditFinding,
  AuditRemediationClosure,
  ClosureError,
  ClosureErrorCode,
} from './audit-remediation-closure';

const dev1 = 'dev-1';
const dev2 = 'dev-2';
const rev1 = 'reviewer-1';
const rev2 = 'reviewer-2';
const closer = 'security-lead';
const outsider = 'mallory';

const fixCommit = 'a'.repeat(40);
const deployedCommit = 'b'.repeat(40);

const findings: AuditFinding[] = [
  { id: 'C-01', severity: 'critical', title: 'Replay of settlement message' },
  { id: 'H-01', severity: 'high', title: 'Oracle staleness bypass' },
  { id: 'M-01', severity: 'medium', title: 'Missing zero-address check' },
  { id: 'I-01', severity: 'informational', title: 'Naming' },
];
const roles = {
  remediators: [dev1, dev2],
  verifiers: [rev1, rev2],
  closers: [closer],
};

function make(): AuditRemediationClosure {
  return new AuditRemediationClosure(findings, roles);
}

function fix(findingId: string, commitId = fixCommit) {
  return {
    findingId,
    disposition: 'fixed' as const,
    fixCommit: commitId,
    testRefs: [`test/${findingId}.spec.ts`],
  };
}
function pass(findingId: string, verifiedCommit = fixCommit) {
  return { findingId, verdict: 'pass' as const, verifiedCommit, evidenceRef: 'review-notes#1' };
}
const contained = { deployedCommit, isAncestor: () => true };

function expectCode(fn: () => unknown, code: ClosureErrorCode): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ClosureError);
    expect((error as ClosureError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ClosureError ${code}`);
}

function completeAll(c: AuditRemediationClosure): void {
  for (const f of findings) {
    c.recordRemediation(dev1, fix(f.id));
    c.recordVerification(rev1, pass(f.id));
  }
}

describe('audit remediation closure', () => {
  describe('construction', () => {
    it('rejects empty, malformed and duplicate findings', () => {
      expectCode(() => new AuditRemediationClosure([], roles), 'INVALID_INPUT');
      expectCode(
        () => new AuditRemediationClosure([{ id: '', severity: 'low', title: 'x' }], roles),
        'INVALID_INPUT',
      );
      expectCode(
        () =>
          new AuditRemediationClosure(
            [{ id: 'A', severity: 'bogus' as never, title: 'x' }],
            roles,
          ),
        'INVALID_INPUT',
      );
      expectCode(
        () => new AuditRemediationClosure([findings[0], { ...findings[0] }], roles),
        'INVALID_INPUT',
      );
    });

    it('rejects empty role sets and overlapping roles', () => {
      expectCode(() => new AuditRemediationClosure(findings, { ...roles, closers: [] }), 'INVALID_INPUT');
      expectCode(
        () => new AuditRemediationClosure(findings, { ...roles, verifiers: [dev1] }),
        'NOT_INDEPENDENT',
      );
      expectCode(
        () => new AuditRemediationClosure(findings, { ...roles, closers: [dev2] }),
        'NOT_INDEPENDENT',
      );
    });

    it('starts with every finding blocking closure', () => {
      const list = make().checklist();
      expect(list.closable).toBe(false);
      expect(list.items.every((i) => i.status === 'open')).toBe(true);
      expect(list.blockers).toHaveLength(findings.length);
    });
  });

  describe('remediation', () => {
    it('requires an authorized remediator', () => {
      const c = make();
      for (const actor of [outsider, rev1, closer, '', undefined as never]) {
        expectCode(() => c.recordRemediation(actor, fix('C-01')), 'UNAUTHORIZED');
      }
      expect(c.checklist().items[0].status).toBe('open');
    });

    it('is case and whitespace insensitive for principals', () => {
      const c = make();
      c.recordRemediation('  DEV-1 ', fix('C-01'));
      expect(c.checklist().items[0].remediator).toBe(dev1);
    });

    it.each([
      ['non-object', null],
      ['missing disposition', { findingId: 'C-01' }],
      ['fixed without commit', { findingId: 'C-01', disposition: 'fixed', testRefs: ['t'] }],
      ['fixed with short commit', { findingId: 'C-01', disposition: 'fixed', fixCommit: 'abc', testRefs: ['t'] }],
      ['fixed without tests', { findingId: 'C-01', disposition: 'fixed', fixCommit }],
      ['fixed with empty tests', { findingId: 'C-01', disposition: 'fixed', fixCommit, testRefs: [] }],
      ['fixed with blank test ref', { findingId: 'C-01', disposition: 'fixed', fixCommit, testRefs: [' '] }],
      ['risk acceptance without ref', { findingId: 'M-01', disposition: 'accepted-risk' }],
    ])('rejects %s', (_name, input) => {
      const c = make();
      expectCode(() => c.recordRemediation(dev1, input), 'INVALID_INPUT');
      expect(c.checklist().items.every((i) => i.status === 'open')).toBe(true);
    });

    it('rejects unknown findings', () => {
      expectCode(() => make().recordRemediation(dev1, fix('NOPE')), 'UNKNOWN_FINDING');
    });

    it('forbids risk-accepting critical and high findings', () => {
      const c = make();
      for (const id of ['C-01', 'H-01']) {
        expectCode(
          () => c.recordRemediation(dev1, { findingId: id, disposition: 'accepted-risk', riskAcceptanceRef: 'RA-1' }),
          'POLICY_VIOLATION',
        );
      }
      c.recordRemediation(dev1, { findingId: 'M-01', disposition: 'accepted-risk', riskAcceptanceRef: 'RA-2' });
      expect(c.checklist().items[2].status).toBe('remediated');
    });

    it('rejects a replayed remediation and keeps the original record', () => {
      const c = make();
      c.recordRemediation(dev1, fix('C-01'));
      expectCode(() => c.recordRemediation(dev2, fix('C-01', 'c'.repeat(40))), 'INVALID_TRANSITION');
      const item = c.checklist().items[0];
      expect(item.fixCommit).toBe(fixCommit);
      expect(item.remediator).toBe(dev1);
      expect(c.events()).toHaveLength(1);
    });
  });

  describe('independent verification', () => {
    it('requires an authorized verifier', () => {
      const c = make();
      c.recordRemediation(dev1, fix('C-01'));
      for (const actor of [outsider, dev1, dev2, closer]) {
        expectCode(() => c.recordVerification(actor, pass('C-01')), 'UNAUTHORIZED');
      }
      expect(c.checklist().items[0].status).toBe('remediated');
    });

    it('rejects verification before remediation and after it was already verified', () => {
      const c = make();
      expectCode(() => c.recordVerification(rev1, pass('C-01')), 'INVALID_TRANSITION');
      c.recordRemediation(dev1, fix('C-01'));
      c.recordVerification(rev1, pass('C-01'));
      expectCode(() => c.recordVerification(rev2, pass('C-01')), 'INVALID_TRANSITION');
      expect(c.checklist().items[0].verifier).toBe(rev1);
    });

    it('rejects a commit the verifier did not actually review', () => {
      const c = make();
      c.recordRemediation(dev1, fix('C-01'));
      expectCode(() => c.recordVerification(rev1, pass('C-01', 'c'.repeat(40))), 'COMMIT_MISMATCH');
      expectCode(
        () => c.recordVerification(rev1, { findingId: 'C-01', verdict: 'pass', evidenceRef: 'x' }),
        'COMMIT_MISMATCH',
      );
      expect(c.checklist().items[0].status).toBe('remediated');
    });

    it('validates verification input', () => {
      const c = make();
      c.recordRemediation(dev1, fix('C-01'));
      expectCode(() => c.recordVerification(rev1, null), 'INVALID_INPUT');
      expectCode(() => c.recordVerification(rev1, { ...pass('C-01'), verdict: 'maybe' }), 'INVALID_INPUT');
      expectCode(() => c.recordVerification(rev1, { ...pass('C-01'), evidenceRef: '' }), 'INVALID_INPUT');
      expectCode(() => c.recordVerification(rev1, { ...pass('C-01'), verifiedCommit: 'zz' }), 'INVALID_INPUT');
    });

    it('a failed verification reopens the finding and clears remediation evidence', () => {
      const c = make();
      c.recordRemediation(dev1, fix('C-01'));
      c.recordVerification(rev1, { findingId: 'C-01', verdict: 'fail', evidenceRef: 'bug still reproduces' });
      const item = c.checklist().items[0];
      expect(item.status).toBe('open');
      expect(item.fixCommit).toBeUndefined();
      expect(item.attempts).toBe(1);

      c.recordRemediation(dev2, fix('C-01', 'c'.repeat(40)));
      c.recordVerification(rev2, pass('C-01', 'c'.repeat(40)));
      expect(c.checklist().items[0]).toMatchObject({ status: 'verified', attempts: 2 });
    });

    it('accepted-risk findings are verified without a commit', () => {
      const c = make();
      c.recordRemediation(dev1, { findingId: 'M-01', disposition: 'accepted-risk', riskAcceptanceRef: 'RA-2' });
      c.recordVerification(rev1, { findingId: 'M-01', verdict: 'pass', evidenceRef: 'RA-2 signed' });
      expect(c.checklist().items[2].status).toBe('verified');
    });
  });

  describe('closure', () => {
    it('closes when every finding is verified and fixes are in the deployed commit', () => {
      const c = make();
      completeAll(c);
      expect(c.checklist().closable).toBe(true);
      c.close(closer, contained);
      expect(c.isClosed).toBe(true);
      expect(c.checklist()).toMatchObject({ closed: true, closable: false });
    });

    it('lists blockers and refuses closure while any finding is open or unverified', () => {
      const c = make();
      c.recordRemediation(dev1, fix('C-01'));
      c.recordRemediation(dev1, fix('H-01'));
      c.recordVerification(rev1, pass('H-01'));
      expectCode(() => c.close(closer, contained), 'NOT_CLOSABLE');
      expect(c.checklist().blockers).toEqual([
        'C-01: awaiting independent verification',
        'M-01: not remediated',
        'I-01: not remediated',
      ]);
      expect(c.isClosed).toBe(false);
    });

    it('requires an authorized closer who is not a remediator', () => {
      const c = make();
      completeAll(c);
      for (const actor of [outsider, dev1, rev1]) {
        expectCode(() => c.close(actor, contained), 'UNAUTHORIZED');
      }
      expect(c.isClosed).toBe(false);
    });

    it('fails closed when a fix is not contained in the deployed commit, or ancestry check throws', () => {
      const c = make();
      completeAll(c);
      expectCode(() => c.close(closer, { deployedCommit, isAncestor: () => false }), 'NOT_CLOSABLE');
      expectCode(
        () =>
          c.close(closer, {
            deployedCommit,
            isAncestor: () => {
              throw new Error('git unavailable');
            },
          }),
        'NOT_CLOSABLE',
      );
      expectCode(() => c.close(closer, { deployedCommit: 'main', isAncestor: () => true }), 'INVALID_INPUT');
      expect(c.isClosed).toBe(false);
    });

    it('passes the exact fix commit to the ancestry check, skipping accepted risks', () => {
      const c = make();
      for (const f of findings.slice(0, 2)) {
        c.recordRemediation(dev1, fix(f.id));
        c.recordVerification(rev1, pass(f.id));
      }
      c.recordRemediation(dev1, { findingId: 'M-01', disposition: 'accepted-risk', riskAcceptanceRef: 'RA' });
      c.recordVerification(rev1, { findingId: 'M-01', verdict: 'pass', evidenceRef: 'ok' });
      c.recordRemediation(dev1, fix('I-01'));
      c.recordVerification(rev1, pass('I-01'));

      const isAncestor = jest.fn().mockReturnValue(true);
      c.close(closer, { deployedCommit, isAncestor });
      expect(isAncestor).toHaveBeenCalledTimes(3);
      expect(isAncestor).toHaveBeenCalledWith(fixCommit, deployedCommit);
    });

    it('is terminal: no action can mutate a closed audit, and close cannot be replayed', () => {
      const c = make();
      completeAll(c);
      c.close(closer, contained);
      const before = JSON.stringify([c.checklist(), c.events()]);

      expectCode(() => c.close(closer, contained), 'ALREADY_CLOSED');
      expectCode(() => c.recordRemediation(dev1, fix('C-01')), 'ALREADY_CLOSED');
      expectCode(() => c.recordVerification(rev1, pass('C-01')), 'ALREADY_CLOSED');
      expect(JSON.stringify([c.checklist(), c.events()])).toBe(before);
    });
  });

  describe('stateful invariants (seeded random action sequences)', () => {
    function rng(seed: number): () => number {
      let s = seed >>> 0;
      return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2 ** 32;
      };
    }
    const actors = [dev1, dev2, rev1, rev2, closer, outsider];

    it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('holds for seed %d', (seed) => {
      const rand = rng(seed);
      const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
      const c = make();
      const commits = ['a'.repeat(40), 'c'.repeat(40)];

      for (let step = 0; step < 300 && !c.isClosed; step++) {
        const before = JSON.stringify([c.checklist(), c.events()]);
        const actor = pick(actors);
        const id = pick(findings).id;
        const kind = pick(['remediate', 'verify', 'fail', 'close'] as const);
        const fixedCommit = pick(commits);
        try {
          if (kind === 'remediate') c.recordRemediation(actor, fix(id, fixedCommit));
          else if (kind === 'verify') c.recordVerification(actor, pass(id, pick(commits)));
          else if (kind === 'fail')
            c.recordVerification(actor, { findingId: id, verdict: 'fail', evidenceRef: 'e' });
          else c.close(actor, contained);
        } catch (error) {
          expect(error).toBeInstanceOf(ClosureError);
          // A rejected action never mutates state.
          expect(JSON.stringify([c.checklist(), c.events()])).toBe(before);
        }

        const list = c.checklist();
        for (const item of list.items) {
          // Verified items always have an independent verifier and remediation.
          if (item.status === 'verified') {
            expect(item.verifier).toBeDefined();
            expect(item.verifier).not.toBe(item.remediator);
            expect(item.fixCommit).toBeDefined();
          }
          // Critical/high findings are never risk-accepted.
          if (item.severity === 'critical' || item.severity === 'high') {
            expect(item.disposition).not.toBe('accepted-risk');
          }
        }
        // Closure only ever happens with everything verified.
        if (list.closed) expect(list.items.every((i) => i.status === 'verified')).toBe(true);
        // Events are sequential and only recorded for accepted actions.
        c.events().forEach((e, i) => expect(e.seq).toBe(i));
      }
    });

    it('a deterministic driver always reaches closure through failures and retries', () => {
      const c = make();
      c.recordRemediation(dev1, fix('C-01'));
      c.recordVerification(rev1, { findingId: 'C-01', verdict: 'fail', evidenceRef: 'e' });
      c.recordRemediation(dev2, fix('C-01'));
      c.recordVerification(rev2, pass('C-01'));
      for (const f of findings.slice(1)) {
        c.recordRemediation(dev1, fix(f.id));
        c.recordVerification(rev2, pass(f.id));
      }
      c.close(closer, contained);
      expect(c.events().map((e) => e.action)).toEqual([
        'remediate', 'reject', 'remediate', 'verify',
        'remediate', 'verify', 'remediate', 'verify', 'remediate', 'verify',
        'close',
      ]);
    });
  });
});
