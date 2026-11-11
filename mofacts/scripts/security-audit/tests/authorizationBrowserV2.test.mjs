import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createAuthorizationBrowserV2, acquireSelectedAuthorizationV2 } from '../authentication/browserV2.mjs';
import { runSelectedAuthorizationV2 } from '../authentication/selectedCasesV2.mjs';
import { authorizationBindingsFixture } from './fixtures/authorizationBindingsV2.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
function fixture(options = {}) {
  const bindings = authorizationBindingsFixture(), history = 'synthetic-history-row';
  bindings.values['history.learnerA'].sha256 = digest(history);
  const issued = new Map(), pages = []; let closed = false, sequence = 0;
  const browser = { async newContext() { return { async newPage() {
    const state = { actor: null, path: '/', template: 'publicLanding' };
    const page = { setDefaultTimeout() {}, async goto(input) {
      const path = new URL(input).pathname;
      if (path === '/profile' && !state.actor) { state.path = '/auth/login'; state.template = 'signIn'; }
      else if (path === '/admin/security-audits' && state.actor !== 'admin' && !options.allowedForbiddenRoute) { state.path = '/home'; state.template = 'home'; }
      else { state.path = path; state.template = { '/profile': 'profile', '/courses': 'courses', '/admin/security-audits': 'adminSecurityAuditsV2' }[path] ?? 'publicLanding'; }
    }, async evaluate(fn, args) {
      const keys = ['Meteor', 'Session', 'GlobalExperimentStates', 'DynamicSettings', 'document', 'location', 'Blaze', 'fetch'];
      const saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
      const actorId = () => state.actor ? bindings.actors[state.actor].userId : null;
      Object.assign(globalThis, {
        location: { origin: 'https://audit.example', get pathname() { return state.path; } },
        Session: { get(key) {
          if (['authReady', 'authRolesHydrated'].includes(key)) return true;
          if (key === 'authRolesSyncedUserId') return actorId();
          if (key === 'authRoles') return { admin: state.actor === 'admin' || options.wrongActorRole === state.actor, teacher: state.actor?.startsWith('teacher') === true };
        } },
        Meteor: { status: () => ({ connected: true }), userId: actorId,
          loginWithPassword(username, password, callback) {
            state.actor = Object.keys(bindings.actors).find(name => bindings.actors[name].username === username && bindings.actors[name].password === password);
            callback(state.actor ? null : { error: 403 });
          },
          call(name, ...args) {
            const callback = args.pop(); let value, code;
            if (name === 'getOwnOpenRouterSettings') {
              if (!state.actor) code = 401; else value = { model: '', reasoningLevel: 'none', hasOpenRouterKey: false };
            } else if (name === 'getStudentPerformanceByIdAndTDFIdFromHistory') {
              if (args[0] !== actorId() && !options.allowForeignPerformance) code = 403; else value = bindings.values['performance.learnerB'];
            } else if (name === 'admin.securityAudits.list') {
              if (state.actor !== 'admin') code = 'not-authorized'; else value = { reports: [], latestExposure: null, latestFull: null };
            } else throw new Error('Unexpected synthetic method');
            callback(code ? { error: code } : null, value);
          },
          async callAsync(name) {
            const isHistory = name === 'downloadOwnHistoryAcrossTdfs';
            assert(isHistory || name === 'admin.securityAudits.downloadToken');
            const url = `/${isHistory ? 'data-download/own-history' : 'admin/security-audits/download'}/synthetic-${++sequence}/file`;
            issued.set('https://audit.example' + url, { history: isHistory, consumed: false });
            return isHistory ? { downloadUrl: url } : { url };
          },
          subscribe(name, ...args) { const callbacks = args.at(-1); queueMicrotask(callbacks.onReady); return { stop() {
            if (options.expireLearnerB && state.actor === 'learnerB') state.actor = null;
          } }; },
        },
        GlobalExperimentStates: options.unreadable ? undefined : { find() { return { fetch() {
          const names = state.actor ? [state.actor] : [];
          if (options.leak) names.push(state.actor === 'learnerA' ? 'learnerB' : 'learnerA');
          return names.map(name => ({ _id: bindings.values[`progress.${name}`], userId: bindings.actors[name].userId, TDFId: bindings.values['lesson.progress'] }));
        } }; } },
        DynamicSettings: { find() {}, findOne() { const value = bindings.values['settings.canary']; return { _id: value.documentId, key: value.key, value: value.value }; } },
        document: { querySelectorAll() { return [{ template: state.template }]; } },
        Blaze: { getView(element) { return { name: `Template.${element.template}` }; } },
        async fetch(url) {
          const capability = issued.get(String(url)); assert(capability);
          if (capability.consumed && !options.replayAllowed) return new Response(null, { status: 404 });
          capability.consumed = true;
          const body = capability.history ? history : JSON.stringify({ schema: 'SecurityAuditReportV2', ...bindings.values['audit.report'] });
          return new Response(body, { status: 200, headers: { 'content-type': capability.history ? 'text/tab-separated-values' : 'application/json', 'x-content-sha256': digest(body) } });
        },
      });
      try { return await fn(args); }
      finally { for (const key of keys) { const descriptor = saved.get(key); if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
    }, async waitForFunction(fn, args) { assert.equal(await this.evaluate(fn, args), true, 'Synthetic browser wait must observe its specified condition'); } };
    pages.push(page); return page;
  } }; }, async close() { closed = true; } };
  return { bindings, browser, pages, closed: () => closed };
}
test('browser adapter executes all selected proof families with separate actor sessions and no retained private values', async () => {
  const value = fixture(), adapter = await createAuthorizationBrowserV2({ target: 'https://audit.example', bindings: value.bindings }, async () => value.browser);
  try {
    const result = await runSelectedAuthorizationV2(adapter); assert.equal(result.status, 'PASS'); assert.equal(value.pages.length, 6);
    const publicEvidence = JSON.stringify(result);
    for (const actor of Object.values(value.bindings.actors)) assert(!publicEvidence.includes(actor.password));
    assert(!publicEvidence.includes('https://'));
  } finally { await adapter.close(); }
  assert.equal(value.closed(), true);
});
test('browser adapter detects allowed forbidden routes, foreign progress and reusable download capabilities', async () => {
  for (const options of [{ allowedForbiddenRoute: true }, { leak: true }, { replayAllowed: true }, { allowForeignPerformance: true }]) {
    const value = fixture(options), adapter = await createAuthorizationBrowserV2({ target: 'https://audit.example', bindings: value.bindings }, async () => value.browser);
    try { assert.equal((await runSelectedAuthorizationV2(adapter)).status, 'FAIL'); }
    finally { await adapter.close(); }
  }
});
test('unreadable progress stores and mismatched fixture roles remain errors, never successful denials', async () => {
  for (const options of [{ unreadable: true }, { wrongActorRole: 'learnerA' }]) {
    const value = fixture(options), adapter = await createAuthorizationBrowserV2({ target: 'https://audit.example', bindings: value.bindings }, async () => value.browser);
    try { assert.equal((await runSelectedAuthorizationV2(adapter)).status, 'ERROR'); }
    finally { await adapter.close(); }
  }
});
test('acquisition closes its browser and refuses a successful result if cleanup fails', async () => {
  const value = fixture();
  const result = await acquireSelectedAuthorizationV2({ target: 'https://audit.example', bindings: value.bindings }, async () => value.browser);
  assert.equal(result.status, 'PASS'); assert.equal(value.closed(), true);
  const failed = fixture(); failed.browser.close = async () => { throw new Error('Synthetic cleanup failure'); };
  await assert.rejects(acquireSelectedAuthorizationV2({ target: 'https://audit.example', bindings: failed.bindings }, async () => failed.browser), /cleanup failure/);
});
test('cached sessions are rebound before each case so an expired actor cannot masquerade as a non-admin denial', async () => {
  const value = fixture({ expireLearnerB: true });
  const result = await acquireSelectedAuthorizationV2({ target: 'https://audit.example', bindings: value.bindings }, async () => value.browser);
  assert.equal(result.status, 'ERROR');
  assert.equal(result.results.find(row => row.verificationId === 'authz.method.audit-list.learnerB').outcome, 'DOMAIN_REJECTION');
  assert.equal(value.closed(), true);
});
