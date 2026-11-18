import { expect } from 'chai';
import { WebApp } from 'meteor/webapp';
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

describe('/health mounted HTTP behavior', function() {
  let origin: string;

  before(function() {
    const address = WebApp.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Application TCP listener is unavailable');
    origin = `http://127.0.0.1:${address.port}`;
  });

  it('serves health for GET through the mounted path and its suffixes', async function() {
    for (const path of ['/health?probe=1', '/health/phase3-characterization']) {
      const response = await fetch(origin + path, { signal: AbortSignal.timeout(3000) });
      expect(response.status).to.equal(200);
      expect(response.headers.get('content-type')).to.equal('application/json; charset=utf-8');
      expect(response.headers.get('cache-control')).to.equal('no-store');
      expect(await response.json()).to.include({ status: 'ok', app: 'mofacts' });
    }
  });

  it('preserves HEAD without a response body', async function() {
    const response = await fetch(origin + '/health', { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    expect(response.status).to.equal(200);
    expect(response.headers.get('cache-control')).to.equal('no-store');
    expect(await response.text()).to.equal('');
  });

  it('leaves an unsupported method to the application default handler', async function() {
    const response = await fetch(origin + '/health', { method: 'POST', signal: AbortSignal.timeout(3000) });
    expect(response.status).to.equal(405);
    expect(response.headers.get('allow')).to.equal('OPTIONS, GET, HEAD');
    await response.text();
  });

  it('leaves an adjacent prefix to the application rather than serving health JSON', async function() {
    const response = await fetch(origin + '/health-phase3-characterization', { signal: AbortSignal.timeout(3000) });
    expect(response.headers.get('content-type')).to.match(/^text\/html(?:;|$)/i);
    await response.text();
  });
});
