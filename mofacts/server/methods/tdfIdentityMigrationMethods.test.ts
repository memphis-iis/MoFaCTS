import { strict as assert } from 'node:assert';

import { migrateFilenameTdfReferences } from './tdfIdentityMigrationMethods';

function makeDeps(tdfs: any[], logs: any[], turkMessages: any[] = []) {
  const writes: any[] = [];
  const audits: any[] = [];
  return {
    writes,
    audits,
    deps: {
      Tdfs: {
        find(selector: any) {
          const names = selector?.$or?.flatMap((clause: any) =>
            clause?._id?.$in || clause?.['content.fileName']?.$in || clause?.tdfFileName?.$in || []
          ) || [];
          return { fetchAsync: async () => tdfs.filter((tdf) => names.includes(tdf?._id) || names.includes(tdf?.content?.fileName) || names.includes(tdf?.tdfFileName)) };
        },
      },
      UserTimesLog: {
        find() { return { fetchAsync: async () => logs }; },
        async updateAsync(selector: any, modifier: any) {
          writes.push({ selector, modifier });
          return 1;
        },
      },
      ScheduledTurkMessages: {
        find() { return { fetchAsync: async () => turkMessages }; },
        async updateAsync(selector: any, modifier: any) {
          writes.push({ collection: 'ScheduledTurkMessages', selector, modifier });
          return 1;
        },
      },
      AuditLog: { async insertAsync(doc: any) { audits.push(doc); } },
      serverConsole() {},
    },
  };
}

describe('filename TDF reference migration', function() {
  it('dry-runs, fingerprints, and idempotently writes unambiguous currentTdfId values', async function() {
    const fixture = makeDeps(
      [{ _id: 'tdf-one', content: { fileName: 'lesson.json' } }],
      [{ _id: 'log-one', userId: 'private', study: [{ action: 'expcondition', currentTdfName: 'lesson.json' }] }],
    );
    const dryRun = await migrateFilenameTdfReferences(fixture.deps, { batchSize: 100 });
    assert.equal(dryRun.changedRecords, 1);
    assert.equal(fixture.writes.length, 0);

    const applied = await migrateFilenameTdfReferences(fixture.deps, {
      dryRun: false,
      confirmWrite: 'backfill-filename-tdf-references',
      expectedFingerprint: dryRun.fingerprint,
      batchSize: 100,
    });
    assert.equal(applied.changedRecords, 1);
    assert.equal(fixture.writes[0].modifier.$set.study[0].currentTdfId, 'tdf-one');
    assert.equal(fixture.audits.length, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(fixture.audits[0], 'userId'), false);
  });

  it('reports ambiguous filenames and refuses to apply them', async function() {
    const fixture = makeDeps(
      [
        { _id: 'tdf-one', content: { fileName: 'duplicate.json' } },
        { _id: 'tdf-two', content: { fileName: 'duplicate.json' } },
      ],
      [{ _id: 'log-one', study: [{ currentTdfName: 'duplicate.json' }] }],
    );
    const dryRun = await migrateFilenameTdfReferences(fixture.deps);
    assert.deepEqual(dryRun.ambiguousFileNames, ['duplicate.json']);
    await assert.rejects(() => migrateFilenameTdfReferences(fixture.deps, {
      dryRun: false,
      confirmWrite: 'backfill-filename-tdf-references',
      expectedFingerprint: dryRun.fingerprint,
    }), (error: any) => error?.error === 'tdf-reference-migration-unresolved');
  });

  it('migrates scheduled Turk experiment references but leaves existing TDF ids unchanged', async function() {
    const fixture = makeDeps(
      [{ _id: 'tdf-one', content: { fileName: 'lesson.json' } }],
      [],
      [
        { _id: 'message-one', experiment: 'lesson.json' },
        { _id: 'message-two', experiment: 'tdf-one' },
      ],
    );
    const dryRun = await migrateFilenameTdfReferences(fixture.deps);
    assert.equal(dryRun.changedTurkMessages, 1);
    assert.equal(dryRun.canonicalTurkMessages, 1);
    await migrateFilenameTdfReferences(fixture.deps, {
      dryRun: false,
      confirmWrite: 'backfill-filename-tdf-references',
      expectedFingerprint: dryRun.fingerprint,
    });
    const messageWrite = fixture.writes.find((write) => write.collection === 'ScheduledTurkMessages');
    assert.deepEqual(messageWrite.modifier, { $set: { experiment: 'tdf-one' } });
  });
});
