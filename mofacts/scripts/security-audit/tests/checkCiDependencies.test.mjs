import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assessCiDependencies } from '../check-ci-dependencies.mjs';

const policy = { schema: 'DevelopmentDependencyExposurePolicyV1', confirmedBuildExposures: [] };

function audit(entries = []) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: entries.length };
  const vulnerabilities = {};
  for (const [name, severity] of entries) {
    counts[severity] += 1;
    vulnerabilities[name] = { severity, via: [{ source: 101 }] };
  }
  return { metadata: { vulnerabilities: counts }, vulnerabilities };
}

test('CI keeps development high and critical advisories informational', () => {
  const result = assessCiDependencies(audit([['dev-high', 'high'], ['dev-critical', 'critical']]), audit(), policy, 'application');
  assert.equal(result.status, 'PASS');
  assert.equal(result.developmentFindings.length, 2);
  assert.equal(result.developmentPosture.maintenanceAdvisoryPackageCount, 2);
});

for (const severity of ['high', 'critical']) {
  test(`CI blocks ${severity} production advisories in both lockfiles`, () => {
    const runtime = audit([['shared-package', severity]]);
    for (const lockfile of ['application', 'sidecar-mongo']) {
      const result = assessCiDependencies(runtime, runtime, policy, lockfile);
      assert.equal(result.status, 'FAIL');
      assert.equal(result.blockingRuntimeFindings.length, 1);
      assert.equal(result.developmentFindings.length, 0);
    }
  });
}

test('CI preserves the high threshold while reporting moderate runtime advisories', () => {
  const runtime = audit([['runtime-moderate', 'moderate']]);
  const result = assessCiDependencies(runtime, runtime, policy, 'application');
  assert.equal(result.status, 'PASS');
  assert.equal(result.runtimeFindings.length, 1);
});

test('CI blocks a specifically reviewed build exposure and respects its lockfile owner', () => {
  const reviewed = {
    ...policy,
    confirmedBuildExposures: [{ lockfile: 'application', package: 'dev-high', advisoryId: '101', rationaleId: 'ci-untrusted-input-rce' }],
  };
  const all = audit([['dev-high', 'high']]);
  assert.equal(assessCiDependencies(all, audit(), reviewed, 'application').status, 'FAIL');
  assert.equal(assessCiDependencies(all, audit(), reviewed, 'sidecar-mongo').status, 'PASS');
});

test('CI rejects audit errors, incomplete output, contradictory counts, and invalid policy', () => {
  for (const invalid of [
    {},
    { ...audit(), error: { code: 'E401' } },
    { ...audit(), metadata: { vulnerabilities: { high: 0, critical: 0 } } },
    { ...audit([['runtime-high', 'high']]), metadata: audit().metadata },
    { ...audit(), vulnerabilities: { unknown: { severity: 'unknown' } } },
  ]) {
    assert.throws(() => assessCiDependencies(invalid, audit(), policy, 'application'));
    assert.throws(() => assessCiDependencies(audit(), invalid, policy, 'application'));
  }
  assert.throws(() => assessCiDependencies(audit(), audit(), {}, 'application'));
  assert.throws(() => assessCiDependencies(audit(), audit(), policy, 'unknown'));
});

test('CI command returns the gate outcome and does not print raw registry error details', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mofacts-ci-dependencies-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const allPath = path.join(root, 'all.json');
  const runtimePath = path.join(root, 'runtime.json');
  const command = fileURLToPath(new URL('../check-ci-dependencies.mjs', import.meta.url));
  const invoke = () => spawnSync(process.execPath, [command, 'application', allPath, runtimePath], { encoding: 'utf8' });
  fs.writeFileSync(allPath, JSON.stringify(audit([['dev-high', 'high']])));
  fs.writeFileSync(runtimePath, JSON.stringify(audit()));
  assert.equal(invoke().status, 0);
  fs.writeFileSync(runtimePath, JSON.stringify(audit([['runtime-high', 'high']])));
  assert.equal(invoke().status, 1);
  fs.writeFileSync(allPath, JSON.stringify({ error: { summary: 'synthetic-private-registry-token' } }));
  const failed = invoke();
  assert.equal(failed.status, 1);
  assert.doesNotMatch(`${failed.stdout}${failed.stderr}`, /synthetic-private-registry-token/);
  assert.match(failed.stderr, /Dependency audit failed/);
});
