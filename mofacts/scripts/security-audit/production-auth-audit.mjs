import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { control, errorControl, runCommand, section, writeJsonFile } from './audit-lib.mjs';
import {
  assertUniqueSemanticProbeIds,
  classifyAuthenticationTiming,
  classifyEnumeration,
  expectedDeniedRoute,
  passwordlessContainmentOutcomes,
  routeProbePassed,
  selectExpiredResetLink,
  semanticAuthorizationProbeId,
  throttleResultCategory,
  throttleWasObserved,
} from './authentication-probes.mjs';

const outputPath = process.argv[2];
if (!outputPath) throw new Error('output path is required');
const target = process.env.AUDIT_TARGET || 'https://mofacts.optimallearning.org';
const controls = [];
const authenticationControlDefinitions = [
  ['authentication.enumeration', 'Login and reset responses resist account enumeration'],
  ['authentication.timing', 'Authentication timing resists account enumeration'],
  ['authentication.reset-token.expired-rejected', 'An expired reset token is rejected'],
  ['authentication.reset-token.current-single-use', 'A current reset token works exactly once'],
  ['authentication.reset-token.replay-rejected', 'A used reset token cannot be replayed'],
  ['authentication.session-revocation', 'Logout and password reset revoke sessions'],
  ['authentication.session-lifetime', 'Sessions expire within 30 days'],
  ['authentication.material-leakage', 'Authentication material does not enter client-observable channels'],
  ['authentication.authorization', 'Anonymous and cross-user authorization is enforced'],
  ...passwordlessContainmentOutcomes({}).map((outcome) => [outcome.id, outcome.title]),
  ['authentication.throttling', 'Login throttles cover connection, identifier, and IP'],
];
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
const semanticProbeIdsUnique = assertUniqueSemanticProbeIds({
  method: config?.authorizationProbes,
  publication: config?.publicationProbes,
  route: config?.routeProbes,
  download: config?.downloadProbes,
});
const configReady = config && requiredUsers.every((name) => config.users?.[name]?.username && config.users?.[name]?.password)
  && config.users.reset.newPassword
  && config.passwordless?.experimentTarget && config.passwordless?.otherExperimentTarget
  && config.passwordless?.participantId
  && Array.isArray(config.authorizationProbes) && config.authorizationProbes.length > 0
  && Array.isArray(config.publicationProbes) && config.publicationProbes.length > 0
  && Array.isArray(config.routeProbes) && config.routeProbes.length > 0
  && Array.isArray(config.downloadProbes) && config.downloadProbes.length > 0
  && semanticProbeIdsUnique
  && ['anonymous', 'learnerA', 'learnerB', 'teacherA', 'teacherB', 'admin'].every((actor) => configuredProbeActors.has(actor))
  && Array.isArray(config.connectionThrottleIdentifiers) && config.connectionThrottleIdentifiers.length >= 12
  && Array.isArray(config.ipThrottleIdentifiers) && config.ipThrottleIdentifiers.length >= 21
  && config.imaps?.host && config.imaps?.username && process.env.AUDIT_IMAPS_PASSWORD;

if (!configReady) {
  for (const [id, title] of authenticationControlDefinitions) {
    controls.push(errorControl(id, title, 'The protected synthetic fixture or IMAPS configuration is incomplete'));
  }
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
  return messages.flatMap((message) => {
    const issuedAtMs = Date.parse(message.match(/^Date:\s*(.+)$/mi)?.[1] || '');
    return [...message.replace(/=\r?\n/g, '').replace(/=3D/gi, '=').matchAll(/https:\/\/[^\s<>]+\/auth\/reset-password\?[^\s<>]+/g)]
    .map((match) => match[0].replace(/&amp;/g, '&'))
    .map((value) => {
      try {
        const url = new URL(value);
        return url.searchParams.get('email') === recipient && url.searchParams.get('token')
          ? { email: recipient, token: url.searchParams.get('token'), issuedAtMs }
          : null;
      } catch { return null; }
    }).filter(Boolean);
  });
}

function outcomeObservation(probeId, passed, failureText) {
  return `${probeId}: ${passed ? 'PASS' : `FAIL - ${failureText}`}`;
}

