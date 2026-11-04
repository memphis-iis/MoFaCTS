// Invoked as root only by the hosted Linux fixture test. No host /etc paths or
// live containers are touched: fixed paths are rewritten into one owned temp root.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fixture from '../../../../common/securityAudit/fixtures/release-record.fixture.json' with { type: 'json' };
import { projectReleaseReceipt } from '../../qualification/releaseRecordStore.mjs';
import { dockerImageFixture } from './dockerImageArchiveFixture.mjs';

assert.equal(process.getuid(), 0);
assert.equal(spawnSync('jq', ['--version']).status, 0, 'Hosted runner must supply its existing jq');
const temporary = await fs.realpath(os.tmpdir());
const root = await fs.mkdtemp(path.join(temporary, 'mofacts-host-receipt-test-'));
await fs.chmod(root, 0o700);
const config = path.join(root, 'security-audit.conf');
const receipt = path.join(root, 'release-receipt.json');
const moduleFile = path.join(root, 'releaseReceipt.mjs');
const imageModule = path.join(root, 'imageArchiveIdentity.mjs');
const script = path.join(root, 'release-receipt.sh');
const bin = path.join(root, 'bin');
await fs.mkdir(bin, { mode: 0o700 });
const state = path.join(root, 'image-id');
const initialImage = dockerImageFixture();
const imageId = initialImage.configDigest;
const archiveFile = path.join(root, 'image.tar');
const inspectionFile = path.join(root, 'inspection.json');
async function imageState(value) {
  await fs.writeFile(state, value.inspection.nativeId);
  await fs.writeFile(archiveFile, value.archive());
  await fs.writeFile(inspectionFile, JSON.stringify(value.inspection));
}
const input = JSON.stringify(projectReleaseReceipt(Buffer.from(JSON.stringify({ ...fixture, imageId,
  qualification: { ...fixture.qualification, builtImage: { ...fixture.qualification.builtImage, configDigest: imageId },
    publishedImage: { ...fixture.qualification.publishedImage, configDigest: imageId },
    runningImage: { ...fixture.qualification.runningImage, configDigest: imageId } },
  acceptance: 'operator-confirmed readiness and participant smoke checks' }))));
