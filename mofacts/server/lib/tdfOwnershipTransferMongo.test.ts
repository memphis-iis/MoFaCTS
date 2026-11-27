import { strict as assert } from 'node:assert';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { Tdfs } from '../../common/Collections';
import { LESSON_PROVIDER_KEY_FIELDS } from '../../common/lessonProviderKeys';
import { ProlificStudies } from './prolificCollections';
import { saveProlificStudyBinding, type ProlificStudyBinding } from './prolificStudyBinding';
import { transferTdfOwnership } from './tdfOwnershipTransferMongo';

describe('provider keys on family ownership transfer', function() {
  for (const order of ['binding first', 'transfer first', 'concurrent'] as const) {
    it(`keeps the Prolific binding and lesson owner consistent when ${order}`, async function() {
      const owner = Random.id(), recipient = Random.id(), rootTdfId = Random.id(), childId = Random.id();
      const binding: ProlificStudyBinding = { ownerId: owner, rootTdfId, studyId: Random.hexString(24),
        accountId: Random.id(), workspaceId: Random.id(), projectId: Random.id(), currency: 'USD',
        reminderText: '', updatedAt: new Date() };
      const key = LESSON_PROVIDER_KEY_FIELDS[0]!;
      const root = { _id: rootTdfId, ownerId: owner, tdfAvailability: 'available', tdfRevision: 1, packageAssetId: 'synthetic-archive',
        content: { fileName: `${rootTdfId}.json`, tdfs: { tutor: { setspec: {
          condition: [`${childId}.json`], conditionTdfIds: [childId], experimentTarget: binding.studyId,
          prolificCompletionUrl: 'https://app.prolific.com/submissions/complete?cc=TEST123', [key]: 'synthetic-key',
        } } } } };
      const child = { _id: childId, ownerId: owner, tdfAvailability: 'available', tdfRevision: 1,
        content: { fileName: `${childId}.json`, tdfs: { tutor: { setspec: {}, unit: [{}] } } } };
      try {
        await Meteor.users.insertAsync({ _id: recipient });
        await Tdfs.insertAsync(root);
        await Tdfs.insertAsync(child);
        const bind = () => saveProlificStudyBinding(binding, 1);
        const transfer = () => transferTdfOwnership(childId, owner, recipient);
        if (order === 'binding first') {
          await bind();
          await assert.rejects(transfer, { error: 'prolific-study-bound' });
          await bind();
        } else if (order === 'transfer first') {
          await transfer();
          await assert.rejects(bind, /prolific.accessDenied/);
        } else {
          const results = await Promise.allSettled([bind(), transfer()]);
          assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
        }
        const saved = await ProlificStudies.findOneAsync({ rootTdfId });
        const savedRoot = await Tdfs.findOneAsync(rootTdfId);
        const savedChild = await Tdfs.findOneAsync(childId);
        assert.equal(savedRoot?.ownerId, saved ? owner : recipient);
        assert.equal(savedChild?.ownerId, savedRoot?.ownerId);
        if (saved) {
          assert.equal(saved.ownerId, savedRoot?.ownerId);
          assert.equal(savedRoot?.tdfRevision, 2);
          assert.equal(savedChild?.tdfRevision, 1);
          assert.equal(savedRoot?.packageAssetId, 'synthetic-archive');
          assert.equal(savedRoot?.content.tdfs.tutor.setspec[key], 'synthetic-key');
        }
      } finally {
        await ProlificStudies.removeAsync({ rootTdfId });
        await Tdfs.removeAsync({ _id: { $in: [rootTdfId, childId] } });
        await Meteor.users.removeAsync({ _id: recipient });
      }
    });
  }

  it('clears credentials and archive links across the family only on a change of owner', async function() {
    const owner = Random.id();
    const recipient = Random.id();
    const root = Random.id();
    const children = [Random.id(), Random.id()];
    const ids = [root, ...children];
    const keys = Object.fromEntries(LESSON_PROVIDER_KEY_FIELDS.map(field => [field, 'synthetic-' + field]));
    const transfer = (Meteor as any).server.method_handlers.transferDataOwnership;
    try {
      await Meteor.users.insertAsync({ _id: recipient });
      for (const id of ids) {
        const setspec = id === root
          ? { ...keys, condition: children.map(child => child + '.json'), conditionTdfIds: children }
          : { ...keys };
        await Tdfs.insertAsync({ _id: id, ownerId: owner, tdfRevision: 2,
          content: { fileName: id + '.json', tdfs: { tutor: { setspec, ...(id === root ? {} : { unit: [{}] }) } } },
          packageAssetId: 'synthetic-archive', packageFile: 'synthetic.zip' });
      }
      await assert.rejects(transfer.call({ userId: recipient }, root, recipient), { error: 403 });
      await Meteor.users.insertAsync({ _id: owner });
      await transfer.call({ userId: owner }, root, owner);
      for (const id of ids) {
        const row = await Tdfs.findOneAsync(id);
        for (const field of LESSON_PROVIDER_KEY_FIELDS) assert.equal(row?.content.tdfs.tutor.setspec[field], keys[field]);
        assert.equal(row?.packageAssetId, 'synthetic-archive');
      }
      await transfer.call({ userId: owner }, children[0], recipient);
      for (const id of ids) {
        const row = await Tdfs.findOneAsync(id);
        assert.equal(row?.ownerId, recipient);
        assert.equal(row.tdfRevision, 4);
        for (const field of LESSON_PROVIDER_KEY_FIELDS) assert.equal(field in row.content.tdfs.tutor.setspec, false);
        assert.equal('packageAssetId' in row, false);
        assert.equal('packageFile' in row, false);
      }
    } finally {
      await Tdfs.removeAsync({ _id: { $in: ids } });
      await Meteor.users.removeAsync({ _id: { $in: [owner, recipient] } });
    }
  });
});
