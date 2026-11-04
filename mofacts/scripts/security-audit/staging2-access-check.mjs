import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { INTERNAL_CONTROL_DEFINITIONS } from './internal-audit-contract.mjs';
import { parseReleaseReceipt } from './qualification/releaseReceipt.mjs';

const execute = promisify(execFile);
const tag = 'tag:staging2-audit';
const invalid = () => { throw new Error('Staging2 access acceptance failed'); };
const digestPattern = /^[a-f0-9]{64}$/;
const deniedPorts = [22, 53, 80, 443, 3000, 27017, 6379, 8931, 8932];

// Return only fixed control IDs/statuses and the already public image identity.
// Raw host output, tool diagnostics and connection coordinates are never retained.
export function acceptHostObservation(value, expectedRecordDigest) {
  if (!digestPattern.test(expectedRecordDigest ?? '') || value?.sectionId !== 'internal'
    || value.status !== 'PASS' || !Array.isArray(value.controls)
    || value.controls.length !== INTERNAL_CONTROL_DEFINITIONS.length) invalid();
  const expected = new Set(INTERNAL_CONTROL_DEFINITIONS.map(([id]) => id));
  for (const control of value.controls) {
    if (!expected.delete(control?.controlId) || control.status !== 'PASS') invalid();
  }
  if (expected.size || value.releaseReceipt?.state !== 'observed'
    || value.releaseReceipt.result !== 'MATCH') invalid();
  const receipt = parseReleaseReceipt(value.releaseReceipt.receipt);
  if (receipt.recordDigestSha256 !== expectedRecordDigest
    || receipt.includedUncommittedLocalChanges
    || !receipt.image.startsWith('ppavlikmemphis/mofacts-staging2:')) invalid();
  return {
    controls: INTERNAL_CONTROL_DEFINITIONS.map(([controlId]) => ({ controlId, status: 'PASS' })),
    receipt: { recordDigestSha256: receipt.recordDigestSha256,
      baseCommit: receipt.baseCommit, configDigest: receipt.imageId },
  };
}

function privateAddress(value) {
  if (net.isIP(value) === 4) {
    const [first, second] = value.split('.').map(Number);
    return first === 100 && second >= 64 && second <= 127;
  }
  return net.isIP(value) === 6 && value.toLowerCase().startsWith('fd7a:115c:a1e0:');
}

// A refusal can mean the port is reachable but closed. Only a timeout supplies
// the negative live observation; Tailscale's saved policy tests own ACL proof.
function requireTcpTimeout(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); reject(new Error('Unexpected connection')); });
    socket.once('error', () => { socket.destroy(); reject(new Error('Negative probe inconclusive')); });
    socket.once('timeout', () => { socket.destroy(); resolve(); });
  });
}

async function sshResult(args, extras = [], command = []) {
  try {
    const result = await execute('ssh', [...args, ...extras, ...command], {
      encoding: 'utf8', timeout: 180000, maxBuffer: 256 * 1024,
    });
    return { code: 0, ...result };
  } catch (error) {
    if (error.killed || typeof error.code !== 'number'
      || typeof error.stdout !== 'string' || typeof error.stderr !== 'string') invalid();
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

export async function runStaging2AccessCheck(outputFile, expectedRecordDigest, env = process.env) {
  let stage = 'inputs';
  let directory;
  try {
    if (process.platform !== 'linux' || !digestPattern.test(expectedRecordDigest ?? '')
      || !outputFile || !privateAddress(env.AUDIT_SSH_HOST)
      || env.AUDIT_SSH_USER !== 'mofacts-audit'
      || !env.AUDIT_SSH_PRIVATE_KEY || !env.AUDIT_SSH_KNOWN_HOSTS) invalid();
    const peers = JSON.parse(env.AUDIT_DENIED_PEERS_JSON ?? 'null');
    if (!Array.isArray(peers) || peers.length !== 4 || new Set(peers).size !== 4
      || peers.some(peer => !privateAddress(peer) || peer === env.AUDIT_SSH_HOST)
      || peers.filter(peer => net.isIP(peer) === 4).length !== 2) invalid();
    stage = 'runner-identity';
    const status = JSON.parse((await execute('tailscale', ['status', '--json'], {
      encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
    })).stdout);
    if (status.BackendState !== 'Running' || status.Self?.Tags?.length !== 1
      || status.Self.Tags[0] !== tag) invalid();
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-staging2-audit-'));
    await fs.chmod(directory, 0o700);
    const key = path.join(directory, 'key');
    const knownHosts = path.join(directory, 'known_hosts');
    await fs.writeFile(key, env.AUDIT_SSH_PRIVATE_KEY, { mode: 0o600, flag: 'wx' });
    await fs.writeFile(knownHosts, env.AUDIT_SSH_KNOWN_HOSTS, { mode: 0o600, flag: 'wx' });
    // The process has the credentials only for this invocation. Child SSH
    // inherits the existing environment but never prints it or receives key bytes as arguments.
    const args = ['-F', '/dev/null', '-i', key, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
      '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${knownHosts}`,
      '-o', 'ConnectTimeout=20', '-o', 'ConnectionAttempts=1'];
    const target = `${env.AUDIT_SSH_USER}@${env.AUDIT_SSH_HOST}`;
    stage = 'host-and-receipt';
    const normal = await sshResult(args, ['-T', target]);
    if (normal.code !== 0) invalid();
    const accepted = acceptHostObservation(JSON.parse(normal.stdout), expectedRecordDigest);
    stage = 'forced-command';
    const arbitrary = await sshResult(args, ['-T', target], ['printf __MOFACTS_SHELL_PROBE__']);
    if (arbitrary.stdout.includes('__MOFACTS_SHELL_PROBE__')) invalid();
    if (arbitrary.code === 0) acceptHostObservation(JSON.parse(arbitrary.stdout), expectedRecordDigest);
    else if (![64, 69, 77].includes(arbitrary.code)) invalid();
    stage = 'terminal-denial';
    const pty = await sshResult(args, ['-tt', target]);
    if (!/PTY allocation request failed|PTY allocation.*denied/.test(pty.stderr)) invalid();
    stage = 'forwarding-denial';
    const forward = await sshResult(args, ['-T', '-W', '127.0.0.1:3000',
      '-o', 'ExitOnForwardFailure=yes', target]);
    if (!forward.code || !forward.stderr.includes('administratively prohibited')) invalid();
    stage = 'network-denial';
    const probes = [
      ...deniedPorts.filter(port => port !== 22).map(port => [env.AUDIT_SSH_HOST, port]),
      ...peers.flatMap(peer => deniedPorts.map(port => [peer, port])),
    ];
    // Four bounded workers; TCP setup only, no authentication or application bytes.
    let next = 0;
    const workers = await Promise.allSettled(Array.from({ length: 4 }, async () => {
      while (next < probes.length) {
        const [host, port] = probes[next++];
        await requireTcpTimeout(host, port);
      }
    }));
    if (workers.some(worker => worker.status !== 'fulfilled')) invalid();
    stage = 'publication';
    const result = { state: 'staging2-access-accepted-unqualified', runnerTag: tag,
      ...accepted, restrictedSsh: 'PASS', negativeTcpProbes: probes.length };
    await fs.writeFile(outputFile, JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    return result;
  } catch {
    throw new Error(`Staging2 access check failed at ${stage}; diagnostics withheld`);
  } finally {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) invalid();
    const result = await runStaging2AccessCheck(...process.argv.slice(2));
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}
