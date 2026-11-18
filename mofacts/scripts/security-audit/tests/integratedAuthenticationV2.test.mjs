import assert from 'node:assert/strict';
import test from 'node:test';
import { runIntegratedAuthenticationV2 } from '../authentication/integratedV2.mjs';

const runtime = {
  target: 'https://staging2.optimallearning.org',
  applicationRevision: '1'.repeat(40),
  platformImageDigest: `sha256:${'2'.repeat(64)}`,
};

test('an integrated phase cannot contribute old or unclean evidence', async () => {
  for (const cleanupVerified of [true, false]) {
    let laterPhaseStarted = false;
    await assert.rejects(runIntegratedAuthenticationV2({
      observeRuntime: async () => runtime,
      captureMailProtocols: async ({ namespace }) => ({
        namespace: cleanupVerified ? 'mofacts_audit_fixture_000000000000' : namespace,
        result: {}, cleanupVerified,
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
    captureMailProtocols: async ({ namespace }) => ({ namespace, result: {}, cleanupVerified: true }),
    captureSelected: async () => { laterPhaseStarted = true; },
  }), /did not retain its run scope/);
  assert.equal(laterPhaseStarted, false);
});
