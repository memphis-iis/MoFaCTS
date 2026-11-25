import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readAuthenticationLeaseV2 } from '../../../mofacts/scripts/security-audit/authentication/leaseV2.mjs';

// Private Unix socket only: scanner group can submit its existing stdio frames.
// No HTTP operation opens a run, supplies a target, releases a lease or recovers.
export function createScannerChannel({ handoff, leaseDirectory, now = Date.now }) {
  let owner;
  const server = net.createServer(socket => {
    if (owner) { socket.destroy(); return; }
    owner = socket;
    let buffer = Buffer.alloc(0), namespace, completed = false, failed = false, queued = 0, sequence = Promise.resolve();
    socket.setTimeout(130000);
    async function leaseMatches() {
      const lease = await readAuthenticationLeaseV2(leaseDirectory);
      if (lease.namespace !== namespace || lease.deadlineMs <= now()) throw new Error();
    }
    const send = frame => {
      socket.write(JSON.stringify(frame) + '\n', error => { if (error) socket.destroy(); });
    };
    const reject = () => { failed = true; buffer.fill(0); socket.destroy(); };
    async function verifyLeaseReleased() {
      const directory = path.resolve(leaseDirectory), stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(directory) !== directory) throw new Error();
      try { await readAuthenticationLeaseV2(leaseDirectory); return false; }
      catch (error) { return error.code === 'ENOENT'; }
    }
    async function receive(frame) {
      if (failed) return;
      if (!namespace) {
        if (Object.keys(frame).sort().join(',') !== 'namespace,operation' || !['open', 'recover'].includes(frame.operation)
          || !/^mofacts_audit_fixture_[a-f0-9]{12}$/.test(frame.namespace)) throw new Error();
        namespace = frame.namespace;
        if (frame.operation === 'recover') {
          // The scanner's lease recovery owns fixture cleanup and proof that
          // its previous process stopped. This channel only acknowledges its
          // completed lease release; it cannot delete or bypass that lease.
          if (handoff.status().state !== 'recovery-required') throw new Error();
          await handoff.closeAfterVerifiedCleanup(namespace, verifyLeaseReleased);
          completed = true;
          send({ operation: 'closed' }); socket.end();
          return;
        }
        await leaseMatches();
        await handoff.open(namespace, send);
        send({ operation: 'attached' });
      } else if (frame.operation === 'cleanup-complete') {
        if (Object.keys(frame).join(',') !== 'operation') throw new Error();
        await handoff.closeAfterVerifiedCleanup(namespace, verifyLeaseReleased);
        completed = true;
        send({ operation: 'closed' }); socket.end();
      } else {
        await leaseMatches();
        if (frame.operation === 'hold') {
          if (Object.keys(frame).join(',') !== 'operation' || handoff.status().state !== 'mail-handed-off') throw new Error();
          send({ operation: 'lease-held' }); return;
        }
        await handoff.acceptScannerRequest(frame);
      }
    }
    socket.on('data', bytes => {
      if (failed || buffer.length + bytes.length > 131072) { reject(); return; }
      buffer = Buffer.concat([buffer, bytes]);
      while (buffer.includes(10)) {
        if (++queued > 4) { reject(); return; }
        const end = buffer.indexOf(10), line = buffer.subarray(0, end);
        let frame;
        try { frame = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)); }
        catch { reject(); return; }
        buffer = Buffer.from(buffer.subarray(end + 1));
        sequence = sequence.then(() => receive(frame)).catch(reject).finally(() => { queued--; });
      }
    });
    socket.on('timeout', reject); socket.on('error', reject);
    socket.on('close', () => {
      buffer.fill(0);
      sequence = sequence.finally(async () => {
        if (!completed && namespace) await handoff.interrupt();
        owner = undefined;
        server.emit('scanner-idle');
      });
      sequence.catch(() => {});
    });
  });
  return server;
}

export async function listenScannerChannel(server, socketPath) {
  // Existing socket state is never removed as a startup workaround. The
  // supervisor owns stale-socket recovery after proving its old process stopped.
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(socketPath, resolve);
  });
  await fs.chmod(socketPath, 0o660);
}
