import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import membership from './fixtures/v1-membership.json' with { type: 'json' };
import { historicalScannerPath, historicalScannerModule } from './helpers/historicalScanner.mjs';
import { canonicalJson, parseSecurityAuditReport } from '../../../common/securityAuditReport.ts';

const { control, section, canonicalJson: scannerCanonicalJson } = await historicalScannerModule('audit-lib.mjs');
const appRoot = fileURLToPath(new URL('../../../', import.meta.url));

test('Phase 0: the V1 membership fixture has a fixed shared/scanner canonical digest', () => {
  assert.equal(canonicalJson(membership), scannerCanonicalJson(membership));
  assert.equal(createHash('sha256').update(canonicalJson(membership)).digest('hex'),
    '37bd0109ed7c4c14755566692d0e32ae71e95b19ef91de091b7d5dc743b0dfeb');
});

function assembler(t, mode) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mofacts-audit-phase0-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('mofacts-audit-phase0-'));
    fs.rmSync(directory, { recursive: true });
  });
  const inputs = Object.fromEntries(Object.entries(membership).map(([id, ids]) => [id, section(id,
    ids.map((controlId) => control(controlId, 'Synthetic fixture control', 'PASS', 'INFO', 'Synthetic contract fixture')),
  )]));
  // Satisfy the current composite UDP proof shape without making a network call.
  const metric = (id, metrics) => { inputs.internal.controls.find((entry) => entry.controlId === id).evidence.metrics = metrics; };
  metric('internal.listening-sockets', { unexpectedUdpListenerCount: 0 });
  metric('internal.docker-ports', { unexpectedUdpPublicationCount: 0 });
  metric('internal.firewall', { unexpectedUdpAllowRuleCount: 0, firewallActive: true, defaultDenyInbound: true });
  const paths = Object.keys(inputs).map((id) => {
    const target = path.join(directory, `${id}.json`);
    fs.writeFileSync(target, JSON.stringify(inputs[id]), { mode: 0o600 });
    return [id, target];
  });
  const inputPaths = Object.fromEntries(paths);
  const output = path.join(directory, 'report.json');
  // The actual assembler only reads/writes these synthetic files. Deliberately
  // exclude scanner secrets, runtime settings and unrelated ambient variables.
  execFileSync(process.execPath, [
    historicalScannerPath('assemble-report.mjs'), mode,
    inputPaths.external, inputPaths.internal, inputPaths.authentication, inputPaths.repository, output,
  ], { cwd: appRoot, windowsHide: true, timeout: 10000, stdio: 'pipe', env: {
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    AUDIT_STARTED_AT: '2026-01-01T00:00:00.000Z', AUDIT_REPORT_ID: 'audit-phase0-synthetic', GITHUB_SHA: 'a'.repeat(40),
  } });
  return JSON.parse(fs.readFileSync(output, 'utf8'));
}

test('Phase 0 V1 fixture: full membership is exactly 52 controls in pinned assembler order', (t) => {
  const report = assembler(t, 'full');
  for (const [id, ids] of Object.entries(membership)) {
    assert.deepEqual(report.sections[id].controls.map((entry) => entry.controlId), ids);
  }
  assert.equal(report.counts.pass, 52);
  assert.equal(report.counts.error, 0);
  assert.deepEqual(parseSecurityAuditReport(report), report);
});

test('Phase 0 V1 fixture: exposure preserves the two existing not-applicable placeholders', (t) => {
  const report = assembler(t, 'exposure');
  for (const id of ['external', 'internal']) {
    assert.deepEqual(report.sections[id].controls.map((entry) => entry.controlId), membership[id]);
  }
  for (const id of ['authentication', 'repository']) {
    assert.deepEqual(report.sections[id].controls.map((entry) => entry.controlId), [`${id}.not-applicable`]);
  }
  assert.equal(report.counts.pass, 20);
  assert.equal(report.counts.notApplicable, 2);
});
