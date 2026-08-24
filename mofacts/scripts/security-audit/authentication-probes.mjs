import crypto from 'node:crypto';

function safeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .split('/')
    .filter(Boolean)
    .map((segment) => (/^\d+$/.test(segment) || /^[a-f0-9]{12,}$/i.test(segment) || segment.length > 32
      ? 'parameter'
      : segment))
    .join('-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'unnamed';
}

export function semanticAuthorizationProbeId(kind, probe) {
  const subject = kind === 'method' ? probe.method
    : kind === 'publication' ? probe.publication
      : probe.path;
  const semantic = `${safeSlug(probe.actor)}-${safeSlug(subject)}`;
  const discriminator = crypto.createHash('sha256')
    .update(`${kind}\0${String(probe.actor || '')}\0${String(subject || '')}`)
    .digest('hex')
    .slice(0, 8);
  return `authorization.${kind}.${semantic}-${discriminator}`;
}

export function assertUniqueSemanticProbeIds(probeGroups) {
  const ids = [];
  for (const [kind, probes] of Object.entries(probeGroups)) {
    for (const probe of probes || []) ids.push(semanticAuthorizationProbeId(kind, probe));
  }
  return ids.length === new Set(ids).size;
}

export function throttleResultCategory(result) {
  const code = String(result?.code || '');
  if (/rate-limit|too-many|thrott|lock/i.test(code)) return 'rate-limited';
  if (result?.ok) return 'success';
  if (/403|not-authorized|invalid|incorrect/i.test(code)) return 'invalid-credentials';
  return 'other-error';
}

export function throttleWasObserved(result) {
  return throttleResultCategory(result) === 'rate-limited';
}

