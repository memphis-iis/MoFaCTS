import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { chromium } from '../../../mofacts/node_modules/playwright/index.mjs';
import { openConnectionStore } from './store.mjs';
import { createAuditAuthorization, CONNECTION_RESOURCE } from './authorization.mjs';
import { createMailHandoff } from './handoff.mjs';
import { createConnectionApp } from './server.mjs';

// Source qualification on the existing operator browser installation. Every
// canonical URL is intercepted and forwarded only to the synthetic loopback
// server; this test never connects to staging2, Gmail or a real OAuth callback.
test('native Chromium form submission preserves exact Origin and the bound consent cookie', { timeout: 30000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-consent-browser-'));
  await fs.chmod(directory, 0o700);
  let browser, listener;
  try {
    const store = await openConnectionStore(directory), authorization = createAuditAuthorization({ store });
    const callback = 'https://chatgpt.com/connector/oauth/test-audit';
    const client = await authorization.provider.clientsStore.registerClient({ redirect_uris: [callback], token_endpoint_auth_method: 'none' });
    const enrollment = await authorization.enroll(), verifier = 'A'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    let consentUrl, consentCookie, completedRedirect;
    await authorization.provider.authorize(client, { redirectUri: callback, codeChallenge: challenge,
      resource: new URL(CONNECTION_RESOURCE), scopes: ['audit:status'], state: 'synthetic-state' }, {
      cookie(name, value) { consentCookie = { name, value }; }, redirect(value) { consentUrl = value; },
    });
    listener = createConnectionApp({ authorization, handoff: createMailHandoff({ store }) }).listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const loopback = `http://127.0.0.1:${listener.address().port}`;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addCookies([{ ...consentCookie, domain: 'staging2.optimallearning.org',
      path: '/audit-connection/consent', secure: true, httpOnly: true, sameSite: 'Strict' }]);
    let formObservation;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === 'https://staging2.optimallearning.org') {
        const headers = await request.allHeaders();
        if (request.method() === 'POST' && url.pathname === '/audit-connection/consent') {
          formObservation = { exactOrigin: headers.origin === url.origin, referrerOriginOnly: headers.referer === `${url.origin}/`,
            boundCookiePresent: /(?:^|;\s*)__Secure-mofacts-audit-consent=/.test(headers.cookie ?? '') };
        }
        const forwarded = { ...headers, host: url.host };
        delete forwarded.connection; delete forwarded['accept-encoding']; delete forwarded['content-length'];
        const response = await fetch(`${loopback}${url.pathname}${url.search}`, { method: request.method(),
          headers: forwarded, ...(request.postDataBuffer() ? { body: request.postDataBuffer() } : {}),
          redirect: 'manual', signal: AbortSignal.timeout(5000) });
        t.diagnostic(`Synthetic ${request.method()} ${url.pathname}: ${response.status}`);
        if (response.status === 303) {
          completedRedirect = new URL(response.headers.get('location'));
          assert.equal(completedRedirect.origin + completedRedirect.pathname, callback);
          await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Synthetic consent accepted' });
        } else {
          assert.equal(response.status >= 300 && response.status < 400, false, 'Unexpected redirect may not leave the isolated test');
          await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
        }
      } else await route.abort();
    });
    const page = await context.newPage();
    await page.goto(consentUrl, { timeout: 10000 });
    await page.getByLabel('One-time connection code').fill(enrollment, { timeout: 3000 });
    await page.getByRole('button', { name: 'Approve audit connection', exact: true }).click({ timeout: 10000 });
    assert.deepEqual(formObservation, { exactOrigin: true, boundCookiePresent: true, referrerOriginOnly: true });
    assert.equal(await page.locator('body').innerText(), 'Synthetic consent accepted');
    assert.equal(store.read().enrollment, null);
    const code = completedRedirect.searchParams.get('code');
    const tokens = await authorization.provider.exchangeAuthorizationCode(client, code, verifier, callback, new URL(CONNECTION_RESOURCE));
    assert.deepEqual((await authorization.provider.verifyAccessToken(tokens.access_token)).scopes, ['audit:status']);
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (listener) await new Promise(resolve => listener.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