const source = await fs.readFile(new URL('../../../../../deploy/security-audit/release-receipt.sh', import.meta.url), 'utf8');
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
try {
  await fs.writeFile(config, 'MOFACTS_APP_CONTAINER=mofacts-app\n', { mode: 0o600 });
  await fs.writeFile(moduleFile, await fs.readFile(new URL('../../qualification/releaseReceipt.mjs', import.meta.url)), { mode: 0o644 });
  await fs.writeFile(imageModule, await fs.readFile(new URL('../../qualification/imageArchiveIdentity.mjs', import.meta.url)), { mode: 0o644 });
  await fs.writeFile(script, source.replace('CONFIG_FILE=/etc/mofacts/security-audit.conf', 'CONFIG_FILE=' + shellQuote(config))
    .replace('RECEIPT_FILE=/etc/mofacts/release-receipt.json', 'RECEIPT_FILE=' + shellQuote(receipt))
    .replace('MODULE_FILE=/usr/local/libexec/mofacts-security-audit/releaseReceipt.mjs', 'MODULE_FILE=' + shellQuote(moduleFile))
    .replace('IMAGE_IDENTITY_MODULE=/usr/local/libexec/mofacts-security-audit/imageArchiveIdentity.mjs', 'IMAGE_IDENTITY_MODULE=' + shellQuote(imageModule)), { mode: 0o755 });
  await imageState(initialImage);
  const docker = path.join(bin, 'docker');
  await fs.writeFile(docker, `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  inspect) if [[ "$3" == '{{.Id}}' ]]; then printf '%s\\n' '${'1'.repeat(64)}'; else printf '%s true ' '${'1'.repeat(64)}'; cat ${shellQuote(state)}; fi ;;
  image) if [[ "$2" == save ]]; then cat ${shellQuote(archiveFile)}; elif [[ "$4" == *nativeId* ]]; then cat ${shellQuote(inspectionFile)}; else printf '%s\\n' '${fixture.baseCommit}'; fi ;;
  exec) shift 4; exec ${shellQuote(process.execPath)} "$@" ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
  const run = (action, bytes = '') => spawnSync('bash', [script, action], {
    input: bytes, encoding: 'utf8', timeout: 10000, maxBuffer: 32768,
    env: { ...process.env, PATH: bin + ':' + process.env.PATH },
  });
  let result = run('read');
  assert.equal(JSON.parse(result.stdout).reason, 'not-installed');
  result = run('install', input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).state, 'receipt-installed-unqualified');
  assert.equal((await fs.stat(receipt)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(receipt)).uid, 0);
  assert.equal(JSON.parse(run('read').stdout).result, 'MATCH');
  for (const kind of ['manifest', 'index']) {
    await imageState(dockerImageFixture(kind));
    assert.equal(JSON.parse(run('read').stdout).result, 'MATCH', 'Engine IDs must resolve to unchanged config identity');
    assert.equal(run('install', input).status, 0);
  }
  await imageState(initialImage);
  await fs.chmod(imageModule, 0o666);
  assert.equal(JSON.parse(run('read').stdout).reason, 'protected-parser-unavailable');
  assert.equal(run('install', input).status, 1);
  await fs.chmod(imageModule, 0o644);
  await fs.writeFile(archiveFile, 'invalid Docker export');
  assert.equal(JSON.parse(run('read').stdout).reason, 'running-image-unavailable');
  assert.equal(run('install', input).status, 1);
  await imageState(initialImage);
  const prior = await fs.readFile(receipt);
  const failedMove = path.join(bin, 'mv');
  await fs.writeFile(failedMove, '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 });
  assert.equal(run('install', input).status, 1);
  assert.deepEqual(await fs.readFile(receipt), prior);
  assert.deepEqual((await fs.readdir(root)).filter(name => name.startsWith('.release-receipt.')), []);
  await fs.unlink(failedMove);
  await imageState(dockerImageFixture('index', 'different-config'));
  assert.equal(JSON.parse(run('read').stdout).result, 'MISMATCH');
  result = run('install', input);
  assert.equal(result.status, 1);
  assert.deepEqual(await fs.readFile(receipt), prior);
  await imageState(initialImage);
  for (const bytes of [input + ' '.repeat(8193), JSON.stringify({ ...JSON.parse(input), rawOutput: 'synthetic-private-value' })]) {
    result = run('install', bytes);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-value/);
    assert.deepEqual(await fs.readFile(receipt), prior);
  }
  await fs.chmod(receipt, 0o644);
  assert.equal(JSON.parse(run('read').stdout).reason, 'unsafe-receipt');
  assert.equal(run('install', input).status, 1);
  await fs.chmod(receipt, 0o600);
  const target = path.join(root, 'outside.json');
  await fs.writeFile(target, prior, { mode: 0o600 });
  await fs.unlink(receipt);
  await fs.symlink(target, receipt);
  assert.equal(run('install', input).status, 1);
  assert.deepEqual(await fs.readFile(target), prior);
  await fs.unlink(receipt);
  await fs.writeFile(receipt, prior, { mode: 0o600 });
  await fs.chmod(moduleFile, 0o666);
  assert.equal(JSON.parse(run('read').stdout).reason, 'protected-parser-unavailable');
  await fs.chmod(moduleFile, 0o644);
  await fs.mkdir(receipt + '.lock', { mode: 0o700 });
  assert.equal(JSON.parse(run('install', input).stdout).reason, 'receipt-writer-busy');
  await fs.rmdir(receipt + '.lock');
  assert.equal(run('install', input).status, 0);
  assert.deepEqual((await fs.readdir(root)).filter(name => name.startsWith('.release-receipt.')), []);
  process.stdout.write('Protected host receipt fixtures passed.\n');
} finally {
  assert.equal(path.dirname(root), temporary);
  assert.ok(path.basename(root).startsWith('mofacts-host-receipt-test-'));
  await fs.rm(root, { recursive: true, force: true });
}
