import { PASSWORDLESS_PROTOCOL_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { evaluatePasswordlessProtocol } from '../../../common/securityAudit/passwordlessProtocol.ts';
import { proofBoolean, proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { fixtureNamespaceV2 } from './stagingFixturesV2.mjs';
import { parseAuthorizationActorBindingV2 } from './bindingsV2.mjs';
import { openAuthorizationActorPageV2, validateAuthorizationActorPageV2 } from './browserV2.mjs';
import { observeAuthenticationMaterialV2 } from './materialV2.mjs';

const invalid = () => { throw new Error('Passwordless browser observation is invalid'); };
const origin = 'https://staging2.optimallearning.org';
const prefix = 'authn.passwordless.';
const definition = id => PASSWORDLESS_PROTOCOL_VERIFICATIONS.find(row => row.verificationId === prefix + id);
const predicate = value => ({ state: 'observed', value });
const returned = value => ({ state: 'returned', allowedObservationMatched: value });

// Progress is an allowed credential in the laboratory workflow. A missing flag
// is not a violation; a missing/unreadable owned progress canary is not proof.
export function passwordlessEligibilityV2(value) {
  const row = proofRecord(value, ['identityMatched', 'explicitExperiment', 'ownedProgressVerified']);
  const identity = proofBoolean(row.identityMatched), flag = proofBoolean(row.explicitExperiment), progress = proofBoolean(row.ownedProgressVerified);
  return identity && (flag || progress);
}

// Only the exact same-origin native resume handoff is excluded from unintended
// HTTP disclosure. Unexpected keys/paths/origins remain fully scanned.
export function redactExpectedResumeBodyV2({ target, url, body, token }) {
  if (typeof body !== 'string' || typeof token !== 'string' || token.length < 8 || token.length > 512) invalid();
  let parsedUrl, frames;
  try { parsedUrl = new URL(url); frames = JSON.parse(body); } catch { return body; }
  if (target !== origin || parsedUrl.origin !== target || !/^\/sockjs\/[A-Za-z0-9_/-]+\/xhr_send$/.test(parsedUrl.pathname)
      || !Array.isArray(frames) || frames.length > 32) return body;
  return JSON.stringify(frames.map(frame => {
    if (typeof frame !== 'string') return frame;
    try {
      const row = JSON.parse(frame);
      if (Object.keys(row).sort().join(',') !== 'id,method,msg,params' || row.msg !== 'method' || row.method !== 'login'
          || typeof row.id !== 'string' || !Array.isArray(row.params) || row.params.length !== 1
          || Object.keys(row.params[0]).join(',') !== 'resume' || row.params[0].resume !== token) return frame;
      return JSON.stringify({ ...row, params: [{ resume: '[expected-own-session-handoff]' }] });
    } catch { return frame; }
  }));
}

export function captureDisclosureChannelsV2(context) {
  const values = { dom: [], url: [], cookies: [], console: [], requests: [] }, pending = new Set(), requests = [];
  let complete = true, count = 0, bytes = 0, finished = false;
  function append(channel, value) {
    if (finished) return;
    if (typeof value !== 'string' || Buffer.byteLength(value) > 65536 || ++count > 1000
        || (bytes += Buffer.byteLength(value)) > 4 * 1024 * 1024) { complete = false; return; }
    values[channel].push(value);
  }
  function track(work) {
    if (finished) return;
    if (pending.size >= 1000) { complete = false; return; }
    const task = Promise.resolve().then(work).catch(() => { complete = false; }).finally(() => pending.delete(task));
    pending.add(task);
  }
  context.on('page', page => page.on('console', message => track(async () => {
    append('console', message.text()); const args = message.args(); if (args.length > 16) { complete = false; return; }
    for (const arg of args) { const value = await arg.jsonValue(); append('console', JSON.stringify(value) ?? String(value)); }
  })));
  context.on('request', request => track(async () => {
    append('requests', request.url()); append('requests', JSON.stringify(await request.allHeaders()));
    const body = request.postData();
    if (body !== null) { if (Buffer.byteLength(body) > 65536 || requests.length >= 1000
      || (bytes += Buffer.byteLength(body)) > 4 * 1024 * 1024) complete = false; else requests.push({ url: request.url(), body }); }
  }));
  return {
    async snapshot(page) { append('url', page.url()); append('dom', await page.locator('body').innerText());
      append('cookies', JSON.stringify(await context.cookies())); },
    async finish(token) {
      let timer;
      try { await Promise.race([Promise.all([...pending]), new Promise(resolve => { timer = setTimeout(resolve, 5000); })]); }
      finally { clearTimeout(timer); }
      if (pending.size) complete = false;
      for (const request of requests) append('requests', redactExpectedResumeBodyV2({ target: origin, ...request, token }));
      finished = true;
      return Object.fromEntries(Object.entries(values).map(([name, rows]) => [name, { installed: true, complete, values: [...rows] }]));
    },
  };
}

// Fixture/host lease ownership stays with the caller. Importing acquires no
// browser, provider access or credentials. Every context created here is closed.
export async function capturePasswordlessBrowserV2({ browser, target, namespace, admin, learner, participant, values, requireLease }) {
  fixtureNamespaceV2(namespace); if (target !== origin) invalid();
  if (typeof requireLease !== 'function' || await requireLease() !== true) invalid();
  const operator = parseAuthorizationActorBindingV2(admin), foreign = parseAuthorizationActorBindingV2(learner);
  proofRecord(participant, ['userId', 'username']);
  if (foreign.username !== `${namespace}-learnerb@localhost.invalid` || participant.userId !== `${namespace}-participant`
      || participant.username !== `AUDIT_${namespace.slice(-12).toUpperCase()}`
      || new Set([operator.userId, foreign.userId, participant.userId]).size !== 3) invalid();
  proofRecord(values, ['lesson.progress', 'progress.learnerB', 'performance.learnerB', 'passwordless.experimentTarget',
    'passwordless.otherExperimentTarget', 'passwordless.participantId', 'passwordless.ownProgress']);
  if (values['lesson.progress'] !== `${namespace}-lesson` || values['progress.learnerB'] !== `${namespace}-progress-learnerB`
      || values['passwordless.ownProgress'] !== `${namespace}-passwordless-progress`
      || values['passwordless.experimentTarget'] !== `${namespace}-target-a`
      || values['passwordless.otherExperimentTarget'] !== `${namespace}-target-b`
      || values['passwordless.participantId'] !== participant.username) invalid();
  const contexts = [], collectors = [], results = [];
  let token, eligibility, failure, progressReloadVerified = false, cleanupFailed = false;
  const owned = { async newContext() { const context = await browser.newContext(); contexts.push(context); return context; } };
  async function open(actor, binding, watch = false) {
    let collector;
    const owner = watch ? { async newContext() { const context = await owned.newContext(); collector = captureDisclosureChannelsV2(context); collectors.push(collector); return context; } } : owned;
    const row = await openAuthorizationActorPageV2({ browser: owner, target, actor, ...(binding ? { binding } : {}) });
    if (!row.page || row.state) throw new Error('Passwordless baseline unavailable'); return { ...row, collector };
  }
  async function call(page, name, args, actorId) {
    return page.evaluate(async ({ name, args, actorId, origin }) => {
      if (location.origin !== origin || !Meteor.status().connected || Meteor.userId() !== actorId) return { state: 'inconclusive' };
      let timer;
      try { return await Promise.race([Meteor.callAsync(name, ...args).then(value => ({ state: 'returned', value }),
        error => ({ state: 'rejected', code: String(error.error) })), new Promise(resolve => { timer = setTimeout(() => resolve({ state: 'transport-error' }), 12000); })]); }
      finally { clearTimeout(timer); }
    }, { name, args, actorId, origin });
  }
  const record = (id, observation) => { if (!definition(id)) invalid(); results.push({ verificationId: prefix + id, observation }); };
  function method(id, row, matches) { record(id, row.state === 'returned' ? returned(matches(row.value)) : row); }
  const settings = value => typeof value?.model === 'string' && typeof value.reasoningLevel === 'string' && typeof value.hasOpenRouterKey === 'boolean';
  const summary = value => value && Array.isArray(value.reports) && Object.hasOwn(value, 'latestExposure') && Object.hasOwn(value, 'latestFull');
  const performance = value => value && Object.entries(values['performance.learnerB']).every(([key, expected]) => value[key] === expected)
    && Object.keys(value).sort().join(',') === Object.keys(values['performance.learnerB']).sort().join(',');
  const tdf = (value, id, target) => value?._id === id && value.content?.tdfs?.tutor?.setspec?.experimentTarget === target && Array.isArray(value.content?.tdfs?.tutor?.unit);
  async function progress(page, actorId) {
    return page.evaluate(async ({ actorId, lesson, own, other }) => {
      if (!Meteor.status().connected || Meteor.userId() !== actorId) return { state: 'inconclusive' };
      let handle, timer;
      try { await new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('bounded-publication-timeout')), 12000);
        handle = Meteor.subscribe('userExperimentState', lesson, { onReady: resolve, onError: reject }); });
        if (!globalThis.GlobalExperimentStates?.findOne) return { state: 'inconclusive' };
        const row = GlobalExperimentStates.findOne({ _id: own });
        return { state: 'observed', own: row?.userId === actorId && row?.TDFId === lesson,
          foreign: Boolean(GlobalExperimentStates.findOne({ _id: other })), progress: row?.experimentState ?? null };
      } catch { return { state: 'inconclusive' }; } finally { clearTimeout(timer); handle?.stop(); }
    }, { actorId, lesson: values['lesson.progress'], own: actorId === participant.userId ? values['passwordless.ownProgress'] : values['progress.learnerB'],
      other: actorId === participant.userId ? values['progress.learnerB'] : values['passwordless.ownProgress'] });
  }
  try {
    const operatorPage = (await open('admin', operator)).page, learnerPage = (await open('learnerB', foreign)).page;
    if (await validateAuthorizationActorPageV2(operatorPage, target, 'admin', operator.userId) !== 'matched'
        || await validateAuthorizationActorPageV2(learnerPage, target, 'learnerB', foreign.userId) !== 'matched') invalid();
    method('baseline.admin', await call(operatorPage, 'admin.securityAudits.list', [], operator.userId), summary);
    method('baseline.ordinary', await call(learnerPage, 'getOwnOpenRouterSettings', [], foreign.userId), settings);
    method('baseline.foreign-performance', await call(learnerPage, 'getStudentPerformanceByIdAndTDFIdFromHistory', [foreign.userId, values['lesson.progress'], null], foreign.userId), performance);
    const foreignProgress = await progress(learnerPage, foreign.userId);
    record('baseline.publication', foreignProgress.state === 'observed' && foreignProgress.own && !foreignProgress.foreign ? predicate(true) : { state: 'inconclusive' });
    const other = await call(operatorPage, 'getTdfByExperimentTarget', [values['passwordless.otherExperimentTarget']], operator.userId);
    record('baseline.other-target', other.state === 'returned' && tdf(other.value, `${namespace}-other-lesson`, values['passwordless.otherExperimentTarget']) ? predicate(true) : { state: 'inconclusive' });
    const anonymous = await open('anonymous', undefined, true);
    if (await requireLease() !== true) invalid();
    const issued = await call(anonymous.page, 'provisionExperimentUser', [values['passwordless.experimentTarget'], participant.username], null);
    if (issued.state !== 'returned' || issued.value?.userId !== participant.userId || issued.value?.userExists !== true
        || typeof issued.value.loginToken !== 'string' || issued.value.loginToken.length < 8 || issued.value.loginToken.length > 512) throw new Error('Owned participant resume unavailable');
    token = issued.value.loginToken; record('resume-token-issued', predicate(true));
    const active = await open('anonymous', undefined, true);
    const loggedIn = await active.page.evaluate(({ token, userId }) => new Promise(resolve => { const timer = setTimeout(() => resolve(false), 12000);
      Meteor.loginWithToken(token, error => { clearTimeout(timer); resolve(!error && Meteor.userId() === userId); }); }), { token, userId: participant.userId });
    record('token-login', predicate(loggedIn)); if (!loggedIn) throw new Error('Owned participant session unavailable');
    await active.page.waitForFunction(id => Session.get('authRolesHydrated') === true && Session.get('authRolesSyncedUserId') === id, participant.userId);
    const identity = await active.page.evaluate(() => ({ id: Meteor.userId(), profile: Meteor.user()?.profile,
      roles: Session.get('authRoles') }));
    if (identity.roles?.admin !== false || identity.roles?.teacher !== false) invalid();
    record('participant-identity', predicate(identity.id === participant.userId));
    const before = await progress(active.page, participant.userId);
    eligibility = { identityMatched: identity.id === participant.userId, explicitExperiment: identity.profile?.experiment === true || identity.profile?.experiment === 'true',
      ownedProgressVerified: before.state === 'observed' && before.own && !before.foreign && before.progress !== null };
    record('experiment-flag', predicate(passwordlessEligibilityV2(eligibility)));
    record('sealed-target-binding', predicate(identity.profile?.experimentTarget === values['passwordless.experimentTarget']));
    method('modified-target-rejected', await call(anonymous.page, 'provisionExperimentUser', [values['passwordless.otherExperimentTarget'], participant.username], null), value => typeof value?.loginToken === 'string');
    method('admin-denied', await call(active.page, 'admin.securityAudits.list', [], participant.userId), summary);
    method('ordinary-account-denied', await call(active.page, 'getOwnOpenRouterSettings', [], participant.userId), settings);
    const assigned = await call(active.page, 'getTdfByExperimentTarget', [values['passwordless.experimentTarget']], participant.userId);
    record('assigned-experiment-allowed', assigned.state === 'returned' && tdf(assigned.value, values['lesson.progress'], values['passwordless.experimentTarget']) ? predicate(true) : { state: 'inconclusive' });
    method('cross-user-method-denied', await call(active.page, 'getStudentPerformanceByIdAndTDFIdFromHistory', [foreign.userId, values['lesson.progress'], null], participant.userId), performance);
    record('cross-user-publication-contained', before.state === 'observed' && before.own ? predicate(!before.foreign) : { state: 'inconclusive' });
    await active.collector.snapshot(active.page);
    await active.page.reload({ waitUntil: 'domcontentloaded' });
    await active.page.waitForFunction(id => Meteor.userId() === id && Meteor.status().connected, participant.userId);
    const restored = await progress(active.page, participant.userId);
    if (restored.state !== 'observed' || !restored.own || restored.foreign || JSON.stringify(restored.progress) !== JSON.stringify(before.progress)) throw new Error('Progress resume unavailable');
    progressReloadVerified = true;
    await active.collector.snapshot(active.page); await anonymous.collector.snapshot(anonymous.page);
  } catch { failure = new Error('Passwordless acquisition incomplete; no successful policy denial is claimed'); }
  finally {
    for (const context of contexts) {
      for (const page of context.pages()) { try { await page.evaluate(() => new Promise(resolve => { const timer = setTimeout(() => resolve(false), 12000);
        Meteor.logout(error => { clearTimeout(timer); resolve(!error); }); })).then(ok => { if (!ok) cleanupFailed = true; }); } catch { cleanupFailed = true; } }
      try { await context.close(); } catch { cleanupFailed = true; }
    }
  }
  if (cleanupFailed) throw new Error('Passwordless context/session cleanup unverified');
  if (await requireLease() !== true) invalid();
  if (!token || results.length === 0) throw failure ?? new Error('Passwordless acquisition unavailable');
  const channels = await Promise.all(collectors.map(collector => collector.finish(token)));
  const combined = Object.fromEntries(['dom', 'url', 'cookies', 'console', 'requests'].map(name => [name, {
    installed: channels.length === 2, complete: channels.every(channel => channel[name].complete), values: channels.flatMap(channel => channel[name].values),
  }]));
  const material = observeAuthenticationMaterialV2({ baselineVerified: !failure, channels: combined, canaries: [token] });
  record('token-not-leaked', material.status === 'ERROR' ? { state: 'inconclusive' } : predicate(material.status === 'PASS'));
  const observation = { bindingsVerified: true, environmentLeaseHeld: true, results };
  return { observation, result: evaluatePasswordlessProtocol(observation), eligibility: eligibility ?? null,
    progressReloadVerified, acquisitionComplete: !failure, reportQualification: 'requires-next-catalog-eligibility-title', material };
}
