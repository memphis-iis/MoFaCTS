import { Meteor } from 'meteor/meteor';
import { expect } from 'chai';
import { createSecurityAuditMethods } from './securityAuditMethods';

function storedReport() {
  const section = (sectionId: string) => ({ sectionId, status: 'PASS', controls: [] });
  return {
    reportId: 'audit-1-full', reportType: 'full', startedAt: '2026-08-19T00:00:00.000Z', completedAt: '2026-08-19T00:01:00.000Z',
    target: 'https://mofacts.optimallearning.org', sourceRevision: 'unknown', productionImage: 'unknown', digestSha256: 'a'.repeat(64),
    toolVersions: {}, executionErrors: [], counts: { pass: 1, fail: 0, error: 0, notApplicable: 0, info: 0, low: 0, medium: 0, high: 0, critical: 0 },
    sections: { external: section('external'), authentication: section('authentication'), internal: section('internal'), repository: section('repository') },
    ingestNonce: 'nonce', ingestedAt: new Date('2026-08-19T00:02:00.000Z'), expiresAt: new Date('2026-11-17T00:02:00.000Z'),
  } as any;
}

function createDeps(requireAdminUser: (userId?: string | null) => Promise<void> = async () => undefined) {
  return {
    reports: {
      find: () => ({ fetchAsync: async () => [storedReport()] }),
      findOneAsync: async () => storedReport(),
    },
    requireAdminUser,
  };
}

describe('security audit admin methods', function() {
  for (const methodName of ['admin.securityAudits.list', 'admin.securityAudits.get', 'admin.securityAudits.downloadToken'] as const) {
    for (const userId of [null, 'learner', 'teacher']) {
      it(`rejects ${userId || 'anonymous'} access to ${methodName}`, async function() {
        const methods = createSecurityAuditMethods(createDeps(async (candidate) => {
          if (candidate !== 'admin') throw new Meteor.Error('not-authorized', 'Only admins can view security audits');
        }) as any);
        try {
          await (methods[methodName] as any).call({ userId }, 'audit-1-full', 'json');
          throw new Error('Expected method to reject non-admin user');
        } catch (error) {
          expect(error).to.be.instanceOf(Meteor.Error);
          expect((error as Meteor.Error).error).to.equal('not-authorized');
        }
      });
    }
  }

  it('returns summaries without controls, evidence, or ingestion nonces', async function() {
    const methods = createSecurityAuditMethods(createDeps() as any);
    const result = await methods['admin.securityAudits.list'].call({ userId: 'admin' });
    const serialized = JSON.stringify(result);
    expect(result.reports).to.have.length(1);
    expect(serialized).not.to.include('controls');
    expect(serialized).not.to.include('evidence');
    expect(serialized).not.to.include('ingestNonce');
  });

  it('allows an admin to get a summary and mint either download format', async function() {
    const methods = createSecurityAuditMethods(createDeps() as any);
    const summary = await methods['admin.securityAudits.get'].call({ userId: 'admin' }, 'audit-1-full');
    expect(summary.reportId).to.equal('audit-1-full');
    expect(JSON.stringify(summary)).not.to.include('controls');
    for (const format of ['json', 'html'] as const) {
      const result = await methods['admin.securityAudits.downloadToken'].call({ userId: 'admin' }, 'audit-1-full', format);
      expect(result.url).to.include(`/audit-1-full.${format}`);
    }
  });
});
