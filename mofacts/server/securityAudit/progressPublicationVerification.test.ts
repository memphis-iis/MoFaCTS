import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { GlobalExperimentStates } from '../../common/Collections';

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
});
