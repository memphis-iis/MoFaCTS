import { strict as assert } from 'node:assert';

import { createTdfIdentityMigrationMethods, migrateFilenameTdfReferences } from './tdfIdentityMigrationMethods';

function makeDeps(tdfs: any[], logs: any[]) {
  const writes: any[] = [];
  const audits: any[] = [];
  const logQueries: any[] = [];
  return {
    writes,
    audits,
    logQueries,
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
        find(selector: any, options: any) {
          logQueries.push({ selector, options });
          return { fetchAsync: async () => logs
            .filter(log => !selector._id || log._id > selector._id.$gt)
            .sort((left, right) => left._id.localeCompare(right._id))
            .slice(0, options.limit) };
        },
        async updateAsync(selector: any, modifier: any) {
          writes.push({ selector, modifier });
          const log = logs.find(document => document._id === selector._id);
          Object.assign(log, modifier.$set);
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
    const repeated = await migrateFilenameTdfReferences(fixture.deps);
    assert.equal(repeated.changedRecords, 0);
    assert.equal(repeated.alreadyCanonical, 1);
    assert.deepEqual(fixture.writes[0].selector.study, [{ action: 'expcondition', currentTdfName: 'lesson.json' }]);
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

  it('retains bounded log pagination and the log-only report contract', async function() {
    const fixture = makeDeps([], [
      { _id: 'log-three', study: [] },
      { _id: 'log-one', study: [] },
      { _id: 'log-two', study: [] },
    ]);
    const report = await migrateFilenameTdfReferences(fixture.deps, { afterUserTimesLogId: 'log-one', batchSize: 1 });
    assert.deepEqual(fixture.logQueries[0], { selector: { _id: { $gt: 'log-one' } }, options: { sort: { _id: 1 }, limit: 1 } });
    assert.equal(report.scannedDocuments, 1);
    assert.equal(report.nextAfterUserTimesLogId, 'log-three');
    assert.deepEqual(Object.keys(report).sort(), [
      'dryRun', 'scannedDocuments', 'scannedRecords', 'changedDocuments', 'changedRecords',
      'alreadyCanonical', 'ambiguousFileNames', 'missingFileNames', 'nextAfterUserTimesLogId', 'fingerprint',
    ].sort());
  });

  it('requires reviewed fingerprints and stops on write conflicts', async function() {
    const fixture = makeDeps(
      [{ _id: 'tdf-one', content: { fileName: 'lesson.json' } }],
      [{ _id: 'log-one', study: [{ currentTdfName: 'lesson.json' }] }],
    );
    await assert.rejects(() => migrateFilenameTdfReferences(fixture.deps, { dryRun: false }),
      (error: any) => error?.error === 'migration-confirmation-required');
    await assert.rejects(() => migrateFilenameTdfReferences(fixture.deps, {
      dryRun: false, confirmWrite: 'backfill-filename-tdf-references', expectedFingerprint: 'unreviewed',
    }), (error: any) => error?.error === 'migration-fingerprint-mismatch');
    assert.equal(fixture.writes.length, 0);
    const reviewed = await migrateFilenameTdfReferences(fixture.deps);
    fixture.deps.UserTimesLog.updateAsync = async () => 0;
    await assert.rejects(() => migrateFilenameTdfReferences(fixture.deps, {
      dryRun: false, confirmWrite: 'backfill-filename-tdf-references', expectedFingerprint: reviewed.fingerprint,
    }), (error: any) => error?.error === 'migration-write-conflict');
    assert.equal(fixture.audits.length, 0);
  });

  it('keeps authentication and admin authorization at the method boundary', async function() {
    const fixture = makeDeps([], []);
    const methods = createTdfIdentityMigrationMethods({ ...fixture.deps, userIsInRoleAsync: async () => false });
    await assert.rejects(() => methods.migrateFilenameTdfReferences.call({}),
      (error: any) => error?.error === 401);
    await assert.rejects(() => methods.migrateFilenameTdfReferences.call({ userId: 'non-admin' }),
      (error: any) => error?.error === 403);
    assert.equal(fixture.logQueries.length, 0);
  });
});
