// Contract tests use synthetic repositories and a fake transport; no Meteor service or live API.
require('./registerHistoryTypescript.cjs');
const { describe, it, beforeEach, afterEach } = require('node:test');
Object.assign(global, { describe, it, beforeEach, afterEach });
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'meteor/mongo') return { Mongo: { Collection: class {} } };
  if (name === 'meteor/meteor') return { Meteor: { Error: class extends Error { constructor(code, message) { super(message); this.error = code; } } } };
  return originalLoad.call(this, name, ...args);
};
const { createProlificParticipationService } = require('../server/lib/prolificParticipation.ts');
const { createProlificManagementService } = require('../server/lib/prolificManagement.ts');
const { createProlificMethods } = require('../server/methods/prolificMethods.ts');
const { prolificRequest, ProlificApiError } = require('../server/lib/prolificApi.ts');
const { prolificCompletionUrl, prolificAmount } = require('../common/prolific.ts');
const { savedLessonCompleted } = require('../common/experimentCompletion.ts');
const { writeHistoryExport } = require('../server/lib/historyExport.ts');
Module._load = originalLoad;
require('../client/lib/prolificExperimentEntry.test.ts');

function values(doc, path) {
  if (!path.length) return Array.isArray(doc) ? doc : [doc];
  if (Array.isArray(doc)) return doc.flatMap(d => values(d, path));
  return values(doc?.[path[0]], path.slice(1));
}
function matches(doc, selector) {
  return Object.entries(selector).every(([key, expected]) => {
    const actual = values(doc, key.split('.'));
    if (!expected || typeof expected !== 'object' || expected instanceof Date) return actual.some(v => v === expected);
    return Object.entries(expected).every(([op, value]) => {
      if (op === '$ne') return actual.every(v => v !== value);
      if (op === '$exists') return actual.some(v => v !== undefined) === value;
      if (op === '$in') return actual.some(v => value.includes(v));
      if (op === '$lt') return actual.some(v => v < value);
      if (op === '$lte') return actual.some(v => v <= value);
      if (op === '$gt') return actual.some(v => v > value);
      throw new Error(`Unsupported fixture operator ${op}`);
    });
  });
}
class Store {
  constructor(rows = [], unique = []) { this.rows = structuredClone(rows); this.unique = unique; }
  enforce(row, except) {
    for (const keys of this.unique) {
      if (keys.some(k => row[k] === undefined)) continue;
      if (this.rows.some(r => r !== except && keys.every(k => r[k] === row[k]))) throw Object.assign(new Error('duplicate'), { code: 11000 });
    }
  }
  async findOneAsync(selector) { return structuredClone(this.rows.find(r => matches(r, selector))); }
  find(selector = {}, options = {}) {
    return { fetchAsync: async () => {
      let rows = this.rows.filter(r => matches(r, selector));
      if (options.sort) { const [key, order] = Object.entries(options.sort)[0]; rows.sort((a, b) => a[key] < b[key] ? -order : a[key] > b[key] ? order : 0); }
      return structuredClone(rows.slice(0, options.limit ?? rows.length));
    } };
  }
  async insertAsync(row) { row = structuredClone({ _id: String(this.rows.length + 1), ...row }); this.enforce(row); this.rows.push(row); return row._id; }
  async updateAsync(selector, modifier, options = {}) {
    let count = 0;
    for (const row of this.rows) {
      if (!matches(row, selector)) continue;
      const next = structuredClone(row);
      Object.assign(next, structuredClone(modifier.$set || {}));
      for (const key of Object.keys(modifier.$unset || {})) delete next[key];
      for (const [key, value] of Object.entries(modifier.$push || {})) (next[key] ||= []).push(structuredClone(value));
      this.enforce(next, row);
      for (const key of Object.keys(row)) delete row[key];
      Object.assign(row, next); count++;
      if (!options.multi) break;
    }
    return count;
  }
  async upsertAsync(selector, modifier) { if (!await this.updateAsync(selector, modifier)) await this.insertAsync({ ...selector, ...modifier.$set }); }
}
const participantId = 'a'.repeat(24), studyId = 'b'.repeat(24), submissionId = 'c'.repeat(24);
const projectId = 'd'.repeat(24), workspaceId = 'e'.repeat(24), accountId = 'f'.repeat(24);
const completionUrl = 'https://app.prolific.com/submissions/complete?cc=ABC123';
function fixture() {
  const Tdfs = new Store([{ _id: 'root', ownerId: 'owner', content: { tdfs: { tutor: { setspec: { experimentTarget: studyId, prolificCompletionUrl: completionUrl }, unit: [{}, { deliverySettings: { lockoutminutes: 5 } }, {}] } } } }]);
  const db = {
    connections: new Store([{ ownerId: 'owner', accountId, tokenEncrypted: 'secret' }], [['ownerId']]),
    studies: new Store([{ studyId, rootTdfId: 'root', ownerId: 'owner', accountId, projectId, workspaceId, currency: 'USD', reminderText: 'Please return' }], [['studyId'], ['rootTdfId']]),
    participants: new Store([], [['participantId', 'studyId'], ['submissionId'], ['userId']]),
    operations: new Store([], [['ownerId', 'requestId'], ['activeStudy']]),
    reminders: new Store([], [['participationId', 'boundary'], ['resumeHash']]),
  };
  const states = new Store(), users = new Store([], [['username']]);
  const calls = [], audits = [];
  const request = async (token, path, body) => {
    assert.equal(token, 'secret'); calls.push({ path, body });
    if (path === 'users/me/') return { id: accountId };
    if (path.startsWith('studies/')) return { id: studyId, project: projectId, name: 'Synthetic' };
    if (path === 'submissions/bonus-payments/') return { id: '1'.repeat(24), amount: 150, fees: 50, vat: 0, total_amount: 200 };
    if (path.endsWith('/pay/') || path.endsWith('/transition/') || path === 'messages/') return null;
    if (path.startsWith('submissions/')) return { id: submissionId, study_id: studyId, participant: participantId, status: 'AWAITING REVIEW' };
    if (path.endsWith('/balance/')) return { currency_code: 'USD' };
    if (path.endsWith('/projects/')) return { results: [{ id: projectId }] };
    throw new Error(`Unexpected synthetic request ${path}`);
  };
  const deps = { resolveExperimentTargetFamily: async target => ({ root: await Tdfs.findOneAsync({ 'content.tdfs.tutor.setspec.experimentTarget': target }) }), Tdfs, encrypt: value => value, decrypt: value => value, audit: async (...args) => audits.push(args), request };
  const participation = createProlificParticipationService({ ...deps, states, users, baseUrl: () => 'https://example.org/',
    createUser: async (username, password, profile) => users.insertAsync({ username, password, profile }),
    issueToken: async userId => `token:${userId}`, withLock: async (_key, work) => work(),
  }, { participations: db.participants, studies: db.studies, reminders: db.reminders });
  deps.progress = participation.progress;
  const management = createProlificManagementService(deps, db);
  return { Tdfs, db, states, users, calls, audits, deps, participation, management };
}
const launch = { participantId, studyId, submissionId, experimentTarget: studyId };
async function started(f) { await f.participation.start(launch); return f.db.participants.rows[0]; }
async function progress(f, p, state) { await f.states.upsertAsync({ userId: p.userId, TDFId: 'root' }, { $set: { experimentState: state } }); }

