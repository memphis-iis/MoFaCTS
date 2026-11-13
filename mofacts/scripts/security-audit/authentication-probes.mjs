import crypto from 'node:crypto';
import { authenticationTimingMetric, authenticationTimingStatus } from '../../common/securityAudit/authenticationTiming.ts';

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

export function classifyAuthenticationTiming(existingLoginMs, missingLoginMs, existingResetMs, missingResetMs) {
  const login = authenticationTimingMetric(existingLoginMs, missingLoginMs, 'login');
  const reset = authenticationTimingMetric(existingResetMs, missingResetMs, 'reset');
  return { status: authenticationTimingStatus(login.status, reset.status), login, reset };
}
export function expectedDeniedRoute(actor) {
  return actor === 'anonymous' ? '/auth/login' : '/home';
}

export function routeProbePassed({ actor, requestedPath, finalPath, expectDenied, authReady }) {
  if (!authReady) return false;
  const denied = finalPath === expectedDeniedRoute(actor);
  return expectDenied ? denied : !denied && finalPath === requestedPath;
}

export function selectExpiredResetLink(links, nowMs, lifetimeMs) {
  if (!Array.isArray(links) || !Number.isFinite(nowMs) || !Number.isFinite(lifetimeMs) || lifetimeMs <= 0) {
    throw new Error('reset-link expiry input is invalid');
  }
  return links
    .filter((link) => link && Number.isFinite(link.issuedAtMs) && nowMs - link.issuedAtMs > lifetimeMs)
    .sort((a, b) => b.issuedAtMs - a.issuedAtMs)[0] || null;
}
