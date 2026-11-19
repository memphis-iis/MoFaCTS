import { expect } from 'chai';
import { WebApp } from 'meteor/webapp';
import { HTTP_FILE_VERIFICATIONS, HTTP_MIDDLEWARE_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';
import { registeredHttpSurfaces } from '../securitySurfaces/registerHttpRoutes.ts';

describe('application HTTP registration', function() {
  this.timeout(15000);
  let origin: string;
  before(function() {
    const address = WebApp.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Application TCP listener is unavailable');
    origin = `http://127.0.0.1:${address.port}`;
  });

  it('binds each file handler once on its existing HTTP stack', function() {
    const registrations = registeredHttpSurfaces();
    for (const [mount, stack, policy, verification] of [
      ['/admin/backups/download', 'connectHandlers', 'single-use-capability', HTTP_FILE_VERIFICATIONS.backup],
      ['/data-download/own-history', 'connectHandlers', 'single-use-capability', HTTP_FILE_VERIFICATIONS.history],
      ['/data-download/owned-history', 'connectHandlers', 'single-use-capability', HTTP_FILE_VERIFICATIONS.ownedHistory],
      ['/dynamic-assets', 'connectHandlers', 'public-asset-marker', HTTP_FILE_VERIFICATIONS.asset],
      ['/cdn/storage/Assets', 'rawConnectHandlers', 'public-asset-marker', HTTP_FILE_VERIFICATIONS.cdn],
    ] as const) {
      const found = registrations.filter(entry => entry.mount === mount);
      expect(found).to.have.length(1);
      expect(found[0]?.stack).to.equal(stack);
      expect(found[0]?.policy.kind).to.equal(policy);
      expect(found[0]?.verification).to.equal(verification);
    }
  });

  it('retains download method and invalid-capability responses at the mounted paths', async function() {
    for (const path of ['/admin/backups/download', '/data-download/own-history', '/data-download/owned-history']) {
      const url = `${origin}${path}/invalid/fixture.tsv`;
      const denied = await fetch(url, { signal: AbortSignal.timeout(5000) });
      expect(denied.status, path).to.equal(404);
      await denied.text();
      const wrongMethod = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(5000) });
      expect(wrongMethod.status, path).to.equal(405);
      await wrongMethod.text();
    }
  });

  it('preserves the retired upload response on both asset mounts', async function() {
    for (const path of ['/dynamic-assets', '/cdn/storage/Assets']) {
      const response = await fetch(`${origin}${path}/__upload?fixture=1`, { signal: AbortSignal.timeout(5000) });
      expect(response.status, path).to.equal(410);
      expect(await response.text()).to.include('HTTP uploads are retired');
    }
  });
  it('records each unmounted owner once on its existing stack', function() {
    for (const [surfaceId, stack, policy, verification] of [
      ['middleware:memphis-saml', 'connectHandlers', 'saml-protocol', HTTP_MIDDLEWARE_VERIFICATIONS.saml],
      ['middleware:pwa-assets', 'handlers', 'public', HTTP_MIDDLEWARE_VERIFICATIONS.pwa],
      ['middleware:social-preview', 'handlers', 'public', HTTP_MIDDLEWARE_VERIFICATIONS.socialPreview],
      ['middleware:security-headers', 'handlers', 'response-headers', HTTP_MIDDLEWARE_VERIFICATIONS.headers],
    ] as const) {
      const matches = registeredHttpSurfaces().filter(entry => entry.surfaceId === surfaceId);
      expect(matches).to.have.length(1);
      expect(matches[0]).to.include({ stack, dispatch: 'handler-owned', mount: null });
      expect(matches[0]?.policy.kind).to.equal(policy);
      expect(matches[0]?.verification).to.equal(verification);
    }
  });

  it('retains SAML method handling on all three exact paths', async function() {
    for (const [path, method] of [
      ['/auth/saml/memphis/login', 'POST'], ['/auth/saml/memphis/acs', 'GET'], ['/auth/saml/memphis/metadata', 'POST'],
    ] as const) {
      const response = await fetch(`${origin}${path}?fixture=1`, { method, signal: AbortSignal.timeout(5000) });
      expect(response.status, path).to.equal(405);
      expect(await response.text(), path).to.equal('Method not allowed.');
    }
  });

  it('serves the public app manifest and leaves unsupported methods to Meteor', async function() {
    const manifest = await fetch(`${origin}/site.webmanifest`, { signal: AbortSignal.timeout(5000) });
    expect(manifest.status).to.equal(200);
    expect(manifest.headers.get('content-type')).to.match(/^application\/manifest\+json\b/);
    expect(await manifest.json()).to.include({ display: 'standalone' });
    const rejected = await fetch(`${origin}/site.webmanifest`, { method: 'POST', signal: AbortSignal.timeout(5000) });
    expect(rejected.status).to.equal(405);
    expect(rejected.headers.get('allow')).to.equal('OPTIONS, GET, HEAD');
    await rejected.text();
  });

  it('serves social crawler metadata and lets an ordinary request reach the app', async function() {
    const url = `${origin}/?fixture=1`;
    const preview = await fetch(url, { headers: { 'User-Agent': 'Twitterbot' }, signal: AbortSignal.timeout(5000) });
    expect(preview.status).to.equal(200);
    expect(preview.headers.get('cache-control')).to.equal('public, max-age=300');
    expect(await preview.text()).to.include('property="og:title"');
    const page = await fetch(url, { signal: AbortSignal.timeout(5000) });
    expect(page.status).to.equal(200);
    expect(page.headers.get('cache-control')).not.to.equal('public, max-age=300');
    expect(page.headers.get('x-frame-options')).to.equal('DENY');
    expect(page.headers.get('x-content-type-options')).to.equal('nosniff');
    await page.text();
  });

});