describe('Prolific shared contracts', () => {
  it('accepts only the official completion URL with exactly one alphanumeric code', () => {
    assert.equal(prolificCompletionUrl(completionUrl), completionUrl);
    for (const bad of [completionUrl + '\n', completionUrl + '&extra=x', completionUrl + '#x', completionUrl + '&cc=ABC', completionUrl.replace('https:', 'http:'), completionUrl.replace('app.', 'evil.'), completionUrl.replace('.com/', '.com:443/'), completionUrl.replace('app.', 'user@app.'), completionUrl.replace('ABC123', ''), completionUrl.replace('ABC123', 'ABC%31')]) assert.throws(() => prolificCompletionUrl(bad));
  });
  it('generates an optional completion field with no default and strict value constraints', () => {
    const { createTdfSchemaFromRegistry } = require('../common/fieldRegistrySections.ts');
    const schema = createTdfSchemaFromRegistry().properties.tutor.properties.setspec.properties.prolificCompletionUrl;
    assert.equal(schema.type, 'string'); assert.equal(Object.hasOwn(schema, 'default'), false);
    const pattern = new RegExp(schema.pattern);
    assert.equal(pattern.test(completionUrl), true);
    for (const value of ['', completionUrl + '&extra=1', completionUrl + '\n']) assert.equal(pattern.test(value), false);
  });
  it('uses exact cents and saved terminal progress', () => {
    assert.equal(prolificAmount('1.50'), 150);
    for (const bad of [0, '0', '-1', '1e2', '0.001', 'NaN', ' 1', '1\n']) assert.throws(() => prolificAmount(bad));
    assert.equal(savedLessonCompleted({}, 3), false);
    assert.equal(savedLessonCompleted({ lastUnitCompleted: 2, currentUnitNumber: 3 }, 3), true);
    assert.equal(savedLessonCompleted({ lastUnitCompleted: 1, currentUnitNumber: 3 }, 3), false);
  });
  it('never retries a failed or ambiguous API mutation and refuses redirects', async () => {
    let calls = 0;
    await assert.rejects(prolificRequest('secret', 'messages/', {}, async (_url, options) => { calls++; assert.equal(options.redirect, 'error'); throw new Error('secret network details'); }), e => e instanceof ProlificApiError && e.uncertain && !e.message.includes('secret'));
    assert.equal(calls, 1);
    await assert.rejects(prolificRequest('secret', '../evil', undefined, async () => { throw new Error('must not run'); }));
    assert.deepEqual(await prolificRequest('secret', 'users/me/', undefined, async () => new Response('{"id":"synthetic"}')), { id: 'synthetic' });
  });
});

