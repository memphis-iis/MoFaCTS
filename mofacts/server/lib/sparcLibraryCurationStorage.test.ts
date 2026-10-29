import { strict as assert } from 'node:assert';
import { MongoInternals } from 'meteor/mongo';
import { createSparcLibraryCuration, SparcInstructionalRemovals } from './sparcLibraryCurationStorage';
import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import { collectionMongoName } from '../../common/collectionOwnership';

// Supported Meteor/Mongo integration environment only; never run against the live app database.
describe('Instructional library curation Mongo contract', () => {
  const db = () => MongoInternals.defaultRemoteCollectionDriver().mongo.db;
  const library = () => db().collection<{ _id: string; [key: string]: unknown }>(collectionMongoName('SparcInstructionalLibrary'));
  afterEach(async () => {
    await SparcInstructionalLibrary.removeAsync({ _id: /^curationTest/ });
    await SparcInstructionalRemovals.removeAsync({ _id: /^curationTest/ });
    await db().collection('sparc_figure_versions').deleteMany({ _id: /^curationTest/ });
    await db().collection(collectionMongoName('SparcMoveManifests')).deleteMany({ _id: /^curationTest/ });
    for (const name of ['SparcFigureRequests', 'SparcMoveRequests', 'Histories', 'GlobalExperimentStates'] as const) {
      await db().collection(collectionMongoName(name)).deleteMany({ _id: /^curationTest/ });
    }
  });
  it('removes an image and dependent content before its media while retaining decisions and learning records', async () => {
    const assetId = 'curationTestBulkImage';
    const dependentId = 'curationTestBulkInstruction';
    await library().insertMany([
      { _id: assetId, kind: 'image', ready: true },
      { _id: dependentId, kind: 'instruction', content: { support: { figure: { assetId } } } },
      { _id: 'curationTestUnrelatedText', kind: 'instruction', content: { text: 'Unrelated instruction' } },
      { _id: 'curationTestUnrelatedVideo', kind: 'video', content: { video: { segmentId: 'unrelated-video' } } },
    ]);
    const retained = [
      { name: 'SparcFigureRequests' as const, row: { _id: 'curationTestFigureDecision', kind: 'decision', assetId, userId: 'synthetic-user' } },
      { name: 'SparcMoveRequests' as const, row: { _id: 'curationTestMoveDecision', entryId: dependentId, userId: 'synthetic-user' } },
      { name: 'Histories' as const, row: { _id: 'curationTestHistory', userId: 'synthetic-user', primitiveReference: { entryId: dependentId } } },
      { name: 'GlobalExperimentStates' as const, row: { _id: 'curationTestModel', userId: 'synthetic-user', modelState: { score: 0.5 } } },
    ];
    for (const { name, row } of retained) await db().collection<{ _id: string; [key: string]: unknown }>(collectionMongoName(name)).insertOne(row);
    const removedAssets: string[] = [];
    const owner = createSparcLibraryCuration(async id => {
      assert.ok(await SparcInstructionalRemovals.findOneAsync(assetId));
      assert.ok(await SparcInstructionalRemovals.findOneAsync(dependentId));
      assert.equal(await library().findOne({ _id: assetId }), null);
      assert.equal(await library().findOne({ _id: dependentId }), null);
      removedAssets.push(id);
    });

    await owner.removeImageAsset(assetId);

    assert.deepEqual(removedAssets, [assetId]);
    assert.deepEqual(Object.keys((await SparcInstructionalRemovals.findOneAsync(assetId))!).sort(), ['_id', 'removedAt']);
    assert.equal(await library().countDocuments({ _id: { $in: ['curationTestUnrelatedText', 'curationTestUnrelatedVideo'] } }), 2);
    for (const { name, row } of retained) assert.deepEqual(await db().collection(collectionMongoName(name)).findOne({ _id: row._id }), row);
  });
  it('journals an uncatalogued image before media removal and resumes interrupted cleanup', async () => {
    const assetId = 'curationTestUncataloguedImage';
    let fail = true;
    let attempts = 0;
    const owner = createSparcLibraryCuration(async id => {
      assert.equal(id, assetId);
      assert.ok(await SparcInstructionalRemovals.findOneAsync(id));
      attempts++;
      if (fail) throw new Error('Synthetic storage failure');
    });

    await assert.rejects(owner.removeImageAsset(assetId), /Synthetic storage failure/);
    const pending = await SparcInstructionalRemovals.findOneAsync(assetId);
    assert.equal(pending?.cleanupKind, 'image');
    assert.equal(pending?.removeAsset, true);
    fail = false;
    await owner.removeImageAsset(assetId);
    const receipt = await SparcInstructionalRemovals.findOneAsync(assetId);
    assert.equal(attempts, 2);
    assert.deepEqual(Object.keys(receipt!).sort(), ['_id', 'removedAt']);
    assert.equal(receipt!.removedAt.getTime(), pending!.removedAt.getTime());
  });
  it('rejects image removal when the catalog identity belongs to another content kind', async () => {
    await library().insertOne({ _id: 'curationTestConflictingImage', kind: 'question', content: { text: 'Question' } });
    let removed = false;
    const owner = createSparcLibraryCuration(async () => { removed = true; });
    await assert.rejects(owner.removeImageAsset('curationTestConflictingImage'), /conflicting instructional content kind/);
    assert.equal(removed, false);
    assert.equal(await SparcInstructionalRemovals.findOneAsync('curationTestConflictingImage'), undefined);
    assert.ok(await library().findOne({ _id: 'curationTestConflictingImage' }));
  });
  it('deletes old exclusions and retires old image copies while retaining only the current item', async () => {
    await library().insertMany([
      { _id: 'curationTestExcluded', kind: 'explanation', reusable: false },
      { _id: 'curationTestOriginal', kind: 'image', ready: true, reusable: true, currentAssetId: 'curationTestCurrent', revision: 1 },
      { _id: 'curationTestText', kind: 'question', reusable: true, previousEntryId: 'curationTestExcluded', content: { text: 'Current question' } },
    ]);
    await db().collection<{ _id: string; libraryId: string; revision: number }>('sparc_figure_versions').insertMany([
      { _id: 'curationTestOriginal', libraryId: 'curationTestOriginal', revision: 0 },
      { _id: 'curationTestCurrent', libraryId: 'curationTestOriginal', revision: 1 },
    ]);
    const assets: string[] = [];
    await createSparcLibraryCuration(async id => { assets.push(id); }).migrateExclusions(() => {});
    assert.equal(await library().findOne({ _id: 'curationTestExcluded' }), null);
    assert.deepEqual(await library().findOne({ _id: 'curationTestCurrent' }), { _id: 'curationTestCurrent', kind: 'image', ready: true });
    assert.equal(await db().collection('sparc_figure_versions').countDocuments({ _id: /^curationTest/ }), 0);
    assert.ok(assets.includes('curationTestOriginal')); assert.ok(!assets.includes('curationTestCurrent'));
    assert.deepEqual(await library().findOne({ _id: 'curationTestText' }), { _id: 'curationTestText', kind: 'question', content: { text: 'Current question' } });
  });
  it('deletes dependent support in bounded pages and finishes interrupted asset cleanup on retry', async () => {
    await library().insertMany([{ _id: 'curationTestImage', kind: 'image', ready: true },
      { _id: 'curationTestPair', kind: 'instruction', content: { text: 'Matched explanation', support: { text: 'Description', figure: { assetId: 'curationTestImage' } } } },
      ...Array.from({ length: 105 }, (_, i) => ({ _id: `curationTestSupport${i}`, kind: 'richContent', content: { figure: { assetId: 'curationTestImage' } } })),
    ]);
    let fail = true;
    const owner = createSparcLibraryCuration(async () => { if (fail) throw new Error('Synthetic storage failure'); });
    await assert.rejects(owner.remove('curationTestImage'), /Synthetic storage failure/);
    assert.equal(await library().countDocuments({ _id: /^curationTest/ }), 0);
    assert.equal((await SparcInstructionalRemovals.findOneAsync('curationTestImage'))?.removeAsset, true);
    fail = false;
    await owner.remove('curationTestImage');
    const receipt = await SparcInstructionalRemovals.findOneAsync('curationTestImage');
    assert.deepEqual(Object.keys(receipt!).sort(), ['_id', 'removedAt']);
    assert.equal(await SparcInstructionalRemovals.find({ _id: /^curationTest/ }).countAsync(), 107);
  });
});
