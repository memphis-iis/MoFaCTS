import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { parseHostAuditAcquisitionV2, writeHostAcquisitionFilesV2 } from '../internal/hostAcquisitionV2.mjs';
import { hostAcquisitionFixture } from './fixtures/hostAcquisitionFixtures.mjs';
import { hostNow } from './fixtures/hostFixtures.mjs';

const encoded = value => Buffer.from(canonicalAuditJson(value) + '\n');
async function directory(t) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'mofacts-host-acquisition-'));
  await fs.chmod(root, 0o700);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
test('host carriage validates both unchanged nested contracts and preserves explicit unavailable/mismatching identity', async () => {
  const fixture = await hostAcquisitionFixture();
  assert.deepEqual(await parseHostAuditAcquisitionV2(encoded(fixture), hostNow), fixture);
  fixture.releaseReceipt.result = 'MISMATCH';
  assert.equal((await parseHostAuditAcquisitionV2(encoded(fixture), hostNow)).releaseReceipt.result, 'MISMATCH');
  fixture.releaseReceipt = { state: 'unavailable', reason: 'receipt-file-missing' };
  assert.deepEqual((await parseHostAuditAcquisitionV2(encoded(fixture), hostNow)).releaseReceipt, { state: 'unavailable', reason: 'release-unavailable' });
});
test('host carriage rejects old formats, extra fields, duplicate keys, excessive bytes and invalid nested observations', async () => {
  for (const change of [
    value => { value.schema = 'SecurityAuditReportV1'; },
    value => { value.rawCredentials = 'never accepted'; },
    value => { value.hostObservations.observedAt = '2026-11-04T12:00:00.000Z'; },
    value => { delete value.hostObservations.observations.mongoRoles; },
    value => { value.releaseReceipt.receipt.schema = 'MoFaCTSReleaseReceiptV1'; },
    value => { value.releaseReceipt.result = 'PASS'; },
    value => { value.releaseReceipt = { state: 'unavailable', reason: 'private diagnostic text' }; },
  ]) {
    const fixture = await hostAcquisitionFixture(); change(fixture);
    await assert.rejects(parseHostAuditAcquisitionV2(encoded(fixture), hostNow));
  }
  const bytes = encoded(await hostAcquisitionFixture());
  await assert.rejects(parseHostAuditAcquisitionV2(Buffer.from('{"schema":"ignored",' + bytes.toString().slice(1)), hostNow));
  await assert.rejects(parseHostAuditAcquisitionV2(Buffer.alloc(65537), hostNow));
});
test('file carriage allocates only validated separate outputs and never overwrites an existing observation', async t => {
  const root = await directory(t), input = path.join(root, 'acquisition.json');
  const args = { acquisitionPath: input, hostObservationPath: path.join(root, 'host.json'), releaseReceiptPath: path.join(root, 'receipt.json'), now: hostNow };
  const fixture = await hostAcquisitionFixture(); await fs.writeFile(input, encoded(fixture));
  assert.deepEqual(await writeHostAcquisitionFilesV2(args), { receiptMatched: true });
  assert.deepEqual(JSON.parse(await fs.readFile(args.hostObservationPath, 'utf8')), fixture.hostObservations);
  assert.deepEqual(JSON.parse(await fs.readFile(args.releaseReceiptPath, 'utf8')), fixture.releaseReceipt);
  await assert.rejects(writeHostAcquisitionFilesV2(args));
  await assert.rejects(writeHostAcquisitionFilesV2({ ...args, hostObservationPath: input }));
  await fs.writeFile(input, '{}\n');
  const absent = path.join(root, 'absent.json');
  await assert.rejects(writeHostAcquisitionFilesV2({ ...args, hostObservationPath: absent }));
  await assert.rejects(fs.lstat(absent), { code: 'ENOENT' });
});
test('file-only CLI uses the same bounded parser, requires exactly three paths and withholds rejected input', async t => {
  const root = await directory(t), fixture = await hostAcquisitionFixture();
  fixture.hostObservations.observedAt = new Date().toISOString();
  const input = path.join(root, 'input.json'), host = path.join(root, 'host.json'), receipt = path.join(root, 'receipt.json');
  await fs.writeFile(input, encoded(fixture));
  const script = new URL('../internal/hostAcquisitionV2.mjs', import.meta.url);
  const run = args => spawnSync(process.execPath, [fileURLToPath(script), ...args], { encoding: 'utf8', timeout: 10000 });
  assert.equal(run([input, host, receipt]).status, 0);
  assert.equal(run([input, host, receipt, 'extra']).status, 1);
  const invalid = { privateCredentials: 'must-not-appear-in-diagnostics' }; await fs.writeFile(input, encoded(invalid));
  const rejected = run([input, path.join(root, 'absent-host'), path.join(root, 'absent-receipt')]);
  assert.equal(rejected.status, 1); assert(!rejected.stdout.includes(invalid.privateCredentials));
  assert(!rejected.stderr.includes(invalid.privateCredentials));
  await assert.rejects(fs.lstat(path.join(root, 'absent-host')), { code: 'ENOENT' });
});
test('root forced-command carriage executes only fixed protected children and rejects extra authority or oversized output', {
  skip: process.platform !== 'linux' || process.getuid?.() !== 0,
}, async t => {
  const root = await directory(t), fixture = await hostAcquisitionFixture();
  const collector = path.join(root, 'collector.sh'), receipt = path.join(root, 'receipt.sh');
  const hostFile = path.join(root, 'host.json'), receiptFile = path.join(root, 'receipt.json');
  await fs.writeFile(hostFile, encoded(fixture.hostObservations)); await fs.writeFile(receiptFile, encoded(fixture.releaseReceipt));
  await fs.writeFile(collector, `#!/bin/sh\ncat '${hostFile}'\n`, { mode: 0o755 });
  await fs.writeFile(receipt, `#!/bin/sh\n[ "$#" = 1 ] && [ "$1" = read-v2 ] || exit 64\ncat '${receiptFile}'\n`, { mode: 0o755 });
  const source = (await fs.readFile(new URL('../../../../deploy/security-audit/host-audit-v2.sh', import.meta.url), 'utf8'))
    .replaceAll('\r\n', '\n').replace('/usr/local/libexec/mofacts-security-audit/host-observations.sh', collector)
    .replace('/usr/local/libexec/mofacts-security-audit/release-receipt.sh', receipt);
  const run = (args = [], env = process.env) => spawnSync('/bin/bash', ['-c', source, 'host-carriage', ...args], { encoding: 'utf8', env, timeout: 10000, maxBuffer: 65536 });
  const normal = run(); assert.equal(normal.status, 0, normal.stderr);
  assert.deepEqual(await parseHostAuditAcquisitionV2(Buffer.from(normal.stdout), hostNow), fixture);
  assert.equal(run(['unapproved']).status, 64);
  assert.equal(run([], { ...process.env, SSH_ORIGINAL_COMMAND: 'shell' }).status, 64);
  await fs.chmod(collector, 0o777); assert.equal(run().status, 69); await fs.chmod(collector, 0o755);
  await fs.writeFile(hostFile, Buffer.alloc(49154, 'x')); assert.equal(run().status, 69);
  await fs.writeFile(hostFile, encoded(fixture.hostObservations)); await fs.unlink(receipt);
  await fs.symlink(collector, receipt); assert.equal(run().status, 69);
});
