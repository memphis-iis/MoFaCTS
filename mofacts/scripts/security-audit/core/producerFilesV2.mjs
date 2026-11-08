import fs from 'node:fs/promises';
import path from 'node:path';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { expectedAuditProducers, parseAuditProducerArtifact } from '../../../common/securityAudit/producerArtifact.ts';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { auditTargetOrigin } from '../../../common/securityAudit/reportV2.ts';
import { AUDIT_V2_MAX_BODY_BYTES } from '../../../server/securityAudit/securityAuditIngestionV2.ts';
import { assembleAuditReportV2 } from './assembleV2.mjs';

const invalid = () => { throw new Error('Invalid V2 audit file input'); };

// These files belong to a private per-run directory. Bound reads even when a
// producer crashes, changes its file, emits a device, or exceeds its contract.
export async function readAuditFileV2(file) {
  const before = await fs.lstat(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
    || before.size > BigInt(AUDIT_V2_MAX_BODY_BYTES)) invalid();
  const handle = await fs.open(file, fs.constants.O_RDONLY
    | (process.platform === 'linux' ? fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK : 0));
  try {
    const opened = await handle.stat({ bigint: true });
    for (const key of ['ino', 'dev', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']) {
      if (before[key] !== opened[key]) invalid();
    }
    const buffer = Buffer.alloc(AUDIT_V2_MAX_BODY_BYTES + 1);
    let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await handle.read(buffer, count, buffer.length - count, null);
      if (!bytesRead) break;
      count += bytesRead;
    }
    const after = await fs.lstat(file, { bigint: true });
    const final = await handle.stat({ bigint: true });
    for (const key of ['ino', 'dev', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']) {
      if (before[key] !== after[key] || before[key] !== final[key]) invalid();
    }
    if (count > AUDIT_V2_MAX_BODY_BYTES || BigInt(count) !== before.size) invalid();
    return buffer.subarray(0, count);
  } finally { await handle.close(); }
}

// Canonical bytes (optionally one terminal newline) also reject duplicate JSON
// keys before their discarded values can become accepted producer evidence.
export function parseAuditFileV2(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const value = JSON.parse(text);
  const canonical = canonicalAuditJson(value);
  if (text !== canonical && text !== canonical + '\n') invalid();
  return value;
}

export async function writeAuditFileV2(file, value) {
  const bytes = Buffer.from(canonicalAuditJson(value) + '\n');
  if (bytes.length > AUDIT_V2_MAX_BODY_BYTES) invalid();
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

export async function writeAuditProducerFileV2({ file, artifact, catalog, profile, producerId }) {
  const parsed = parseAuditProducerArtifact(artifact, catalog, profile, producerId);
  await writeAuditFileV2(file, parsed);
}

// AUDIT_TARGET is supplied by the selected protected environment. Callers cannot
// override it through metadata or a CLI target option. Active V1 never imports
// this module; activation belongs to the coordinated receiver/producer cutover.
export async function assembleAuditReportFilesV2({ artifactDirectory, outputPath, envelope, env = process.env }) {
  const target = auditTargetOrigin(env.AUDIT_TARGET);
  if (!envelope || Object.hasOwn(envelope, 'target')) invalid();
  const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  const producers = expectedAuditProducers(catalog, envelope.reportType);
  const directory = path.resolve(artifactDirectory);
  const stat = await fs.lstat(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(directory) !== directory) invalid();
  const names = new Set();
  const stream = await fs.opendir(directory);
  for await (const entry of stream) {
    if (names.size >= producers.length || !producers.some(id => entry.name === `${id}.json`)) invalid();
    names.add(entry.name);
  }
  const artifacts = [];
  for (const producerId of producers) {
    const name = `${producerId}.json`;
    if (!names.has(name)) continue;
    let artifact = null;
    try { artifact = parseAuditFileV2(await readAuditFileV2(path.join(directory, name))); }
    catch { /* The assembler's existing whole-producer recovery owns this slot. */ }
    artifacts.push({ producerId, artifact });
  }
  const after = await fs.lstat(directory, { bigint: true });
  for (const key of ['ino', 'dev', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']) {
    if (stat[key] !== after[key]) invalid();
  }
  const report = await assembleAuditReportV2({ ...envelope, target, artifacts });
  await writeAuditFileV2(outputPath, report);
  return report;
}
