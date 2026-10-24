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
