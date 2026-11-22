import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { WebApp } from 'meteor/webapp';
import { GlobalExperimentStates, Histories, Tdfs } from '../../common/Collections';
import { issueExperimentLoginToken } from '../methods/experimentMethods';

describe('approved progress-privacy selection on the registered Meteor publication', function() {
  const suffix = Random.id(12), lesson = `synthetic-progress-lesson-${suffix}`;
  const actors = ['learnerA', 'learnerB', 'teacherA', 'teacherB'] as const;
  const users = Object.fromEntries(actors.map(actor => [actor, `synthetic-progress-${actor}-${suffix}`]));
  const ids = actors.map(actor => `synthetic-progress-row-${actor}-${suffix}`);
  const extraId = `synthetic-progress-other-lesson-${suffix}`;
  before(async function() {
    for (const [index, actor] of actors.entries()) {
      await GlobalExperimentStates.insertAsync({ _id: ids[index], userId: users[actor], TDFId: lesson });
    }
    await GlobalExperimentStates.insertAsync({ _id: extraId, userId: users.learnerA, TDFId: lesson + '-other' });
  });
  after(async function() { await GlobalExperimentStates.removeAsync({ _id: { $in: [...ids, extraId] } }); });

  it('finishes logged-out subscriptions without a progress cursor', function() {
    const handler = (Meteor as any).server.publish_handlers.userExperimentState;
    for (const request of [lesson, [lesson, lesson + '-other']]) {
      let readyCalls = 0;
      const result = handler.call({ userId: null, ready() { readyCalls++; } }, request);
      expect(result).to.equal(undefined);
      expect(readyCalls).to.equal(1);
    }
  });

  for (const actor of actors) {
    it(`returns only the bound own canary and no other actor's progress for ${actor}`, async function() {
      const handler = (Meteor as any).server.publish_handlers.userExperimentState;
      expect(handler, 'actual application publication registration').to.be.a('function');
      const cursor = await handler.call({ userId: users[actor], ready() {} }, lesson);
      const rows = await cursor.fetchAsync();
      const expected = [ids[actors.indexOf(actor)]];
      expect(rows.map((row: { _id: string }) => row._id)).to.deep.equal(expected);
      for (const row of rows) { expect(row.userId).to.equal(users[actor]); expect(row.TDFId).to.equal(lesson); }
    });
  }
  it('preserves own-user scope when a publication request contains multiple lessons', async function() {
    const handler = (Meteor as any).server.publish_handlers.userExperimentState;
    const cursor = await handler.call({ userId: users.learnerA, ready() {} }, [lesson, lesson + '-other']);
    const rows = await cursor.fetchAsync();
    expect(rows.map((row: { _id: string }) => row._id).sort()).to.deep.equal([ids[0], extraId].sort());
    expect(rows.every((row: { userId: string }) => row.userId === users.learnerA)).to.equal(true);
  });

  it('resumes a passwordless study session and scopes progress on its real DDP connection', async function() {
    this.timeout(15000);
    const address = WebApp.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Application TCP listener is unavailable');
    const ids = { root: Random.id(), condition: Random.id(), shared: Random.id(), other: Random.id() };
    const target = `progress-ddp-${suffix}`.toLowerCase();
    const username = `PROGRESS-DDP-${suffix}`.toUpperCase();
    const userId = Random.id();
    const otherUserId = Random.id();
    const otherActorRowId = Random.id();
    const rootRowId = Random.id();
    const conditionRowId = Random.id();
    const sharedRowId = Random.id();
    const otherRowId = Random.id();
    const rows = [[ids.root, rootRowId], [ids.condition, conditionRowId], [ids.shared, sharedRowId], [ids.other, otherRowId]];
    const sockets: WebSocket[] = [];

    function openConnection() {
      const ws = new WebSocket(`ws://127.0.0.1:${(address as { port: number }).port}/websocket`);
      sockets.push(ws);
      ws.addEventListener('message', event => {
        const message = JSON.parse(String(event.data));
        if (message.msg === 'ping') ws.send(JSON.stringify({ msg: 'pong', id: message.id }));
      });
      return ws;
    }
    function waitFor(ws: WebSocket, accept: (message: any) => boolean) {
      return new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => finish(new Error('Timed out waiting for an expected DDP response')), 5000);
        function finish(error?: Error, message?: any) {
          clearTimeout(timeout);
          ws.removeEventListener('message', onMessage);
          ws.removeEventListener('close', onClose);
          ws.removeEventListener('error', onClose);
          if (error) reject(error);
          else resolve(message);
        }
        function onClose() { finish(new Error('The test DDP connection closed')); }
        function onMessage(event: MessageEvent) {
          const message = JSON.parse(String(event.data));
          if (accept(message)) finish(undefined, message);
        }
        ws.addEventListener('message', onMessage);
        ws.addEventListener('close', onClose);
        ws.addEventListener('error', onClose);
      });
    }
    async function connect() {
      const ws = openConnection();
      const connected = waitFor(ws, message => message.msg === 'connected');
      ws.addEventListener('open', () => ws.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1'] })), { once: true });
      await connected;
      return ws;
    }
    function method(ws: WebSocket, name: string, ...params: unknown[]) {
      const id = Random.id();
      const result = waitFor(ws, message => message.msg === 'result' && message.id === id);
      ws.send(JSON.stringify({ msg: 'method', method: name, id, params }));
      return result;
    }
    function insertLesson(id: string, tutor: Record<string, unknown>) {
      return Tdfs.insertAsync({ _id: id, ownerId: 'synthetic-progress-study-owner', tdfAvailability: 'available',
        content: { fileName: `${id}.tdf`, tdfs: { tutor } } });
    }
    try {
      await insertLesson(ids.condition, { deliverySettings: [{ lockoutminutes: 3 }, { lockoutminutes: 7 }], unit: [{}] });
      await insertLesson(ids.shared, { unit: [{}] });
      await insertLesson(ids.root, { setspec: { experimentTarget: target,
        condition: [`${ids.condition}.tdf`, `${ids.shared}.tdf`], conditionTdfIds: [ids.condition, ids.shared] } });
      await insertLesson(ids.other, { setspec: { condition: [`${ids.shared}.tdf`], conditionTdfIds: [ids.shared] } });
      await Meteor.users.insertAsync({ _id: userId, username, createdAt: new Date(), profile: {} });
      for (const [index, [TDFId, _id]] of rows.entries()) {
        await GlobalExperimentStates.insertAsync({ _id, userId, TDFId,
          experimentState: { ...(TDFId === ids.root ? { conditionTdfId: ids.condition, currentUnitNumber: 0, experimentXCond: 1 } : {}), lastUnitCompleted: -1, lastActionTimeStamp: 100 + index } });
        await Histories.insertAsync({ _id, userId, TDFId, time: 100 + index });
      }
      await GlobalExperimentStates.insertAsync({ _id: otherActorRowId, userId: otherUserId, TDFId: ids.root });

      const entry = await connect();
      const resumed = await method(entry, 'provisionExperimentUser', target, username);
      expect(resumed.error).to.equal(undefined);
      expect(resumed.result.userId).to.equal(userId);
      expect(resumed.result.status).to.equal('resumed');
      entry.close();
      const ws = await connect();
      const ordinaryToken = await issueExperimentLoginToken(userId);
      const ordinary = await method(ws, 'login', { resume: ordinaryToken });
      expect(ordinary.error).to.equal(undefined);
      expect(ordinary.result.id).to.equal(userId);

      const subId = Random.id();
      const publishedIds: string[] = [];
      const ready = waitFor(ws, message => {
        if (message.msg === 'added' && [...rows.map(([, id]) => id), otherActorRowId].includes(message.id)) publishedIds.push(message.id);
        return (message.msg === 'ready' && message.subs.includes(subId)) || (message.msg === 'nosub' && message.id === subId);
      });
      ws.send(JSON.stringify({ msg: 'sub', id: subId, name: 'userExperimentState', params: [Object.values(ids)] }));
      expect((await ready).msg).to.equal('ready');
      expect(publishedIds.sort()).to.deep.equal(rows.map(([, id]) => id).sort());

      const removedIds: string[] = [];
      const reduced = waitFor(ws, message => {
        if (message.msg === 'removed' && [otherRowId, sharedRowId].includes(message.id)) removedIds.push(message.id);
        return removedIds.length === 2;
      });
      const [login] = await Promise.all([method(ws, 'reconnectExperimentParticipant', resumed.result.loginToken), reduced]);
      expect(login.error).to.equal(undefined);
      expect(login.result.id).to.equal(userId);
      expect(removedIds.sort()).to.deep.equal([otherRowId, sharedRowId].sort());

      const wait = await method(ws, 'setLockoutTimeStamp', 1, 999, 0, ids.condition);
      expect(wait.error).to.equal(undefined);
      expect(wait.result.lockoutMinutes).to.equal(7);
      expect(wait.result.lockoutTimeStamp).to.be.greaterThan(1);
      const resumedWait = await method(ws, 'setLockoutTimeStamp', 0, 0, 0, ids.condition);
      expect(resumedWait.result).to.deep.equal(wait.result);
      expect((await method(ws, 'setLockoutTimeStamp', 0, 0, 1, ids.condition)).error.error).to.equal(403);
      expect((await method(ws, 'setLockoutTimeStamp', 0, 0, 0, ids.other)).error.error).to.equal(403);

      for (const [lessonId, rowId] of [[ids.root, rootRowId], [ids.condition, conditionRowId]]) {
        expect((await method(ws, 'getExperimentState', userId, lessonId)).result.id).to.equal(rowId);
      }
      for (const lessonId of [ids.other, ids.shared]) {
        expect((await method(ws, 'getExperimentState', userId, lessonId)).error.error).to.equal(403);
      }
      expect((await method(ws, 'getLastTDFAccessed')).result).to.equal(ids.condition);
      expect((await method(ws, 'getUserRecentTDFs')).result.map((row: { _id: string }) => row._id)).to.deep.equal([ids.condition, ids.root]);
      expect((await method(ws, 'getLearnerProgressSignals')).result.attemptedTdfIds.sort()).to.deep.equal([ids.root, ids.condition].sort());
      expect((await method(ws, 'getLearnerProgressSignals', otherUserId)).error.error).to.equal('not-authorized');
      expect((await method(ws, 'getAssessmentCompletedTrialCountFromHistory', userId, ids.condition, 0)).result).to.equal(0);
      expect((await method(ws, 'getAssessmentCompletedTrialCountFromHistory', userId, ids.other, 0)).error.error).to.equal(403);
      expect((await method(ws, 'getPracticeDashboardSnapshot')).error.error).to.equal(403);
      expect((await method(ws, 'getLearnerCoursesSnapshot')).error.error).to.equal(403);
      expect((await method(ws, 'downloadOwnHistoryAcrossTdfs')).error.error).to.equal(403);
      expect((await method(ws, 'downloadDataById', ids.other)).error.error).to.equal(403);
      expect((await method(ws, 'createExperimentState', { currentRootTdfId: ids.other })).error.error).to.equal(403);
      expect((await method(ws, 'setExperimentState', userId, ids.other, otherRowId, {}, 'test')).error.error).to.equal(403);
      expect((await method(ws, 'updateExperimentState', {}, otherRowId)).error.error).to.equal(403);
      expect((await GlobalExperimentStates.findOneAsync(otherRowId))?.experimentState.lastActionTimeStamp).to.equal(103);
    } finally {
      for (const socket of sockets) socket.close();
      await GlobalExperimentStates.removeAsync({ _id: { $in: [...rows.map(([, id]) => id), otherActorRowId] } });
      await Histories.removeAsync({ _id: { $in: rows.map(([, id]) => id) } });
      await Tdfs.removeAsync({ _id: { $in: Object.values(ids) } });
      await Meteor.users.removeAsync(userId);
    }
  });
});
