import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';
import { auditDigest, canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { parseSecurityAuditReportV2 } from '../../../common/securityAudit/reportV2.ts';
import { authenticateAuditRequestV2, signAuditRequestV2 } from '../../../server/securityAudit/securityAuditIngestionV2.ts';
import { auditDownloadBytesV2 } from '../../../server/securityAudit/securityAuditPresentationV2.ts';
import { evaluateUdpExposure } from '../composite/udpExposure.mjs';
import { assembleAuditReportV2 } from '../core/assembleV2.mjs';
import { envelope, errorArtifacts, ingestionContext } from './fixtures/v2Fixtures.mjs';

const external = { observedResultCount: 7, expectedResultCount: 7, openSelectedUdpPortCount: 0 };
const positive = { observedResultCount: 1, expectedResultCount: 7, openSelectedUdpPortCount: 1 };
const host = { unexpectedUdpListenerCount: 0, unexpectedUdpAllowRuleCount: 0,
  unexpectedUdpPublicationCount: 0, firewallActive: true, defaultDenyInbound: true };
const catalog = () => readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
const control = artifact => artifact.controls[0];
const evidence = metrics => ({ summary: 'Synthetic bounded UDP measurements.', metrics });

test('V2 UDP: a confirmed response preserves FAIL without host values, including partial scan coverage', async () => {
  const c = await catalog();
  for (const profile of ['full', 'exposure']) for (const input of [undefined, null, {}, host, { ...host, firewallActive: false }]) {
    const row = control(evaluateUdpExposure(c, profile, positive, input));
    assert.equal(row.status, 'FAIL');
    assert.deepEqual(row.evidence.metrics, positive);
    assert.equal(Object.hasOwn(row, 'failureSeverity'), false);
    assert.equal(Object.hasOwn(row.evidence.metrics, 'firewallActive'), false);
  }
  assert.deepEqual(positive, { observedResultCount: 1, expectedResultCount: 7, openSelectedUdpPortCount: 1 });
});

test('V2 UDP: no response cannot pass with missing, malformed or incomplete inputs', async () => {
  const c = await catalog();
  for (const input of [undefined, null, {}, { ...host, firewallActive: 'true' }, { ...host, unexpectedUdpListenerCount: -1 }]) {
    assert.equal(control(evaluateUdpExposure(c, 'full', external, input)).status, 'ERROR');
  }
  const partial = { ...external, observedResultCount: 6 };
  const row = control(evaluateUdpExposure(c, 'full', partial, host));
  assert.equal(row.status, 'ERROR'); assert.equal(row.evidence.category, 'evidence-incomplete');
  for (const input of [undefined, {}, { ...positive, openSelectedUdpPortCount: '1' },
    { ...positive, observedResultCount: 0 }, { ...positive, rawResponse: 'discard this' }]) {
    const error = control(evaluateUdpExposure(c, 'full', input, host));
    assert.equal(error.status, 'ERROR');
    assert.equal(JSON.stringify(error).includes('discard this'), false);
  }
});

test('V2 UDP: complete external and host policy facts preserve the safe/unsafe decision table', async () => {
  const c = await catalog();
  const good = control(evaluateUdpExposure(c, 'exposure', external, host));
  assert.equal(good.status, 'PASS'); assert.deepEqual(good.evidence.metrics, { ...external, ...host });
  for (const patch of [{ unexpectedUdpListenerCount: 1 }, { unexpectedUdpAllowRuleCount: 1 },
    { unexpectedUdpPublicationCount: 1 }, { firewallActive: false }, { defaultDenyInbound: false }]) {
    assert.equal(control(evaluateUdpExposure(c, 'full', external, { ...host, ...patch })).status, 'FAIL');
  }
  assert.throws(() => evaluateUdpExposure(c, 'invalid-profile', external, host));
});

test('V2 UDP proof: positive-only evidence is closed and exclusive to a real positive FAIL', () => {
  assert.deepEqual(parseAuditEvidence('udp-exposure-v1', 'FAIL', evidence(positive)), evidence(positive));
  for (const status of ['PASS', 'ERROR']) assert.throws(() => parseAuditEvidence('udp-exposure-v1', status, evidence(positive)));
  for (const patch of [{ openSelectedUdpPortCount: 0 }, { openSelectedUdpPortCount: -1 },
    { openSelectedUdpPortCount: 2 }, { openSelectedUdpPortCount: true }, { openSelectedUdpPortCount: NaN },
    { observedResultCount: 0 }, { observedResultCount: 8 }, { expectedResultCount: 0 },
    { expectedResultCount: 1e12 + 1 }, { expectedResultCount: Infinity }, { observedResultCount: 0.5 },
    { firewallActive: true }, { unknown: false }]) {
    assert.throws(() => parseAuditEvidence('udp-exposure-v1', 'FAIL', evidence({ ...positive, ...patch })));
  }
  for (const key of Object.keys(positive)) {
    const missing = { ...positive }; delete missing[key];
    assert.throws(() => parseAuditEvidence('udp-exposure-v1', 'FAIL', evidence(missing)));
  }
});

test('V2 UDP proof: full evidence rejects a forged PASS or unsupported FAIL and retains old complete shapes', () => {
  const complete = { ...external, ...host };
  assert.deepEqual(parseAuditEvidence('udp-exposure-v1', 'PASS', evidence(complete)), evidence(complete));
  assert.throws(() => parseAuditEvidence('udp-exposure-v1', 'FAIL', evidence(complete)));
  for (const patch of [{ observedResultCount: 6 }, { observedResultCount: 0, expectedResultCount: 0 },
    { openSelectedUdpPortCount: 1 }, { unexpectedUdpListenerCount: 1 }, { unexpectedUdpAllowRuleCount: 1 },
    { unexpectedUdpPublicationCount: 1 }, { firewallActive: false }, { defaultDenyInbound: false }]) {
    assert.throws(() => parseAuditEvidence('udp-exposure-v1', 'PASS', evidence({ ...complete, ...patch })));
  }
  const oldPositive = { ...complete, openSelectedUdpPortCount: 1 };
  assert.deepEqual(parseAuditEvidence('udp-exposure-v1', 'FAIL', evidence(oldPositive)), evidence(oldPositive));
});

async function report(profile) {
  const c = await catalog(), slots = await errorArtifacts(profile);
  slots.find(slot => slot.producerId === 'composite-exposure').artifact = evaluateUdpExposure(c, profile, positive, undefined);
  return assembleAuditReportV2({ ...envelope, reportType: profile, artifacts: slots });
}

test('V2 UDP assembly: confirmed HIGH finding coexists with all missing host errors in both exact profiles', async () => {
  for (const profile of ['full', 'exposure']) {
    const value = await report(profile);
    assert.equal(value.counts.fail, 1); assert.equal(value.counts.high, 1); assert.equal(value.counts.pass, 0);
    assert.equal(value.counts.error, profile === 'full' ? 69 : 22);
    assert(value.sections.internal.controls.every(row => row.status === 'ERROR'));
    const row = value.sections.external.controls.find(row => row.controlId === 'external.public-udp-ports');
    assert.equal(row.status, 'FAIL'); assert.equal(row.failureSeverity, 'HIGH');
    assert.deepEqual(row.evidence.metrics, positive);
    assert.deepEqual(await parseSecurityAuditReportV2(value, { purpose: 'retained' }), value);
  }
});

test('V2 UDP ingestion and exports: retain signed real finding without fabricated host facts and reject a signed forged PASS', async () => {
  const value = await report('full'), timestamp = '1793880120', nonce = 'synthetic-udp-contract-nonce-0001', secret = 'synthetic-only-'.repeat(4);
  const args = report => { const body = Buffer.from(canonicalAuditJson(report)); return { body, secret,
    now: new Date(Number(timestamp) * 1000), headers: { timestamp, nonce, signature: signAuditRequestV2(secret, timestamp, nonce, body) },
    receiver: { targetOrigin: ingestionContext.targetOrigin, receiverRevision: ingestionContext.receiverRevision, receiverImage: ingestionContext.receiverImage } }; };
  assert.deepEqual((await authenticateAuditRequestV2(args(value))).report, value);
  for (const format of ['json', 'html']) {
    const download = await auditDownloadBytesV2(value, format);
    assert.equal(download.sha256, crypto.createHash('sha256').update(download.body).digest('hex'));
    if (format === 'json') assert.deepEqual(JSON.parse(download.body.toString()), value);
    else assert(download.body.toString().includes('external.public-udp-ports'));
  }
  const row = value.sections.external.controls.find(row => row.controlId === 'external.public-udp-ports');
  row.status = 'PASS'; value.counts.fail--; value.counts.high--; value.counts.pass++;
  const { digestSha256: _old, ...payload } = value; value.digestSha256 = await auditDigest(payload);
  await assert.rejects(authenticateAuditRequestV2(args(value)));
});
