import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { control, errorControl, runCommand, section, writeJsonFile } from './audit-lib.mjs';

const outputPath = process.argv[2];
if (!outputPath) throw new Error('output path is required');
const target = process.env.AUDIT_TARGET || 'https://mofacts.optimallearning.org';
const controls = [];
let config;
try {
  config = JSON.parse(process.env.AUDIT_AUTH_FIXTURES_JSON || '');
} catch {
  config = null;
}

const requiredUsers = ['learnerA', 'learnerB', 'teacherA', 'teacherB', 'admin', 'reset', 'expiry', 'lockout'];
const configuredProbeActors = new Set([
  ...(config?.authorizationProbes || []), ...(config?.publicationProbes || []),
  ...(config?.routeProbes || []), ...(config?.downloadProbes || []),
].map((probe) => probe.actor));
const configReady = config && requiredUsers.every((name) => config.users?.[name]?.username && config.users?.[name]?.password)
  && config.users.reset.newPassword
  && config.passwordless?.experimentTarget && config.passwordless?.otherExperimentTarget
  && config.passwordless?.participantId
  && Array.isArray(config.authorizationProbes) && config.authorizationProbes.length > 0
  && Array.isArray(config.publicationProbes) && config.publicationProbes.length > 0
  && Array.isArray(config.routeProbes) && config.routeProbes.length > 0
  && Array.isArray(config.downloadProbes) && config.downloadProbes.length > 0
  && ['anonymous', 'learnerA', 'learnerB', 'teacherA', 'teacherB', 'admin'].every((actor) => configuredProbeActors.has(actor))
  && Array.isArray(config.connectionThrottleIdentifiers) && config.connectionThrottleIdentifiers.length >= 12
  && Array.isArray(config.ipThrottleIdentifiers) && config.ipThrottleIdentifiers.length >= 21
  && config.imaps?.host && config.imaps?.username && process.env.AUDIT_IMAPS_PASSWORD;

if (!configReady) {
  const ids = [
    ['authentication.enumeration', 'Login and reset responses resist account enumeration'],
    ['authentication.timing', 'Authentication timing resists account enumeration'],
    ['authentication.reset-token', 'Reset tokens expire and are one-time'],
    ['authentication.session-revocation', 'Logout and password reset revoke sessions'],
    ['authentication.session-lifetime', 'Sessions expire within 30 days'],
    ['authentication.material-leakage', 'Authentication material does not enter client-observable channels'],
    ['authentication.authorization', 'Anonymous and cross-user authorization is enforced'],
    ['authentication.passwordless-containment', 'Passwordless experiment sessions remain bound to their authorized target'],
    ['authentication.throttling', 'Login throttles cover connection, identifier, and IP'],
  ];
  for (const [id, title] of ids) controls.push(errorControl(id, title, 'The protected synthetic fixture or IMAPS configuration is incomplete'));
  await writeJsonFile(outputPath, section('authentication', controls));
  process.exit(0);
}

const browser = await chromium.launch({ headless: true });
const observed = [];

async function newPage() {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (message) => observed.push(message.text()));
  page.on('request', (request) => {
    observed.push(request.url());
    if (request.postData()) observed.push(request.postData());
  });
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.Meteor?.status?.().connected === true, null, { timeout: 30000 });
  return { context, page };
}

async function callMethod(page, name, args = []) {
  return await page.evaluate(async ({ methodName, methodArgs }) => {
    try {
      const value = await globalThis.Meteor.callAsync(methodName, ...methodArgs);
      return { ok: true, value };
    } catch (error) {
      return { ok: false, code: String(error?.error || error?.code || 'error') };
    }
  }, { methodName: name, methodArgs: args });
}

async function login(page, username, password) {
  return await page.evaluate(({ loginName, loginPassword }) => new Promise((resolve) => {
    globalThis.Meteor.loginWithPassword(loginName, loginPassword, (error) => {
      resolve(error ? { ok: false, code: String(error.error || error.code || 'error') } : { ok: true });
    });
  }), { loginName: username, loginPassword: password });
}

async function loginWithToken(page, token) {
  return await page.evaluate((loginToken) => new Promise((resolve) => {
    globalThis.Meteor.loginWithToken(loginToken, (error) => resolve(error
      ? { ok: false, code: String(error?.error || error?.code || 'error') }
      : { ok: true }));
  }), token);
}

