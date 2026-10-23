import { strict as assert } from 'node:assert';
import { createSparcFigureLibraryStore, SparcFigureLibrary, SparcFigureRequests } from './sparcFigureLibraryStorage';
import { SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../common/lib/sparcPromptImage';
import { SPARC_INSTRUCTIONAL_NEED_VERSION } from '../../../learning-components/runtime/sparcInstructionalNeed';

// Run only in the supported isolated Meteor/Mongo test environment, never by the pure runner.
describe('SPARC figure library Mongo contracts', function() {
  afterEach(async function() {
    await SparcFigureLibrary.removeAsync({ _id: /^test-library-/ });
    await SparcFigureRequests.removeAsync({ _id: /^test-library-/ });
  });
  it('serializes administrative maintenance with owner-specific Mongo leases', async function() {
    const store = createSparcFigureLibraryStore(); let active = 0; let maximum = 0;
    const work = () => store.withLock(async () => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 20)); active--;
    });
    await Promise.all([work(), work()]);
    assert.equal(maximum, 1);
    assert.equal(await SparcFigureRequests.findOneAsync(`lease:${SPARC_FIGURE_LIBRARY_SETTINGS.version}`), undefined);
  });
  it('filters reusable ready vectors and retains the first durable decision atomically', async function() {
    const store = createSparcFigureLibraryStore();
    const entry = { _id: 'test-library-ready', version: SPARC_FIGURE_LIBRARY_SETTINGS.version,
      imageModel: SPARC_PROMPT_IMAGE_SETTINGS.model, embeddingModel: SPARC_FIGURE_LIBRARY_SETTINGS.embeddingModel,
      dimensions: 2, situation: 'Synthetic situation', embedding: [1, 0], embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION, ready: true, createdAt: new Date() };
    await store.saveEntry(entry);
    await store.saveEntry({ ...entry, _id: 'test-library-pending', ready: false });
    assert.ok(await store.findVisual(entry._id, 'en'));
    assert.equal(await store.findVisual('test-library-pending', 'en'), undefined);
    const decision = { _id: 'test-library-decision', kind: 'decision' as const, userId: 'synthetic-admin',
      tdfId: 'synthetic-lesson', sessionId: 'synthetic-session', assetId: entry._id,
      source: 'semantic' as const, similarity: 1, createdAt: new Date() };
    await store.saveDecision(decision);
    await store.saveDecision({ ...decision, assetId: 'test-library-other' });
    assert.equal((await store.findDecision(decision._id, decision.userId))!.assetId, entry._id);
    assert.equal(await store.findDecision(decision._id, 'other-user'), undefined);
  });
  it('inspects completed entries across versions without vectors or situation records', async function() {
    const store = createSparcFigureLibraryStore();
    const entry = { _id: 'test-library-inspect-a', version: 'earlier-version', imageModel: 'synthetic-model',
      embeddingModel: 'synthetic-embedding', dimensions: 2, situation: 'Private situation', embedding: [1, 0],
      ready: true, createdAt: new Date() };
    await store.saveEntry(entry);
    await store.saveEntry({ ...entry, _id: 'test-library-inspect-b', version: SPARC_FIGURE_LIBRARY_SETTINGS.version });
    await store.saveEntry({ ...entry, _id: 'test-library-inspect-c', ready: false });
    const page = await store.inspectPage('test-library-inspect-');
    assert.deepEqual(page.map(record => record._id), ['test-library-inspect-a', 'test-library-inspect-b']);
    assert.deepEqual(Object.keys(page[0]!).sort(), ['_id', 'createdAt', 'imageModel', 'version']);
    assert.deepEqual(await store.findEntry(entry._id), { ...entry, kind: 'image' });
    assert.deepEqual((await store.inspectPage(entry._id)).map(record => record._id), ['test-library-inspect-b']);
  });
});
