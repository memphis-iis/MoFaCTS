import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evaluateAuthorizationVerifications } from '../../../common/securityAudit/authorizationVerification.ts';
import { ACTIVE_AUDIT_CATALOG } from '../../../common/securityAudit/catalogRegistry.ts';
import { evaluatePasswordlessProtocol } from '../../../common/securityAudit/passwordlessProtocol.ts';
import { evaluateResetProtocol } from '../../../common/securityAudit/resetProtocol.ts';
import { parseSecurityAuditReportV2 } from '../../../common/securityAudit/reportV2.ts';
import { evaluateSessionLifetime } from '../../../common/securityAudit/sessionLifetime.ts';
import {
  AUTHENTICATION_COMPARISON_BASELINE, AUTHENTICATION_COMPARISON_SAMPLES, AUTHENTICATION_MATERIAL_CHANNELS,
  AUTHENTICATION_THROTTLE_CASES, AUTHORIZATION_VERIFICATIONS, PASSWORDLESS_PROTOCOL_VERIFICATIONS, RESET_PROTOCOL_VERIFICATIONS,
} from '../../../common/securityAudit/verificationCatalog.ts';
import { authenticationComparisonProofsV2, captureAuthenticationComparisonPairV2 } from '../authentication/comparisonV2.mjs';
import { assembleIntegratedStaging2AuditV2, runIntegratedAuthenticationV2 } from '../authentication/integratedV2.mjs';
import { observeAuthenticationMaterialV2 } from '../authentication/materialV2.mjs';
import { assembleAuditReportFilesV2, parseAuditFileV2, writeAuditFileV2 } from '../core/producerFilesV2.mjs';
import { envelope } from './fixtures/v2Fixtures.mjs';

const runtime = {
  target: 'https://staging2.optimallearning.org',
  applicationRevision: '1'.repeat(40),
  platformImageDigest: `sha256:${'2'.repeat(64)}`,
};

test('integrated coordinator acquires four clean phases and pairs all 22 controls with the active report catalog', async t => {
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
  const executors = {
    observeRuntime: async () => runtime,
    captureMailProtocols: phase('mail', mail), captureSelected: phase('selected', selected),
    capturePasswordless: phase('passwordless', passwordless), captureThrottles: phase('throttles', throttles),
  };
  const complete = await runIntegratedAuthenticationV2(executors);
  assert.deepEqual(order, ['mail', 'selected', 'passwordless', 'throttles']);
  assert.equal(namespaces.size, 4);
  assert.equal(complete.catalog.catalogVersion, 2);
  assert.equal(complete.artifact.controls.length, 22);
  assert.deepEqual(complete.artifact.controls.map(row => row.controlId).sort(), [...complete.catalog.profiles.full.authentication].sort());
  assert(complete.artifact.controls.every(row => row.status === 'PASS'));

  const scratch = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-integrated-report-')));
  t.after(() => fs.rm(scratch, { recursive: true, force: true }));
  const artifactDirectory = path.join(scratch, 'producers');
  await fs.mkdir(artifactDirectory);
  const { target: _target, ...fileEnvelope } = envelope;
  const options = {
    artifactDirectory, outputPath: path.join(scratch, 'report.json'), env: { AUDIT_TARGET: runtime.target }, executors,
    envelope: { ...fileEnvelope, startedAt: new Date().toISOString(),
      deployedApplicationRevision: { state: 'observed', value: runtime.applicationRevision },
      deployedImageDigest: { state: 'observed', value: `registry.example/mofacts@${runtime.platformImageDigest}` } },
  };
  const resultsAtStart = order.length;
  if (ACTIVE_AUDIT_CATALOG.catalogVersion === 1) {
    await assert.rejects(assembleIntegratedStaging2AuditV2(options), /requires the active authentication qualification catalog/);
    await assert.rejects(fs.stat(options.outputPath), { code: 'ENOENT' });
    assert.equal(order.length, resultsAtStart);
    return;
  }

  await assert.rejects(assembleIntegratedStaging2AuditV2({ ...options, executors: {
    ...executors, observeRuntime: async () => ({ ...runtime, platformImageDigest: `sha256:${'3'.repeat(64)}` }),
  } }), /differs from the planned report/);
  assert.equal(order.length, resultsAtStart);

  const report = await assembleIntegratedStaging2AuditV2(options);
  assert.deepEqual(parseAuditFileV2(await fs.readFile(options.outputPath)), report);
  assert.equal(report.catalogVersion, 2);
  assert.deepEqual(report.sections.authentication.controls.map(({ controlId }) => controlId), [...complete.catalog.profiles.full.authentication]);
  assert.equal(report.sections.authentication.status, 'PASS');
  assert.equal(report.counts.pass, 22);
  assert.equal(report.counts.error, 48);
  assert.deepEqual(report.executionErrors, ['producer-missing']);
  assert.deepEqual(await parseSecurityAuditReportV2(report, {
    purpose: 'ingestion', targetOrigin: runtime.target,
    authenticatedAt: report.completedAt, uploadedAt: report.completedAt,
    receiverRevision: options.envelope.deployedApplicationRevision, receiverImage: options.envelope.deployedImageDigest,
  }), report);

  const rejected = { ...options, outputPath: path.join(scratch, 'rejected.json') };
  const oldResult = { ...complete, startedAt: '2026-11-01T00:00:00.000Z' };
  await assert.rejects(assembleAuditReportFilesV2({ ...rejected, integratedAuthentication: oldResult }), /does not match this report run/);
  await assert.rejects(fs.stat(rejected.outputPath), { code: 'ENOENT' });

  await writeAuditFileV2(path.join(artifactDirectory, 'authentication.json'), complete.artifact);
  await assert.rejects(assembleIntegratedStaging2AuditV2(rejected), /Invalid V2 audit file input/);
  await assert.rejects(fs.stat(rejected.outputPath), { code: 'ENOENT' });
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
