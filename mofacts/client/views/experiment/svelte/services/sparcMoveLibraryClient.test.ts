import { strict as assert } from 'node:assert';
import { expect } from 'chai';
import type { SparcPrimitiveQuery, SparcPrimitiveTicket } from '../../../../../../learning-components/runtime/sparcMoveLibraryContract';
import { Meteor } from 'meteor/meteor';
import { createSparcMoveLibraryClient, readSparcAdministrativeRemovals } from './sparcMoveLibraryClient';

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
});