export function classifyEnumeration(existingResults, missingResults, resetShapeMatch, resetResults = []) {
  const paired = Array.isArray(existingResults) && Array.isArray(missingResults)
    && existingResults.length > 0 && existingResults.length === missingResults.length
    && Array.isArray(resetResults);
  if (!paired || typeof resetShapeMatch !== 'boolean') {
    return { status: 'ERROR', loginCodeMatch: false, resetShapeMatch: false, rateLimitedAttemptCount: 0 };
  }

  const rateLimitedAttemptCount = [...existingResults, ...missingResults, ...resetResults]
    .filter((result) => throttleWasObserved(result)).length;
  const loginCodeMatch = existingResults.every((result, index) => (
    String(result?.code || '') === String(missingResults[index]?.code || '')
  ));
  if (rateLimitedAttemptCount > 0) {
    return { status: 'ERROR', loginCodeMatch, resetShapeMatch, rateLimitedAttemptCount };
  }
  return {
    status: loginCodeMatch && resetShapeMatch ? 'PASS' : 'FAIL',
    loginCodeMatch,
    resetShapeMatch,
    rateLimitedAttemptCount,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function timingMetrics(existingSamples, missingSamples, minimumBoundMs, relativeBound) {
  const existingMedianMs = median(existingSamples);
  const missingMedianMs = median(missingSamples);
  const differentialMs = Math.abs(existingMedianMs - missingMedianMs);
  const approvedBoundMs = Math.max(minimumBoundMs, Math.min(existingMedianMs, missingMedianMs) * relativeBound);
  const directions = existingSamples.map((value, index) => Math.sign(value - missingSamples[index]));
  const positiveDirectionCount = directions.filter((direction) => direction > 0).length;
  const negativeDirectionCount = directions.filter((direction) => direction < 0).length;
  const dominantDirectionCount = Math.max(positiveDirectionCount, negativeDirectionCount);
  const requiredDirectionCount = Math.ceil(existingSamples.length * 0.8);
  const exceedsBound = differentialMs > approvedBoundMs;
  return {
    existingMedianMs,
    missingMedianMs,
    differentialMs,
    approvedBoundMs,
    dominantDirectionCount,
    requiredDirectionCount,
    status: !exceedsBound ? 'PASS' : dominantDirectionCount >= requiredDirectionCount ? 'FAIL' : 'ERROR',
  };
}

export function classifyAuthenticationTiming(existingLoginMs, missingLoginMs, existingResetMs, missingResetMs) {
  const sampleSets = [existingLoginMs, missingLoginMs, existingResetMs, missingResetMs];
  if (sampleSets.some((samples) => !Array.isArray(samples)
    || samples.some((value) => !Number.isFinite(value) || value < 0))
    || existingLoginMs.length < 5 || existingResetMs.length < 2
    || existingLoginMs.length !== missingLoginMs.length
    || existingResetMs.length !== missingResetMs.length) {
    throw new Error('authentication timing samples are invalid');
  }
  const login = timingMetrics(existingLoginMs, missingLoginMs, 150, 0.5);
  const reset = timingMetrics(existingResetMs, missingResetMs, 250, 0.75);
  return {
    status: [login.status, reset.status].includes('FAIL')
      ? 'FAIL'
      : [login.status, reset.status].includes('ERROR') ? 'ERROR' : 'PASS',
    login,
    reset,
  };
}

export function expectedDeniedRoute(actor) {
  return actor === 'anonymous' ? '/auth/login' : '/home';
}

export function routeProbePassed({ actor, requestedPath, finalPath, expectDenied, authReady }) {
  if (!authReady) return false;
  const denied = finalPath === expectedDeniedRoute(actor);
  return expectDenied ? denied : !denied && finalPath === requestedPath;
}

export function passwordlessContainmentOutcomes(state) {
  const definitions = [
    ['authentication.passwordless.resume-token-issued', 'Anonymous sealed-link resume issues a login token', 'INFO', 'issuedToken', 'anonymous resume did not issue a token'],
    ['authentication.passwordless.token-login', 'The issued passwordless token establishes its participant session', 'HIGH', 'tokenLogin', 'issued token did not establish a session'],
    ['authentication.passwordless.participant-identity', 'The passwordless session retains the expected participant identity', 'HIGH', 'identityMatches', 'session identity did not match the participant'],
    ['authentication.passwordless.experiment-flag', 'The passwordless session is marked as an experiment participant', 'MEDIUM', 'experimentFlag', 'session was not marked as an experiment participant'],
    ['authentication.passwordless.sealed-target-binding', 'The passwordless session remains bound to its sealed experiment target', 'CRITICAL', 'targetMatches', 'session was not bound to the sealed experiment target'],
    ['authentication.passwordless.modified-target-rejected', 'A passwordless participant cannot switch to a modified experiment target', 'CRITICAL', 'modifiedTargetRejected', 'modified experiment target was accepted'],
    ['authentication.passwordless.admin-denied', 'A passwordless participant cannot call an admin method', 'CRITICAL', 'adminDenied', 'participant reached an admin method'],
    ['authentication.passwordless.ordinary-account-denied', 'A passwordless participant cannot call an ordinary-account settings method', 'MEDIUM', 'ordinaryAccountDenied', 'participant reached getOwnOpenRouterSettings'],
    ['authentication.passwordless.assigned-experiment-allowed', 'A passwordless participant can access the assigned experiment', 'INFO', 'assignedExperimentAllowed', 'assigned experiment was unavailable'],
    ['authentication.passwordless.cross-user-method-denied', 'A passwordless participant cannot call a cross-user method', 'CRITICAL', 'crossUserMethodDenied', 'cross-user method was available'],
    ['authentication.passwordless.cross-user-publication-contained', 'A passwordless participant cannot observe another user publication payload', 'CRITICAL', 'crossUserPublicationContained', 'another user payload was observable'],
    ['authentication.passwordless.token-not-leaked', 'The issued passwordless token is absent from client-observable channels', 'CRITICAL', 'tokenNotLeaked', 'issued token appeared in a client-observable channel'],
  ];
  return definitions.map(([id, title, severity, stateKey, failure]) => ({
    id,
    title,
    severity,
    passed: Boolean(state[stateKey]),
    failure,
  }));
}

export function selectExpiredResetLink(links, nowMs, lifetimeMs) {
  if (!Array.isArray(links) || !Number.isFinite(nowMs) || !Number.isFinite(lifetimeMs) || lifetimeMs <= 0) {
    throw new Error('reset-link expiry input is invalid');
  }
  return links
    .filter((link) => link && Number.isFinite(link.issuedAtMs) && nowMs - link.issuedAtMs > lifetimeMs)
    .sort((a, b) => b.issuedAtMs - a.issuedAtMs)[0] || null;
}
