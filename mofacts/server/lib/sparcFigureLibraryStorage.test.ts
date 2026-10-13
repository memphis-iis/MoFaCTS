import { strict as assert } from 'node:assert';
import { createSparcFigureLibraryStore, SparcFigureLibrary, SparcFigureRequests } from './sparcFigureLibraryStorage';
import { SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../common/lib/sparcPromptImage';

// Run only in the supported isolated Meteor/Mongo test environment, never by the pure runner.
describe('SPARC figure library Mongo contracts', function() {
  afterEach(async function() {
    await SparcFigureLibrary.removeAsync({ _id: /^test-library-/ });
    await SparcFigureRequests.removeAsync({ _id: /^test-library-/ });
  });
  it('serializes overlapping generation work with owner-specific Mongo leases', async function() {
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
      dimensions: 2, situation: 'Synthetic situation', embedding: [1, 0], ready: true, reusable: true, createdAt: new Date() };
    await store.saveEntry(entry);
    await store.saveEntry({ ...entry, _id: 'test-library-excluded', reusable: false });
    const candidates = await store.candidates({ ...entry, afterId: '' });
    assert.ok(candidates.some(candidate => candidate._id === entry._id));
    assert.ok(!candidates.some(candidate => candidate._id === 'test-library-excluded'));
    const decision = { _id: 'test-library-decision', kind: 'decision' as const, userId: 'synthetic-admin',
      tdfId: 'synthetic-lesson', sessionId: 'synthetic-session', assetId: entry._id,
      source: 'semantic' as const, similarity: 1, createdAt: new Date() };
    await store.saveDecision(decision);
    await store.saveDecision({ ...decision, assetId: 'test-library-other' });
    assert.equal((await store.findDecision(decision._id, decision.userId))!.assetId, entry._id);
    assert.equal(await store.findDecision(decision._id, 'other-user'), undefined);
  });
});
