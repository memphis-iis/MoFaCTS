import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAuthorizationVerifications } from '../../../common/securityAudit/authorizationVerification.ts';
import { evaluatePasswordlessProtocol } from '../../../common/securityAudit/passwordlessProtocol.ts';
import { evaluateResetProtocol } from '../../../common/securityAudit/resetProtocol.ts';
import { evaluateSessionLifetime } from '../../../common/securityAudit/sessionLifetime.ts';
import {
  AUTHENTICATION_COMPARISON_BASELINE, AUTHENTICATION_COMPARISON_SAMPLES, AUTHENTICATION_MATERIAL_CHANNELS,
  AUTHENTICATION_THROTTLE_CASES, AUTHORIZATION_VERIFICATIONS, PASSWORDLESS_PROTOCOL_VERIFICATIONS, RESET_PROTOCOL_VERIFICATIONS,
} from '../../../common/securityAudit/verificationCatalog.ts';
import { authenticationComparisonProofsV2, captureAuthenticationComparisonPairV2 } from '../authentication/comparisonV2.mjs';
import { runIntegratedAuthenticationV2 } from '../authentication/integratedV2.mjs';
import { observeAuthenticationMaterialV2 } from '../authentication/materialV2.mjs';

const runtime = {
  target: 'https://staging2.optimallearning.org',
  applicationRevision: '1'.repeat(40),
  platformImageDigest: `sha256:${'2'.repeat(64)}`,
};

test('integrated coordinator acquires four clean phases in order and emits all 22 candidate controls', async () => {
  const ready = { bindingsVerified: true, environmentLeaseHeld: true };
  const matching = rows => rows.map(({ verificationId, expectedPolicy }) => ({
    verificationId, outcome: expectedPolicy === 'allow' ? 'ALLOWED' : 'DENIED_BY_POLICY',
  }));
  const selected = evaluateAuthorizationVerifications(matching(AUTHORIZATION_VERIFICATIONS));
  const protocol = evaluateResetProtocol({ ...ready, currentTokenOwned: true, currentTokenUnused: true,
    expiredToken: { owned: true, unused: true, ageMs: 3900000, lifetimeMs: 3600000, remainingMs: -300000 },
    results: matching(RESET_PROTOCOL_VERIFICATIONS) });
  const pairs = AUTHENTICATION_COMPARISON_SAMPLES.map(({ sampleId, sampleSet }) => {
    const response = sampleSet === 'login'
      ? { state: 'rejected', code: '403', reason: 'Incorrect password', details: null, elapsedMs: 100 }
      : { state: 'returned', value: { success: true }, elapsedMs: 100 };
    return captureAuthenticationComparisonPairV2(sampleId, response, response);
  });
  const comparison = { ...ready, baselineVerificationId: AUTHENTICATION_COMPARISON_BASELINE.verificationId,
    baselineOutcome: 'ALLOWED', loginPairs: pairs.slice(0, 5), resetPairs: pairs.slice(5) };
  const denied = 'DENIED_BY_POLICY';
  const mail = { state: 'qualified', ownedAccountAndResetStateAbsent: true, operatorSessionCleanupVerified: true,
    productionAccess: false, result: { protocol,
      comparisons: { observation: comparison, proofs: authenticationComparisonProofsV2(comparison) },
      lifetime: evaluateSessionLifetime({ baselineOutcome: 'ALLOWED', freshSessionVerified: true, issuedAtMs: 0, expiresAtMs: 86400000 }),
      session: { outcomes: { newLogin: 'ALLOWED', oldLogin: denied, sessions: Array.from({ length: 2 }, () => ({ method: denied, resume: denied })) } },
      logout: { observation: { originalBaselineMatched: true, cloneBaselineMatched: true, sameCapabilityCloned: true,
        logoutCompleted: true, passwordReloginMatched: true, revokedMethodOutcome: denied, revokedResumeOutcome: denied } },
    } };
  const observation = { ...ready, results: PASSWORDLESS_PROTOCOL_VERIFICATIONS.map(row => ({
    verificationId: row.verificationId,
    observation: row.family === 'predicate' ? { state: 'observed', value: true }
      : row.expectedPolicy === 'allow' ? { state: 'returned', allowedObservationMatched: true }
        : { state: 'rejected', code: row.policyDenialCodes[0] },
  })) };
  const channels = Object.fromEntries(AUTHENTICATION_MATERIAL_CHANNELS.map(name => [name, { installed: true, complete: true, values: [] }]));
  const qualified = { state: 'qualification-observed', acquisitionComplete: true, cleanup: true, closed: true };
  const passwordless = { qualification: qualified, observation: { acquisitionComplete: true, progressReloadVerified: true, observation,
    result: evaluatePasswordlessProtocol(observation),
    material: observeAuthenticationMaterialV2({ baselineVerified: true, channels, canaries: ['synthetic-material-canary'] }) } };
  const [connection, ...remaining] = AUTHENTICATION_THROTTLE_CASES.map(({ verificationId }) => ({ verificationId, status: 'PASS' }));
  const throttles = [{ ...qualified, result: connection }, { ...qualified, result: remaining }];
  const order = [], namespaces = new Set();
  const phase = (label, result) => async ({ namespace, phaseNamespace, runtime: observed }) => {
    assert.deepEqual(observed, runtime);
    order.push(label);
    namespaces.add(phaseNamespace);
    assert.notEqual(phaseNamespace, namespace);
    return { namespace, phaseNamespace, cleanupVerified: true, result };
  };
  const complete = await runIntegratedAuthenticationV2({
    observeRuntime: async () => runtime,
    captureMailProtocols: phase('mail', mail), captureSelected: phase('selected', selected),
    capturePasswordless: phase('passwordless', passwordless), captureThrottles: phase('throttles', throttles),
  });
  assert.deepEqual(order, ['mail', 'selected', 'passwordless', 'throttles']);
  assert.equal(namespaces.size, 4);
  assert.equal(complete.catalog.catalogVersion, 2);
  assert.equal(complete.artifact.controls.length, 22);
  assert.deepEqual(complete.artifact.controls.map(row => row.controlId).sort(), [...complete.catalog.profiles.full.authentication].sort());
  assert(complete.artifact.controls.every(row => row.status === 'PASS'));
});

test('an integrated phase cannot contribute old or unclean evidence', async () => {
  for (const cleanupVerified of [true, false]) {
    let laterPhaseStarted = false;
    await assert.rejects(runIntegratedAuthenticationV2({
      observeRuntime: async () => runtime,
      captureMailProtocols: async ({ namespace, phaseNamespace }) => ({
        namespace: cleanupVerified ? 'mofacts_audit_fixture_000000000000' : namespace,
        phaseNamespace, result: {}, cleanupVerified,
      }),
      captureSelected: async () => { laterPhaseStarted = true; },
    }), /did not retain its run scope/);
    assert.equal(laterPhaseStarted, false);
  }
});

test('receiver identity changes stop acquisition before further stateful phases', async () => {
  let observations = 0, laterPhaseStarted = false;
  await assert.rejects(runIntegratedAuthenticationV2({
    observeRuntime: async () => ++observations === 1 ? runtime : { ...runtime, applicationRevision: '3'.repeat(40) },
    captureMailProtocols: async ({ namespace, phaseNamespace }) => ({ namespace, phaseNamespace, result: {}, cleanupVerified: true }),
    captureSelected: async () => { laterPhaseStarted = true; },
  }), /did not retain its run scope/);
  assert.equal(laterPhaseStarted, false);
});
