import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { expect } from 'chai';
import { ensureProlificIndexes } from './prolificCollections';

if (Meteor.isServer) describe('Prolific Mongo persistence boundaries', function() {
  this.timeout(30000);
  it('enforces immutable identity uniqueness and single financial claims with real Mongo indexes', async function() {
    const prefix = `test_prolific_${Random.id()}_`;
    const collections = {
      ProlificConnections: new Mongo.Collection<any>(`${prefix}connections`),
      ProlificStudies: new Mongo.Collection<any>(`${prefix}studies`),
      ProlificParticipations: new Mongo.Collection<any>(`${prefix}participations`),
      ProlificOperations: new Mongo.Collection<any>(`${prefix}operations`),
      ProlificReminders: new Mongo.Collection<any>(`${prefix}reminders`),
    };
    try {
      await ensureProlificIndexes(collections);
      const p = collections.ProlificParticipations;
      await p.insertAsync({ participantId: 'synthetic-p', studyId: 'synthetic-study', submissionId: 'synthetic-s', userId: 'synthetic-u' });
      const conflicts = await Promise.allSettled([
        p.insertAsync({ participantId: 'synthetic-p', studyId: 'synthetic-study', submissionId: 'different-s', userId: 'different-u' }),
        p.insertAsync({ participantId: 'different-p', studyId: 'different-study', submissionId: 'synthetic-s', userId: 'another-u' }),
        p.insertAsync({ participantId: 'different-p', studyId: 'different-study', submissionId: 'another-s', userId: 'synthetic-u' }),
      ]);
      expect(conflicts.every(r => r.status === 'rejected')).to.equal(true);
      await p.insertAsync({ participantId: 'synthetic-p', studyId: 'second-study', submissionId: 'second-s', userId: 'second-u' });
      expect(await p.find().countAsync()).to.equal(2);
      const operations = collections.ProlificOperations;
      const ids = await Promise.all(['one', 'two'].map(requestId => operations.insertAsync({ ownerId: 'synthetic-owner', requestId, studyId: 'synthetic-study', status: 'prepared' })));
      const claims = await Promise.allSettled(ids.map(_id => operations.updateAsync({ _id, status: 'prepared' }, { $set: { status: 'sending', activeStudy: 'synthetic-study' } })));
      expect(claims.filter(r => r.status === 'fulfilled').length).to.equal(1);
      expect(await operations.find({ activeStudy: 'synthetic-study' }).countAsync()).to.equal(1);
      const reminders = collections.ProlificReminders;
      const attempts = await Promise.allSettled(['one', 'two'].map(resumeHash => reminders.insertAsync({ participationId: 'synthetic-p', boundary: 'same-lockout', resumeHash })));
      expect(attempts.filter(r => r.status === 'fulfilled').length).to.equal(1);
    } finally {
      // Only these freshly named test collections are removed; application records are never touched.
      for (const collection of Object.values(collections)) await collection.rawCollection().drop();
    }
  });
});
