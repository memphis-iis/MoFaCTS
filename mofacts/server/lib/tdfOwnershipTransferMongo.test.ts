import { strict as assert } from 'node:assert';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { Tdfs } from '../../common/Collections';
import { LESSON_PROVIDER_KEY_FIELDS } from '../../common/lessonProviderKeys';

describe('provider keys on family ownership transfer', function() {
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