describe('participation persistence and session boundaries', () => {
  it('resumes the exact identity under concurrent provisioning and rejects conflicting identities', async () => {
    const f = fixture();
    const result = await Promise.all(Array.from({ length: 5 }, () => f.participation.start(launch)));
    assert.equal(new Set(result.map(r => r.loginToken)).size, 1);
    assert.equal(f.users.rows.length, 1); assert.equal(f.db.participants.rows.length, 1);
    assert.match(f.users.rows[0].username, /^PR-/);
    assert.equal(JSON.stringify(f.users.rows[0].profile).includes(participantId), false);
    await assert.rejects(f.participation.start({ ...launch, submissionId: '1'.repeat(24) }), /identityConflict/);
    await assert.rejects(f.participation.start({ ...launch, participantId: '2'.repeat(24) }), /identityConflict/);
    assert.equal(f.calls.length, 0); // Participant entry uses no live API credentials.
  });
  it('keeps accounts and progress independent across studies', async () => {
    const f = fixture(); await started(f);
    const secondStudy = '2'.repeat(24);
    const root = structuredClone(f.Tdfs.rows[0]); root._id = 'root2'; root.content.tdfs.tutor.setspec.experimentTarget = secondStudy; await f.Tdfs.insertAsync(root);
    await f.db.studies.insertAsync({ ...f.db.studies.rows[0], _id: 'study2', studyId: secondStudy, rootTdfId: 'root2' });
    await f.participation.start({ ...launch, studyId: secondStudy, experimentTarget: secondStudy, submissionId: '3'.repeat(24) });
    assert.equal(new Set(f.db.participants.rows.map(p => p.userId)).size, 2);
  });
  it('rejects invalid direct calls and password-protected Prolific launches', async () => {
    const f = fixture();
    await assert.rejects(f.participation.start({ ...launch, submissionId: null }));
    await assert.rejects(f.participation.start({ ...launch, experimentTarget: '1'.repeat(24) }));
    f.Tdfs.rows[0].content.tdfs.tutor.setspec.experimentPasswordRequired = true;
    await assert.rejects(f.participation.start(launch), /invalidConfiguration/);
    assert.equal(f.users.rows.length, 0);
  });
  it('completes the initial paid session at a saved positive lockout, schedules once and resumes without bypassing lockout', async () => {
    const f = fixture(), p = await started(f);
    assert.deepEqual(await f.participation.checkpoint(p.userId), { prolific: true, completed: false });
    await progress(f, p, { currentUnitNumber: 1, lastUnitCompleted: 0 });
    assert.equal((await f.participation.checkpoint(p.userId)).completionUrl, undefined);
    f.users.rows[0].lockouts = { root: { currentLockoutUnit: 1, lockoutMinutes: 5, lockoutTimeStamp: Date.now() } };
    assert.equal(await f.participation.validateLockout(p.userId, 'root', 1), 5);
    f.Tdfs.rows[0].content.tdfs.tutor.unit[1].deliverySettings = [{ lockoutminutes: 5 }, { lockoutminutes: 15 }];
    f.states.rows[0].experimentState.experimentXCond = 1;
    assert.equal(await f.participation.validateLockout(p.userId, 'root', 1), 15);
    await assert.rejects(f.participation.validateLockout(p.userId, 'root', 2));
    assert.equal((await f.participation.checkpoint(p.userId)).completionUrl, completionUrl);
    assert.equal((await f.participation.checkpoint(p.userId)).completionUrl, null);
    assert.equal((await f.participation.checkpoint(p.userId, true)).completionUrl, completionUrl);
    assert.equal(f.db.participants.rows[0].sessions.length, 1); assert.equal(f.db.reminders.rows.length, 1);
    assert.equal(f.db.participants.rows[0].completedAt, undefined);
    const token = f.db.reminders.rows[0].bodyEncrypted.split('#')[1];
    const resumed = await f.participation.resume(token);
    assert.equal(resumed.loginToken, `token:${p.userId}`);
    assert.equal(f.users.rows[0].lockouts.root.lockoutMinutes, 5);
    await progress(f, p, { currentUnitNumber: 2, lastUnitCompleted: 0 });
    assert.equal((await f.participation.checkpoint(p.userId, true)).completionUrl, completionUrl);
    assert.equal((await f.participation.checkpoint(p.userId)).completionUrl, undefined);
    assert.equal(f.db.participants.rows[0].sessions.length, 1);
  });
  it('does not count initial pre-work lockouts or mid-unit progress', async () => {
    const f = fixture(), p = await started(f);
    for (const state of [{ currentUnitNumber: 0 }, ...[-1, null, undefined, '', false].map(lastUnitCompleted => ({ currentUnitNumber: 1, lastUnitCompleted }))]) {
      await progress(f, p, state);
      f.users.rows[0].lockouts = { root: { currentLockoutUnit: state.currentUnitNumber, lockoutMinutes: 5, lockoutTimeStamp: Date.now() } };
      assert.equal((await f.participation.checkpoint(p.userId)).completionUrl, undefined);
    }
    assert.equal(f.db.reminders.rows.length, 0);
  });
  it('uses selected-condition frozen adaptive units and records terminal completion once', async () => {
    const f = fixture(), p = await started(f);
    f.Tdfs.rows[0].content.tdfs.tutor.setspec.conditionTdfIds = ['child'];
    await f.Tdfs.insertAsync({ _id: 'child', content: { tdfs: { tutor: { unit: [{ adaptive: true }, {}] } } } });
    await progress(f, p, { conditionTdfId: 'child', currentUnitNumber: 3, lastUnitCompleted: 2, adaptiveUnitSequence: { version: 1, tdfId: 'child', units: [{}, {}, {}, {}] } });
    assert.equal((await f.participation.checkpoint(p.userId)).completionUrl, undefined);
    f.states.rows[0].experimentState.currentUnitNumber = 4; f.states.rows[0].experimentState.lastUnitCompleted = 3;
    assert.equal((await f.participation.checkpoint(p.userId)).completed, true);
    const date = f.db.participants.rows[0].completedAt;
    assert.equal((await f.participation.checkpoint(p.userId, true)).completionUrl, completionUrl);
    assert.deepEqual(f.db.participants.rows[0].completedAt, date);
    assert.equal(f.db.participants.rows[0].sessions.length, 1);
  });
  it('retries failed persistence without claiming successful completion or duplicating reminders', async () => {
    const f = fixture(), p = await started(f);
    await progress(f, p, { currentUnitNumber: 1, lastUnitCompleted: 0 });
    f.users.rows[0].lockouts = { root: { currentLockoutUnit: 1, lockoutMinutes: 5, lockoutTimeStamp: Date.now() } };
    const insert = f.db.reminders.insertAsync.bind(f.db.reminders);
    f.db.reminders.insertAsync = async () => { throw new Error('synthetic write failure'); };
    await assert.rejects(f.participation.checkpoint(p.userId));
    f.db.reminders.insertAsync = insert;
    assert.equal((await f.participation.checkpoint(p.userId, true)).completionUrl, completionUrl);
    assert.equal(f.db.reminders.rows.length, 1); assert.equal(f.db.participants.rows[0].sessions.length, 1);
    assert.deepEqual(await f.participation.checkpoint('ordinary'), { prolific: false });
  });
});

