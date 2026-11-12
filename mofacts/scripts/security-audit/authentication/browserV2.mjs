import { auditTargetOrigin } from '../../../common/securityAudit/reportV2.ts';
import { parseAuthorizationBindingsV2, parseAuthorizationActorBindingV2 } from './bindingsV2.mjs';
import { auditVerification, AUTHORIZATION_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { runSelectedAuthorizationV2 } from './selectedCasesV2.mjs';

const targetMatched = (page, origin) => new URL(page.url()).origin === origin;

export async function validateAuthorizationActorPageV2(page, target, actor, userId) {
  const origin = auditTargetOrigin(target);
  if (!AUTHORIZATION_VERIFICATIONS.some(row => row.actor === actor)) throw new Error('Invalid authorization actor');
  if (!targetMatched(page, origin)) return 'domain-error';
  return page.evaluate(({ userId, alias }) => {
    if (!globalThis.Meteor.status().connected) return 'transport-error';
    if (globalThis.Session.get('authReady') !== true) return 'inconclusive';
    if (globalThis.Meteor.userId() !== userId) return 'domain-error';
    if (alias === 'anonymous') return 'matched';
    if (globalThis.Session.get('authRolesHydrated') !== true || globalThis.Session.get('authRolesSyncedUserId') !== userId) return 'inconclusive';
    const roles = globalThis.Session.get('authRoles');
    if (!roles || typeof roles.admin !== 'boolean' || typeof roles.teacher !== 'boolean') return 'inconclusive';
    const matched = alias === 'admin' ? roles.admin : alias.startsWith('teacher') ? roles.teacher && !roles.admin : !roles.admin && !roles.teacher;
    return matched ? 'matched' : 'domain-error';
  }, { userId, alias: actor });
}

// Shared private-session owner for selected cases and fixture preparation.
// Callers own closing its context/browser. This is inert until explicitly used.
export async function openAuthorizationActorPageV2({ browser, target, actor, binding }) {
  const origin = auditTargetOrigin(target);
  if (!AUTHORIZATION_VERIFICATIONS.some(row => row.actor === actor)) throw new Error('Invalid authorization actor');
  const user = actor === 'anonymous' ? undefined : parseAuthorizationActorBindingV2(binding);
  if (actor === 'anonymous' && binding !== undefined) throw new Error('Anonymous actor has credentials');
  const context = await browser.newContext(), page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  if (!targetMatched(page, origin)) return { state: 'domain-error', context };
  await page.waitForFunction(() => globalThis.Meteor?.status?.().connected === true);
  if (user) {
    const loggedIn = await page.evaluate(({ username, password }) => new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 10000);
      globalThis.Meteor.loginWithPassword(username, password, error => { clearTimeout(timer); resolve(!error); });
    }), { username: user.username, password: user.password });
    if (!loggedIn) return { state: 'domain-error', context };
    await page.waitForFunction(() => globalThis.Session?.get('authReady') === true
      && globalThis.Session.get('authRolesHydrated') === true
      && globalThis.Session.get('authRolesSyncedUserId') === globalThis.Meteor.userId());
  } else {
    await page.waitForFunction(() => globalThis.Session?.get('authReady') === true);
  }
  return { page, context };
}

