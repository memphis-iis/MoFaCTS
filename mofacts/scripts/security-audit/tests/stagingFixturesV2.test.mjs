import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fixtureNamespaceV2, createFixtureCredentialsV2, createFixtureHistoryV2 } from '../authentication/stagingFixturesV2.mjs';
import { renderFixtureHistoryExpectationV2 } from '../authentication/historyExpectationV2.mjs';

const namespace = 'mofacts_audit_fixture_0123456789ab';
const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
const history = () => createFixtureHistoryV2({ namespace, userId: 'synthetic-fixture-owner', alias: 'learnerA', now: 1794430000000 });

test('fixture planning creates exactly the approved fresh actors with strong distinct private credentials', () => {
  assert.notEqual(fixtureNamespaceV2(), fixtureNamespaceV2());
  const first = createFixtureCredentialsV2(namespace), second = createFixtureCredentialsV2(namespace);
  assert.deepEqual(Object.keys(first), ['learnerA', 'learnerB', 'teacherA', 'teacherB']);
  assert.equal(new Set(Object.values(first).map(row => row.username)).size, 4);
  assert.equal(new Set(Object.values(first).map(row => row.password)).size, 4);
  for (const [alias, actor] of Object.entries(first)) {
    assert(actor.username.startsWith(namespace + '-')); assert(actor.username.endsWith('@localhost.invalid'));
    assert.match(actor.password, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(actor.password, second[alias].password);
  }
  assert.throws(() => createFixtureCredentialsV2('existing-account'));
  assert.throws(() => createFixtureHistoryV2({ namespace, userId: 'fixture', alias: 'admin' }));
});
test('known history bytes come from the actual committed formatter and HTTP transport without a live download', async () => {
  const input = { repository, sourceRevision: revision, namespace, userId: 'synthetic-fixture-owner', history: history() };
  const rendered = await renderFixtureHistoryExpectationV2(input);
  assert.equal(rendered.sourceRevision, revision);
  assert.equal(rendered.sha256, createHash('sha256').update(rendered.bytes).digest('hex'));
  assert.equal(rendered.bytes[0], 0xff); assert.equal(rendered.bytes[1], 0xfe);
  const text = rendered.bytes.subarray(2).toString('utf16le');
  assert(text.includes(namespace + '-learnerA')); assert(text.includes(namespace + '-learnerA-answer'));
  assert.equal(text.trim().split(/\r?\n/).length, 2);
  const repeated = await renderFixtureHistoryExpectationV2(input); assert.deepEqual(repeated.bytes, rendered.bytes);
});
test('wrong ownership, namespace, source revision and malformed history cannot establish an expected hash', async () => {
  const input = { repository, sourceRevision: revision, namespace, userId: 'synthetic-fixture-owner', history: history() };
  await assert.rejects(renderFixtureHistoryExpectationV2({ ...input, userId: 'other-fixture-owner' }));
  await assert.rejects(renderFixtureHistoryExpectationV2({ ...input, namespace: 'existing-data' }));
  await assert.rejects(renderFixtureHistoryExpectationV2({ ...input, sourceRevision: 'moving-main' }));
  await assert.rejects(renderFixtureHistoryExpectationV2({ ...input, sourceRevision: '0'.repeat(40) }));
  const broken = history(); delete broken.selection;
  await assert.rejects(renderFixtureHistoryExpectationV2({ ...input, history: broken }));
});