describe('researcher operations and reminders', () => {
  it('requires ownership and remote identity matches before previewing or sending', async () => {
    const f = fixture(); await started(f);
    await assert.rejects(f.management.dashboard('other', { studyId }), /accessDenied/);
    const management = createProlificManagementService({ ...f.deps, request: async (token, path, body) => path.startsWith('submissions/') ? { id: submissionId, study_id: studyId, participant: 'wrong' } : f.deps.request(token, path, body) }, f.db);
    await assert.rejects(management.prepare('owner', { studyId, kind: 'approve', rows: [{ submissionId }], requestId: 'one' }), /identityConflict/);
    assert.equal(f.db.operations.rows.length, 0);
  });
  it('shows study messages and labeled unassigned replies without leaking other-study conversations', async () => {
    const f = fixture(); await started(f);
    const management = createProlificManagementService({ ...f.deps, request: async (token, path, body) => path.startsWith('messages/?') ? { results: [
      { id: 'one', sender_id: participantId, body: 'Unassigned reply', sent_at: '2026-01-01T00:00:00Z' },
      { id: 'two', sender_id: accountId, body: 'Study message', sent_at: '2026-01-02T00:00:00Z', data: { study_id: studyId } },
      { id: 'other', body: 'Other study', sent_at: '2026-01-03T00:00:00Z', data: { study_id: '0'.repeat(24) } },
    ] } : f.deps.request(token, path, body) }, f.db);
    const messages = await management.messages('owner', { studyId, submissionId });
    assert.deepEqual(messages.map(m => m.id), ['one', 'two']);
    assert.equal(messages[0].unassignedStudy, true); assert.equal(messages[1].fromResearcher, true);
  });
  it('previews researcher-entered bonuses including fees, then pays only once under duplicate confirmation', async () => {
    const f = fixture(); await started(f);
    const input = { studyId, kind: 'bonus', rows: [{ submissionId, amount: '1.50' }], requestId: 'one' };
    const preview = await f.management.prepare('owner', input);
    assert.equal(preview.quote.total, 200); assert.equal(preview.rows[0].cents, 150);
    assert.equal((await f.management.prepare('owner', input)).id, preview.id);
    await assert.rejects(f.management.prepare('owner', { ...input, rows: [{ submissionId, amount: '2.00' }] }), /identityConflict/);
    assert.equal(f.calls.filter(c => c.path.endsWith('/pay/')).length, 0);
    await Promise.allSettled([f.management.confirm('owner', { operationId: preview.id }), f.management.confirm('owner', { operationId: preview.id })]);
    await f.management.confirm('owner', { operationId: preview.id });
    assert.equal(f.calls.filter(c => c.path.endsWith('/pay/')).length, 1);
    assert.equal(f.db.operations.rows[0].status, 'accepted');
  });
  it('accepts fractional-cent fee quotes and blocks missing or mismatched cost breakdowns', async () => {
    const f = fixture(); await started(f);
    let quote = { id: '1'.repeat(24), study: studyId, amount: 150, fees: 50.01, vat: 10.002, total_amount: 210.012 };
    const management = createProlificManagementService({ ...f.deps, request: async (token, path, body) => path === 'submissions/bonus-payments/' ? quote : f.deps.request(token, path, body) }, f.db);
    const input = { studyId, kind: 'bonus', rows: [{ submissionId, amount: '1.50' }], requestId: 'fractional' };
    assert.equal((await management.prepare('owner', input)).quote.total, 210.012);
    for (const [key, value] of [['fees', undefined], ['amount', 151], ['vat', -1], ['total_amount', NaN], ['study', '0'.repeat(24)]]) {
      const original = quote;
      quote = { ...quote, [key]: value };
      await assert.rejects(management.prepare('owner', { ...input, requestId: key }), /remoteFailed/);
      quote = original;
    }
    assert.equal(f.calls.filter(c => c.path.endsWith('/pay/')).length, 0);
  });
  it('never retries an uncertain payment; requires recorded external review before another operation', async () => {
    const f = fixture(); await started(f);
    const management = createProlificManagementService({ ...f.deps, request: async (token, path, body) => {
      if (path.endsWith('/pay/')) { f.calls.push({ path }); throw new ProlificApiError(0, true); }
      return f.deps.request(token, path, body);
    } }, f.db);
    const input = { studyId, kind: 'bonus', rows: [{ submissionId, amount: '1.50' }], requestId: 'one' };
    const op = await management.prepare('owner', input);
    assert.equal((await management.confirm('owner', { operationId: op.id })).status, 'review-required');
    await management.confirm('owner', { operationId: op.id });
    await assert.rejects(management.prepare('owner', { ...input, requestId: 'two' }), /reviewRequired/);
    assert.equal(f.calls.filter(c => c.path.endsWith('/pay/')).length, 1);
    await management.review('owner', { operationId: op.id, note: 'Synthetic external verification' });
    assert.equal(f.db.operations.rows[0].status, 'reviewed');
    assert.equal(f.db.operations.rows[0].activeStudy, undefined);
  });
  it('sends reminders only after expiry, once across concurrent workers, and cancels completed participants', async () => {
    const f = fixture(), p = await started(f);
    await progress(f, p, { currentUnitNumber: 1, lastUnitCompleted: 0 });
    await f.db.reminders.insertAsync({ _id: 'r', tdfId: 'root', unit: 1, participationId: p._id, ownerId: 'owner', studyId, boundary: 'test', dueAt: new Date(Date.now() + 60000), status: 'pending', bodyEncrypted: 'Synthetic return link' });
    await f.management.processReminders(); assert.equal(f.calls.length, 0);
    f.db.reminders.rows[0].dueAt = new Date(0);
    await Promise.all([f.management.processReminders(), f.management.processReminders()]);
    assert.equal(f.calls.filter(c => c.path === 'messages/').length, 1);
    assert.equal(f.db.reminders.rows[0].status, 'sent');
    f.db.reminders.rows[0].status = 'pending'; f.db.participants.rows[0].completedAt = new Date();
    await f.management.processReminders(); assert.equal(f.db.reminders.rows[0].status, 'cancelled');
  });
  it('enforces roles, self authentication, rate limiting and sanitized errors at method boundaries', async () => {
    const f = fixture(), rateCalls = [];
    const methods = createProlificMethods({ participation: f.participation, management: f.management, authorization: () => ({ userIsInRoleAsync: async id => id === 'owner' }), rateLimit: async (...args) => rateCalls.push(args) });
    await assert.rejects(methods.prolificDashboard.call({ userId: 'student' }, { studyId }));
    for (const name of ['prolificCreateTestParticipant', 'prolificPrepareTestStudy', 'prolificExecuteTestStudy', 'prolificTestSetupStatus']) {
      await assert.rejects(methods[name].call({ userId: 'student' }, {}));
      await assert.rejects(methods[name].call({}, {}));
    }
    await assert.rejects(methods.completeProlificParticipation.call({}));
    await methods.startProlificParticipation.call({ connection: { clientAddress: 'synthetic' } }, launch);
    assert.equal(rateCalls[0][0], 'prolific-start');
    await assert.rejects(methods.startProlificParticipation.call({}, {}), e => e.error === 'prolific.invalidIdentity');
  });
});

