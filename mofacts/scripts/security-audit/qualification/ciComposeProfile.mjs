import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseBuildIdentity } from '../../../common/securityAudit/buildIdentity.ts';

const prefix = 'mofacts-ci-compose-';
const files = ['build.env', 'mongodb-keyfile', 'owner.json'];
function invalidProfile() { throw new Error('Invalid CI Compose build profile'); }

// Only supplies interpolation inputs for the canonical Compose build. No service
// startup, private deployment settings or protected database access belongs here.
export async function createCiComposeProfile(repository, temporaryRoot, identity, runId, attempt) {
  const source = parseBuildIdentity(identity);
  if (!/^\d{1,20}$/.test(runId) || !/^\d{1,6}$/.test(attempt)) invalidProfile();
  const repo = await fs.realpath(repository);
  const temporary = await fs.realpath(temporaryRoot);
  const relative = path.relative(repo, temporary);
  if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))) invalidProfile();
  if (/[\r\n$]/.test(repo + temporary)) invalidProfile();
  for (const name of ['deploy/docker-compose.yml', 'mofacts/settings.ci.json']) {
    const stat = await fs.lstat(path.join(repo, name));
    if (!stat.isFile() || stat.isSymbolicLink()) invalidProfile();
  }
  const workspace = await fs.mkdtemp(path.join(temporary, prefix));
  await fs.chmod(workspace, 0o700);
  await fs.writeFile(path.join(workspace, 'owner.json'), JSON.stringify({
    schema: 'MoFaCTSCiComposeBuildProfileV1', workspace, id: randomUUID(),
  }), { flag: 'wx', mode: 0o600 });
  try {
    const database = 'mofacts_ci_build';
    const mongoUrl = new URL(`mongodb://mongodb:27017/${database}`);
    mongoUrl.username = 'ci_app';
    mongoUrl.password = randomBytes(24).toString('hex');
    mongoUrl.searchParams.set('authSource', database);
    const environment = {
      DOCKER_REGISTRY: 'mofacts-ci', IMAGE_NAME: 'mofacts-mini', IMAGE_TAG: `ci-${runId}-${attempt}`,
      MOFACTS_SOURCE_REVISION: source.baseCommit,
      MOFACTS_SOURCE_SNAPSHOT_DIGEST_SHA256: source.sourceSnapshotDigestSha256,
      MOFACTS_SOURCE_INCLUDED_UNCOMMITTED_LOCAL_CHANGES: String(source.includedUncommittedLocalChanges),
      METEOR_SETTINGS_HOST_PATH: path.join(repo, 'mofacts/settings.ci.json'),
      MONGO_REPLICA_SET_KEYFILE_HOST_PATH: path.join(workspace, 'mongodb-keyfile'),
      ROOT_URL: 'http://localhost:3200',
      MONGO_URL: mongoUrl.href,
      MOFACTS_MONGO_APP_DATABASE: database, EXPECTED_MONGO_DB_NAME: database,
      MOFACTS_MONGO_APP_USERNAME: mongoUrl.username, MOFACTS_MONGO_APP_PASSWORD: mongoUrl.password,
      MONGO_INITDB_ROOT_USERNAME: 'ci_root', MONGO_INITDB_ROOT_PASSWORD: randomBytes(24).toString('hex'),
      MOFACTS_REDIS_PASSWORD: randomBytes(24).toString('hex'),
    };
    await fs.writeFile(path.join(workspace, 'mongodb-keyfile'), randomBytes(48).toString('base64'), { flag: 'wx', mode: 0o600 });
    const envFile = path.join(workspace, 'build.env');
    await fs.writeFile(envFile, Object.entries(environment).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n',
      { flag: 'wx', mode: 0o600 });
    return { workspace, envFile,
      image: `${environment.DOCKER_REGISTRY}/${environment.IMAGE_NAME}:${environment.IMAGE_TAG}` };
  } catch (error) {
    await cleanupCiComposeProfile(workspace, temporary);
    throw error;
  }
}

export async function cleanupCiComposeProfile(workspace, temporaryRoot) {
  const temporary = await fs.realpath(temporaryRoot);
  const root = path.resolve(workspace);
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !path.basename(root).startsWith(prefix)
    || path.dirname(await fs.realpath(root)) !== temporary) invalidProfile();
  const marker = path.join(root, 'owner.json');
  const markerStat = await fs.lstat(marker);
  if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.size > 4096) invalidProfile();
  const owner = JSON.parse(await fs.readFile(marker, 'utf8'));
  if (owner.schema !== 'MoFaCTSCiComposeBuildProfileV1' || owner.workspace !== root
    || !/^[a-f0-9-]{36}$/.test(owner.id)) invalidProfile();
  if ((await fs.readdir(root)).some(name => !files.includes(name))) invalidProfile();
  // Fixed owned children only. unlink removes links themselves, never targets.
  for (const name of files) await fs.unlink(path.join(root, name)).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  await fs.rmdir(root);
}

export async function main(argv) {
  if (process.platform !== 'linux' || process.env.CI !== 'true' || !process.env.RUNNER_TEMP) invalidProfile();
  const [action, ...args] = argv;
  if (action === 'cleanup' && args.length === 1) {
    await cleanupCiComposeProfile(args[0], process.env.RUNNER_TEMP);
    return;
  }
  if (action !== 'create' || args.length !== 4 || !process.env.GITHUB_OUTPUT) invalidProfile();
  const [repository, commit, digest, dirty] = args;
  if (!['true', 'false'].includes(dirty)) invalidProfile();
  const result = await createCiComposeProfile(repository, process.env.RUNNER_TEMP, {
    schema: 'BuildIdentityV1', baseCommit: commit, sourceSnapshotDigestSha256: digest,
    includedUncommittedLocalChanges: dirty === 'true',
  }, process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT);
  try {
    await fs.appendFile(process.env.GITHUB_OUTPUT,
      `workspace=${result.workspace}\nenv_file=${result.envFile}\nimage=${result.image}\n`);
  } catch (error) {
    await cleanupCiComposeProfile(result.workspace, process.env.RUNNER_TEMP);
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write('CI Compose build profile operation failed.\n');
    process.exitCode = 1;
  });
}
