import { strict as assert } from 'node:assert';
import { Meteor } from 'meteor/meteor';
import { HISTORY_DOWNLOAD_METHOD_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods';
import { createAnalyticsDownloadRegistration } from './analyticsDownloadMethods';
import { consumeOwnedHistoryDownloadToken } from '../lib/ownedHistoryDownloadTokens';

describe('history export runtime bindings', () => {
  const handlers = () => (Meteor as any).server.method_handlers;
  it('binds the four history export methods and preserves missing-session denials', async () => {
    const observation = registeredMeteorMethodSurfaces();
    if (observation.state !== 'observed') throw new Error(observation.reason);
    const operations = {
      downloadDataByTeacher: 'owned-lessons', downloadOwnHistoryAcrossTdfs: 'own-history',
      downloadDataByClass: 'disabled-class', downloadDataById: 'owned-lesson',
    } as const;
    for (const verification of Object.values(HISTORY_DOWNLOAD_METHOD_VERIFICATIONS)) {
      const name: keyof typeof operations = verification.method;
      const entries: typeof observation.surfaces = observation.surfaces.filter(value => value.name === name);
      assert.equal(entries.length, 1);
      assert.equal(entries[0]?.verification, verification);
      assert.deepEqual(entries[0]?.policy, { kind: 'history-download', operation: operations[verification.method] });
      assert.equal(entries[0]?.dataEgress, verification.method === 'downloadDataByClass' ? 'none' : 'history-download-capability');
      await assert.rejects(() => handlers()[verification.method].call({}, 'synthetic-id'),
        (error: unknown) => error instanceof Meteor.Error && error.error === 401);
    }
  });
  it('keeps class-based export disabled for signed-in callers', async () => {
    await assert.rejects(() => handlers().downloadDataByClass.call({ userId: 'synthetic-user' }, 'synthetic-class'),
      (error: unknown) => error instanceof Meteor.Error && error.error === 403
        && error.reason === 'Class-based data download is not allowed in this flow');
  });
});

describe('instructor export method capabilities', () => {
  function fixture() {
    const calls: Array<{ selector: Record<string, unknown>; options?: Record<string, unknown> }> = [];
    const tdf = { _id: 'synthetic-lesson', ownerId: 'synthetic-owner', content: { tdfs: { tutor: { setspec: { lessonname: 'Synthetic lesson' }, unit: [{ type: 'model' }] } } } };
    const { methods } = createAnalyticsDownloadRegistration({
      GlobalExperimentStates: { findOneAsync: async () => null },
      Histories: {
        find: () => { throw new Error('A method must not buffer history rows'); },
        findOneAsync: async () => { throw new Error('An instructor method must not read history rows'); },
      },
      Tdfs: {
        find: (selector, options) => { calls.push({ selector, ...(options ? { options } : {}) }); return { fetchAsync: async () => [tdf] }; },
        findOneAsync: async (selector, options) => { calls.push({ selector, ...(options ? { options } : {}) }); return selector._id === tdf._id ? tdf : null; },
      },
      usersCollection: { findOneAsync: async () => ({ username: 'synthetic-owner' }) },
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => false }),
    });
    return { methods, calls };
  }

  it('returns an all-owned streaming capability using only projected lesson IDs', async () => {
    const f = fixture();
    const result = await f.methods.downloadDataByTeacher.call({ userId: 'synthetic-owner' }, 'synthetic-owner');
    assert.equal('content' in result, false);
    assert.equal(result.fileName, 'learning-data_synthetic-owner_all-lessons.tsv');
    assert.deepEqual(f.calls, [{ selector: { ownerId: 'synthetic-owner' }, options: { fields: { _id: 1 } } }]);
    const token = decodeURIComponent(result.downloadUrl.split('/')[3]!);
    assert.deepEqual(consumeOwnedHistoryDownloadToken(token)?.tdfIds, ['synthetic-lesson']);
  });

  it('returns a single-lesson streaming capability while keeping ownership enforcement', async () => {
    const f = fixture();
    const result = await f.methods.downloadDataById.call({ userId: 'synthetic-owner' }, 'synthetic-lesson');
    assert.equal('content' in result, false);
    assert.equal(result.fileName, 'Synthetic_lesson-data.tsv');
    const record = consumeOwnedHistoryDownloadToken(decodeURIComponent(result.downloadUrl.split('/')[3]!));
    assert.deepEqual(record?.request, { kind: 'lesson', tdfId: 'synthetic-lesson', includeConditions: false });
    await assert.rejects(f.methods.downloadDataById.call({ userId: 'synthetic-other' }, 'synthetic-lesson'), /Not authorized/);
  });

  it('rejects unsigned and cross-user all-owned requests before reading lesson IDs', async () => {
    const f = fixture();
    await assert.rejects(f.methods.downloadDataByTeacher.call({}, 'synthetic-owner'), /Must be logged in/);
    await assert.rejects(f.methods.downloadDataByTeacher.call({ userId: 'synthetic-other' }, 'synthetic-owner'), /Permission denied/);
    assert.deepEqual(f.calls, []);
  });
});
