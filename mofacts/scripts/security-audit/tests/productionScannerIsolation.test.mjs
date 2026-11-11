import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const workflow = fs.readFileSync(new URL('../../../../.github/workflows/production-security-audit.yml', import.meta.url), 'utf8');
const retained = '09f0c32fc2af6d220c699dd805133df3c0507c2e';
function selected(text) {
  const refs = [...text.matchAll(/^\s+ref: ([a-f0-9]{40})\s*$/gm)];
  assert.equal(refs.length, 1, 'One immutable production scanner checkout is required');
  const revision = refs[0][1];
  assert.ok(text.includes(`test "$scanner_revision" = ${revision}`), 'Checkout and runtime assertion must agree');
  assert.ok(text.includes('GITHUB_SHA="$AUDIT_SCANNER_REVISION" AUDIT_TOOL_VERSIONS_JSON='),
    'V1 reports must identify the checked-out scanner rather than the workflow commit');
  return revision;
}
function source(revision, path) {
  assert.match(revision, /^[a-f0-9]{40}$/);
  return execFileSync('git', ['-C', root, 'show', `${revision}:${path}`], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
}
test('production remains paired with the immutable V1 scanner while the application candidate activates V2', () => {
  assert.equal(selected(workflow), retained);
  assert.match(source(retained, 'mofacts/scripts/security-audit/upload-report.mjs'), /\/internal\/security-audits\/v1/);
  assert.match(source(retained, 'mofacts/server/http/securityAudits.ts'), /use\('\/internal\/security-audits\/v1'/);
  assert.match(source(retained, 'mofacts/scripts/security-audit/assemble-report.mjs'), /process\.env\.GITHUB_SHA/);
  const binding = fs.readFileSync(new URL('../../../server/http/securityAudits.ts', import.meta.url), 'utf8');
  assert.match(binding, /use\('\/internal\/security-audits\/v2'/);
  assert.doesNotMatch(binding, /\/internal\/security-audits\/v1|securityAuditStorage/);
});
test('scanner update/rollback requires matching immutable selection and runtime assertion', () => {
  assert.throws(() => selected(workflow.replace(`ref: ${retained}`, 'ref: main')));
  assert.throws(() => selected(workflow.replace(`ref: ${retained}`, `ref: ${'a'.repeat(40)}`)));
  assert.throws(() => selected(workflow.replace('GITHUB_SHA="$AUDIT_SCANNER_REVISION" ', '')));
  // A coordinated update preserves the same contract; reverting the complete
  // change restores the original exact selection rather than a moving branch.
  const changed = workflow.replaceAll(retained, 'a'.repeat(40));
  assert.equal(selected(changed), 'a'.repeat(40));
  assert.equal(selected(changed.replaceAll('a'.repeat(40), retained)), retained);
});