it('appends export identities with bounded batched joins and empty ordinary participant values', async () => {
  const chunks = [], batches = [];
  const histories = Array.from({ length: 205 }, (_, i) => ({ userId: `u${i}`, anonStudentId: `synthetic${i}` }));
  await writeHistoryExport(histories, c => chunks.push(c), e => { throw e; }, async ids => { batches.push(ids); return ids.includes('u0') ? [{ userId: 'u0', participantId, studyId, submissionId }] : []; });
  assert.deepEqual(batches.map(b => b.length), [100, 100, 5]);
  assert.match(chunks[0], /Prolific Participant ID\tProlific Study ID\tProlific Submission ID\n$/);
  assert.equal(chunks[1].endsWith(`${participantId}\t${studyId}\t${submissionId}\n`), true);
  assert.equal(chunks[2].endsWith('\t\t\t\n'), true);
});


describe('learner completion navigation', () => {
  const state = new Map(), storage = new Map();
  let user = { _id: 'learner', profile: { createdBy: 'startProlificParticipation' } };
  let fail = false, completions = 0;
  const navigations = [];
  const loader = Module._load;
  Module._load = function(name, ...args) {
    if (name === 'meteor/meteor') return { Meteor: { user: () => user, userId: () => user?._id } };
    if (name === 'meteor/session') return { Session: { get: k => state.get(k), set: (k, v) => state.set(k, v) } };
    if (name === './launchLoading') return { finishLaunchLoading: () => state.set('appLoading', false) };
    if (name === './meteorAsync') return { meteorCallAsync: async () => { completions++; if (fail) throw new Error('save failure'); return { completionUrl }; } };
    if (name.endsWith('/navigationCleanup')) return { leavePage: async (url, external) => navigations.push({ url, external }) };
    return loader.call(this, name, ...args);
  };
  const runtime = require('../client/lib/prolificParticipation.ts');
  // Transpiled dynamic imports use require when finalization runs, so intercept only that module during these tests.
  Module._load = loader;
  beforeEach(() => {
    state.clear(); storage.clear(); navigations.length = 0; completions = 0; fail = false;
    user = { _id: 'learner', profile: { createdBy: 'startProlificParticipation' } };
    global.sessionStorage = { getItem: k => storage.get(k), removeItem: k => storage.delete(k) };
    storage.set('prolificInitialReturn', 'learner');
    Module._load = function(name, ...args) {
      if (name.endsWith('/navigationCleanup')) return { leavePage: async (url, external) => navigations.push({ url, external }) };
      return loader.call(this, name, ...args);
    };
  });
  afterEach(() => { Module._load = loader; delete global.sessionStorage; });
  it('awaits finalization, redirects only once for concurrent calls and leaves ordinary mode alone', async () => {
    await Promise.all([runtime.finalizeProlificSession(), runtime.finalizeProlificSession()]);
    assert.equal(completions, 1); assert.deepEqual(navigations, [{ url: completionUrl, external: true }]);
    user.profile = {};
    assert.equal(await runtime.finalizeProlificSession(), false); assert.equal(completions, 1);
  });
  it('retains context on failure and retries without navigation until persistence succeeds', async () => {
    fail = true;
    await runtime.checkpointProlificLockout();
    assert.equal(navigations.length, 0); assert.equal(runtime.participationSaveFailed(), true);
    assert.equal(storage.get('prolificInitialReturn'), 'learner');
    await runtime.retryParticipationSave();
    assert.equal(navigations.length, 0); assert.equal(runtime.participationSaveFailed(), true);
    fail = false;
    await runtime.retryParticipationSave();
    assert.equal(navigations.length, 1); assert.equal(runtime.participationSaveFailed(), false);
  });
  it('never replays a failed participant save under a different authenticated account', async () => {
    fail = true; await runtime.checkpointProlificLockout();
    user = { _id: 'different', profile: {} };
    await runtime.retryParticipationSave();
    assert.equal(completions, 1); assert.equal(runtime.participationSaveFailed(), false);
  });
});

