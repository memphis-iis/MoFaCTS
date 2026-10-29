import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { createSparcFigureLibraryStore, SparcFigureLibrary, SparcFigureRequests } from './sparcFigureLibraryStorage';
import { createSparcMoveStore, SparcMoveLibrary, SparcMoveRequests } from './sparcMoveLibraryStorage';
import { createMoveLibraryService, moveDigest } from './sparcMoveLibraryService';
import { HistoryCommitState, historyCommitStorage } from './historyCommitMongo';
import { Histories } from '../../common/Collections';
import { sparcHistoryWriteId } from './sparcHistoryWrite';
import { SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../common/lib/sparcPromptImage';
import { SPARC_INSTRUCTIONAL_NEED_VERSION, sparcInstructionalNeedText } from '../../../learning-components/runtime/sparcInstructionalNeed';
import { SPARC_MOVE_LIBRARY_VERSION, type SparcPrimitiveQuery } from '../../../learning-components/runtime/sparcMoveLibraryContract';
import { createSparcStateTransitionHistoryRecord } from '../../../learning-components/units/sparcsession/sparcStateTransitionHistory';
import { SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY } from '../../../learning-components/trial-displays/sparc/sparcProgressiveNodes';

// Run only in the supported isolated Meteor/Mongo test environment, never by the pure runner.
describe('SPARC figure library Mongo contracts', function() {
  this.timeout(15000);
  afterEach(async function() {
    await SparcFigureLibrary.removeAsync({ _id: /^test-library-/ });
    await SparcMoveLibrary.removeAsync({ 'context.specification': 'test-library-atomic' });
    await SparcFigureRequests.removeAsync({ $or: [{ _id: /^test-library-/ }, { userId: /^test-library-user-/ }] });
    await SparcMoveRequests.removeAsync({ userId: /^test-library-user-/ });
    await Histories.removeAsync({ $or: [{ _id: /^test-library-/ }, { userId: /^test-library-user-/ }] });
    await HistoryCommitState.removeAsync({ _id: /^test-library-user-/ });
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
    const decision = { _id: 'test-library-decision', kind: 'decision' as const, userId: 'test-library-user-base',
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
    assert.deepEqual(await store.findEntry(entry._id), { ...entry, kind: 'image',
      contentUseKeys: [`entry:${entry._id}`, `image:${entry._id}`].sort() });
    assert.deepEqual((await store.inspectPage(entry._id)).map(record => record._id), ['test-library-inspect-b']);
  });

  function instructionQuery(eventId: string): SparcPrimitiveQuery {
    return { tdfId: 'test-library-lesson', sessionId: 'test-library-session', eventId,
      context: { version: SPARC_MOVE_LIBRARY_VERSION, kind: 'instruction', target: 'synthetic-target',
        move: 'example', assistance: 2.52, responseFormat: 'text', requirements: 'Synthetic meaning',
        components: ['explanation', 'richContent', 'question'], focus: 'Synthetic unresolved evidence',
        dependencies: 'null', specification: 'test-library-atomic', supportKind: 'visual' },
      queryText: sparcInstructionalNeedText({ target: { texts: ['Synthetic meaning'] }, assistance: 2.52, evidence: [] }),
      previousQuestions: [] };
  }

  function visualDecision(userId: string, query: SparcPrimitiveQuery, assetId: string) {
    return { _id: createHash('sha256').update(JSON.stringify([userId, query.tdfId, query.sessionId, query.eventId])).digest('hex'),
      kind: 'decision' as const, userId, tdfId: query.tdfId, sessionId: query.sessionId, assetId,
      source: 'semantic' as const, similarity: 1, createdAt: new Date() };
  }

  function instructionalService() {
    return createMoveLibraryService({ store: createSparcMoveStore(), embeddingModel: 'test-library-embedding',
      // The Mongo contract owns persistence and claims; no provider or media-file IO is needed.
      verifyFigure: async () => undefined });
  }

  const syntheticInstruction = (text: string, assetId: string) => ({ text,
    support: { text: `${text} worked example.`, figure: { assetId, description: 'Synthetic teaching figure' } } });

  it('accepts same-event media composition and resume while rejecting later reuse without changing dashboard checkpoints', async function() {
    const userId = 'test-library-user-continuation';
    const otherUserId = 'test-library-user-other';
    const assetId = 'testLibraryImage';
    const query = instructionQuery('test-library-original-event');
    const store = createSparcFigureLibraryStore();
    const service = instructionalService();
    await store.saveDecision(visualDecision(userId, query, assetId));
    const content = syntheticInstruction('Synthetic first explanation.', assetId);
    const accepted = await service.publish(userId, { query, embedding: [1, 0] }, content);
    assert.deepEqual(accepted.content, content);
    const restored = await service.lookup(userId, query, null, [1, 0]);
    assert.equal(restored.status, 'hit');
    if (restored.status === 'hit') assert.deepEqual(restored.content, accepted.content);
    const beforeFailure = await HistoryCommitState.findOneAsync(userId);
    const next = instructionQuery('test-library-later-event');
    next.tdfId = 'test-library-another-lesson';
    next.sessionId = 'test-library-another-session';
    await assert.rejects(service.publish(userId, { query: next, embedding: [1, 0] },
      syntheticInstruction('Synthetic different explanation.', assetId)), /already been used/);
    const afterFailure = await HistoryCommitState.findOneAsync(userId);
    assert.deepEqual(afterFailure, beforeFailure, 'A rejected claim must roll back its state revision');
    assert.equal(await SparcMoveRequests.find({ userId, entryId: { $exists: true } }).countAsync(), 1);
    assert.equal(await SparcFigureRequests.find({ userId, kind: 'decision' }).countAsync(), 1);
    assert.equal(afterFailure?.sequence, 0);
    assert.equal(afterFailure?.repairRevision, 0);
    assert.ok(Number(afterFailure?.contentUseRevision) > 0);
    const other = await service.publish(otherUserId, { query: next, embedding: [1, 0] }, content);
    assert.deepEqual(other.content, content, 'A different learner remains eligible for this catalog content');
  });

  it('commits only one of concurrent cross-store claims for the same learner and media', async function() {
    const userId = 'test-library-user-race';
    const assetId = 'testLibraryRace';
    const visualQuery = instructionQuery('test-library-visual-event');
    const instruction = instructionQuery('test-library-instruction-event');
    const store = createSparcFigureLibraryStore();
    const service = instructionalService();
    const results = await Promise.allSettled([
      store.saveDecision(visualDecision(userId, visualQuery, assetId)),
      service.publish(userId, { query: instruction, embedding: [1, 0] }, syntheticInstruction('Synthetic racing explanation.', assetId)),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = results.find(result => result.status === 'rejected');
    assert.equal(rejected?.status, 'rejected');
    if (rejected?.status === 'rejected') assert.match(String(rejected.reason?.message), /already been used/);
    const moves = await SparcMoveRequests.find({ userId, entryId: { $exists: true } }).countAsync();
    const visuals = await SparcFigureRequests.find({ userId, kind: 'decision' }).countAsync();
    assert.equal(moves + visuals, 1, 'Concurrent acceptance must not leave two committed uses');
    const checkpoint = await HistoryCommitState.findOneAsync(userId);
    assert.equal(checkpoint?.sequence, 0);
    assert.equal(checkpoint?.repairRevision, 0);
  });

  it('commits uncached tutor presentation use with its history row and rolls back a later exact repetition', async function() {
    const userId = 'test-library-user-presentation';
    const pageKey = 'test-library-page';
    function presentedSummary(eventId: string) {
      const record = createSparcStateTransitionHistoryRecord({
        core: { userId, TDFId: 'test-library-lesson', sessionID: 'test-library-session', levelUnit: 0 },
        transition: {
          transitionId: `${eventId}:summary`,
          event: { eventId, type: 'response-submitted', time: 1710000000000,
            source: { pageKey, nodeId: 'learner-response' }, payload: { input: 'Synthetic learner response.' } },
          writes: [{ target: { pageKey, nodeId: 'root' }, key: SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY, value: {
            type: 'append-node', boxId: 'dialogue-flow', node: { id: `${eventId}:summary`, speaker: 'tutor',
              nodeType: 'atomic', atomType: 'dialogue-utterance', turnEventId: eventId,
              value: 'Synthetic summary generated directly without a library selection.' },
          } }],
        },
      });
      const id = sparcHistoryWriteId(record);
      assert.ok(id);
      return { ...record, userId, _id: id };
    }
    const first = presentedSummary('test-library-first-summary');
    const committed = await historyCommitStorage.insert(userId, [first]);
    assert.equal(committed.length, 1);
    assert.equal(committed[0]?.historySequence, 1);
    assert.ok(await Histories.findOneAsync(first._id));
    assert.equal(await SparcMoveRequests.find({ userId, kind: 'presentation-use' }).countAsync(), 1);
    const baseline = await HistoryCommitState.findOneAsync(userId);
    assert.equal(baseline?.sequence, 1);
    const repeated = presentedSummary('test-library-next-summary');
    await assert.rejects(historyCommitStorage.insert(userId, [repeated]), /already been used/);
    assert.equal(await Histories.findOneAsync(repeated._id), undefined);
    assert.deepEqual(await HistoryCommitState.findOneAsync(userId), baseline,
      'History allocation and content-use revision must both roll back on rejection');
    assert.equal(await SparcMoveRequests.find({ userId, kind: 'presentation-use' }).countAsync(), 1);
    assert.deepEqual(await historyCommitStorage.insert(userId, [first]), [], 'A saved-row retry must remain idempotent');
    assert.deepEqual(await HistoryCommitState.findOneAsync(userId), baseline);
  });

  it('initializes an old accepted primitive from its saved presentation before an exact-event read without a publication', async function() {
    const userId = 'test-library-user-old-read';
    const query = instructionQuery('test-library-old-feedback-event');
    query.context.kind = 'feedback';
    query.context.components = ['feedback'];
    delete query.context.supportKind;
    const entryId = 'test-library-old-feedback';
    const content = { text: 'The original feedback preserved in this synthetic conversation.' };
    const requestId = moveDigest([userId, query.tdfId, query.sessionId, query.eventId, query.context.kind]);
    // Raw inserts reproduce records written before content-use metadata existed.
    await SparcMoveLibrary.rawCollection().insertOne({ _id: entryId, kind: 'feedback',
      version: SPARC_MOVE_LIBRARY_VERSION, context: query.context, content,
      embeddingModel: 'test-library-embedding', embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION,
      embedding: [1, 0], requirements: query.context.requirements, move: query.context.move,
      target: query.context.target, createdAt: new Date(1710000000000) });
    await SparcMoveRequests.rawCollection().insertOne({ _id: requestId, userId, query,
      embedding: [1, 0], embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION,
      entryId, source: 'retrieved', similarity: 1 });
    const pageKey = 'test-library-page';
    const record = createSparcStateTransitionHistoryRecord({
      core: { userId, TDFId: query.tdfId, sessionID: query.sessionId, levelUnit: 0 },
      transition: { transitionId: `${query.eventId}:feedback`,
        event: { eventId: query.eventId, type: 'response-submitted', time: 1710000000000,
          source: { pageKey, nodeId: 'learner-response' }, payload: { input: 'Synthetic learner response.' } },
        writes: [{ target: { pageKey, nodeId: 'root' }, key: SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY, value: {
          type: 'append-node', boxId: 'dialogue-flow', node: { id: `${query.eventId}:feedback`, speaker: 'tutor',
            nodeType: 'atomic', atomType: 'dialogue-utterance', turnEventId: query.eventId, value: content.text,
            primitiveReference: { entryId, version: SPARC_MOVE_LIBRARY_VERSION, source: 'retrieved', similarity: 1 } },
        } }],
      },
    });
    const historyId = sparcHistoryWriteId(record);
    assert.ok(historyId);
    const savedHistory = { ...record, userId, _id: historyId };
    await (Histories.rawCollection() as unknown as { insertOne(value: typeof savedHistory): Promise<unknown> }).insertOne(savedHistory);
    const storedHistoryBeforeLookup = await Histories.findOneAsync(historyId);
    assert.ok(storedHistoryBeforeLookup);
    assert.equal(await HistoryCommitState.findOneAsync(userId), undefined);
    assert.equal((await SparcMoveRequests.findOneAsync(requestId))?.contentUseKeys, undefined);

    const restored = await instructionalService().lookup(userId, query, null, [1, 0]);

    assert.equal(restored.status, 'hit', 'Exact-event restoration must not request fresh generation');
    if (restored.status === 'hit') {
      assert.deepEqual(restored.content, content);
      assert.equal(restored.reference.entryId, entryId);
      assert.equal(restored.reference.source, 'retrieved');
    }
    const normalized = await SparcMoveRequests.findOneAsync(requestId);
    assert.ok(normalized);
    assert.deepEqual(normalized.query, query);
    assert.ok(Array.isArray(normalized.contentUseKeys));
    assert.ok(normalized.contentUseKeys.some((key: string) => key.startsWith('payload:')));
    assert.ok(normalized.contentUseKeys.some((key: string) => key.startsWith('text:')));
    assert.equal(await SparcMoveRequests.find({ userId, kind: { $ne: 'presentation-use' }, entryId: { $exists: true } }).countAsync(), 1);
    assert.equal(await SparcFigureRequests.find({ userId, kind: 'decision' }).countAsync(), 0);
    assert.deepEqual(await Histories.findOneAsync(historyId), storedHistoryBeforeLookup, 'Metadata initialization must preserve the saved conversation');
    const checkpoint = await HistoryCommitState.findOneAsync(userId);
    assert.equal(checkpoint?.contentUseInitialization?.phase, 'complete');
    assert.equal(checkpoint?.sequence, 0, 'Historical restoration must not allocate a new history sequence');
    assert.equal(checkpoint?.repairRevision, 0);
  });
});
