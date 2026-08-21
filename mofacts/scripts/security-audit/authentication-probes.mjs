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

export function expectedDeniedRoute(actor) {
  return actor === 'anonymous' ? '/auth/login' : '/home';
}

export function routeProbePassed({ actor, requestedPath, finalPath, expectDenied, authReady }) {
  if (!authReady) return false;
  const denied = finalPath === expectedDeniedRoute(actor);
  return expectDenied ? denied : !denied && finalPath === requestedPath;
}

export function passwordlessContainmentOutcomes(state) {
  return [
    ['passwordless.resume-token-issued', Boolean(state.issuedToken), 'anonymous resume did not issue a token'],
    ['passwordless.token-login', Boolean(state.tokenLogin), 'issued token did not establish a session'],
    ['passwordless.participant-identity', Boolean(state.identityMatches), 'session identity did not match the participant'],
    ['passwordless.experiment-flag', Boolean(state.experimentFlag), 'session was not marked as an experiment participant'],
    ['passwordless.sealed-target-binding', Boolean(state.targetMatches), 'session was not bound to the sealed experiment target'],
    ['passwordless.modified-target-rejected', Boolean(state.modifiedTargetRejected), 'modified experiment target was accepted'],
    ['passwordless.admin-denied', Boolean(state.adminDenied), 'participant reached an admin method'],
    ['passwordless.ordinary-account-denied', Boolean(state.ordinaryAccountDenied), 'participant reached an ordinary-account method'],
    ['passwordless.assigned-experiment-allowed', Boolean(state.assignedExperimentAllowed), 'assigned experiment was unavailable'],
    ['passwordless.cross-user-method-denied', Boolean(state.crossUserMethodDenied), 'cross-user method was available'],
    ['passwordless.cross-user-publication-contained', Boolean(state.crossUserPublicationContained), 'another user payload was observable'],
    ['passwordless.token-not-leaked', Boolean(state.tokenNotLeaked), 'issued token appeared in a client-observable channel'],
  ].map(([id, passed, failure]) => ({ id, passed, failure }));
}