async function logout(page) {
  return await page.evaluate(() => new Promise((resolve) => globalThis.Meteor.logout((error) => resolve(!error))));
}

async function publicationProbe(page, name, args, canary) {
  return await page.evaluate(({ publicationName, publicationArgs, expectedCanary }) => new Promise((resolve) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      let payload = '';
      try {
        const stores = globalThis.Meteor.connection?._stores || {};
        payload = Object.values(stores).flatMap((store) => {
          const collection = store?._getCollection?.();
          return collection?.find?.().fetch?.().slice(0, 100) || [];
        }).map((doc) => JSON.stringify(doc)).join('\n');
      } catch { /* an unreadable client store cannot become evidence of leakage */ }
      resolve({ error: Boolean(error), leakedCanary: Boolean(expectedCanary && payload.includes(expectedCanary)) });
    };
    let subscription;
    subscription = globalThis.Meteor.subscribe(publicationName, ...publicationArgs, {
      onReady: () => { subscription?.stop(); finish(null); },
      onError: (error) => finish(error),
    });
    setTimeout(() => { subscription?.stop(); finish(new Error('timeout')); }, 10000);
  }), { publicationName: name, publicationArgs: args || [], expectedCanary: canary || '' });
}

async function imapMessages(recipient) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-imaps-'));
  const curlConfig = path.join(temporary, 'curl.conf');
  try {
    const escapedUser = String(config.imaps.username).replaceAll('"', '\\"');
    const escapedPassword = String(process.env.AUDIT_IMAPS_PASSWORD).replaceAll('"', '\\"');
    await fs.writeFile(curlConfig, `silent\nshow-error\nfail\nuser = "${escapedUser}:${escapedPassword}"\n`, { mode: 0o600 });
    const mailbox = encodeURIComponent(config.imaps.mailbox || 'INBOX');
    const search = await runCommand('curl', ['--config', curlConfig, '--url', `imaps://${config.imaps.host}/${mailbox}`, '-X', `SEARCH TO "${recipient}"`]);
    if (!search.ok) throw new Error('IMAPS search failed');
    const ids = (search.stdout.match(/\* SEARCH ([\d ]+)/)?.[1] || '').trim().split(/\s+/).filter(Boolean).slice(-4);
    const messages = [];
    for (const id of ids) {
      const fetchResult = await runCommand('curl', ['--config', curlConfig, '--url', `imaps://${config.imaps.host}/${mailbox};UID=${id}`]);
      if (fetchResult.ok) messages.push(fetchResult.stdout);
    }
    return messages;
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

function resetLinks(messages, recipient) {
  return messages.flatMap((message) => [...message.replace(/=\r?\n/g, '').replace(/=3D/gi, '=').matchAll(/https:\/\/[^\s<>]+\/auth\/reset-password\?[^\s<>]+/g)])
    .map((match) => match[0].replace(/&amp;/g, '&'))
    .map((value) => {
      try {
        const url = new URL(value);
        return url.searchParams.get('email') === recipient && url.searchParams.get('token')
          ? { email: recipient, token: url.searchParams.get('token') }
          : null;
      } catch { return null; }
    }).filter(Boolean);
}

function numberedProbeId(kind, index) {
  return `authorization.${kind}.${String(index + 1).padStart(3, '0')}`;
}

function outcomeObservation(probeId, passed, failureText) {
  return `${probeId}: ${passed ? 'PASS' : `FAIL - ${failureText}`}`;
}

try {
  const anonymous = await newPage();
  const existingLogin = [];
  const missingLogin = [];
  for (let index = 0; index < 3; index += 1) {
    let started = performance.now();
    const existing = await login(anonymous.page, config.users.expiry.username, `invalid-${index}`);
    existingLogin.push({ result: existing, elapsed: performance.now() - started });
    started = performance.now();
    const missing = await login(anonymous.page, `missing-${index}-${config.runNamespace}@audit.invalid`, `invalid-${index}`);
    missingLogin.push({ result: missing, elapsed: performance.now() - started });
  }
  let resetStarted = performance.now();
  const resetExisting = await callMethod(anonymous.page, 'requestPasswordReset', [config.users.reset.username]);
  const resetExistingElapsed = performance.now() - resetStarted;
  resetStarted = performance.now();
  const resetMissing = await callMethod(anonymous.page, 'requestPasswordReset', [`missing-reset-${config.runNamespace}@audit.invalid`]);
  const resetMissingElapsed = performance.now() - resetStarted;
  const sameLoginCode = existingLogin.every((entry, index) => entry.result.code === missingLogin[index].result.code);
  const sameResetShape = JSON.stringify(resetExisting) === JSON.stringify(resetMissing);
  controls.push(control('authentication.enumeration', 'Login and reset responses resist account enumeration',
    sameLoginCode && sameResetShape ? 'PASS' : 'FAIL', 'HIGH',
    sameLoginCode && sameResetShape ? 'Existing and nonexistent identifiers produced indistinguishable result shapes.' : 'Existing and nonexistent identifiers produced distinguishable results.'));
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const existingMedian = median(existingLogin.map((entry) => entry.elapsed));
  const missingMedian = median(missingLogin.map((entry) => entry.elapsed));
  const loginDifferential = Math.abs(existingMedian - missingMedian);
  const resetDifferential = Math.abs(resetExistingElapsed - resetMissingElapsed);
  const timingPass = loginDifferential <= Math.max(150, Math.min(existingMedian, missingMedian) * 0.5)
    && resetDifferential <= Math.max(250, Math.min(resetExistingElapsed, resetMissingElapsed) * 0.75);
  controls.push(control('authentication.timing', 'Authentication timing resists account enumeration', timingPass ? 'PASS' : 'FAIL', 'MEDIUM',
    timingPass ? 'Login and reset timing differentials stayed within the approved bounds.' : 'A login or reset timing differential exceeded the approved bound.',
    { metrics: { loginDifferentialMs: Math.round(loginDifferential), resetDifferentialMs: Math.round(resetDifferential), sampleCountPerIdentifier: 3 } }));

  const passwordProbe = await newPage();
  let resetCurrentPassword = config.users.reset.password;
  if (!(await login(passwordProbe.page, config.users.reset.username, resetCurrentPassword)).ok) {
    resetCurrentPassword = config.users.reset.newPassword;
  }
  await logout(passwordProbe.page);
  await passwordProbe.context.close();
  const resetNextPassword = resetCurrentPassword === config.users.reset.password
    ? config.users.reset.newPassword
    : config.users.reset.password;
  let resetRevocationPass = false;
  let resetRevocationError = '';

  const priorMessages = await imapMessages(config.users.reset.username);
  const priorLinks = resetLinks(priorMessages, config.users.reset.username);
  await callMethod(anonymous.page, 'requestPasswordReset', [config.users.reset.username]);
  let links = [];
  for (let attempt = 0; attempt < 6 && links.length <= priorLinks.length; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    links = resetLinks(await imapMessages(config.users.reset.username), config.users.reset.username);
  }
  const newest = links.at(-1);
  const prior = priorLinks.at(-1);
  if (!newest || !prior) {
    controls.push(errorControl('authentication.reset-token', 'Reset tokens expire and are one-time', 'The dedicated mailbox did not contain both prior-run and current reset links'));
    resetRevocationError = 'A current reset token was unavailable';
  } else {
    const expired = await callMethod(anonymous.page, 'resetPasswordWithToken', [prior.email, prior.token, resetNextPassword]);
    const sessionA = await newPage();
    const sessionB = await newPage();
    await login(sessionA.page, config.users.reset.username, resetCurrentPassword);
    await login(sessionB.page, config.users.reset.username, resetCurrentPassword);
    const reset = await callMethod(anonymous.page, 'resetPasswordWithToken', [newest.email, newest.token, resetNextPassword]);
    const replay = await callMethod(anonymous.page, 'resetPasswordWithToken', [newest.email, newest.token, resetCurrentPassword]);
    const resetOutcomes = [
      { id: 'reset.prior-run-rejected', passed: !expired.ok, failure: 'prior-run token was accepted' },
      { id: 'reset.current-single-use', passed: reset.ok, failure: 'current token was rejected on first use' },
      { id: 'reset.replay-rejected', passed: !replay.ok, failure: 'used token was accepted again' },
    ];
    const resetTokenPass = resetOutcomes.every((outcome) => outcome.passed);
    controls.push(control('authentication.reset-token', 'Reset tokens expire and are one-time',
      resetTokenPass ? 'PASS' : 'FAIL', 'CRITICAL',
      resetTokenPass ? 'Prior-run and replayed reset tokens were rejected; the current token worked once.' : 'One or more reset-token policy probes failed.',
      {
        observations: resetOutcomes.map((outcome) => outcomeObservation(outcome.id, outcome.passed, outcome.failure)),
        metrics: { probeCount: resetOutcomes.length, failedProbeCount: resetOutcomes.filter((outcome) => !outcome.passed).length },
      }));
    const revokedA = await callMethod(sessionA.page, 'getOwnOpenRouterSettings');
    const revokedB = await callMethod(sessionB.page, 'getOwnOpenRouterSettings');
    const oldPassword = await login(anonymous.page, config.users.reset.username, resetCurrentPassword);
    const newPassword = await login(anonymous.page, config.users.reset.username, resetNextPassword);
    await logout(anonymous.page);
    resetRevocationPass = !revokedA.ok && !revokedB.ok && !oldPassword.ok && newPassword.ok;
    await Promise.all([sessionA.context.close(), sessionB.context.close()]);
  }

  const expirySession = await newPage();
  const expiryLogin = await login(expirySession.page, config.users.expiry.username, config.users.expiry.password);
  const expirySessionStorage = expiryLogin.ok ? await expirySession.page.evaluate(() => ({
    token: sessionStorage.getItem('Meteor.loginToken'),
    userId: sessionStorage.getItem('Meteor.userId'),
    expiresAt: sessionStorage.getItem('Meteor.loginTokenExpires'),
  })) : { token: null, userId: null, expiresAt: null };
  const expiryValue = expirySessionStorage.expiresAt;
  const lifetimeDays = expiryValue ? (new Date(expiryValue).getTime() - Date.now()) / 86400000 : NaN;
  controls.push(control('authentication.session-lifetime', 'Sessions expire within 30 days',
    Number.isFinite(lifetimeDays) && lifetimeDays <= 30.05 ? 'PASS' : 'FAIL', 'HIGH',
    Number.isFinite(lifetimeDays) ? `Observed a maximum session lifetime of approximately ${Math.ceil(lifetimeDays)} days.` : 'Session expiration could not be read after login.',
    { metrics: { lifetimeDays: Number.isFinite(lifetimeDays) ? Math.ceil(lifetimeDays) : -1 } }));

  const authorizationFailures = [];
  const authorizationSessions = new Map();
  async function getAuthorizationSession(actorName) {
    if (authorizationSessions.has(actorName)) return authorizationSessions.get(actorName);
    const session = await newPage();
    if (actorName !== 'anonymous') {
      const actor = config.users[actorName];
      if (!actor || !(await login(session.page, actor.username, actor.password)).ok) {
        throw new Error('A configured authorization actor could not log in');
      }
    }
    authorizationSessions.set(actorName, session);
    return session;
  }
  for (const [index, probe] of config.authorizationProbes.entries()) {
    const probeSession = await getAuthorizationSession(probe.actor);
    const result = await callMethod(probeSession.page, probe.method, probe.args || []);
    const passed = probe.expectDenied ? !result.ok : result.ok;
    if (!passed) authorizationFailures.push(outcomeObservation(numberedProbeId('method', index), false,
      probe.expectDenied ? 'request was unexpectedly allowed' : 'request was unexpectedly denied'));
  }
  for (const [index, probe] of config.routeProbes.entries()) {
    const probeSession = await getAuthorizationSession(probe.actor);
    await probeSession.page.goto(new URL(probe.path, target).toString(), { waitUntil: 'domcontentloaded' });
    const denied = /(?:accessDenied|signIn|auth\/login)/i.test(probeSession.page.url());
    const passed = probe.expectDenied ? denied : !denied;
    if (!passed) authorizationFailures.push(outcomeObservation(numberedProbeId('route', index), false,
      probe.expectDenied ? 'route was unexpectedly accessible' : 'route was unexpectedly denied'));
  }
  for (const [index, probe] of config.publicationProbes.entries()) {
    const probeSession = await getAuthorizationSession(probe.actor);
    const result = await publicationProbe(probeSession.page, probe.publication, probe.args || [], probe.otherUserCanary);
    const passed = !result.leakedCanary && (!probe.expectError || result.error);
    if (!passed) authorizationFailures.push(outcomeObservation(numberedProbeId('publication', index), false,
      result.leakedCanary ? 'another user payload was observable' : 'publication was unexpectedly available'));
  }
  for (const [index, probe] of config.downloadProbes.entries()) {
    const probeSession = await getAuthorizationSession(probe.actor);
    const status = await probeSession.page.evaluate(async (pathValue) => {
      const response = await fetch(pathValue, { credentials: 'include', redirect: 'manual' });
      return response.status;
    }, probe.path);
    const passed = probe.expectDenied ? [401, 403, 404].includes(status) : status < 400;
    if (!passed) authorizationFailures.push(outcomeObservation(numberedProbeId('download', index), false,
      probe.expectDenied ? 'download was unexpectedly accessible' : 'download was unexpectedly denied'));
  }
  const authorizationProbeCount = config.authorizationProbes.length + config.publicationProbes.length
    + config.routeProbes.length + config.downloadProbes.length;
  const authorizationPass = authorizationFailures.length === 0;
  controls.push(control('authentication.authorization', 'Anonymous and cross-user authorization is enforced',
    authorizationPass ? 'PASS' : 'FAIL', 'CRITICAL',
    authorizationPass ? `All ${authorizationProbeCount} configured method, publication, route, and download probes matched policy.`
      : `${authorizationFailures.length} configured authorization probes violated policy.`,
    {
      observations: authorizationFailures,
      metrics: {
        probeCount: authorizationProbeCount,
        failedProbeCount: authorizationFailures.length,
        omittedFailureCount: Math.max(0, authorizationFailures.length - 12),
      },
    }));
  await Promise.all([...authorizationSessions.values()].map((session) => session.context.close()));

  const resume = await callMethod(anonymous.page, 'provisionExperimentUser', [
    config.passwordless.experimentTarget,
    config.passwordless.participantId,
  ]);
  if (!resume.ok) {
    controls.push(errorControl('authentication.passwordless-containment', 'Passwordless experiment sessions remain bound to their authorized target',
      `The passwordless re-provisioning probe failed with code ${resume.code}.`));
  } else {
    const issuedToken = typeof resume.value?.loginToken === 'string' ? resume.value.loginToken : '';
    const participant = await newPage();
    const tokenLogin = issuedToken ? await loginWithToken(participant.page, issuedToken) : { ok: false };
    if (tokenLogin.ok) {
      await participant.page.waitForFunction(
        (expectedTarget) => globalThis.Meteor.user?.()?.profile?.experimentTarget === expectedTarget,
        config.passwordless.experimentTarget,
        { timeout: 30000 },
      ).catch(() => {});
    }
    const participantIdentity = tokenLogin.ok ? await participant.page.evaluate(() => {
      const user = globalThis.Meteor.user?.();
      return {
        userId: globalThis.Meteor.userId?.() || null,
        experiment: user?.profile?.experiment,
        experimentTarget: user?.profile?.experimentTarget || null,
      };
    }) : { userId: null, experiment: null, experimentTarget: null };
    const mismatchedTarget = await callMethod(anonymous.page, 'provisionExperimentUser', [
      config.passwordless.otherExperimentTarget,
      config.passwordless.participantId,
    ]);
    const adminAccess = tokenLogin.ok
      ? await callMethod(participant.page, 'admin.securityAudits.list')
      : { ok: false };
    const ordinaryAccountAccess = tokenLogin.ok
      ? await callMethod(participant.page, 'getOwnOpenRouterSettings')
      : { ok: false };
    const assignedExperimentAccess = tokenLogin.ok
      ? await callMethod(participant.page, 'getTdfByExperimentTarget', [config.passwordless.experimentTarget])
      : { ok: false };
    const crossUserProbe = config.authorizationProbes.find((probe) =>
      probe.actor === 'learnerA' && probe.expectDenied && probe.method === 'getStudentPerformanceByIdAndTDFIdFromHistory');
    const crossUserAccess = tokenLogin.ok && crossUserProbe
      ? await callMethod(participant.page, crossUserProbe.method, crossUserProbe.args || [])
      : { ok: false };
    const otherUserPublicationProbe = config.publicationProbes.find((probe) =>
      probe.actor === 'learnerB' && probe.publication === 'userHistory');
    const otherUserPublication = tokenLogin.ok && otherUserPublicationProbe
      ? await publicationProbe(
        participant.page,
        otherUserPublicationProbe.publication,
        otherUserPublicationProbe.args || [],
        otherUserPublicationProbe.otherUserCanary,
      )
      : { leakedCanary: true };
    const participantText = await participant.page.locator('body').innerText().catch(() => '');
    const participantCookies = await participant.context.cookies();
    const tokenLeaked = issuedToken
      ? participantText.includes(issuedToken)
        || participant.page.url().includes(issuedToken)
        || participantCookies.some((cookie) => cookie.value.includes(issuedToken))
      : false;
    const containmentPass = Boolean(
      issuedToken
      && tokenLogin.ok
      && participantIdentity.userId === resume.value?.userId
      && (participantIdentity.experiment === true || participantIdentity.experiment === 'true')
      && participantIdentity.experimentTarget === config.passwordless.experimentTarget
      && !mismatchedTarget.ok
      && !adminAccess.ok
      && !ordinaryAccountAccess.ok
      && assignedExperimentAccess.ok
      && Boolean(assignedExperimentAccess.value)
      && Boolean(crossUserProbe)
      && !crossUserAccess.ok
      && Boolean(otherUserPublicationProbe)
      && !otherUserPublication.leakedCanary
      && !tokenLeaked,
    );
    controls.push(control('authentication.passwordless-containment', 'Passwordless experiment sessions remain bound to their authorized target',
      containmentPass ? 'PASS' : 'FAIL', 'CRITICAL',
      containmentPass
        ? 'Valid passwordless resume issued a session while modified-target, cross-user, admin, and token-leakage probes were denied.'
        : 'Passwordless resume or experiment-session containment did not match policy.',
      { metrics: { containmentProbeCount: 9 } }));
    await participant.context.close();
  }

  const pageContent = await expirySession.page.locator('body').innerText().catch(() => '');
  const cookies = await expirySession.context.cookies();
  const accountIdentifiers = requiredUsers.map((name) => config.users[name].username).filter(Boolean);
  const credentials = requiredUsers.map((name) => config.users[name].password)
    .concat([config.users.reset.newPassword, expirySessionStorage.token], config.canaries || []).filter(Boolean);
  const capturedMetadata = [...observed, ...cookies.flatMap((cookie) => [cookie.name, cookie.value])].join('\n');
  const allClientChannels = `${capturedMetadata}\n${pageContent}`;
  const leakCount = credentials.filter((value) => allClientChannels.includes(value)).length
    + accountIdentifiers.filter((value) => capturedMetadata.includes(value)).length;
  controls.push(control('authentication.material-leakage', 'Authentication material does not enter client-observable channels',
    leakCount === 0 ? 'PASS' : 'FAIL', 'CRITICAL',
    leakCount === 0 ? 'No configured credential or canary appeared in cookies, URLs, DOM, console, or captured request metadata.' : `${leakCount} configured sensitive canaries appeared in client-observable channels.`,
    { metrics: { leakCount } }));

  let logoutRevocationPass = false;
  let logoutRevocationError = '';
  let logoutClone;
  try {
    if (!expiryLogin.ok || !expirySessionStorage.token || !expirySessionStorage.userId) {
      throw new Error('The dedicated logout identity did not yield a clonable session');
    }
    logoutClone = await newPage();
    await logoutClone.page.evaluate((stored) => {
      sessionStorage.setItem('Meteor.loginToken', stored.token);
      sessionStorage.setItem('Meteor.userId', stored.userId);
      if (stored.expiresAt) sessionStorage.setItem('Meteor.loginTokenExpires', stored.expiresAt);
    }, expirySessionStorage);
    await logoutClone.page.reload({ waitUntil: 'domcontentloaded' });
    await logoutClone.page.waitForFunction(() => globalThis.Meteor?.userId?.() !== null, null, { timeout: 30000 });
    const beforeOriginal = await callMethod(expirySession.page, 'getOwnOpenRouterSettings');
    const beforeClone = await callMethod(logoutClone.page, 'getOwnOpenRouterSettings');
    await logout(expirySession.page);
    await logoutClone.page.reload({ waitUntil: 'domcontentloaded' });
    await logoutClone.page.waitForFunction(() => globalThis.Meteor?.status?.().connected === true, null, { timeout: 30000 });
    const afterOriginal = await callMethod(expirySession.page, 'getOwnOpenRouterSettings');
    const afterClone = await callMethod(logoutClone.page, 'getOwnOpenRouterSettings');
    logoutRevocationPass = beforeOriginal.ok && beforeClone.ok && !afterOriginal.ok && !afterClone.ok;
  } catch {
    logoutRevocationError = 'The two-context logout revocation probe did not complete';
  } finally {
    await logoutClone?.context.close();
  }
  if (resetRevocationError || logoutRevocationError) {
    controls.push(errorControl('authentication.session-revocation', 'Logout and password reset revoke sessions',
      resetRevocationError || logoutRevocationError));
  } else {
    controls.push(control('authentication.session-revocation', 'Logout and password reset revoke sessions',
      resetRevocationPass && logoutRevocationPass ? 'PASS' : 'FAIL', 'CRITICAL',
      'Tested password-reset revocation and cloned-session logout revocation in independent browser contexts.'));
  }
  await expirySession.context.close();

  // Brute-force checks deliberately run last so their state can affect only the lockout canary.
  const throttleSession = await newPage();
  const identifierResults = [];
  for (let index = 0; index < 10; index += 1) {
    const identifierSession = await newPage();
    identifierResults.push(await login(identifierSession.page, config.users.lockout.username, `invalid-lockout-${index}`));
    await identifierSession.context.close();
  }
  const identifierThrottled = identifierResults.some((result) => /too-many|thrott|lock/i.test(result.code || ''));
  let connectionThrottled = false;
  if (Array.isArray(config.connectionThrottleIdentifiers) && config.connectionThrottleIdentifiers.length >= 12) {
    for (const [index, identifier] of config.connectionThrottleIdentifiers.slice(0, 12).entries()) {
      const result = await login(throttleSession.page, identifier, `invalid-connection-${index}`);
      if (/too-many|thrott|lock/i.test(result.code || '')) connectionThrottled = true;
    }
  }
  let ipThrottled = false;
  if (Array.isArray(config.ipThrottleIdentifiers) && config.ipThrottleIdentifiers.length >= 21) {
    for (const [index, identifier] of config.ipThrottleIdentifiers.entries()) {
      const ipSession = await newPage();
      const result = await login(ipSession.page, identifier, `invalid-ip-${index}`);
      await ipSession.context.close();
      if (/too-many|thrott|lock/i.test(result.code || '')) ipThrottled = true;
    }
  }
  const throttleOutcomes = [
    { id: 'throttle.connection', passed: connectionThrottled, failure: 'connection limit was not observed' },
    { id: 'throttle.identifier', passed: identifierThrottled, failure: 'identifier limit was not observed' },
    { id: 'throttle.ip', passed: ipThrottled, failure: 'IP limit was not observed' },
  ];
  const throttlingPass = throttleOutcomes.every((outcome) => outcome.passed);
  controls.push(control('authentication.throttling', 'Login throttles cover connection, identifier, and IP',
    throttlingPass ? 'PASS' : 'FAIL', 'CRITICAL',
    throttlingPass ? 'Connection, identifier, and IP brute-force probes were each throttled.' : 'One or more configured brute-force dimensions were not observably throttled.',
    {
      observations: throttleOutcomes.map((outcome) => outcomeObservation(outcome.id, outcome.passed, outcome.failure)),
      metrics: { probeCount: throttleOutcomes.length, failedProbeCount: throttleOutcomes.filter((outcome) => !outcome.passed).length },
    }));
  await throttleSession.context.close();
  await anonymous.context.close();
} catch (error) {
  const existingIds = new Set(controls.map((entry) => entry.controlId));
  for (const [id, title] of [
    ['authentication.enumeration', 'Login and reset responses resist account enumeration'],
    ['authentication.timing', 'Authentication timing resists account enumeration'],
    ['authentication.reset-token', 'Reset tokens expire and are one-time'],
    ['authentication.session-revocation', 'Logout and password reset revoke sessions'],
    ['authentication.session-lifetime', 'Sessions expire within 30 days'],
    ['authentication.material-leakage', 'Authentication material does not enter client-observable channels'],
    ['authentication.authorization', 'Anonymous and cross-user authorization is enforced'],
    ['authentication.passwordless-containment', 'Passwordless experiment sessions remain bound to their authorized target'],
    ['authentication.throttling', 'Login throttles cover connection, identifier, and IP'],
  ]) if (!existingIds.has(id)) controls.push(errorControl(id, title, error));
} finally {
  await browser.close();
}

await writeJsonFile(outputPath, section('authentication', controls));
