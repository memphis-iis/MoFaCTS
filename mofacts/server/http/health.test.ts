import { expect } from 'chai';
import { buildHealthPayload } from './health';

describe('/health endpoint payload', function() {
  it('returns a stable shape for monitoring', function() {
    const payload = buildHealthPayload(new Date('2026-02-15T12:34:56.000Z'));

    expect(payload.status).to.equal('ok');
    expect(payload.app).to.equal('mofacts');
    expect(payload.environment).to.be.oneOf(['development', 'production']);
    expect(payload.uptimeSeconds).to.be.a('number');
    expect(payload.uptimeSeconds).to.be.at.least(0);
    expect(payload.timestamp).to.equal('2026-02-15T12:34:56.000Z');
  });
});