const { createProlificTestSetup } = require('../server/lib/prolificTestSetup.ts');
function testSetupFixture() {
 const f=fixture();
 f.db.operations=new Store([], [['ownerId','requestId'],['testRootKey'],['testDraftKey'],['testParticipantKey']]);
 let configured=0, inspectFailure=false, saveFailure=false, mutationFailure=null;
 const newStudy='9'.repeat(24);
 const draft={id:studyId,project:projectId,name:'Test draft',status:'UNPUBLISHED',completion_codes:[{code:'TEST123',actions:[{action:'MANUALLY_REVIEW'}]}]};
 const requests=[];
 const service=createProlificTestSetup({operations:f.db.operations,connection:async()=>({token:'synthetic',accountId}),
 encrypt:v=>v,decrypt:v=>v,audit:async()=>{},baseUrl:()=> 'https://example.org/',
 inspect:async()=>{if(inspectFailure) throw new Error('prolific.experimentUsed');return {name:'Mock lesson',revisions:{root:1}};},
 configure:async()=>{if(saveFailure)throw new Error('save failed');configured++;},
 request:async(_token,path,body,_transport,method)=>{
  requests.push({path,body,method});
  if(body && mutationFailure)throw mutationFailure;
  if(path==='projects/'+projectId+'/')return {id:projectId,workspace:workspaceId};
  if(path.endsWith('/balance/'))return {currency_code:'USD'};
  if(path==='researchers/participants/')return {participant_id:participantId};
  if(path.endsWith('/test-study'))return {study_id:newStudy,study_url:'https://app.prolific.com/studies/'+newStudy+'/test'};
  if(path==='studies/'+studyId+'/'){if(method==='PATCH')draft.external_study_url=body.external_study_url;return structuredClone(draft);}
  if(path==='studies/'+newStudy+'/')return {...draft,id:newStudy,status:'ACTIVE'};
  throw new Error('Unexpected request');
 }});
 const input={requestId:'prepare',workspaceId,projectId,sourceStudyId:studyId,rootTdfId:'root',reminderText:'Return for testing'};
 return {service,input,requests,draft,db:f.db,newStudy,configured:()=>configured,used:()=>{inspectFailure=true;},failSave:v=>{saveFailure=v;},failMutation:v=>{mutationFailure=v;}};
}
describe('Prolific test provisioning',()=>{
 it('prepares without mutations and configures the returned test identity',async()=>{
  const f=testSetupFixture(), p=await f.service.prepare('owner',f.input);
  assert.equal(f.requests.some(r=>r.body),false);assert.equal(p.status,'prepared');assert.match(p.launchUrl,/experiment\/\{\{%STUDY_ID%\}\}/);
  const done=await f.service.execute('owner',{operationId:p.id});assert.equal(done.status,'ready');assert.equal(done.studyId,f.newStudy);assert.equal(f.configured(),1);
  assert.equal(f.requests.filter(r=>r.path.endsWith('/test-study')).length,1);
  await f.service.execute('owner',{operationId:p.id});assert.equal(f.configured(),1);
 });
 it('requires an explicit choice among multiple completion codes',async()=>{
  const f=testSetupFixture();f.draft.completion_codes.push({code:'SECOND'});
  const p=await f.service.prepare('owner',f.input);assert.equal(p.status,'choose-code');assert.equal(f.db.operations.rows.length,0);
  assert.equal((await f.service.prepare('owner',{...f.input,completionCode:'SECOND'})).completionCode,'SECOND');
 });
 it('rejects non-drafts and used experiments before creation',async()=>{
  const f=testSetupFixture();f.draft.status='ACTIVE';await assert.rejects(f.service.prepare('owner',f.input),/draftRequired/);
  f.draft.status='UNPUBLISHED';f.used();await assert.rejects(f.service.prepare('owner',f.input),/experimentUsed/);
  assert.equal(f.requests.some(r=>r.body),false);
 });
 it('rejects changed drafts and newly used experiments before mutations',async()=>{
  const f=testSetupFixture();const p=await f.service.prepare('owner',f.input);f.draft.name='Changed';
  assert.equal((await f.service.execute('owner',{operationId:p.id})).errorKey,'prolific.setupChanged');assert.equal(f.requests.some(r=>r.body),false);
  const g=testSetupFixture();const q=await g.service.prepare('owner',g.input);g.used();assert.equal((await g.service.execute('owner',{operationId:q.id})).errorKey,'prolific.experimentUsed');
 });
 it('resumes local configuration without repeating remote creation',async()=>{
  const f=testSetupFixture(),p=await f.service.prepare('owner',f.input);f.failSave(true);
  assert.equal((await f.service.execute('owner',{operationId:p.id})).status,'setup-incomplete');
  f.failSave(false);assert.equal((await f.service.execute('owner',{operationId:p.id})).status,'ready');
  assert.equal(f.requests.filter(r=>r.path.endsWith('/test-study')).length,1);
 });
 it('claims concurrent creation once and retains status across clients',async()=>{
  const f=testSetupFixture(),p=await f.service.prepare('owner',f.input);
  await Promise.all([1,2,3].map(()=>f.service.execute('owner',{operationId:p.id})));
  assert.equal(f.requests.filter(r=>r.path.endsWith('/test-study')).length,1);
  assert.equal((await f.service.status('owner'))[0].status,'ready');assert.deepEqual(await f.service.status('another'),[]);
  await assert.rejects(f.service.execute('another',{operationId:p.id}),/accessDenied/);
 });
 it('retains unknown outcomes without retrying external writes',async()=>{
  const f=testSetupFixture(),p=await f.service.prepare('owner',f.input);f.failMutation(new ProlificApiError(0,true));
  assert.equal((await f.service.execute('owner',{operationId:p.id})).status,'review-required');
  const count=f.requests.length;await f.service.execute('owner',{operationId:p.id});assert.equal(f.requests.length,count);
 });
 it('creates participant receipts without participation or learner records',async()=>{
  const f=testSetupFixture(),input={email:'tester@example.org',requestId:'participant'};
  const result=await f.service.participant('owner',input);assert.equal(result.participantId,participantId);
  await f.service.participant('owner',input);assert.equal(f.requests.length,1);assert.equal(f.db.participants.rows.length,0);
  assert.equal(JSON.stringify(await f.service.status('owner')).includes('tester@example.org'),false);
  await assert.rejects(f.service.participant('owner',{...input,requestId:'another'}),/setupConflict/);
 });
});

