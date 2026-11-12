import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
const template = new URL('../../../../deploy/security-audit/staging2-v2-workflow.yml.review', import.meta.url);
const text = fs.readFileSync(template, 'utf8'), workflow = yaml.load(text);
test('report writer remains an inactive reviewed main-only staging2 workflow without production or release operations', () => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  const job = workflow.jobs.audit;
  assert.equal(job.environment, 'staging2-security-audit'); assert.equal(job.if, "github.ref == 'refs/heads/main'");
  assert.equal(job.env.AUDIT_TARGET, 'https://staging2.optimallearning.org');
  assert(!fs.existsSync(new URL('../../../../.github/workflows/staging2-security-audit-v2.yml', import.meta.url)));
  assert.doesNotMatch(text, /test:ci|docker build|docker compose|production-security-audit|tags: tag:ci/);
});
test('workflow scopes credential channels, uploads only encrypted output and asserts complete execution after storage', () => {
  const steps = workflow.jobs.audit.steps;
  const signer = steps.filter(step => Object.hasOwn(step.env ?? {}, 'AUDIT_REPORT_INGEST_SECRET'));
  assert.equal(signer.length, 1); assert.match(signer[0].run, /upload-report-v2\.mjs/);
  const encryption = steps.find(step => Object.hasOwn(step.env ?? {}, 'AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY'));
  assert.equal(encryption.env.AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY, '${{ vars.AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY }}');
  const upload = steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(upload.with.path, '${{ runner.temp }}/mofacts-v2-retained/report.encrypted.json');
  const assemble = steps.findIndex(step => step.name === 'Assemble the exact V2 report after acquisition');
  const assertion = steps.findIndex(step => step.run?.includes('assert-execution-complete-v2.mjs'));
  assert(assemble > steps.findIndex(step => step.run?.includes('emit-repository-producer-v2.mjs')));
  assert(assertion > steps.indexOf(signer[0])); assert(assertion > steps.indexOf(upload));
  assert.equal(steps.at(-1).if, 'always()'); assert.match(steps.at(-1).run, /rm -rf -- "\$private_dir"/);
});
