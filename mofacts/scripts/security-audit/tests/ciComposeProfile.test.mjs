import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCiComposeProfile, cleanupCiComposeProfile } from '../qualification/ciComposeProfile.mjs';

const identity = { schema: 'BuildIdentityV1', baseCommit: 'a'.repeat(40),
  sourceSnapshotDigestSha256: 'b'.repeat(64), includedUncommittedLocalChanges: false };

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'mofacts-compose-profile-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repository = path.join(root, 'repository');
  await fs.mkdir(path.join(repository, 'deploy'), { recursive: true });
  await fs.mkdir(path.join(repository, 'mofacts'));
  const recipe = await fs.readFile(new URL('../../../../deploy/docker-compose.yml', import.meta.url));
  await fs.writeFile(path.join(repository, 'deploy/docker-compose.yml'), recipe);
  await fs.writeFile(path.join(repository, 'mofacts/settings.ci.json'), '{}');
  return { root, repository, recipe: recipe.toString('utf8') };
}

async function environment(profile) {
  return Object.fromEntries((await fs.readFile(profile.envFile, 'utf8')).trimEnd().split('\n')
    .map(line => { const equals = line.indexOf('='); return [line.slice(0, equals), JSON.parse(line.slice(equals + 1))]; }));
}

test('profile satisfies canonical Compose interpolation and preserves exact tested identity', async (t) => {
  const { root, repository, recipe } = await fixture(t);
  const profile = await createCiComposeProfile(repository, root, identity, '12345', '2');
  const env = await environment(profile);
  for (const match of recipe.matchAll(/\$\{([A-Z_]+):\?/g)) {
    assert.ok(typeof env[match[1]] === 'string' && env[match[1]].length > 0, `Missing required build input ${match[1]}`);
  }
  assert.equal(env.MOFACTS_SOURCE_REVISION, identity.baseCommit);
  assert.equal(env.MOFACTS_SOURCE_SNAPSHOT_DIGEST_SHA256, identity.sourceSnapshotDigestSha256);
  assert.equal(env.MOFACTS_SOURCE_INCLUDED_UNCOMMITTED_LOCAL_CHANGES, 'false');
  assert.equal(profile.image, 'mofacts-ci/mofacts-mini:ci-12345-2');
  assert.equal(env.METEOR_SETTINGS_HOST_PATH, path.join(repository, 'mofacts/settings.ci.json'));
  const uri = new URL(env.MONGO_URL);
  assert.ok(uri.hostname === 'mongodb' && uri.password === env.MOFACTS_MONGO_APP_PASSWORD
    && uri.username === env.MOFACTS_MONGO_APP_USERNAME && uri.pathname === '/' + env.MOFACTS_MONGO_APP_DATABASE);
  assert.ok((await fs.stat(env.MONGO_REPLICA_SET_KEYFILE_HOST_PATH)).size > 0);
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(profile.workspace)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(profile.envFile)).mode & 0o777, 0o600);
  }
  await cleanupCiComposeProfile(profile.workspace, root);
  await assert.rejects(fs.stat(profile.workspace), { code: 'ENOENT' });
});

test('profiles isolate image tags and generated credentials across run attempts', async (t) => {
  const { root, repository } = await fixture(t);
  const first = await createCiComposeProfile(repository, root, identity, '12345', '1');
  const second = await createCiComposeProfile(repository, root, identity, '12345', '2');
  const a = await environment(first);
  const b = await environment(second);
  assert.notEqual(first.workspace, second.workspace);
  assert.notEqual(first.image, second.image);
  assert.ok(a.MOFACTS_MONGO_APP_PASSWORD !== b.MOFACTS_MONGO_APP_PASSWORD);
  assert.ok(a.MONGO_INITDB_ROOT_PASSWORD !== b.MONGO_INITDB_ROOT_PASSWORD);
  assert.ok(a.MOFACTS_REDIS_PASSWORD !== b.MOFACTS_REDIS_PASSWORD);
});

test('malformed provenance or identifiers and a temp root inside source fail before allocation', async (t) => {
  const { root, repository } = await fixture(t);
  const before = await fs.readdir(root);
  await assert.rejects(createCiComposeProfile(repository, root, { ...identity, sourceSnapshotDigestSha256: 'invalid' }, '1', '1'));
  await assert.rejects(createCiComposeProfile(repository, root, identity, '../escape', '1'), /Invalid CI/);
  await assert.rejects(createCiComposeProfile(repository, repository, identity, '1', '1'), /Invalid CI/);
  assert.deepEqual(await fs.readdir(root), before);
});

test('cleanup rejects foreign roots and altered ownership without removing their files', async (t) => {
  const { root, repository } = await fixture(t);
  await assert.rejects(cleanupCiComposeProfile(repository, root), /Invalid CI/);
  const profile = await createCiComposeProfile(repository, root, identity, '1', '1');
  const marker = path.join(profile.workspace, 'owner.json');
  const original = await fs.readFile(marker);
  await fs.writeFile(marker, JSON.stringify({ schema: 'wrong', workspace: profile.workspace }));
  await assert.rejects(cleanupCiComposeProfile(profile.workspace, root), /Invalid CI/);
  assert.ok((await fs.stat(profile.envFile)).isFile());
  await fs.writeFile(marker, original);
  await fs.writeFile(path.join(profile.workspace, 'unexpected'), 'preserve');
  await assert.rejects(cleanupCiComposeProfile(profile.workspace, root), /Invalid CI/);
  assert.ok((await fs.stat(profile.envFile)).isFile());
});

test('cleanup unlinks only owned paths without modifying external hard-link targets', async (t) => {
  const { root, repository } = await fixture(t);
  const profile = await createCiComposeProfile(repository, root, identity, '1', '1');
  const external = path.join(root, 'external');
  await fs.writeFile(external, 'preserve');
  await fs.unlink(profile.envFile);
  await fs.link(external, profile.envFile);
  await cleanupCiComposeProfile(profile.workspace, root);
  assert.equal(await fs.readFile(external, 'utf8'), 'preserve');
});
