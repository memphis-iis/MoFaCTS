import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { acquireAuditReportReadbackV2 } from '../core/reportReadbackBrowserV2.mjs';
import { errorReport } from './fixtures/v2Fixtures.mjs';
import { finalizeAuditReport } from '../../../common/securityAudit/reportV2.ts';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';

const target = 'https://staging2.optimallearning.org';
async function fixture(mode = 'success') {
  const { counts, digestSha256, ...payload } = await errorReport(); void counts; void digestSha256;
  const report = await finalizeAuditReport({ ...payload, target,
    ...(mode === 'wrong-report' ? { reportId: 'another-report' } : {}) });
  const bytes = mode === 'oversized' ? Buffer.alloc(2 * 1024 * 1024 + 1, 65)
    : Buffer.from(canonicalAuditJson(report) + '\n');
  const calls = [];
  let identity = 'operator';
  const globals = { URL, AbortSignal, TextDecoder, Uint8Array, crypto: crypto.webcrypto, setTimeout, clearTimeout,
    location: { origin: target }, Session: { get: name => ({ authReady: true, authRolesHydrated: true,
      authRolesSyncedUserId: identity, authRoles: { admin: mode !== 'not-admin', teacher: false } })[name] },
    Meteor: { status: () => ({ connected: true }), userId: () => identity,
      callAsync: async (...args) => {
        calls.push(args);
        if (mode === 'private-error') throw new Error('PRIVATE_DOWNLOAD_CAPABILITY');
        return { url: mode === 'foreign-url' ? 'https://foreign.example/admin/security-audits/download/private'
          : '/admin/security-audits/download/private' };
      } },
    fetch: async (url, options) => {
      calls.push('fetch'); assert.equal(url.origin, target); assert.equal(options.redirect, 'error');
      if (mode === 'identity-changed') identity = 'another-operator';
      return new Response(bytes, { status: 200, headers: { 'x-content-sha256': mode === 'wrong-header' ? '0'.repeat(64)
        : crypto.createHash('sha256').update(bytes).digest('hex') } });
    },
  };
  const page = { url: () => target, evaluate: (fn, argument) => vm.runInNewContext(`(${fn.toString()})(argument)`, { ...globals, argument }) };
  return { page, target, adminUserId: 'operator', reportId: 'synthetic-v2-report', bytes, calls };
}

test('actual browser callback reads only the exact selected report through the existing protected download', async () => {
  const f = await fixture();
  assert.deepEqual(await acquireAuditReportReadbackV2(f), f.bytes);
  assert.deepEqual(f.calls, [['admin.securityAudits.downloadToken', f.reportId, 'json'], 'fetch']);
});

for (const mode of ['not-admin', 'foreign-url', 'private-error', 'wrong-header', 'wrong-report', 'oversized', 'identity-changed']) {
  test(`report readback ${mode} fails without returning private diagnostics or capabilities`, async () => {
    const f = await fixture(mode);
    await assert.rejects(acquireAuditReportReadbackV2(f), error => {
      assert.equal(error.message, 'V2 authorized report readback is unavailable');
      assert.equal(error.cause, undefined);
      assert.equal(String(error.stack).includes('PRIVATE_DOWNLOAD_CAPABILITY'), false);
      return true;
    });
    if (['not-admin', 'foreign-url', 'private-error'].includes(mode)) assert.equal(f.calls.includes('fetch'), false);
  });
}

test('production and malformed report selection fail before browser or method access', async () => {
  const f = await fixture();
  await assert.rejects(acquireAuditReportReadbackV2({ ...f, target: 'https://optimallearning.org' }));
  await assert.rejects(acquireAuditReportReadbackV2({ ...f, reportId: '../another-report' }));
  assert.deepEqual(f.calls, []);
});
