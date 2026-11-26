import { expect } from 'chai';
import {
  consumeSecurityAuditDownloadToken,
  issueSecurityAuditDownloadToken,
} from './securityAuditDownloadTokens.ts';

describe('security audit download tokens', function() {
  it('issues single-use five-minute download tokens', function() {
    const issued = issueSecurityAuditDownloadToken({
      reportId: 'audit-123-full', format: 'json', createdByUserId: 'admin',
      now: new Date('2026-08-19T00:00:00.000Z'),
    });
    expect(consumeSecurityAuditDownloadToken(issued.token, new Date('2026-08-19T00:04:59.000Z'))?.reportId).to.equal('audit-123-full');
    expect(consumeSecurityAuditDownloadToken(issued.token, new Date('2026-08-19T00:04:59.000Z'))).to.equal(null);
    const expired = issueSecurityAuditDownloadToken({
      reportId: 'audit-expired', format: 'html', createdByUserId: 'admin',
      now: new Date('2026-08-19T00:00:00.000Z'),
    });
    expect(consumeSecurityAuditDownloadToken(expired.token, new Date('2026-08-19T00:05:01.000Z'))).to.equal(null);
  });
});
