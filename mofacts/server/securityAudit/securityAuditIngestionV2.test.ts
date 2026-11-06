import { expect } from 'chai';
import { signSecurityAuditRequest } from './securityAuditIngestion';
import { signAuditRequestV2 } from './securityAuditIngestionV2.ts';
import { auditReceiverRevision, createAuditReceiverIdentityLoader } from './securityAuditReceiverIdentity.ts';

describe('V2 audit transport Meteor parity', function() {
  it('preserves the exact V1 HMAC formula under the supported server runtime', function() {
    const body = Buffer.from('{"synthetic":"wire-formula-parity"}');
    const secret = 'synthetic-only-'.repeat(4);
    expect(signAuditRequestV2(secret, '1793880120', 'synthetic-contract-nonce-0001', body))
      .to.equal(signSecurityAuditRequest(secret, '1793880120', 'synthetic-contract-nonce-0001', body));
  });

  it('loads the existing image carrier once and keeps missing proof operational', async function() {
    let reads = 0;
    const identity = { schema: 'BuildIdentityV1', baseCommit: 'a'.repeat(40),
      includedUncommittedLocalChanges: true, sourceSnapshotDigestSha256: 'b'.repeat(64) };
    const load = createAuditReceiverIdentityLoader(async () => {
      reads++;
      return Buffer.from(JSON.stringify({ schema: 'MoFaCTSImageSourceObservationV1', state: 'source-matched-unqualified', identity }));
    });
    const values = await Promise.all([load(), load()]);
    expect(values[0]).to.deep.equal({ state: 'observed', identity });
    expect(auditReceiverRevision(await load())).to.deep.equal({ state: 'observed', value: identity.baseCommit });
    expect(reads).to.equal(1);
    const missing = createAuditReceiverIdentityLoader(async () => undefined);
    expect(await missing()).to.deep.equal({ state: 'unavailable', reason: 'not-provided' });
  });
});
