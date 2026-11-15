import fs from 'node:fs/promises';
import { openConnectionStore } from './store.mjs';
import { createAuditAuthorization } from './authorization.mjs';
import { createMailHandoff } from './handoff.mjs';
import { createConnectionApp } from './server.mjs';
import { createScannerChannel, listenScannerChannel } from './scannerChannel.mjs';

const [action, stateDirectory, ...args] = process.argv.slice(2);
try {
  if (process.version !== 'v24.22.1' || !stateDirectory) throw new Error();
  const store = await openConnectionStore(stateDirectory);
  const authorization = createAuditAuthorization({ store });
  if (action === 'enroll' && args.length === 1) {
    // Operator-only command, offline while service is stopped. The output file
    // is private and exclusive; stdout contains no connection credential.
    const file = await fs.open(args[0], 'wx', 0o600);
    try { await file.writeFile(await authorization.enroll()); await file.sync(); }
    finally { await file.close(); }
    process.stdout.write('Private one-time enrollment file created; expires in ten minutes.\n');
  } else if (action === 'revoke' && args.length === 0) {
    await authorization.revokeAll();
    process.stdout.write('All audit connection grants revoked.\n');
  } else if (action === 'serve' && args.length === 3) {
    const [socketPath, leaseDirectory, portText] = args;
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error();
    const handoff = createMailHandoff({ store });
    const privateServer = createScannerChannel({ handoff, leaseDirectory });
    await listenScannerChannel(privateServer, socketPath);
    const publicServer = createConnectionApp({ authorization, handoff }).listen(port, '0.0.0.0');
    publicServer.on('error', () => { process.stderr.write('Audit connection listener unavailable.\n'); process.exit(1); });
    process.on('SIGTERM', () => {
      publicServer.close(); privateServer.close();
      setTimeout(() => process.exit(0), 1000).unref();
    });
  } else throw new Error();
} catch {
  process.stderr.write('Audit connection configuration or state rejected.\n'); process.exitCode = 1;
}
