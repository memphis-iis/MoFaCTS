// Optional root operator subprocess, run through the existing container
// entrypoint. Never imported/registered by the application or exposed as RPC.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { proofRecord, proofString } from '../../mofacts/common/securityAudit/proofFields.ts';
import { parseAuditFileV2 } from '../../mofacts/scripts/security-audit/core/producerFilesV2.mjs';
import { fixtureNamespaceV2 } from '../../mofacts/scripts/security-audit/authentication/stagingFixturesV2.mjs';
import { requireStagingFixtureRuntimeV2, requireUnusedFixtureNamesV2, findOwnedFixtureActorsV2,
  requireOwnedFixtureActorV2, seedStagingFixtureDataV2, removeStagingFixtureDataV2 } from '../../mofacts/scripts/security-audit/authentication/fixtureStorageV2.mjs';

const actions = ['operator', 'preflight', 'inspect', 'seed', 'cleanup'];
const invalid = () => { throw new Error('Staging fixture runtime rejected'); };
export async function runStagingFixtureStorageActionV2(action, payload, runtime) {
  if (!actions.includes(action)) invalid();
  const value = proofRecord(payload, action === 'operator' ? ['namespace', 'expectedRuntime', 'username']
    : ['namespace', 'expectedRuntime', 'adminUserId', 'startedAt', 'historyNow', 'actors']);
  proofRecord(runtime, ['database', 'mongoOptions', 'environment']); fixtureNamespaceV2(value.namespace);
  const input = { ...value, ...runtime };
  requireStagingFixtureRuntimeV2(input);
  if (action === 'operator') {
    const username = proofString(value.username, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 254).toLowerCase();
    const user = await runtime.database.collection('users').findOne({ username }, { projection: { _id: 1 } });
    if (!user || typeof user._id !== 'string' || !user._id) invalid();
    return { state: 'fixture-operator-identity-observed', userId: user._id, startedAt: Date.now() };
  }
  if (action === 'preflight') {
    await requireUnusedFixtureNamesV2(input); return { state: 'fixture-names-unused' };
  }
  if (action === 'inspect') {
    const actors = await findOwnedFixtureActorsV2(input);
    for (const actor of actors) if (!await requireOwnedFixtureActorV2(input, actor)) invalid();
    return { state: 'fixture-ownership-observed', actors };
  }
  if (action === 'seed') return { state: 'fixture-data-seeded', ...await seedStagingFixtureDataV2(input) };
  return { state: 'fixture-data-removed', ...await removeStagingFixtureDataV2(input) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let client, result, succeeded = false;
  try {
    if (process.argv.length !== 3 || !actions.includes(process.argv[2])) invalid();
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) { size += chunk.length; if (size > 65536) invalid(); chunks.push(chunk); }
    const payload = parseAuditFileV2(Buffer.concat(chunks));
    const require = createRequire('/opt/bundle/bundle/programs/server/npm/package.json');
    const { MongoClient } = require('meteor/npm-mongo/node_modules/mongodb');
    client = new MongoClient(process.env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
    const runtime = { database: client.db(), mongoOptions: client.options, environment: process.env };
    requireStagingFixtureRuntimeV2({ ...runtime, expectedRuntime: payload.expectedRuntime });
    await client.connect();
    result = await runStagingFixtureStorageActionV2(process.argv[2], payload, runtime); succeeded = true;
  } catch { succeeded = false; }
  finally { if (client) { try { await client.close(); } catch { succeeded = false; } } }
  if (succeeded) process.stdout.write(JSON.stringify(result) + '\n');
  else { process.stderr.write('{"state":"fixture-storage-rejected"}\n'); process.exitCode = 1; }
}
