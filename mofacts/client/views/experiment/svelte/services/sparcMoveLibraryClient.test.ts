import { strict as assert } from 'node:assert';
import { expect } from 'chai';
import type { SparcPrimitiveQuery, SparcPrimitiveTicket } from '../../../../../../learning-components/runtime/sparcMoveLibraryContract';
import { Meteor } from 'meteor/meteor';
import { createSparcMoveLibraryClient, readSparcAdministrativeRemovals } from './sparcMoveLibraryClient';
import { SparcEmbeddingIndex } from '../../../../../../learning-components/runtime/sparcEmbeddingIndex';
import type { SparcUtteranceRequest } from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import { realizeSparcPrimitive } from './sparcPrimitiveRealization';

describe('Content-removal lookup diagnostics', () => {
  it('returns successful removal reads without reporting a failure', async () => {
    const original = Meteor.callAsync;
    Meteor.callAsync = (async (name: string, ids: string[]) => {
      assert.equal(name, 'getSparcAdministrativeRemovals');
      assert.deepEqual(ids, ['removed']);
      return ['removed'];
    }) as typeof Meteor.callAsync;
    try { assert.deepEqual(await readSparcAdministrativeRemovals(['removed'], 'lesson'), ['removed']); }
    finally { Meteor.callAsync = original; }
  });

  it('persists the bounded redacted cause and preserves the original rejection even if reporting fails', async () => {
    const original = Meteor.callAsync;
    for (const reportingFails of [false, true]) {
      const connection = new URL('mongodb://host/db');
      connection.username = 'synthetic-user';
      connection.password = 'synthetic-password';
      const error = Object.assign(new Error(`Database unavailable ${connection} Bearer private-token token=secret-value`), { error: 503 });
      const reports: unknown[] = [];
      Meteor.callAsync = (async (name: string, payload: unknown) => {
        if (name === 'getSparcAdministrativeRemovals') throw error;
        assert.equal(name, 'reportRecoverableWarning');
        reports.push(payload);
        if (reportingFails) throw new Error('Diagnostic store unavailable');
        return true;
      }) as typeof Meteor.callAsync;
      try {
        await assert.rejects(readSparcAdministrativeRemovals(['component'], 'lesson'), actual => actual === error);
        assert.deepEqual(reports, [{ code: 'sparc.contentRemovalCheckFailed', tdfId: 'lesson', referenceCount: 1,
          error: { name: 'Error', code: '503', message: 'Database unavailable [redacted connection string] Bearer [redacted] token=[redacted]' } }]);
        assert.ok(!JSON.stringify(reports).includes('private-token'));
        assert.ok(!JSON.stringify(reports).includes(connection.password));
      } finally { Meteor.callAsync = original; }
    }
  });
});


describe('Instruction publication embedding ownership', () => {
  it('rebuilds a resumed query embedding and reuses its browser cache for retries', async () => {
    const originalCall = Meteor.callAsync;
    const originalUser = Meteor.userId;
    const content = { text: 'A saved matched explanation.' };
    const query = { tdfId: 'embedding-ownership-lesson', queryText: 'A saved instructional need.',
      context: { kind: 'instruction', supportKind: 'visual' } } as SparcPrimitiveQuery;
    let embeddings = 0;
    let publications = 0;
    Meteor.userId = () => 'embedding-ownership-user';
    Meteor.callAsync = (async (method: string, payload: SparcPrimitiveTicket & { input: string[] }, saved: unknown) => {
      if (method === 'callResolvedOpenRouterEmbeddings') {
        embeddings++;
        expect(payload.input).to.deep.equal([query.queryText]);
        return { embeddings: [[3, 4]] };
      }
      expect(method).to.equal('publishSparcPrimitive');
      expect(payload).to.deep.equal({ query, embedding: [0.6, 0.8] });
      expect(saved).to.deep.equal(content);
      publications++;
      return { accepted: true, content };
    }) as typeof Meteor.callAsync;
    try {
      const client = createSparcMoveLibraryClient(async () => { throw new Error('Resume must not repeat retrieval'); });
      const checkpointTicket = JSON.parse(JSON.stringify({ query }));
      await client.publish(checkpointTicket, content);
      await client.publish(checkpointTicket, content);
      expect(embeddings).to.equal(1);
      expect(publications).to.equal(2);
      expect(checkpointTicket).not.to.have.property('embedding');
    } finally { Meteor.callAsync = originalCall; Meteor.userId = originalUser; }
  });

  it('restores an accepted event removed from the eligible index after an interrupted history write without generating again', async () => {
    const originalCall = Meteor.callAsync, originalUser = Meteor.userId;
    const calls: string[] = [];
    const content = { text: 'The accepted explanation remains authoritative.' };
    const reference = { entryId: 'already-used-entry', version: 'sparc-moves-v1', source: 'generated' as const, similarity: null };
    Meteor.userId = () => 'lost-history-ack-user';
    Meteor.callAsync = (async (name: string, _payload: unknown, selection: unknown) => {
      calls.push(name);
      if (name === 'callResolvedOpenRouterEmbeddings') return { embeddings: [[1, 0]] };
      assert.equal(name, 'lookupSparcPrimitive'); assert.equal(selection, null);
      return { status: 'hit', content, reference };
    }) as typeof Meteor.callAsync;
    try {
      const request = { selectedAction: { snapshotId: 'accepted-event' }, targetId: 'species', action: 'explain',
        contentTexts: ['Isolation'], targetContent: ['Isolation'], dialogueHistory: [], learnerText: '',
        moveDefinition: { assistance: 1.55, responseFormat: 'text' } } as unknown as SparcUtteranceRequest;
      const library = createSparcMoveLibraryClient(async () => new SparcEmbeddingIndex());
      let generated = 0;
      const params = { request, kind: 'explanation' as const, dependencies: null, tdfId: 'lost-history-ack-lesson', sessionId: 'attempt', library,
        generate: async () => { generated++; throw new Error('Accepted content must not be generated again'); } };
      await assert.rejects(realizeSparcPrimitive({ ...params, persist: async () => { throw new Error('Interrupted journal'); } }), /Interrupted journal/);
      let restored: unknown;
      await realizeSparcPrimitive({ ...params, persist: async (saved, savedReference) => { restored = { content: saved, reference: savedReference }; } });
      assert.equal(generated, 0);
      assert.deepEqual(restored, { content, reference });
      assert.deepEqual(calls, ['callResolvedOpenRouterEmbeddings', 'lookupSparcPrimitive', 'lookupSparcPrimitive']);
    } finally { Meteor.callAsync = originalCall; Meteor.userId = originalUser; }
  });

  it('checks a visual primitive accepted event before composing a new brief without embedding or searching twice', async () => {
    const originalCall = Meteor.callAsync;
    const accepted = { status: 'hit', content: { text: 'Saved figure support.' }, reference: { entryId: 'visual-entry' } };
    let lookedUp = 0;
    Meteor.callAsync = (async (name: string, _query: unknown, selection: unknown, embedding: unknown) => {
      assert.equal(name, 'lookupSparcPrimitive'); assert.equal(selection, null); assert.deepEqual(embedding, []);
      lookedUp++; return accepted;
    }) as typeof Meteor.callAsync;
    try {
      const client = createSparcMoveLibraryClient(async () => { throw new Error('The visual resource search follows the brief, not primitive resume'); });
      const result = await client.lookup({ context: { kind: 'richContent', supportKind: 'visual' } } as SparcPrimitiveQuery);
      assert.deepEqual(result, accepted); assert.equal(lookedUp, 1);
    } finally { Meteor.callAsync = originalCall; }
  });
});
