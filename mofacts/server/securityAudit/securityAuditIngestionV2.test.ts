import { expect } from 'chai';
import { signSecurityAuditRequest } from './securityAuditIngestion';
import { signAuditRequestV2 } from './securityAuditIngestionV2.ts';

describe('V2 audit transport Meteor parity', function() {
  it('preserves the exact V1 HMAC formula under the supported server runtime', function() {
    const body = Buffer.from('{"synthetic":"wire-formula-parity"}');
    const secret = 'synthetic-only-'.repeat(4);
    expect(signAuditRequestV2(secret, '1793880120', 'synthetic-contract-nonce-0001', body))
      .to.equal(signSecurityAuditRequest(secret, '1793880120', 'synthetic-contract-nonce-0001', body));
  });
});
