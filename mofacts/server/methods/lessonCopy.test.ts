import assert from 'node:assert/strict';
import { Roles } from 'meteor/alanning:roles';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { Tdfs } from '../../common/Collections';

describe('lesson copy provider keys', function() {
  it('keeps keys only for the source owner and isolates other authorized copies', async function() {
    const owner = Random.id(), shared = Random.id(), admin = Random.id(), outsider = Random.id();
    const source = Random.id(), lessonName = 'Synthetic lesson ' + source;
    const actors = [owner, shared, admin, outsider];
    const keys = { speechAPIKey: 'synthetic-speech', textToSpeechAPIKey: 'synthetic-tts', openRouterApiKey: 'synthetic-router' };
    const settings = { lessonname: lessonName, userselect: 'true', tags: ['fixture'], ...keys };
    const copy = (Meteor as any).server.method_handlers.copyTdf;
    try {
      for (const id of actors) await Meteor.users.insertAsync({ _id: id, profile: { displayName: 'Synthetic creator' } });
      await Roles.createRoleAsync('admin', { unlessExists: true });
      await Roles.addUsersToRolesAsync(admin, 'admin');
      await Tdfs.insertAsync({ _id: source, ownerId: owner, accessors: [{ userId: shared }],
        content: { fileName: 'fixture.json', tdfs: { tutor: { setspec: settings } } },
        packageFile: 'fixture.zip', packageAssetId: 'fixture-archive' });
      const original = await Tdfs.findOneAsync(source);
      for (const [i, actor] of [owner, shared, admin].entries()) {
        const reply = await copy.call({ userId: actor }, source);
        assert.deepEqual(Object.keys(reply).sort(), ['newName', 'newTdfId']);
        const doc = await Tdfs.findOneAsync(reply.newTdfId);
        assert.equal(doc?.ownerId, actor);
        assert.deepEqual(doc?.accessors, []);
        assert.deepEqual(doc?.content.tdfs.tutor.setspec, {
          lessonname: lessonName + ' (' + (i + 1) + ')', userselect: 'false', tags: ['fixture'],
          ...(actor === owner ? keys : {}),
        });
        assert.equal(doc?.packageAssetId, actor === owner ? 'fixture-archive' : undefined);
        assert.equal(doc?.packageFile, actor === owner ? 'fixture.zip' : undefined);
      }
      await assert.rejects(copy.call({ userId: outsider }, source), { error: 'not-authorized' });
      assert.deepEqual(await Tdfs.findOneAsync(source), original);
    } finally {
      await Roles.removeUsersFromRolesAsync(admin, 'admin');
      await Tdfs.removeAsync({ ownerId: { $in: actors } });
      await Meteor.users.removeAsync({ _id: { $in: actors } });
    }
  });
});
