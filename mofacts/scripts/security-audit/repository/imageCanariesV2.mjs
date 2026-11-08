import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseAuditIdentity } from '../../../common/securityAudit/reportIdentity.ts';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';
import { imageDigest, proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { parseImageObservation } from '../../../common/securityAudit/releaseQualification.ts';
import { parseCiEvidenceJson } from '../qualification/ciEvidence.mjs';
import { readCiFile } from '../qualification/collectCiEvidence.mjs';
import { observeDockerImage, streamDockerImageIdentity } from '../qualification/observeDockerImage.mjs';
import { runRepositoryCommandV2, repositoryToolEnvironmentV2 } from './commandV2.mjs';
import { parseClientBundleCanariesV2 } from './clientBundleCanariesV2.mjs';

const ownerLabel = 'org.mofacts.security-audit.repository-canary.owner';
const scannerTarget = '/mofacts-audit/clientBundleCanariesV2.mjs';
const listingFormat = '{"id":{{json .ID}},"name":{{json .Names}}}';
const imageFormat = '{"nativeId":{{json .Id}},"platform":"{{.Os}}/{{.Architecture}}","digests":{{json .RepoDigests}}}';
const inspectFormat = `{"id":{{json .Id}},"name":{{json .Name}},"owner":{{json (index .Config.Labels "${ownerLabel}")}},"image":{{json .Image}},"config":{{json .Config}},"host":{{json .HostConfig}},"mounts":{{json .Mounts}},"state":{{json .State}}}`;
const invalid = () => { throw new Error('Image canary inspection incomplete'); };
const unavailable = reason => ({ state: 'unavailable', reason });
const same = (value, expected) => JSON.stringify(value) === JSON.stringify(expected);
function cleanupFailure(probe) {
  const error = new Error('Repository image probe cleanup did not complete; no observation was accepted.');
  error.code = 'AUDIT_IMAGE_PROBE_CLEANUP_INCOMPLETE';
  error.probe = { name: probe.name, owner: probe.owner, ...(probe.id ? { id: probe.id } : {}) };
  return error;
}

// This validates only the already-selected canary subset, never a full fixture.
function canaryInput(canaries) {
  const bytes = Buffer.from(JSON.stringify(parseClientBundleCanariesV2(canaries)));
  if (bytes.length > 65536) invalid(); return bytes;
}

function requireProbe(value, probe) {
  proofRecord(value, ['id', 'name', 'owner', 'image', 'config', 'host', 'mounts', 'state']);
  if (value.id !== probe.id || value.owner !== probe.owner || value.name !== '/' + probe.name) invalid();
  imageDigest(value.image);
  const { config, host } = value;
  if (config?.Image !== probe.image || !same(config.Entrypoint, ['/usr/local/bin/node'])
    || !same(config.Cmd, [scannerTarget]) || config.User !== '65534:65534' || config.OpenStdin !== true
    || config.AttachStdin !== true || config.StdinOnce !== true || config.Tty !== false
    || !same(config.Healthcheck?.Test, ['NONE']) || !Array.isArray(config.Env)
    || config.Env.filter(value => typeof value === 'string' && value.startsWith('NODE_OPTIONS=')).length !== 1
    || !config.Env.includes('NODE_OPTIONS=') || host?.NetworkMode !== 'none' || host.ReadonlyRootfs !== true
    || host.Privileged !== false || host.AutoRemove !== false || host.RestartPolicy?.Name !== 'no'
    || !same(host.CapDrop, ['ALL']) || (host.CapAdd !== null && !same(host.CapAdd, []))
    || !same(host.SecurityOpt, ['no-new-privileges:true']) || host.PidsLimit !== 64
    || host.Memory !== 128 * 1024 * 1024 || host.MemorySwap !== 128 * 1024 * 1024 || host.NanoCpus !== 500000000
    || host.LogConfig?.Type !== 'none' || !Array.isArray(value.mounts) || value.mounts.length !== 1) invalid();
  const mount = value.mounts[0];
  if (mount.Type !== 'bind' || mount.Source !== probe.scanner || mount.Destination !== scannerTarget || mount.RW !== false) invalid();
  return value;
}

function readScanResult(result) {
  if (result?.failure) return unavailable(result.failure === 'timeout' ? 'timeout' : 'evidence-incomplete');
  if (result?.exitCode !== 0) return unavailable('evidence-incomplete');
  try {
    const data = proofRecord(parseCiEvidenceJson(result.stdout, 16384), ['state', 'value']);
    if (data.state !== 'observed') invalid();
    const evidence = parseAuditEvidence('image-findings-v1', data.value?.findingCount === 0 ? 'PASS' : 'FAIL',
      { summary: 'The complete browser file inventory was inspected.', metrics: data.value });
    if (evidence.metrics.evaluatedCount < 2) invalid();
    return { state: 'observed', value: evidence.metrics };
  } catch { return unavailable('producer-malformed'); }
}

// No automatic pull/build, CLI registration, workflow, fixture loading or release
// qualification. This export performs Docker operations only when explicitly
// invoked in an approved lane. Tests replace both Docker/identity I/O boundaries.
export async function observeImageCanariesV2({ runtimeImage, canaries, environment }, dependencies = {}) {
  const env = repositoryToolEnvironmentV2(environment);
  if (Object.keys(dependencies).some(key => !['run', 'archive'].includes(key))) invalid();
  const run = Object.hasOwn(dependencies, 'run') ? dependencies.run : runRepositoryCommandV2;
  const archive = Object.hasOwn(dependencies, 'archive') ? dependencies.archive : (inspection => streamDockerImageIdentity(inspection, env));
  if (typeof run !== 'function' || typeof archive !== 'function') invalid();
  let input;
  try { input = canaryInput(canaries); }
  catch { return unavailable('configuration'); }
  try { parseAuditIdentity({ state: 'observed', value: runtimeImage }, 'platform-image'); }
  catch { return unavailable('identity-unavailable'); }
  const probe = { name: `mofacts-repository-canary-${randomUUID()}`, owner: randomUUID(), image: runtimeImage };
  const cwd = await fs.realpath(os.tmpdir());
  const execute = async (args, bytes, timeoutMs = 120000) => {
    try { return await run({ command: 'docker', args: ['--context', 'default', ...args], cwd,
      environment: env, input: bytes, timeoutMs, maximum: 16384 }); }
    catch { return { exitCode: -1, stdout: Buffer.alloc(0), failure: 'command-unavailable' }; }
  };
  const command = async (_command, args) => {
    const result = await execute(args.slice(2));
    if (result.exitCode !== 0 || result.failure) invalid(); return result.stdout;
  };
  const json = async args => parseCiEvidenceJson(await command('docker', ['--context', 'default', ...args]), 16384);
  async function listed(filter) {
    const bytes = await command('docker', ['--context', 'default', 'container', 'ls', '--all', '--no-trunc', '--filter', filter, '--format', listingFormat]);
    if (!bytes.toString('utf8').trim()) return undefined;
    const item = proofRecord(parseCiEvidenceJson(bytes, 16384), ['id', 'name']);
    if (typeof item.id !== 'string' || !/^[a-f0-9]{64}$/.test(item.id) || typeof item.name !== 'string') invalid();
    return item;
  }
  async function cleanup() {
    try {
      const item = await listed(probe.id ? `id=${probe.id}` : `name=^/${probe.name}$`);
      // A cancelled create request without a returned ID can still be executing
      // in the daemon. Immediate absence alone cannot prove that request finished.
      if (!probe.id && !item) invalid();
      if (item) {
        // A known immutable ID survives name changes. On ambiguous create output,
        // require the exact invocation name as well as its independent owner label.
        if ((probe.id && item.id !== probe.id) || (!probe.id && item.name !== probe.name)) invalid();
        const container = await json(['container', 'inspect', '--format', inspectFormat, item.id]);
        if (container.id !== item.id || container.owner !== probe.owner) invalid();
        const removed = await command('docker', ['--context', 'default', 'container', 'rm', '--force', '--volumes', item.id]);
        if (removed.toString('utf8').trim() !== item.id || await listed(`id=${item.id}`)) invalid();
      }
      if (await listed(`name=^/${probe.name}$`)) invalid();
    } catch {
      throw cleanupFailure(probe);
    }
  }
  let temporary, identity, attempted = false, outcome = unavailable('evidence-incomplete');
  async function inspectAndRun() {
    const selected = proofRecord(await json(['image', 'inspect', '--format', imageFormat, runtimeImage]), ['nativeId', 'platform', 'digests']);
    imageDigest(selected.nativeId);
    if (selected.platform !== 'linux/amd64' || !Array.isArray(selected.digests) || !selected.digests.includes(runtimeImage)) return unavailable('identity-conflict');
    // The existing bounded archive reader owns classic/containerd interpretation.
    // Memoize exact native references; never compare an index directly to config.
    const images = new Map();
    async function image(reference) {
      if (!images.has(reference)) images.set(reference, parseImageObservation(await observeDockerImage(reference, { command, archive })));
      return images.get(reference);
    }
    const selectedImage = await image(selected.nativeId);
    if (selectedImage.platform !== selected.platform) return unavailable('identity-conflict');
    if (await listed(`name=^/${probe.name}$`)) return unavailable('evidence-incomplete');
    temporary = await fs.mkdtemp(path.join(cwd, 'mofacts-image-canary-v2-'));
    identity = await fs.lstat(temporary, { bigint: true });
    probe.scanner = path.join(temporary, 'clientBundleCanariesV2.mjs');
    const source = await readCiFile(fileURLToPath(new URL('./clientBundleCanariesV2.mjs', import.meta.url)), 65536);
    await fs.writeFile(probe.scanner, source, { flag: 'wx', mode: 0o444 });
    if (probe.scanner.includes(',')) invalid();
    attempted = true;
    const created = await execute(['container', 'create', '--name', probe.name, '--label', `${ownerLabel}=${probe.owner}`,
      '--pull', 'never', '--platform', 'linux/amd64', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges:true', '--pids-limit', '64', '--memory', '128m', '--memory-swap', '128m',
      '--cpus', '0.5', '--user', '65534:65534', '--restart', 'no', '--log-driver', 'none', '--no-healthcheck',
      '--interactive', '--env', 'NODE_OPTIONS=', '--entrypoint', '/usr/local/bin/node',
      '--mount', `type=bind,source=${probe.scanner},target=${scannerTarget},readonly`, runtimeImage, scannerTarget]);
    if (created.exitCode !== 0 || created.failure) invalid();
    const id = created.stdout.toString('utf8').trim(); if (!/^[a-f0-9]{64}$/.test(id)) invalid(); probe.id = id;
    const before = requireProbe(await json(['container', 'inspect', '--format', inspectFormat, id]), probe);
    if (before.state?.Status !== 'created' || before.state.Running !== false) invalid();
    const actual = await image(before.image);
    if (actual.platform !== selectedImage.platform || actual.configDigest !== selectedImage.configDigest) return unavailable('identity-conflict');
    // All identity/restriction checks precede secret transfer or code execution.
    const result = await execute(['container', 'start', '--attach', '--interactive', id], input, 5 * 60 * 1000);
    outcome = readScanResult(result);
    const after = requireProbe(await json(['container', 'inspect', '--format', inspectFormat, id]), probe);
    if (after.image !== before.image || after.state?.Status !== 'exited' || after.state.Running !== false
      || after.state.ExitCode !== 0 || after.state.OOMKilled !== false || after.state.Error !== '') {
      if (outcome.state === 'observed') outcome = unavailable('evidence-incomplete');
    }
    if (!same(await readCiFile(probe.scanner, 65536), source)) invalid();
    return outcome;
  }
  try { outcome = await inspectAndRun(); }
  catch (error) {
    outcome = unavailable(error?.code === 'DOCKER_IMAGE_OBSERVATION_FAILED' ? 'identity-unavailable' : 'evidence-incomplete');
  }
  let failure;
  try { if (attempted) await cleanup(); }
  catch (error) { failure = error; }
  try {
    if (temporary) {
      const stat = await fs.lstat(temporary, { bigint: true });
      if (!identity || !stat.isDirectory() || stat.isSymbolicLink() || stat.ino !== identity.ino || stat.dev !== identity.dev) invalid();
      await fs.rm(temporary, { recursive: true });
    }
  } catch {
    failure ||= cleanupFailure(probe);
    if (temporary) failure.workspace = temporary;
  }
  if (failure) throw failure;
  return outcome;
}
