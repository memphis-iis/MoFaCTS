import { acquireSelectedAuthorizationV2, openAuthorizationActorPageV2, validateAuthorizationActorPageV2 } from './browserV2.mjs';
import { createFixtureAccountV2, grantFixtureTeacherV2, removeFixtureAccountV2 } from './fixtureBrowserV2.mjs';
import { renderFixtureHistoryExpectationV2 } from './historyExpectationV2.mjs';
import { createFixtureCredentialsV2, createFixtureHistoryV2, fixtureNamespaceV2 } from './stagingFixturesV2.mjs';

const unavailable = () => new Error('Selected staging2 authorization fixture is incomplete');

async function closeOperator(record) {
  if (!record?.context) return;
  try {
    if (record.page && !await record.page.evaluate(() => new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 10000);
      Meteor.logout(error => { clearTimeout(timer); resolve(!error && Meteor.userId() === null); });
    }))) throw unavailable();
  } finally { await record.context.close(); }
}

export async function captureSelectedStagingFixtureV2({
  launch, request, recordOwnership, namespace, expectedRuntime, admin, knownReport, repository, deployedRevision,
}) {
  fixtureNamespaceV2(namespace);
  const target = 'https://staging2.optimallearning.org';
  const profile = { namespace, expectedRuntime };
  const credentials = createFixtureCredentialsV2(namespace);
  const operator = await request('operator', { ...profile, username: admin.username });
  let scope = { ...profile, adminUserId: operator.userId, startedAt: operator.startedAt, historyNow: operator.startedAt, actors: [] };
  const binding = { ...admin, userId: operator.userId };
  await recordOwnership(scope);
  let browser, session, mutationStarted = false;
  const inspect = async () => (await request('inspect', scope)).actors;
  const verifyActor = async actor => (await inspect()).some(row => row.alias === actor.alias && row.userId === actor.userId);
  async function cleanup() {
    const actors = await inspect();
    await request('cleanup', { ...scope, actors });
    for (const actor of actors) {
      await removeFixtureAccountV2({ page: session.page, target, adminUserId: operator.userId, namespace, actor, requireOwnedActor: verifyActor });
    }
    if ((await inspect()).length !== 0 || (await request('protocol-empty', profile)).state !== 'fixture-protocol-namespace-empty') throw unavailable();
  }
  try {
    if ((await request('protocol-empty', profile)).state !== 'fixture-protocol-namespace-empty'
      || (await request('preflight', scope)).state !== 'fixture-names-unused') throw unavailable();
    browser = await launch();
    session = await openAuthorizationActorPageV2({ browser, target, actor: 'admin', binding });
    if (!session.page || await validateAuthorizationActorPageV2(session.page, target, 'admin', operator.userId) !== 'matched') throw unavailable();
    mutationStarted = true;
    for (const [alias, credential] of Object.entries(credentials)) {
      const creator = await openAuthorizationActorPageV2({ browser, target, actor: 'admin', binding });
      try {
        await createFixtureAccountV2({ page: creator.page, target, adminUserId: operator.userId, namespace, alias, credential });
      } finally { await closeOperator(creator); }
    }
    const actors = await inspect();
    if (actors.length !== Object.keys(credentials).length) throw unavailable();
    scope = { ...scope, historyNow: Math.max(scope.startedAt, Date.now()), actors };
    await recordOwnership(scope);
    for (const actor of actors.filter(row => row.alias.startsWith('teacher'))) {
      await grantFixtureTeacherV2({ page: session.page, target, adminUserId: operator.userId, namespace, actor, requireOwnedActor: verifyActor });
    }
    const seeded = await request('seed', scope);
    const learner = actors.find(row => row.alias === 'learnerA');
    const history = createFixtureHistoryV2({ namespace, userId: learner.userId, alias: 'learnerA', now: scope.historyNow });
    const expected = await renderFixtureHistoryExpectationV2({ repository, sourceRevision: deployedRevision, namespace,
      userId: learner.userId, history });
    const bindings = {
      schema: 'MoFaCTSAuditAuthorizationBindingsV1',
      actors: { admin: binding, ...Object.fromEntries(actors.map(actor => [
        actor.alias, { userId: actor.userId, ...credentials[actor.alias] },
      ])) },
      values: { ...seeded.values, 'history.learnerA': { sha256: expected.sha256 }, 'audit.report': knownReport },
    };
    return await acquireSelectedAuthorizationV2({ target, bindings }, launch);
  } finally {
    try {
      if (mutationStarted) await cleanup();
    } finally {
      try { await closeOperator(session); } finally { await browser?.close(); }
    }
  }
}
