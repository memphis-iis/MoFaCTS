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
    userCanManageTdf: async () => authorized,
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
