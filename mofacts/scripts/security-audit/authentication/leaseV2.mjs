import fs from 'node:fs/promises';
import path from 'node:path';
import { fixtureNamespaceV2 } from './stagingFixturesV2.mjs';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { parseAuditFileV2, readAuditFileV2, writeAuditFileV2 } from '../core/producerFilesV2.mjs';

const target = 'https://staging2.optimallearning.org';
const invalid = () => { throw new Error('Authentication lease requires owned recovery'); };
const filename = 'staging2-authentication.lock.json';
async function location(directory) {
  const root = path.resolve(directory), stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(root) !== root) invalid();
  return path.join(root, filename);
}
function parse(value) {
  const row = proofRecord(value, ['schema', 'target', 'namespace', 'startedAtMs', 'deadlineMs']);
  fixtureNamespaceV2(row.namespace);
  if (row.schema !== 'MoFaCTSAuditAuthenticationLeaseV1' || row.target !== target
      || !Number.isSafeInteger(row.startedAtMs) || row.startedAtMs < 0
      || !Number.isSafeInteger(row.deadlineMs) || row.deadlineMs <= row.startedAtMs
      || row.deadlineMs - row.startedAtMs > 7200000) invalid();
  return row;
}
async function existing(file) {
  const bytes = await readAuditFileV2(file);
  if (bytes.length > 1024) invalid();
  return parse(parseAuditFileV2(bytes));
}
async function requireOwner(file, owner, identity) {
  const current = await existing(file), stat = await fs.lstat(file, { bigint: true });
  if (canonicalAuditJson(current) !== canonicalAuditJson(owner) || stat.ino !== identity.ino || stat.dev !== identity.dev) invalid();
}

// One private directory per environment, shared across all protocol families.
// The deadline records the caller's required job stop boundary; this file owner
// does not cancel an in-flight transport. Never steal a stale lease or claim
// automatic account expiry. Keep the lease after failed/unverified cleanup.
export async function withAuthenticationLeaseV2({ directory, namespace, deadlineMs, run, verifyClean, now = Date.now() }) {
  if (typeof run !== 'function' || typeof verifyClean !== 'function') invalid();
  const owner = parse({ schema: 'MoFaCTSAuditAuthenticationLeaseV1', target, namespace, startedAtMs: now, deadlineMs });
  if (now >= deadlineMs) invalid();
  const file = await location(directory);
  await writeAuditFileV2(file, owner);
  const identity = await fs.lstat(file, { bigint: true });
  let result, failure;
  try { result = await run({ ...owner }); } catch (error) { failure = error; }
  try {
    await requireOwner(file, owner, identity);
    if (await verifyClean({ ...owner }) !== true) invalid();
    await requireOwner(file, owner, identity);
    await fs.unlink(file);
  } catch { throw new Error('Authentication cleanup is unverified; owned lease retained for recovery'); }
  if (failure) throw failure;
  return result;
}

// Explicit recovery of the recorded namespace only, not permission to start a
// competing job. The caller recovers its manifest and independently verifies
// absence of all owned access/data before returning true.
export async function recoverAuthenticationLeaseV2({ directory, namespace, confirmOwnerStopped, verifyClean }) {
  fixtureNamespaceV2(namespace);
  if (typeof verifyClean !== 'function' || typeof confirmOwnerStopped !== 'function') invalid();
  const file = await location(directory), owner = await existing(file);
  const identity = await fs.lstat(file, { bigint: true });
  if (owner.namespace !== namespace) invalid();
  if (await confirmOwnerStopped({ ...owner }) !== true) invalid();
  if (await verifyClean({ ...owner }) !== true) invalid();
  await requireOwner(file, owner, identity);
  await fs.unlink(file);
  return { state: 'owned-authentication-recovery-verified', target };
}
