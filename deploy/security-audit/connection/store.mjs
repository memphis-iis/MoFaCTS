import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { readAuditFileV2 } from '../../../mofacts/scripts/security-audit/core/producerFilesV2.mjs';

const invalid = () => { throw new Error('Audit connection state unavailable'); };
export async function openConnectionStore(directory) {
  const root = path.resolve(directory);
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(root) !== root
    || process.platform !== 'win32' && (stat.mode & 0o077)) invalid();
  const file = path.join(root, 'connection.json');
  let current;
  try {
    const item = await fs.lstat(file);
    if (!item.isFile() || item.isSymbolicLink() || item.nlink !== 1 || item.size > 1048576
      || process.platform !== 'win32' && (item.mode & 0o077)) invalid();
    current = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readAuditFileV2(file)));
    if (current.schema !== 'MoFaCTSAuditConnectionStateV1' || !current.clients || !current.grants
      || !current.codes || !current.refresh || !current.access) invalid();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    current = { schema: 'MoFaCTSAuditConnectionStateV1', clients: {}, grants: {}, codes: {}, refresh: {}, access: {}, enrollment: null };
  }
  let chain = Promise.resolve(), poisoned = false;
  async function transaction(change) {
    const action = chain.then(async () => {
      if (poisoned) invalid();
      const draft = structuredClone(current);
      const result = await change(draft);
      const bytes = JSON.stringify(draft);
      if (Buffer.byteLength(bytes) > 1048576) invalid();
      const temporary = path.join(root, `.connection-${randomBytes(16).toString('hex')}`);
      try {
        const handle = await fs.open(temporary, 'wx', 0o600);
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        await fs.rename(temporary, file);
        if (process.platform !== 'win32') {
          const parent = await fs.open(root, 'r');
          try { await parent.sync(); } finally { await parent.close(); }
        }
        current = draft;
        return result;
      } catch {
        poisoned = true;
        await fs.unlink(temporary).catch(() => {});
        invalid();
      }
    });
    chain = action.catch(() => {});
    return action;
  }
  return { transaction, read: () => {
    if (poisoned) invalid();
    return structuredClone(current);
  } };
}
