import { strict as assert } from 'node:assert';
import { Meteor } from 'meteor/meteor';
import { readSparcAdministrativeRemovals } from './sparcMoveLibraryClient';

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
