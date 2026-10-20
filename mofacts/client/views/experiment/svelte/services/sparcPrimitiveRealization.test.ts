import { strict as assert } from 'node:assert';
import { realizeSparcPrimitive } from './sparcPrimitiveRealization';
import type { SparcUtteranceRequest } from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import type { SparcMoveLibraryClient, SparcPrimitiveReference } from '../../../../../../learning-components/units/sparcsession/sparcMoveLibrary';

const request = { selectedAction: { snapshotId: 'event' }, targetId: 'species', action: 'explain', targetContent: ['Isolation'],
  moveDefinition: { assistance: 1.55, responseFormat: 'text' }, dialogueHistory: [], learnerText: 'No gene flow.' } as unknown as SparcUtteranceRequest;
const ref: SparcPrimitiveReference = { entryId: 'entry', version: 'sparc-moves-v1', source: 'retrieved', similarity: .99 };

describe('Primitive retrieval or generation boundary', () => {
  it('makes no instructional generation call on a hit and journals before presentation', async () => {
    const calls: string[] = [];
    const library: SparcMoveLibraryClient = {
      lookup: async q => { assert.equal(q.context.target, 'species'); assert.equal(q.queryText.includes('No gene flow.'), false);
        assert.deepEqual(Object.keys(JSON.parse(q.queryText)), ['target', 'assistance', 'evidence']); calls.push('lookup'); return { status: 'hit', content: { text: 'Saved explanation.' }, reference: ref }; },
      publish: async () => { throw new Error('Unexpected publish'); },
      present: async (_q, _r, id) => { assert.equal(id, 'event:explanation'); calls.push('present'); },
    };
    const content = await realizeSparcPrimitive({ request, kind: 'explanation', dependencies: null, tdfId: 'lesson', sessionId: 'attempt', library,
      generate: async () => { throw new Error('Unexpected generation'); }, persist: async () => { calls.push('journal'); } });
    assert.equal(content.text, 'Saved explanation.'); assert.deepEqual(calls, ['lookup', 'journal', 'present']);
  });
  it('persists the accepted content from a concurrent generation, not a losing draft', async () => {
    const library: SparcMoveLibraryClient = {
      lookup: async () => ({ status: 'generate', ticket: 'ticket', previousQuestions: [] }),
      publish: async () => ({ accepted: true, content: { text: 'Already accepted.' }, reference: ref }), present: async () => {},
    };
    await realizeSparcPrimitive({ request, kind: 'explanation', dependencies: null, tdfId: 'lesson', sessionId: 'attempt', library,
      generate: async () => ({ text: 'Concurrent draft.' }), persist: async content => { assert.equal(content.text, 'Already accepted.'); } });
  });
  it('generates a question once with earlier questions and journals before presentation', async () => {
    const calls: string[] = [];
    const generated = { text: 'Which barrier keeps these birds apart?' };
    const library: SparcMoveLibraryClient = {
      lookup: async () => ({ status: 'generate', ticket: 'ticket', previousQuestions: [{ text: 'What separates these populations?' }] }),
      publish: async (_ticket, content) => { assert.deepEqual(content, generated); calls.push('publish'); return { accepted: true, content, reference: ref }; },
      present: async () => { calls.push('present'); },
    };
    const content = await realizeSparcPrimitive({ request, kind: 'question', dependencies: null, tdfId: 'lesson', sessionId: 'attempt', library,
      generate: async prior => { assert.deepEqual(prior, [{ text: 'What separates these populations?' }]); calls.push('generate'); return generated; },
      persist: async () => { calls.push('journal'); } });
    assert.deepEqual(content, generated);
    assert.deepEqual(calls, ['generate', 'publish', 'journal', 'present']);
  });
  it('generates once with earlier questions and reports a publication rejection without retrying', async () => {
    let attempts = 0;
    const library: SparcMoveLibraryClient = {
      lookup: async () => ({ status: 'generate', ticket: 'ticket', previousQuestions: [{ text: 'Already asked?' }] }),
      publish: async () => ({ accepted: false, reason: 'This content was administratively removed. Generate different content.' }), present: async () => { throw new Error('Unexpected presentation'); },
    };
    await assert.rejects(realizeSparcPrimitive({ request, kind: 'question', dependencies: null, tdfId: 'lesson', sessionId: 'attempt', library,
      generate: async prior => { assert.deepEqual(prior, [{ text: 'Already asked?' }]); attempts++; return { text: 'Paraphrase?' }; },
      persist: async () => { throw new Error('Unexpected journal'); } }), /administratively removed/);
    assert.equal(attempts, 1);
  });
  it('does not acknowledge a failed journal write', async () => {
    const library: SparcMoveLibraryClient = { lookup: async () => ({ status: 'hit', content: { text: 'Accepted' }, reference: ref }),
      publish: async () => { throw new Error('Unexpected publish'); }, present: async () => { throw new Error('Unexpected acknowledgement'); } };
    await assert.rejects(realizeSparcPrimitive({ request, kind: 'explanation', dependencies: null, tdfId: 'lesson', sessionId: 'attempt', library,
      generate: async () => { throw new Error('Unexpected generation'); }, persist: async () => { throw new Error('Interrupted journal'); } }), /Interrupted journal/);
  });
});
