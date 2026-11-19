require('./registerHistoryTypescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspectParticipantPrivacy } = require('../server/lib/participantPrivacyCleanup.ts');

test('count-only inventory, attributable cleanup and idempotence with mixed accounts', async () => {
  const participant = { _id: 'p', profile: { experiment: true }, services: { password: 'synthetic' }, status: { userAgent: 'test', lastLogin: 1, other: true } };
  const ordinary = { _id: 'o', profile: { experiment: false }, status: { lastLogin: 1 } };
  const data = { users: [participant, ordinary], AuthThrottleState: [
    { _id: '1', key: 'prolific-start:ip:synthetic' }, { _id: '2', key: 'login:ip:synthetic' }],
    AuditLog: [{ _id: '1', actorUserId: 'p', action: 'auth.loginSuccess', details: { ip: 'synthetic', loginType: 'resume' } },
      { _id: '2', action: 'auth.loginFailure', details: { ip: 'shared' } }],
    ErrorReports: [{ _id: '1', user: 'p' }, { _id: '2', user: 'o' }],
    histories: [{ userId: 'p', response: 'synthetic' }], participations: [{ _id: 'opaque', userId: 'p' }] };
  const before = structuredClone(data);
  const stores = {
    page: async (name, after) => after === null ? [...data[name]] : [],
    verifiedAccounts: async ids => ({ users: data.users.filter(u => ids.includes(u._id)), participations: data.participations.filter(p => ids.includes(p.userId)) }),
    apply: async (name, row, change) => {
      if (change.remove) data[name] = data[name].filter(doc => doc._id !== row._id);
      else for (const path of change.unset) { const [parent, field] = path.split('.'); delete row[parent][field]; }
    },
  };
  const counts = await inspectParticipantPrivacy(stores);
  assert.deepEqual(data, before);
  assert.deepEqual(counts, { users: { eligible: 1, review: 0 }, AuditLog: { eligible: 1, review: 1 },
    ErrorReports: { eligible: 1, review: 1 }, AuthThrottleState: { eligible: 1, review: 1 } });
  assert.deepEqual(await inspectParticipantPrivacy(stores, 'cleanup'), counts);
  assert.deepEqual(participant.status, { other: true });
  assert.deepEqual(participant.services, before.users[0].services);
  assert.deepEqual(ordinary, before.users[1]);
  assert.deepEqual(data.AuditLog[0].details, { loginType: 'resume' });
  assert.deepEqual(data.AuditLog[1], before.AuditLog[1]);
  assert.deepEqual(data.histories, before.histories);
  assert.deepEqual(data.participations, before.participations);
  assert.deepEqual(data.ErrorReports, [before.ErrorReports[1]]);
  assert.deepEqual(data.AuthThrottleState, [before.AuthThrottleState[1]]);
  const cleaned = structuredClone(data);
  for (const group of Object.values(await inspectParticipantPrivacy(stores, 'cleanup'))) assert.equal(group.eligible, 0);
  assert.deepEqual(data, cleaned);
});

const { sendErrorReportSummariesWorkflow } = require('../server/lib/errorReportSummary.ts');

test('queued study-only and ordinary-account study reports stay out of acknowledgments and admin summaries', async () => {
  const sent = [], marked = [];
  const rows = [
    { _id: 'p', user: 'study', description: 'private-study' },
    { _id: 'r', user: 'regular', description: 'private-visit', sessionVars: { loginMode: 'experiment' } },
    { _id: 'o', user: 'regular', description: 'ordinary-issue' },
  ];
  const deps = {
    ErrorReports: { find: () => ({ fetchAsync: async () => rows }), updateAsync: async selector => marked.push(...selector._id.$in) },
    findUsersByIds: async () => [{ _id: 'study', profile: { experiment: true } }, { _id: 'regular', emails: [{ address: 'regular@example.invalid' }] }],
    adminUsers: ['reviewer@example.invalid'], ownerEmail: 'owner@example.invalid', thisServerUrl: 'localhost', brandName: 'Synthetic',
    sendEmail: (...args) => sent.push(args), serverConsole() {},
  };
  assert.equal(await sendErrorReportSummariesWorkflow(deps), 1);
  assert.deepEqual(marked, ['o']);
  assert.equal(sent.length, 2);
  for (const mail of sent) { assert.match(mail[3], /ordinary-issue/); assert.doesNotMatch(mail[3], /private-/); }
  rows.pop(); sent.length = 0;
  assert.equal(await sendErrorReportSummariesWorkflow(deps), 0);
  assert.deepEqual(sent, []);
});