try {
  const anonymous = await newPage();
  const existingLogin = [];
  const missingLogin = [];
  const missingLoginIdentifier = `missing-enumeration-${config.runNamespace}@audit.invalid`;
  // Stay below the eight-failure soft lock and preserve one of the five hourly
  // reset requests for the token lifecycle probe later in this audit.
  const loginTimingSampleCount = 5;
  const resetTimingSampleCount = 2;
  // Discard one warm-up pair so connection and module initialization do not
  // masquerade as an identifier-dependent timing difference.
  const warmExisting = await newPage();
  const warmMissing = await newPage();
  try {
    await login(warmExisting.page, config.users.expiry.username, 'invalid-warmup');
    await login(warmMissing.page, missingLoginIdentifier, 'invalid-warmup');
  } finally {
    await warmExisting.context.close();
    await warmMissing.context.close();
  }
  for (let index = 0; index < loginTimingSampleCount; index += 1) {
    // Meteor Accounts permits five account operations per connection in ten
    // seconds. Keep every comparison on independent connections so sampling
    // cannot turn a valid enumeration probe into a connection-limiter probe.
    const existingSession = await newPage();
    const missingSession = await newPage();
    try {
      const measureExisting = async () => {
        const started = performance.now();
        const result = await login(existingSession.page, config.users.expiry.username, `invalid-${index}`);
        existingLogin.push({ result, elapsed: performance.now() - started });
      };
      const measureMissing = async () => {
        const started = performance.now();
        const result = await login(missingSession.page, missingLoginIdentifier, `invalid-${index}`);
        missingLogin.push({ result, elapsed: performance.now() - started });
      };
      // Alternate request order to cancel systematic first/second-request bias.
      if (index % 2 === 0) {
        await measureExisting();
        await measureMissing();
      } else {
        await measureMissing();
        await measureExisting();
      }
    } finally {
      await existingSession.context.close();
      await missingSession.context.close();
    }
  }
  const resetExisting = [];
  const resetMissing = [];
  const missingResetIdentifier = `missing-reset-${config.runNamespace}@audit.invalid`;
  for (let index = 0; index < resetTimingSampleCount; index += 1) {
    const existingSession = await newPage();
    const missingSession = await newPage();
    try {
      const measureExisting = async () => {
        const started = performance.now();
        const result = await callMethod(existingSession.page, 'requestPasswordReset', [config.users.reset.username]);
        resetExisting.push({ result, elapsed: performance.now() - started });
      };
      const measureMissing = async () => {
        const started = performance.now();
        const result = await callMethod(missingSession.page, 'requestPasswordReset', [missingResetIdentifier]);
        resetMissing.push({ result, elapsed: performance.now() - started });
      };
      if (index % 2 === 0) {
        await measureExisting();
        await measureMissing();
      } else {
        await measureMissing();
        await measureExisting();
      }
    } finally {
      await existingSession.context.close();
      await missingSession.context.close();
    }
  }
  const sameResetShape = resetExisting.every((entry, index) => (
    JSON.stringify(entry.result) === JSON.stringify(resetMissing[index].result)
  ));
  const enumeration = classifyEnumeration(
    existingLogin.map((entry) => entry.result),
    missingLogin.map((entry) => entry.result),
    sameResetShape,
    [...resetExisting, ...resetMissing].map((entry) => entry.result),
  );
  controls.push(control('authentication.enumeration', 'Login and reset responses resist account enumeration',
    enumeration.status, 'HIGH',
    enumeration.status === 'PASS'
      ? 'Existing and nonexistent identifiers produced indistinguishable result shapes.'
      : enumeration.status === 'ERROR'
        ? 'Authentication throttling prevented a valid account-enumeration comparison.'
        : 'Existing and nonexistent identifiers produced distinguishable results.',
    {
      observations: existingLogin.map((entry, index) => `enumeration.attempt-${index + 1}: existing=${entry.result.code}, missing=${missingLogin[index].result.code}`),
      metrics: {
        loginCodeMatch: enumeration.loginCodeMatch,
        resetShapeMatch: enumeration.resetShapeMatch,
        rateLimitedAttemptCount: enumeration.rateLimitedAttemptCount,
        inconclusive: enumeration.status === 'ERROR',
      },
    }));
  const timing = classifyAuthenticationTiming(
    existingLogin.map((entry) => entry.elapsed),
    missingLogin.map((entry) => entry.elapsed),
    resetExisting.map((entry) => entry.elapsed),
    resetMissing.map((entry) => entry.elapsed),
  );
  const timingStatus = enumeration.status === 'ERROR' ? 'ERROR' : timing.status;
  controls.push(control('authentication.timing', 'Authentication timing resists account enumeration', timingStatus, 'MEDIUM',
    timingStatus === 'PASS'
      ? 'Login and reset timing differentials stayed within the approved bounds.'
      : timingStatus === 'ERROR'
        ? enumeration.status === 'ERROR'
          ? 'Authentication throttling prevented a valid authentication-timing comparison.'
          : 'Timing samples were too inconsistent to support a security conclusion.'
        : 'A login or reset timing differential exceeded the approved bound.',
    {
      metrics: {
        loginDifferentialMs: Math.round(timing.login.differentialMs),
        loginApprovedBoundMs: Math.round(timing.login.approvedBoundMs),
        loginExistingMedianMs: Math.round(timing.login.existingMedianMs),
        loginMissingMedianMs: Math.round(timing.login.missingMedianMs),
        loginSampleCountPerIdentifier: loginTimingSampleCount,
        loginDominantDirectionCount: timing.login.dominantDirectionCount,
        loginRequiredDirectionCount: timing.login.requiredDirectionCount,
        resetDifferentialMs: Math.round(timing.reset.differentialMs),
        resetApprovedBoundMs: Math.round(timing.reset.approvedBoundMs),
        resetExistingMedianMs: Math.round(timing.reset.existingMedianMs),
        resetMissingMedianMs: Math.round(timing.reset.missingMedianMs),
        resetSampleCountPerIdentifier: resetTimingSampleCount,
        resetDominantDirectionCount: timing.reset.dominantDirectionCount,
        resetRequiredDirectionCount: timing.reset.requiredDirectionCount,
        inconclusive: timingStatus === 'ERROR',
      },
    }));

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
  const priorTokens = new Set(priorLinks.map((link) => link.token));
  const newest = links.find((link) => !priorTokens.has(link.token));
  const resetTokenLifetimeMs = 60 * 60 * 1000;
  const prior = selectExpiredResetLink(priorLinks, Date.now(), resetTokenLifetimeMs);
  if (!newest) {
    controls.push(errorControl('authentication.reset-token.current-single-use', 'A current reset token works exactly once', 'The dedicated mailbox did not contain a newly issued reset link'));
    controls.push(errorControl('authentication.reset-token.replay-rejected', 'A used reset token cannot be replayed', 'A current reset token was unavailable'));
    controls.push(control('authentication.reset-token.expired-rejected', 'An expired reset token is rejected', 'ERROR', 'HIGH',
      'No current reset token was available, so expiration behavior could not be isolated.',
      { metrics: { inconclusive: true, configuredLifetimeMinutes: 60 } }));
    resetRevocationError = 'A current reset token was unavailable';
  } else {
    const expired = prior
      ? await callMethod(anonymous.page, 'resetPasswordWithToken', [prior.email, prior.token, resetNextPassword])
      : null;
    const sessionA = await newPage();
    const sessionB = await newPage();
    await login(sessionA.page, config.users.reset.username, resetCurrentPassword);
    await login(sessionB.page, config.users.reset.username, resetCurrentPassword);
    const reset = await callMethod(anonymous.page, 'resetPasswordWithToken', [newest.email, newest.token, resetNextPassword]);
    const replay = await callMethod(anonymous.page, 'resetPasswordWithToken', [newest.email, newest.token, resetCurrentPassword]);
    controls.push(prior
      ? control('authentication.reset-token.expired-rejected', 'An expired reset token is rejected',
        !expired.ok ? 'PASS' : 'FAIL', 'CRITICAL',
        !expired.ok ? 'A reset token older than the configured one-hour lifetime was rejected.' : 'A reset token older than the configured one-hour lifetime was accepted.',
        { metrics: { tokenAgeMinutes: Math.floor((Date.now() - prior.issuedAtMs) / 60000), configuredLifetimeMinutes: 60 } })
      : control('authentication.reset-token.expired-rejected', 'An expired reset token is rejected', 'ERROR', 'HIGH',
        'No mailbox reset link was old enough to test the configured one-hour expiration policy.',
        { metrics: { inconclusive: true, configuredLifetimeMinutes: 60 } }));
    controls.push(control('authentication.reset-token.current-single-use', 'A current reset token works exactly once',
      reset.ok ? 'PASS' : 'FAIL', 'CRITICAL',
      reset.ok ? 'The newly issued reset token worked on its first use.' : `The newly issued reset token failed with category ${reset.code || 'other-error'}.`));
    controls.push(control('authentication.reset-token.replay-rejected', 'A used reset token cannot be replayed',
      !replay.ok ? 'PASS' : 'FAIL', 'CRITICAL',
      !replay.ok ? 'The used reset token was rejected on replay.' : 'The used reset token was accepted a second time.'));
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
  const lifetimeStatus = !expiryLogin.ok
    ? 'ERROR'
    : Number.isFinite(lifetimeDays) && lifetimeDays <= 30.05 ? 'PASS' : 'FAIL';
  controls.push(control('authentication.session-lifetime', 'Sessions expire within 30 days',
    lifetimeStatus, 'HIGH',
    lifetimeStatus === 'ERROR'
      ? 'The synthetic expiry identity could not log in, so session lifetime was inconclusive.'
      : Number.isFinite(lifetimeDays)
        ? `Observed a maximum session lifetime of approximately ${Math.ceil(lifetimeDays)} days.`
        : 'The authenticated session did not expose a parseable expiration.',
    {
      metrics: {
        lifetimeDays: Number.isFinite(lifetimeDays) ? Math.ceil(lifetimeDays) : -1,
        inconclusive: lifetimeStatus === 'ERROR',
        loginCategory: lifetimeStatus === 'ERROR' ? throttleResultCategory(expiryLogin) : 'success',
      },
    }));

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
  for (const probe of config.authorizationProbes) {
    const probeSession = await getAuthorizationSession(probe.actor);
    const result = await callMethod(probeSession.page, probe.method, probe.args || []);
    const passed = probe.expectDenied ? !result.ok : result.ok;
    if (!passed) authorizationFailures.push(outcomeObservation(semanticAuthorizationProbeId('method', probe), false,
      probe.expectDenied ? 'request was unexpectedly allowed' : 'request was unexpectedly denied'));
  }
  for (const probe of config.routeProbes) {
    const probeSession = await getAuthorizationSession(probe.actor);
    const requestedUrl = new URL(probe.path, target);
    await probeSession.page.goto(requestedUrl.toString(), { waitUntil: 'domcontentloaded' });
    await probeSession.page.waitForFunction(() => globalThis.Session?.get?.('authReady') === true, null, { timeout: 10000 }).catch(() => {});
    if (probe.expectDenied) {
      const deniedPath = expectedDeniedRoute(probe.actor);
      await probeSession.page.waitForURL((url) => url.pathname === deniedPath, { timeout: 5000 }).catch(() => {});
    }
    const routeState = await probeSession.page.evaluate(() => ({
      authReady: globalThis.Session?.get?.('authReady') === true,
      path: globalThis.location.pathname,
    }));
    const passed = routeProbePassed({
      actor: probe.actor,
      requestedPath: requestedUrl.pathname,
      finalPath: routeState.path,
      expectDenied: probe.expectDenied,
      authReady: routeState.authReady,
    });
    if (!passed) authorizationFailures.push(outcomeObservation(semanticAuthorizationProbeId('route', probe), false,
      probe.expectDenied ? 'route was unexpectedly accessible' : 'route was unexpectedly denied'));
  }
  for (const probe of config.publicationProbes) {
    const probeSession = await getAuthorizationSession(probe.actor);
    const result = await publicationProbe(probeSession.page, probe.publication, probe.args || [], probe.otherUserCanary);
    const passed = !result.leakedCanary && (!probe.expectError || result.error);
    if (!passed) authorizationFailures.push(outcomeObservation(semanticAuthorizationProbeId('publication', probe), false,
      result.leakedCanary ? 'another user payload was observable' : 'publication was unexpectedly available'));
  }
  for (const probe of config.downloadProbes) {
    const probeSession = await getAuthorizationSession(probe.actor);
    const status = await probeSession.page.evaluate(async (pathValue) => {
      const response = await fetch(pathValue, { credentials: 'include', redirect: 'manual' });
      return response.status;
    }, probe.path);
    const passed = probe.expectDenied ? [401, 403, 404].includes(status) : status < 400;
    if (!passed) authorizationFailures.push(outcomeObservation(semanticAuthorizationProbeId('download', probe), false,
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
    for (const outcome of passwordlessContainmentOutcomes({})) {
      controls.push(errorControl(outcome.id, outcome.title,
        `The passwordless re-provisioning probe failed with code ${resume.code}.`));
    }
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
    const containmentOutcomes = passwordlessContainmentOutcomes({
      issuedToken,
      tokenLogin: tokenLogin.ok,
      identityMatches: participantIdentity.userId === resume.value?.userId,
      experimentFlag: participantIdentity.experiment === true || participantIdentity.experiment === 'true',
      targetMatches: participantIdentity.experimentTarget === config.passwordless.experimentTarget,
      modifiedTargetRejected: !mismatchedTarget.ok,
      adminDenied: !adminAccess.ok,
      ordinaryAccountDenied: !ordinaryAccountAccess.ok,
      assignedExperimentAllowed: assignedExperimentAccess.ok && Boolean(assignedExperimentAccess.value),
      crossUserMethodDenied: Boolean(crossUserProbe) && !crossUserAccess.ok,
      crossUserPublicationContained: Boolean(otherUserPublicationProbe) && !otherUserPublication.leakedCanary,
      tokenNotLeaked: !tokenLeaked,
    });
    for (const outcome of containmentOutcomes) {
      controls.push(control(outcome.id, outcome.title, outcome.passed ? 'PASS' : 'FAIL', outcome.severity,
        outcome.passed ? 'The probe matched the passwordless experiment-session contract.' : outcome.failure));
    }
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
  for (let index = 0; index < 11; index += 1) {
    const identifierSession = await newPage();
    identifierResults.push(await login(identifierSession.page, config.users.lockout.username, `invalid-lockout-${index}`));
    await identifierSession.context.close();
  }
  const identifierThrottled = identifierResults.some(throttleWasObserved);
  let connectionThrottled = false;
  if (Array.isArray(config.connectionThrottleIdentifiers) && config.connectionThrottleIdentifiers.length >= 12) {
    for (const [index, identifier] of config.connectionThrottleIdentifiers.slice(0, 12).entries()) {
      const result = await login(throttleSession.page, identifier, `invalid-connection-${index}`);
      if (throttleWasObserved(result)) connectionThrottled = true;
    }
  }
  let ipThrottled = false;
  const ipThrottleResults = [];
  if (Array.isArray(config.ipThrottleIdentifiers) && config.ipThrottleIdentifiers.length >= 21) {
    for (const [index, identifier] of config.ipThrottleIdentifiers.entries()) {
      const ipSession = await newPage();
      const result = await login(ipSession.page, identifier, `invalid-ip-${index}`);
      ipThrottleResults.push(result);
      await ipSession.context.close();
      if (throttleWasObserved(result)) ipThrottled = true;
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
      metrics: {
        probeCount: throttleOutcomes.length,
        failedProbeCount: throttleOutcomes.filter((outcome) => !outcome.passed).length,
        identifierAttemptCount: identifierResults.length,
        identifierFinalCategory: throttleResultCategory(identifierResults.at(-1)),
        ipAttemptCount: config.ipThrottleIdentifiers.length,
        ipFinalCategory: throttleResultCategory(ipThrottleResults.at(-1)),
      },
    }));
  await throttleSession.context.close();
  await anonymous.context.close();
} catch (error) {
  const existingIds = new Set(controls.map((entry) => entry.controlId));
  for (const [id, title] of authenticationControlDefinitions) {
    if (!existingIds.has(id)) controls.push(errorControl(id, title, error));
  }
} finally {
  await browser.close();
}

await writeJsonFile(outputPath, section('authentication', controls));
