// Run explicitly against the canonical localhost watcher. Uses only run-owned synthetic records.
require('./registerHistoryTypescript.cjs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { MongoClient } = require('mongodb');
const { chromium } = require('playwright');
const { collectionMongoName } = require('../common/collectionOwnership.ts');

const origin = 'http://localhost:3200';
const id = () => randomBytes(12).toString('hex');
const owner = 'privacy-test-' + id();
const study = id(), manual = id(), credentialed = id(), pid = id(), submissionId = id();
const username = 'P-' + id().toUpperCase();
const instructorUser = id(), regularUser = owner;
const stimulusId = randomBytes(6).readUIntBE(0, 6);
const password = 'study-synthetic-password';
const bcrypt = '$2b$10$jgZvZgReRnpE32mE0WsV3uAAfgd/oxWY0vQOGihl7WKQCm6CMaogO';
const users = new Set([instructorUser, regularUser]);
let stage = 'local fixture';

async function main() {
  assert.equal(execFileSync('docker', ['inspect', 'mofacts', '--format', '{{index .Config.Labels "com.docker.compose.service"}}'], { encoding: 'utf8' }).trim(), 'mofacts');
  const uri = new URL(execFileSync('docker', ['exec', 'mofacts', 'printenv', 'MONGO_URL'], { encoding: 'utf8' }).trim());
  assert.equal(uri.hostname, 'mongodb');
  uri.hostname = '127.0.0.1';
  uri.searchParams.set('directConnection', 'true');
  const client = new MongoClient(uri.href);
  const db = client.db();
  const collection = name => db.collection(collectionMongoName(name));
  const browser = await chromium.launch();
  const since = new Date();
  async function open(path = '/', failSavedCheckpoint = false) {
    const ctx = await browser.newContext();
    await ctx.route('**/*', route => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
    const page = await ctx.newPage();
    if (failSavedCheckpoint) await page.addInitScript(() => {
      const timer = setInterval(() => {
        if (!window.Meteor?.callAsync) return;
        clearInterval(timer);
        const call = Meteor.callAsync.bind(Meteor);
        Meteor.callAsync = async (name, ...args) => {
          if (name === 'completeProlificParticipation' && !window.syntheticCheckpointRetried
            && document.querySelector('.instructions-container') && Session.get('currentUnitNumber') === 1) {
            window.syntheticCheckpointRetried = true;
            throw new Error('Synthetic checkpoint interruption');
          }
          return call(name, ...args);
        };
      }, 1);
    });
    const response = await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
    if (path.startsWith('/experiment/') || path.startsWith('/prolific/')) assert.equal(response.headers()['referrer-policy'], 'no-referrer');
    await page.waitForFunction(() => window.Meteor?.status().connected);
    return page;
  }
  async function assertPrivate(page, expected) {
    await page.waitForFunction(uid => Meteor.userId() === uid && Meteor.user()?._id === uid, expected);
    await page.evaluate(async uid => {
      await Meteor.callAsync('setUserSessionId', 'synthetic-session-metadata', 123);
      await Meteor.callAsync('logUserAgentAndLoginTime', uid, 'synthetic-agent');
      await Meteor.callAsync('sendUserErrorReport', uid, 'synthetic', '/synthetic', {}, 'synthetic', [], {});
      await Meteor.callAsync('reportRecoverableWarning', { code: 'autotutor.citationMismatch', tdfId: null, mismatchCount: 1 });
      await Meteor.callAsync('debugLog', 'synthetic-participant-debug');
      let denied = false;
      try { await Meteor.callAsync('updateOwnProfile', { name: 'synthetic-private-write' }); }
      catch (error) { denied = error.error === 'experiment-account-restricted'; }
      if (!denied) throw new Error('Missing profile restriction');
    }, expected);
    const u = await db.collection('users').findOne({ _id: expected }, { projection: { status: 1, lastSessionId: 1, 'profile.name': 1 } });
    assert.equal(u.status?.userAgent, undefined);
    assert.notEqual(u.lastSessionId, 'synthetic-session-metadata');
    assert.notEqual(u.profile?.name, 'synthetic-private-write');
    assert.equal(await collection('ErrorReports').countDocuments({ user: expected }), 0);
    assert.equal(await collection('AuditLog').countDocuments({ actorUserId: expected, action: 'system.recoverableWarning' }), 0);
  }
  let observedPage;
  try {
    const targets = [study, manual, credentialed];
    await collection('Tdfs').insertMany(targets.map((target, index) => ({
      _id: 'tdf_' + target, ownerId: owner, tdfAvailability: 'available', tdfFileName: target + '.json',
      stimuliSetId: stimulusId + index, rawStimuliFile: { setspec: { clusters: [{ clusterKC: 0, stims: [{ stimulusKC: 0, responseKC: 0, stimulus: 'prompt', response: { correctResponse: 'answer' } }] }] } }, stimuli: [{ stimulusKC: 0, clusterKC: 0, responseKC: 0, stimuliSetId: stimulusId + index, correctResponse: 'answer' }], content: { fileName: target + '.json', tdfs: { tutor: {
        setspec: { lessonname: target, userselect: 'false', experimentTarget: target,
          ...(target === study ? { prolificCompletionUrl: 'https://app.prolific.com/submissions/complete?cc=SYNTH' } : {}),
          experimentPasswordRequired: target === credentialed },
        unit: [{ unitname: 'First', unitinstructions: 'First session' }, { unitname: 'Return', unitinstructions: 'Return session', deliverySettings: { lockoutminutes: 1440 } }],
      } } },
    })));
    await db.collection('ProlificStudies').insertOne({ studyId: study, rootTdfId: 'tdf_' + study, ownerId: owner, reminderText: 'Synthetic return' });
    await db.collection('users').insertMany([
      { _id: instructorUser, username: 'I-' + instructorUser, profile: { experiment: true, experimentTarget: credentialed }, services: { password: { bcrypt } } },
      { _id: regularUser, username: regularUser + '@example.invalid', emails: [{ address: regularUser + '@example.invalid', verified: true }],
        profile: { experiment: false }, services: { password: { bcrypt } } },
    ]);
    stage = 'automatic launch';
    const first = await open('/experiment/' + study + '/1?PROLIFIC_PID=' + pid + '&STUDY_ID=' + study + '&SESSION_ID=' + submissionId);
    await first.waitForFunction(() => Meteor.user()?.profile?.createdBy === 'startProlificParticipation' && !location.search.includes('PROLIFIC_PID'));
    const p = await db.collection('ProlificParticipations').findOne({ studyId: study, participantId: pid });
    users.add(p.userId);
    observedPage = first;
    await assertPrivate(first, p.userId);
    stage = 'saved checkpoint';
    async function checkExport(page, userId, target, expectedKey) {
      const marker = 'answer-' + userId;
      await collection('Histories').insertOne({ _id: id(), userId, TDFId: 'tdf_' + target, anonStudentId: 'private-name',
        time: Date.now(), input: marker, outcome: 'correct' });
      const file = await page.evaluate(() => Meteor.callAsync('downloadOwnHistoryAcrossTdfs'));
      assert.equal(file.fileName, 'learning-data_participant_own-history_all-lessons.tsv');
      const response = await page.request.get(origin + file.downloadUrl);
      assert.equal(response.status(), 200);
      const tsv = (await response.body()).toString('utf16le');
      assert.doesNotMatch(tsv, /Prolific (Participant|Study|Submission) ID|private-name/);
      assert.equal([pid, submissionId, target].some(value => tsv.includes(value)), false);
      const row = tsv.split('\n').find(line => line.includes(marker));
      assert.ok(row);
      const key = row.split('\t')[0];
      if (expectedKey) assert.equal(key, expectedKey);
      else assert.match(key, /^[a-f0-9]{64}$/);
    }
    await checkExport(first, p.userId, study, p._id);
    const root = 'tdf_' + study;
    stage = 'first instructions and redirect';
    const completionRequest = first.waitForRequest(req => req.url().startsWith('https://app.prolific.com/submissions/complete?'), { timeout: 30000 });
    await Promise.all([completionRequest, first.locator('#continueButton').click()]);
    const reminders = db.collection('ProlificReminders');
    assert.equal(await reminders.countDocuments({ participationId: p._id }), 1);
    const reminder = await reminders.findOne({ participationId: p._id });
    const savedLock = (await db.collection('users').findOne({ _id: p.userId }, { projection: { lockouts: 1 } })).lockouts[root];
    assert.equal(reminder.dueAt.getTime(), savedLock.lockoutTimeStamp + 86400000);
    // Exercise the exact queued URL without contacting the provider or reading other messages.
    const settings = JSON.parse(execFileSync('docker', ['exec', 'mofacts', 'cat', '/run/mofacts/settings.json'], { encoding: 'utf8' }));
    const Module = require('node:module'), previous = Module._load;
    let decryptData;
    try {
      Module._load = function(name, ...args) { return name === 'meteor/meteor' ? { Meteor: { settings: { encryptionKey: settings.encryptionKey } } } : previous.call(this, name, ...args); };
      ({ decryptData } = require('../server/lib/encryption.ts'));
    } finally { Module._load = previous; }
    const url = new URL(decryptData(reminder.bodyEncrypted).split('\n').at(-1));
    assert.equal(url.pathname, '/prolific/resume');
    await first.context().close();
    stage = 'fresh-browser return';
    const fresh = await open(url.pathname + url.hash, true);
    observedPage = fresh;
    await assertPrivate(fresh, p.userId);
    assert.equal(new URL(fresh.url()).hash, '');
    await fresh.waitForFunction(root => Meteor.user()?.lockouts?.[root]?.lockoutMinutes === 1440, root);
    assert.equal(await fresh.evaluate(root => Meteor.user().lockouts[root].lockoutTimeStamp, root), savedLock.lockoutTimeStamp);
    const persisted = await collection('GlobalExperimentStates').findOne({ userId: p.userId, TDFId: root });
    assert.equal(persisted.experimentState.currentUnitNumber, 1);
    assert.equal(Number(persisted.experimentState.experimentXCond), 1);
    stage = 'saved-lockout retry';
    await fresh.waitForFunction(() => Session.get('prolificSaveError') === true && window.syntheticCheckpointRetried);
    await fresh.getByRole('alert').getByRole('button', { name: /try again/i }).click();
    await fresh.waitForFunction(() => !!document.querySelector('#lockoutTimeRemaining')?.textContent && document.querySelector('#continueButton')?.disabled);
    // The browser clock advances one day, while the stored deadline remains fixed.
    await fresh.clock.setFixedTime(new Date(reminder.dueAt.getTime() + 1000));
    assert.equal(await fresh.evaluate(end => Date.now() >= end, reminder.dueAt.getTime()), true);
    await fresh.waitForFunction(() => document.querySelector('#continueButton')?.disabled === false);
    stage = 'terminal checkpoint';
    await fresh.locator('#continueButton').click();
    let terminal;
    for (let attempt = 0; attempt < 50; attempt++) {
      terminal = await db.collection('ProlificParticipations').findOne({ _id: p._id });
      if (terminal.completedAt) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(terminal.completedAt);
    assert.equal(terminal.sessions.filter(session => session.boundary === 'end').length, 1);
    stage = 'manual entry and reload';
    const manualPage = await open();
    const manualId = await manualPage.evaluate(async ({ manual, username }) => {
      const result = await Meteor.callAsync('provisionExperimentUser', manual, username);
      await Meteor.loginWithTokenAsync(result.loginToken);
      return Meteor.userId();
    }, { manual, username });
    users.add(manualId);
    await checkExport(manualPage, manualId, manual);
    await assertPrivate(manualPage, manualId);
    await manualPage.reload({ waitUntil: 'domcontentloaded' });
    await assertPrivate(manualPage, manualId);
    for (const [accountId, accountName, ordinary] of [[instructorUser, 'I-' + instructorUser, false], [regularUser, regularUser + '@example.invalid', true]]) {
      stage = ordinary ? 'ordinary credentialed entry' : 'study-only credentialed entry';
      const page = await open();
      await page.evaluate(async ({ target, username, password, ordinary }) => {
        let result = await Meteor.callAsync('enterCredentialedExperiment', target, username, Accounts._hashPassword(password));
        if (ordinary !== Boolean(result.ordinaryLoginRequired)) throw new Error('Incorrect account path');
        if (ordinary) {
          await new Promise((resolve, reject) => Meteor.loginWithPassword(username, password, e => e ? reject(e) : resolve()));
          result = await Meteor.callAsync('enterCredentialedExperiment', target);
        }
        await Meteor.loginWithTokenAsync(result.loginToken);
      }, { target: credentialed, username: accountName, password, ordinary });
      await assertPrivate(page, accountId);
      await checkExport(page, accountId, credentialed);
      if (ordinary) {
        const owned = await page.evaluate(root => Meteor.callAsync('downloadDataById', root), root);
        const response = await page.request.get(origin + owned.downloadUrl);
        assert.equal(response.status(), 200);
        const tsv = (await response.body()).toString('utf16le');
        assert.ok(tsv.includes(p._id));
        assert.doesNotMatch(tsv, /Prolific (Participant|Study|Submission) ID|private-name/);
      }
    }
    const logs = execFileSync('docker', ['logs', '--since', since.toISOString(), 'mofacts'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal([pid, submissionId, username, 'synthetic-participant-debug'].some(value => logs.includes(value)), false);
    for (const userId of users) {
      const count = await collection('AuditLog').countDocuments({ actorUserId: userId, action: 'auth.loginSuccess', 'details.ip': { $exists: true } });
      assert.equal(count, userId === regularUser ? 1 : 0);
    }
    assert.equal(await collection('AuthThrottleState').countDocuments({ key: /^prolific-(start|resume|complete):/, updatedAt: { $gte: since } }), 0);
    console.log('Passed automatic launch, saved return, fresh Chromium context, terminal completion, manual reload and both credentialed entries.');
  } catch (error) {
    if (observedPage) console.error('Return page state', await observedPage.evaluate(() => ({
      errorMessage: document.querySelector('.experiment-error-message')?.textContent?.replace(/[a-f0-9]{24}/g, '[id]'), surface: location.pathname.replace(/[a-f0-9]{24}/g, '[id]'), loggedIn: Boolean(Meteor.userId()), mode: Session.get('loginMode'), unit: Session.get('currentUnitNumber'),
      retryVisible: Boolean(Session.get('prolificSaveError')), injected: Boolean(window.syntheticCheckpointRetried),
      instructions: Boolean(document.querySelector('.instructions-container')), continuePresent: Boolean(document.querySelector('#continueButton')),
    })));
    throw error;
  } finally {
    await browser.close();
    const linked = await db.collection('ProlificParticipations').find({ ownerId: owner }, { projection: { userId: 1 } }).toArray();
    for (const row of linked) users.add(row.userId);
    const manualUser = await db.collection('users').findOne({ username, 'profile.experimentTarget': manual }, { projection: { _id: 1 } });
    if (manualUser) users.add(manualUser._id);
    for (const name of ['ProlificReminders', 'ProlificParticipations', 'ProlificStudies']) await db.collection(name).deleteMany({ ownerId: owner });
    for (const name of ['GlobalExperimentStates', 'Histories', 'UserDashboardCache']) await collection(name).deleteMany({ userId: { $in: [...users] } });
    await collection('Tdfs').deleteMany({ ownerId: owner });
    await collection('AuditLog').deleteMany({ actorUserId: { $in: [...users] } });
    await collection('ErrorReports').deleteMany({ user: { $in: [...users] } });
    await db.collection('users').deleteMany({ _id: { $in: [...users] } });
    await client.close();
  }
}
main().catch(error => { console.error('Local participant regression failed at ' + stage + ' (' + error.name + ', ' + (error.code || 'no code') + ')'); process.exitCode = 1; });
