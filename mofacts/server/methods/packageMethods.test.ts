import { prepareEditorProviderKeyChanges } from '../../common/lessonProviderKeys';
import assert from 'node:assert/strict';
import { createPackageMethods } from './packageMethods';

function setup() {
  const doc: any = { _id: 'synthetic-lesson', tdfRevision: 7, stimuliSetId: 'synthetic-set',
    content: { tdfs: { tutor: { setspec: { lessonname: 'Synthetic lesson' }, unit: [{ unitname: 'A' }, { unitname: 'B' }] } } },
    rawStimuliFile: { setspec: { clusters: [{ stims: [{}, {}] }] } } };
  let authorized = true;
  let race = false;
  const writes: any[] = [];
  const methods = createPackageMethods({
    Tdfs: {
      findOneAsync: async () => structuredClone(doc),
      updateAsync: async (selector: any, update: any) => {
        if (race || selector.tdfRevision !== doc.tdfRevision) return 0;
        writes.push(update);
        Object.assign(doc, update.$set);
        doc.tdfRevision++;
        return 1;
      },
    },
    encryptData: () => 'encrypted-fixture',
    userCanManageTdf: async () => authorized,
    userIsInRoleAsync: async () => false,
    canonicalizeStimDisplayMediaRefs: async () => {},
    canonicalizeFlatStimuliMediaRefs: async () => {},
    processAudioFilesForTDF: async () => {},
    updateStimDisplayTypeMap: async () => {},
    serverConsole: () => {},
  } as unknown as Parameters<typeof createPackageMethods>[0]);
  return { doc, writes, methods, deny: () => { authorized = false; }, race: () => { race = true; } };
}

