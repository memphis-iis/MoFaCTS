import { readTarGzArchive } from './tarArchive';
import { parseManifest, sha256Hex } from './backupManifest';
import type { BackupManifest } from './backupTypes';

export type BackupVerificationResult = {
  ok: boolean;
  manifest?: BackupManifest;
  checks: Array<{ name: string; status: 'pass' | 'fail'; message: string }>;
};

function pass(name: string, message: string) {
  return { name, status: 'pass' as const, message };
}

function fail(name: string, message: string) {
  return { name, status: 'fail' as const, message };
}

export async function verifyBackupArchive(archive: Buffer): Promise<BackupVerificationResult> {
  const checks: BackupVerificationResult['checks'] = [];
  let entries;
  try {
    entries = await readTarGzArchive(archive);
    checks.push(pass('archive.read', `read ${entries.length} entries`));
  } catch (error) {
    checks.push(fail('archive.read', error instanceof Error ? error.message : String(error)));
    return { ok: false, checks };
  }

  const entryMap = new Map(entries.map((entry) => [entry.name, entry.body]));
  const manifestBody = entryMap.get('manifest.json');
  if (!manifestBody) {
    checks.push(fail('manifest.exists', 'manifest.json is missing'));
    return { ok: false, checks };
  }
  checks.push(pass('manifest.exists', 'manifest.json found'));

  let manifest: BackupManifest;
  try {
    manifest = parseManifest(manifestBody);
    checks.push(pass('manifest.parse', 'manifest parsed'));
  } catch (error) {
    checks.push(fail('manifest.parse', error instanceof Error ? error.message : String(error)));
    return { ok: false, checks };
  }

  for (const [name, expected] of Object.entries(manifest.checksums)) {
    const body = entryMap.get(name);
    if (!body) {
      checks.push(fail(`checksum.${name}`, 'entry missing'));
      continue;
    }
    const actual = sha256Hex(body);
    checks.push(actual === expected
      ? pass(`checksum.${name}`, 'checksum matched')
      : fail(`checksum.${name}`, `expected ${expected}, got ${actual}`));
  }

  if (!entryMap.has('mongo/database.json')) {
    checks.push(fail('mongo.dump', 'mongo/database.json is missing'));
  } else {
    checks.push(pass('mongo.dump', 'mongo database dump found'));
  }

  return {
    ok: checks.every((check) => check.status === 'pass'),
    manifest,
    checks,
  };
}
