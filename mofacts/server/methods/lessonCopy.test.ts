import assert from 'node:assert/strict';
import { Roles } from 'meteor/alanning:roles';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { LESSON_COPY_VERIFICATION, PACKAGE_DOWNLOAD_VERIFICATION } from '../../common/securityAudit/verificationCatalog';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods';
import { Tdfs } from '../../common/Collections';

describe('lesson copy provider keys', function() {
  it('keeps keys only for the source owner and isolates other authorized copies', async function() {
    const owner = Random.id(), shared = Random.id(), admin = Random.id(), outsider = Random.id();
    const source = Random.id(), lessonName = 'Synthetic lesson ' + source;
    const actors = [owner, shared, admin, outsider];
    const keys = { speechAPIKey: 'synthetic-speech', textToSpeechAPIKey: 'synthetic-tts', openRouterApiKey: 'synthetic-router' };
    const settings = { lessonname: lessonName, userselect: 'true', tags: ['fixture'], ...keys };
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw Error(observed.reason);
    for (const verification of [LESSON_COPY_VERIFICATION, PACKAGE_DOWNLOAD_VERIFICATION]) {
      assert.equal(observed.surfaces.find(row => row.name === verification.method)?.verification, verification);
    }
    const handlers = (Meteor as any).server.method_handlers;
    const copy = handlers.copyTdf;
    let ownerCopyId = '';
    try {
      for (const id of actors) await Meteor.users.insertAsync({ _id: id, profile: { displayName: 'Synthetic creator' } });
      await Roles.createRoleAsync('admin', { unlessExists: true });
      await Roles.addUsersToRolesAsync(admin, 'admin');
      await Tdfs.insertAsync({ _id: source, ownerId: owner, accessors: [{ userId: shared }],
        content: { fileName: 'fixture.json', tdfs: { tutor: { setspec: settings, unit: [{}] } } },
        rawStimuliFile: { setspec: { clusters: [] } },
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
        assert.equal(doc?.packageAssetId, undefined);
        assert.equal(doc?.packageFile, undefined);
        if (actor === owner) ownerCopyId = reply.newTdfId;
      }
      await assert.rejects(handlers.getPackageDownloadLink.call({ userId: outsider }, ownerCopyId), { error: 404 });
      const result = await handlers.getPackageDownloadLink.call({ userId: owner }, ownerCopyId);
      const archivedCopy = await Tdfs.findOneAsync(ownerCopyId);
      assert.ok(result.link);
      assert.ok(archivedCopy?.packageAssetId);
      assert.notEqual(archivedCopy.packageAssetId, 'fixture-archive');
      assert.deepEqual(await handlers.deletePackageFile.call({ userId: owner }, archivedCopy.packageAssetId, { wholeFamily: true }),
        { deletedCount: 1 });
      await assert.rejects(copy.call({ userId: outsider }, source), { error: 'not-authorized' });
      assert.deepEqual(await Tdfs.findOneAsync(source), original);
    } finally {
      await Roles.removeUsersFromRolesAsync(admin, 'admin');
      await Tdfs.removeAsync({ ownerId: { $in: actors } });
      await Meteor.users.removeAsync({ _id: { $in: actors } });
    }
  });

  it('keeps a copied condition family and its shared media when the original package is deleted', async function() {
    const owner = Random.id(), outsider = Random.id(), archive = Random.id();
    const root = Random.id(), child = Random.id(), media = Random.id(), scope = Random.id();
    const assets = (globalThis as any).DynamicAssets.collection;
    const handlers = (Meteor as any).server.method_handlers;
    const actor = { userId: owner };
    try {
      await Meteor.users.insertAsync({ _id: owner, profile: { displayName: 'Synthetic creator' } });
      await assets.insertAsync({ _id: archive, name: 'fixture.zip', ext: 'zip', userId: owner, versions: {} });
      await assets.insertAsync({ _id: media, name: 'shared.png', userId: owner, versions: {},
        meta: { uploadPurpose: 'content-media', tdfId: child, stimuliSetId: scope } });
      await Tdfs.insertAsync({ _id: child, ownerId: owner, packageAssetId: archive, stimuliSetId: scope,
        content: { fileName: 'condition.json', tdfs: { tutor: { setspec: { lessonname: 'Condition' }, unit: [{}] } } },
        stimuli: [{ imageStimulus: '/dynamic-assets/' + media }],
      });
      await Tdfs.insertAsync({ _id: root, ownerId: owner, packageAssetId: archive, conditionCounts: [9],
        content: { fileName: 'root.json', tdfs: { tutor: { setspec: {
          lessonname: 'Study ' + root, condition: ['condition.json'], conditionTdfIds: [child], experimentTarget: 'study-' + root,
        } } } },
      });

      await Tdfs.updateAsync(child, { $set: { 'content.fileName': 'mismatched.json' } });
      await assert.rejects(handlers.copyTdf.call(actor, root), { error: 'tdf-identity-repair-required' });
      assert.equal(await Tdfs.find({ ownerId: owner }).countAsync(), 2);
      await Tdfs.updateAsync(child, { $set: { 'content.fileName': 'condition.json' } });

      const { newTdfId } = await handlers.copyTdf.call(actor, root);
      const copiedRoot = await Tdfs.findOneAsync(newTdfId);
      const copiedSettings = copiedRoot?.content.tdfs.tutor.setspec;
      const copiedChildId = copiedSettings.conditionTdfIds[0];
      assert.notEqual(copiedChildId, child);
      assert.equal(copiedSettings.experimentTarget, undefined);
      assert.deepEqual(copiedRoot?.conditionCounts, [0]);
      await assert.rejects(handlers.deletePackageFile.call(actor, root, { wholeFamily: true, unpackagedLesson: true }),
        { error: 404 });
      await assert.rejects(handlers.deletePackageFile.call({ userId: outsider }, newTdfId, { wholeFamily: true, unpackagedLesson: true }),
        { error: 403 });

      assert.deepEqual(await handlers.deletePackageFile.call(actor, archive, { wholeFamily: true }), { deletedCount: 2 });
      assert.equal(await Tdfs.findOneAsync(root), undefined);
      assert.equal(await Tdfs.findOneAsync(child), undefined);
      assert.deepEqual(await Tdfs.findOneAsync(newTdfId), copiedRoot);
      const copiedChild = await Tdfs.findOneAsync(copiedChildId);
      assert.equal(copiedChild?.packageAssetId, undefined);
      assert.equal(copiedChild?.stimuli[0].imageStimulus, '/dynamic-assets/' + media);
      assert.ok(await assets.findOneAsync(media));

      assert.deepEqual(await handlers.deletePackageFile.call(actor, newTdfId, { wholeFamily: true, unpackagedLesson: true }), { deletedCount: 2 });
      assert.equal(await Tdfs.findOneAsync(newTdfId), undefined);
      assert.equal(await Tdfs.findOneAsync(copiedChildId), undefined);
    } finally {
      await Tdfs.removeAsync({ ownerId: owner });
      await assets.removeAsync({ _id: { $in: [archive, media] } });
      await Meteor.users.removeAsync(owner);
    }
  });
});