const { createProlificTestExperiment } = require('../server/lib/prolificTestExperiment.ts');
function unusedExperimentFixture() {
 const root={_id:'root',ownerId:'owner',tdfAvailability:'available',tdfRevision:3,content:{tdfs:{tutor:{setspec:{lessonname:'Synthetic',loadbalancing:'not-max'},unit:[{unitname:'Preserved'}]}}}};
 const deps={Tdfs:new Store([root]),Histories:new Store(),states:new Store(),assignments:new Store(),studies:new Store([], [['rootTdfId'],['studyId']]),participants:new Store(),
 saveContent:async(_owner,previous,content)=>{const current=deps.Tdfs.rows[0];assert.equal(current.tdfRevision,previous.tdfRevision);current.content=content;current.tdfRevision++;}};
 const service=createProlificTestExperiment(deps);
 const operation={_id:'operation',rootTdfId:'root',studyId,accountId,workspaceId,projectId,currency:'USD',reminderText:'Return',revisions:{root:3},completionCode:'TEST123'};
 return {deps,service,operation};
}
describe('unused test experiment contract',()=>{
 it('uses the normal content writer and retries without another revision',async()=>{
  const f=unusedExperimentFixture();assert.deepEqual((await f.service.inspect('owner','root')).revisions,{root:3});
  await f.service.configure('owner',f.operation);await f.service.configure('owner',f.operation);
  assert.equal(f.deps.Tdfs.rows[0].tdfRevision,4);assert.equal(f.deps.Tdfs.rows[0].content.tdfs.tutor.setspec.loadbalancing,'not-max');
  assert.equal(f.deps.Tdfs.rows[0].content.tdfs.tutor.unit[0].unitname,'Preserved');assert.equal(f.deps.studies.rows.length,1);
 });
 for(const store of ['Histories','states','assignments','participants'])it('rejects existing '+store,async()=>{
  const f=unusedExperimentFixture();await f.deps[store].insertAsync(store==='participants'?{rootTdfId:'root'}:{TDFId:'root'});
  await assert.rejects(f.service.inspect('owner','root'),/experimentUsed/);
 });
 it('rejects another owner and revision changes without saving',async()=>{
  const f=unusedExperimentFixture();await assert.rejects(f.service.inspect('another','root'),/accessDenied/);
  f.deps.Tdfs.rows[0].tdfRevision++;await assert.rejects(f.service.configure('owner',f.operation),/setupChanged/);
  assert.equal(f.deps.studies.rows.length,0);
 });
 it('rejects a bound lesson and does not rewrite it',async()=>{
  const f=unusedExperimentFixture();await f.deps.studies.insertAsync({rootTdfId:'root',studyId:'9'.repeat(24)});
  await assert.rejects(f.service.configure('owner',f.operation),/experimentUsed/);assert.equal(f.deps.Tdfs.rows[0].tdfRevision,3);
 });
 it('checks the child condition history, not only the root',async()=>{
  const f=unusedExperimentFixture(),root=f.deps.Tdfs.rows[0];delete root.content.tdfs.tutor.unit;
  Object.assign(root.content.tdfs.tutor.setspec,{condition:['child.json'],conditionTdfIds:['child']});
  await f.deps.Tdfs.insertAsync({_id:'child',ownerId:'owner',tdfAvailability:'available',tdfRevision:1,content:{fileName:'child.json',tdfs:{tutor:{setspec:{lessonname:'Child'},unit:[{}]}}}});
  await f.deps.Histories.insertAsync({TDFId:'child'});await assert.rejects(f.service.inspect('owner','root'),/experimentUsed/);
 });
});
it('sanitizes explicit provider testing errors without labeling all 403 responses unavailable',async()=>{
 for(const [path,body,key] of [
  ['researchers/participants/',{detail:'Testing feature is not enabled'},'prolific.testingUnavailable'],
  ['researchers/participants/',{email:['Already registered']},'prolific.testEmailUsed'],
  ['studies/'+studyId+'/test-study',{detail:'At least one test participant is required'},'prolific.testParticipantRequired'],
  ['researchers/participants/',{detail:'Access denied'},'prolific.connectionFailed']]) {
  await assert.rejects(prolificRequest('secret',path,{},async()=>new Response(JSON.stringify(body),{status:403})),e=>e.message===key);
 }
});