// Explicit live acquisition only. Importing launches no browser and reads no
// credentials. The protected environment owns target approval and bindings.
export async function createAuthorizationBrowserV2({ target, bindings }, launch) {
  const origin = auditTargetOrigin(target), config = parseAuthorizationBindingsV2(bindings);
  const browser = await (launch ?? (async () => (await import('playwright')).chromium.launch({ headless: true })))();
  const sessions = new Map(), capabilities = new Map();
  async function session(actor) {
    if (!sessions.has(actor)) sessions.set(actor, openAuthorizationActorPageV2({ browser, target: origin, actor,
      ...(actor === 'anonymous' ? {} : { binding: config.actors[actor] }) }));
    const active = await sessions.get(actor); if (!active.page) return { state: active.state };
    const binding = await validateAuthorizationActorPageV2(active.page, origin, actor,
      actor === 'anonymous' ? null : config.actors[actor].userId);
    return binding === 'matched' ? active : { state: binding };
  }
  async function invoke(page, name, args, proof) {
    return page.evaluate(({ name, args, proof }) => new Promise(resolve => {
      if (!globalThis.Meteor.status().connected) { resolve({ state: 'transport-error' }); return; }
      const timer = setTimeout(() => resolve({ state: 'transport-error' }), 10000);
      globalThis.Meteor.call(name, ...args, (error, value) => {
        clearTimeout(timer);
        if (globalThis.Meteor.userId() !== proof.actorId) { resolve({ state: 'inconclusive' }); return; }
        if (error) {
          const code = String(error.error ?? error.code ?? 'unknown-error');
          resolve({ state: 'rejected', code: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(code) ? code : 'unknown-error' }); return;
        }
        let matched = false;
        if (proof.shape === 'own-settings-v1') matched = value && Object.keys(value).sort().join(',') === 'hasOpenRouterKey,model,reasoningLevel'
          && typeof value.model === 'string' && value.model.length <= 256 && typeof value.reasoningLevel === 'string'
          && value.reasoningLevel.length <= 32 && typeof value.hasOpenRouterKey === 'boolean';
        if (proof.shape === 'self-performance-v1') matched = value && Object.keys(proof.expected).every(key => value[key] === proof.expected[key])
          && Object.keys(value).sort().join(',') === Object.keys(proof.expected).sort().join(',');
        if (proof.shape === 'audit-summary-v2') matched = value && Object.keys(value).sort().join(',') === 'latestExposure,latestFull,reports'
          && Array.isArray(value.reports) && value.reports.length <= 200
          && value.reports.every(row => row.schema === 'SecurityAuditReportV2' && typeof row.reportId === 'string');
        resolve({ state: 'returned', allowedObservationMatched: Boolean(matched) });
      });
    }), { name, args, proof });
  }
  return {
    async method(entry) {
      const active = await session(entry.actor); if (!active.page) return active;
      const name = entry.surfaceId.slice('method:'.length), args = entry.proofShape === 'self-performance-v1'
        ? [config.actors[entry.subjectActor].userId, config.values['lesson.progress'], null] : [];
      return invoke(active.page, name, args, { shape: entry.proofShape,
        actorId: entry.actor === 'anonymous' ? null : config.actors[entry.actor].userId,
        ...(entry.proofShape === 'self-performance-v1'
          ? { expected: config.values['performance.learnerB'] } : {}) });
    },
    async publication(entry) {
      const active = await session(entry.actor); if (!active.page) return active;
      const settings = entry.proofShape === 'settings-snapshot-v1';
      return active.page.evaluate(({ name, settings, lesson, actorId, ownId, canary }) => new Promise(resolve => {
        let handle, settled = false;
        const finish = result => {
          if (settled) return; settled = true; clearTimeout(timer);
          try { handle?.stop(); } catch { resolve({ state: 'transport-error' }); return; }
          resolve(result);
        };
        const timer = setTimeout(() => finish({ state: 'transport-error' }), 10000);
        handle = globalThis.Meteor.subscribe(name, ...(settings ? [] : [lesson]), {
          onError: () => finish({ state: 'domain-error' }),
          onReady: () => queueMicrotask(() => {
            try {
              const collection = settings ? globalThis.DynamicSettings : globalThis.GlobalExperimentStates;
              if (!collection || typeof collection.find !== 'function') { finish({ state: 'inconclusive' }); return; }
              const docs = settings ? [collection.findOne({ _id: canary.documentId })].filter(Boolean) : collection.find({}, { limit: 129 }).fetch();
              if (docs.length > 128) { finish({ state: 'inconclusive' }); return; }
              if (!settings && docs.some(doc => typeof doc.userId !== 'string' || typeof doc.TDFId !== 'string')) {
                finish({ state: 'inconclusive' }); return;
              }
              const ownObserved = settings ? docs.some(doc => doc._id === canary.documentId && doc.key === canary.key && doc.value === canary.value)
                : docs.some(doc => doc._id === ownId && doc.userId === actorId && doc.TDFId === lesson);
              finish({ ready: true, readable: true, bindingMatched: globalThis.Meteor.userId() === actorId,
                ownObserved, foreignObserved: !settings && docs.some(doc => doc.userId !== actorId), anonymous: actorId === null });
            } catch { finish({ state: 'inconclusive' }); }
          }),
        });
      }), { name: entry.surfaceId.slice('publication:'.length), settings,
        lesson: config.values['lesson.progress'], actorId: entry.actor === 'anonymous' ? null : config.actors[entry.actor].userId,
        ownId: settings || entry.actor === 'anonymous' ? null : config.values[`progress.${entry.actor}`],
        canary: settings ? config.values['settings.canary'] : null });
    },
    async route(entry) {
      const active = await session(entry.actor); if (!active.page) return active;
      const requestedPath = entry.surfaceId.slice('management-route:'.length);
      const requestedTemplate = entry.expectedPolicy === 'allow' ? entry.template : auditVerification(entry.allowedBaselineIds[0]).template;
      await active.page.goto(new URL(requestedPath, origin).href, { waitUntil: 'domcontentloaded' });
      if (!targetMatched(active.page, origin)) return { state: 'domain-error' };
      await active.page.waitForFunction(({ path, template, requestedPath, requestedTemplate }) => {
        if (globalThis.Session?.get('authReady') !== true) return false;
        const elements = document.querySelectorAll('body *'); if (elements.length > 20000) return false;
        for (const element of elements) {
          const view = globalThis.Blaze?.getView(element);
          if (location.pathname === path && view?.name === `Template.${template}`
            || location.pathname === requestedPath && view?.name === `Template.${requestedTemplate}`) return true;
        }
        return false;
      }, { path: entry.expectedPath, template: entry.template, requestedPath, requestedTemplate });
      return active.page.evaluate(({ expectedPath, template, requestedPath, requestedTemplate, actorId, expectedPolicy }) => {
        const elements = [...document.querySelectorAll('body *')];
        const rendered = elements.length <= 20000 && elements.some(element => globalThis.Blaze?.getView(element)?.name === `Template.${template}`);
        const requested = elements.length <= 20000 && elements.some(element => globalThis.Blaze?.getView(element)?.name === `Template.${requestedTemplate}`);
        const matched = location.pathname === expectedPath && rendered;
        return { authReady: globalThis.Session.get('authReady') === true, connected: globalThis.Meteor.status().connected,
          identityMatched: globalThis.Meteor.userId() === actorId,
          requestedRendered: location.pathname === requestedPath && requested,
          deniedRendered: expectedPolicy === 'deny' && matched };
      }, { expectedPath: entry.expectedPath, template: entry.template, requestedPath, requestedTemplate,
        actorId: entry.actor === 'anonymous' ? null : config.actors[entry.actor].userId, expectedPolicy: entry.expectedPolicy });
    },
    async download(entry, baselines) {
      const active = await session(entry.actor); if (!active.page) return active;
      if (entry.expectedPolicy === 'deny') {
        const baseline = baselines[0], capability = baseline && capabilities.get(baseline.verificationId);
        if (!baseline?.passed || !capability) return { state: 'inconclusive' };
        const status = await active.page.evaluate(async url => (await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) })).status, capability.url);
        return { baselineVerified: true, sameCapability: true, status };
      }
      const history = entry.surfaceId === 'http:/data-download/own-history';
      const result = await active.page.evaluate(async ({ history, report, expectedHash }) => {
        const method = history ? 'downloadOwnHistoryAcrossTdfs' : 'admin.securityAudits.downloadToken';
        let issued;
        let timer;
        try {
          const result = await Promise.race([
            globalThis.Meteor.callAsync(method, ...(history ? [] : [report.reportId, 'json'])).then(value => ({ value })),
            new Promise(resolve => { timer = setTimeout(() => resolve({ timeout: true }), 10000); }),
          ]);
          if (result.timeout) return { state: 'transport-error' };
          issued = result.value;
        }
        catch { return { state: 'domain-error' }; }
        finally { clearTimeout(timer); }
        const url = new URL(history ? issued.downloadUrl : issued.url, location.origin);
        const prefix = history ? '/data-download/own-history/' : '/admin/security-audits/download/';
        if (url.origin !== location.origin || !url.pathname.startsWith(prefix) || url.search || url.hash) return { state: 'inconclusive' };
        const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
        if (response.status !== 200) return { state: 'domain-error' };
        const reader = response.body.getReader(), chunks = []; let size = 0;
        try {
          while (true) {
            const part = await reader.read(); if (part.done) break;
            size += part.value.length; if (size > 2097152) { await reader.cancel(); return { state: 'inconclusive' }; }
            chunks.push(part.value);
          }
        } finally { reader.releaseLock(); }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
        let matched;
        if (history) matched = hash === expectedHash && response.headers.get('content-type')?.startsWith('text/tab-separated-values');
        else {
          const value = JSON.parse(new TextDecoder().decode(bytes));
          matched = value.schema === 'SecurityAuditReportV2' && value.reportId === report.reportId && value.digestSha256 === report.digestSha256
            && response.headers.get('x-content-sha256') === hash;
        }
        return { allowedObservationMatched: Boolean(matched), url: url.href };
      }, { history, report: history ? null : config.values['audit.report'], expectedHash: history ? config.values['history.learnerA'].sha256 : null });
      if (result.allowedObservationMatched === true && typeof result.url === 'string') {
        capabilities.set(entry.verificationId, { url: result.url }); return { allowedObservationMatched: true };
      }
      return result.state ? { state: result.state } : { allowedObservationMatched: false };
    },
    async close() { capabilities.clear(); sessions.clear(); await browser.close(); },
  };
}

// Acquisition owns cleanup. No result can be published as successful if closing
// its private browser fails; the enclosing producer must report that failure.
export async function acquireSelectedAuthorizationV2(options, launch) {
  const adapter = await createAuthorizationBrowserV2(options, launch);
  try { return await runSelectedAuthorizationV2(adapter); }
  finally { await adapter.close(); }
}
