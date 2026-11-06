const fs = require('node:fs');
const path = require('node:path');
const [checkout, workspace] = process.argv.slice(2);
if (process.argv.length !== 4 || !path.isAbsolute(checkout) || !path.isAbsolute(workspace)) {
  throw Error('Invalid isolation probe arguments');
}
if (fs.existsSync('/var/run/docker.sock')) throw Error('Test worker has Docker access');
if (process.getuid() !== 2000) throw Error('Test worker must use its non-root UID');
const capabilities = /^CapEff:\s+([0-9a-f]+)$/m.exec(fs.readFileSync('/proc/self/status', 'utf8'));
if (!capabilities || BigInt('0x' + capabilities[1]) !== 0n) throw Error('Test worker has effective capabilities');
const { parseMounts } = require(path.join(checkout, 'mofacts/scripts/security-audit/qualification/sealCapture.mjs'));
const mounts = parseMounts(fs.readFileSync('/proc/self/mountinfo', 'utf8'));
for (const [target, mode] of [[checkout, 'ro'], [workspace, 'ro'], [path.join(workspace, 'test-context'), 'rw']]) {
  const matches = mounts.filter(mount => mount.target === target);
  if (matches.length !== 1 || !matches[0].options.includes(mode) || matches[0].propagation.length) {
    throw Error('Incorrect native integration mount protection');
  }
}
// Source checkout files belong to the host operator. With zero capabilities,
// their mode bits can reject writes before the mount check. Kernel mount state
// above verifies that boundary; the following files are owned by the worker UID.
for (const file of [path.join(workspace, 'capture.json'), path.join(workspace, 'context/mofacts/.meteor/release')]) {
  // Neither operation changes bytes or permissions if a mount is incorrectly
  // writable. Both must fail with EROFS, not merely user-mode access denial.
  for (const operation of [() => fs.closeSync(fs.openSync(file, 'a')),
    () => fs.chmodSync(file, fs.statSync(file).mode & 0o777)]) {
    try { operation(); } catch (error) { if (error.code === 'EROFS') continue; throw error; }
    throw Error('Retained integration source is writable');
  }
}
const derivative = path.join(workspace, 'test-context/mofacts/.meteor/release');
fs.closeSync(fs.openSync(derivative, 'a'));
fs.writeFileSync('/evidence/isolation.json', JSON.stringify({
  schema: 'NativeIntegrationIsolationV1', dockerSocketAbsent: true,
  workerUid: 2000, effectiveCapabilitiesZero: true, readOnlyMountsVerified: 2,
  readOnlyFileOperationsRefused: 4, testCopyWritable: true,
}) + '\n', { flag: 'wx', mode: 0o600 });