it('allows explicit retries of known failures but never ambiguous participant creation',async()=>{
 const f=testSetupFixture();f.failMutation(new ProlificApiError(403,false,'prolific.testingUnavailable'));
 const op=await f.service.participant('owner',{email:'retry@example.org',requestId:'retry'});assert.equal(op.status,'failed');
 f.failMutation(null);assert.equal((await f.service.participant('owner',{operationId:op.id})).status,'accepted');
 const g=testSetupFixture();g.failMutation(new ProlificApiError(0,true));
 const uncertain=await g.service.participant('owner',{email:'uncertain@example.org',requestId:'unknown'});
 g.failMutation(null);await g.service.participant('owner',{operationId:uncertain.id});assert.equal(g.requests.length,1);
});
it('requires a fresh explicit review to replace a changed prepared setup',async()=>{
 const f=testSetupFixture(),p=await f.service.prepare('owner',f.input);f.draft.name='Reviewed change';
 const revised=await f.service.prepare('owner',{...f.input,requestId:'revision'});
 assert.notEqual(revised.id,p.id);assert.equal((await f.service.execute('owner',{operationId:p.id})).status,'reviewed');
 assert.equal((await f.service.execute('owner',{operationId:revised.id})).status,'ready');
});
it('rejects progressive course assignments and directly selected children',async()=>{
 const f=unusedExperimentFixture();await f.deps.assignments.insertAsync({memberTdfIds:['root']});
 await assert.rejects(f.service.inspect('owner','root'),/experimentUsed/);
 const g=unusedExperimentFixture();await g.deps.Tdfs.insertAsync({_id:'parent',content:{tdfs:{tutor:{setspec:{conditionTdfIds:['root']}}}}});
 await assert.rejects(g.service.inspect('owner','root'),/invalidConfiguration/);
});