// These exercise the authorized read/review/CAS boundary; package archive and
// upload-plan integrity remain covered by the package workflow integration tests.
describe('editor structural update confirmation', function() {
  it('keeps stored provider keys server-side on owner and shared saves', async function() {
    const h = setup();
    h.doc.ownerId = 'owner';
    const settings = h.doc.content.tdfs.tutor.setspec;
    Object.assign(settings, { speechAPIKey: 'old-synthetic', textToSpeechAPIKey: 'another-synthetic' });
    function save(actor: string, patch: Record<string, unknown>, flags = {}, removed: string[] = []) {
      const content = structuredClone(h.doc.content);
      content.tdfs.tutor.setspec = { lessonname: 'Synthetic lesson', ...patch };
      return h.methods.saveTdfContent.call({ userId: actor }, h.doc._id, content, flags, removed);
    }
    const unchanged = { speechAPIKey: '' };
    assert.deepEqual(prepareEditorProviderKeyChanges(unchanged, ['speechAPIKey'], []), {});
    assert.deepEqual(unchanged, {});
    assert.deepEqual(prepareEditorProviderKeyChanges({}, ['speechAPIKey'], ['setspec.speechAPIKey']), { speechAPIKey: false });
    for (const actor of ['owner', 'shared']) {
      await save(actor, {});
      assert.equal(h.doc.content.tdfs.tutor.setspec.speechAPIKey, 'old-synthetic');
    }
    const before = structuredClone(h.doc);
    await assert.rejects(save('shared', {}, { speechAPIKey: false }), /Only the lesson owner/);
    await assert.rejects(save('shared', { speechAPIKey: 'test' }, { speechAPIKey: true }), /Only the lesson owner/);
    await assert.rejects(save('shared', {}, {}, ['setspec.speechAPIKey']), /Only the lesson owner/);
    await assert.rejects(save('owner', {}, {}, ['setspec']), /retain its settings/);
    await assert.rejects(save('owner', { speechAPIKey: 'bad' }, { speechAPIKey: true, textToSpeechAPIKey: false }), /malformed/);
    assert.deepEqual(h.doc, before);
    const replacement = 'AIza' + 'synthetic'.repeat(4);
    await save('owner', { speechAPIKey: replacement }, { speechAPIKey: true, textToSpeechAPIKey: false });
    assert.equal(h.doc.content.tdfs.tutor.setspec.speechAPIKey, 'encrypted-fixture');
    assert.ok(!Object.hasOwn(h.doc.content.tdfs.tutor.setspec, 'textToSpeechAPIKey'));
  });

  for (const method of ['saveTdfContent', 'saveTdfStimuli'] as const) {
    it(`${method}: rejects invalid orientation modes before saving`, async function() {
      const h = setup();
      h.doc.content.tdfs.tutor.unit[0].sparcsession = { orientationMode: 'HEADINGS' };
      const original = structuredClone(h.doc);
      const args = method === 'saveTdfContent' ? [h.doc._id, h.doc.content, {}, []] : [h.doc._id, h.doc.rawStimuliFile, []];
      await assert.rejects(() => (h.methods[method] as any).call({ userId: 'owner' }, ...args), /orientationMode must be full, headings, or off/);
      assert.deepEqual(h.doc, original);
      assert.equal(h.writes.length, 0);
    });
  }
  it('prevents an authorized non-admin owner from adding or removing demo markers', async function() {
    const h = setup();
    const proposed = structuredClone(h.doc.content);
    proposed.tdfs.tutor.setspec.experimentTarget = 'public-demo-test';
    await assert.rejects(() => h.methods.saveTdfContent.call({ userId: 'owner' }, h.doc._id, proposed), /Only administrators/);
    h.doc.content.tdfs.tutor.setspec.tags = ['public-demo'];
    delete proposed.tdfs.tutor.setspec.experimentTarget;
    await assert.rejects(() => h.methods.saveTdfContent.call({ userId: 'owner' }, h.doc._id, proposed), /Only administrators/);
    await assert.rejects(() => h.methods.saveTdfStimuli.call({ userId: 'owner' }, h.doc._id, h.doc.rawStimuliFile, []), /Only administrators/);
    assert.equal(h.writes.length, 0);
  });
  for (const method of ['saveTdfContent', 'saveTdfStimuli'] as const) {
    it(`${method}: risky review does not write, cancel leaves content intact, owner confirmation writes`, async function() {
      const h = setup();
      const proposed = method === 'saveTdfContent'
        ? { tdfs: { tutor: { setspec: { lessonname: 'Synthetic lesson' }, unit: [{ unitname: 'B' }] } } }
        : { setspec: { clusters: [{ stims: [{}] }] } };
      const args = method === 'saveTdfContent' ? [h.doc._id, proposed, {}, []] : [h.doc._id, proposed, []];
      const save = (...extra: any[]) => (h.methods[method] as any).call({ userId: 'owner' }, ...structuredClone(args), ...extra);
      const original = structuredClone(h.doc);
      const review = await save();
      assert.equal(review.status, 'confirmation-required');
      assert.equal(review.expectedRevision, 7);
      assert.deepEqual(review.structuralWarnings, [method === 'saveTdfContent' ? 'unit-sequence-changed' : 'questions-removed']);
      assert.deepEqual(h.doc, original);
      assert.equal(h.writes.length, 0);
      assert.equal((await save({ expectedRevision: review.expectedRevision, confirmed: true })).success, true);
      assert.equal(h.doc.tdfRevision, 8);
      assert.equal(h.writes.length, 1);
    });
    it(`${method}: stale review and revoked authorization cannot write`, async function() {
      const h = setup();
      const proposed = method === 'saveTdfContent' ? h.doc.content : h.doc.rawStimuliFile;
      const args = method === 'saveTdfContent' ? [h.doc._id, proposed, {}, []] : [h.doc._id, proposed, []];
      const save = () => (h.methods[method] as any).call({ userId: 'owner' }, ...args, { expectedRevision: 6, confirmed: true });
      await assert.rejects(save, /changed after review/);
      h.deny();
      await assert.rejects(save, /permission/);
      assert.equal(h.writes.length, 0);
    });
    it(`${method}: rejects a concurrent change between the authorized read and write`, async function() {
      const h = setup();
      h.race();
      const args = method === 'saveTdfContent' ? [h.doc._id, h.doc.content, {}, []] : [h.doc._id, h.doc.rawStimuliFile, []];
      await assert.rejects(() => (h.methods[method] as any).call({ userId: 'owner' }, ...args), /changed during saving/);
      assert.equal(h.writes.length, 0);
    });
  }
});
