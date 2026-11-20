import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';

import { createContentAssetMaintenanceMethods } from '../methods/contentAssetMaintenanceMethods';
import { createPackageMethods } from '../methods/packageMethods';
import { processPackageUploadWorkflow } from './packageUpload';
import type { ProcessPackageUploadDeps } from './packageUploadShared';

const JSZip = require('jszip');

type IntegrationState = {
  contentWrites: number;
  removedAssetIds: string[];
  storedTdf: any;
  mutationJob?: any;
};

async function writeIdentityPackage(tdfId: string) {
  const zip = new JSZip();
  zip.file('lesson.json', JSON.stringify({
    tdfId,
    tutor: {
      setspec: {
        lessonname: 'Identity Integration Lesson',
        stimulusfile: 'stimuli.json',
      },
      unit: [{}],
    },
  }));
  zip.file('stimuli.json', JSON.stringify({ setspec: { clusters: [] } }));
  return writePackage(zip);
}

async function writePackage(zip: any) {
  const zipPath = path.join(os.tmpdir(), `mofacts-package-identity-${Date.now()}-${Math.random()}.zip`);
  fs.writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
  return zipPath;
}

function createWorkflowDeps(state: IntegrationState): ProcessPackageUploadDeps {
  const existingTdf = {
    _id: 'known-tdf-id',
    tdfFileName: 'previous-name.json',
    tdfRevision: 0,
    tdfAvailability: 'repair-required',
    ownerId: 'owner-1',
    stimuliSetId: 17,
    content: {
      fileName: 'previous-name.json',
      tdfs: { tutor: { setspec: { lessonname: 'Previous lesson' }, unit: [] } },
    },
  };
  state.storedTdf = existingTdf;

  return {
    TdfMutationJobs: {
      async insertAsync(document) { state.mutationJob = { _id: 'upload-plan-1', ...document }; return 'upload-plan-1'; },
      async findOneAsync() { return state.mutationJob || null; },
      async updateAsync(_selector, modifier) {
        const mutationJob: any = state.mutationJob || {};
        const update: any = modifier;
        Object.assign(mutationJob, update.$set || {});
        for (const key of Object.keys(update.$unset || {})) delete mutationJob[key];
        if (update.$push?.mediaMutations) {
          mutationJob.mediaMutations = [...(mutationJob.mediaMutations || []), update.$push.mediaMutations];
        }
        return 1;
      },
    },
    DynamicAssets: {
      collection: {
        async findOneAsync() {
          return null;
        },
      },
      async removeAsync(selector) {
        state.removedAssetIds.push(String(selector._id));
      },
    },
    storageBoundary: { backend: 'local' } as ProcessPackageUploadDeps['storageBoundary'],
    async userIsInRoleAsync() {
      return true;
    },
    async userCanManageTdf(userId, tdf) {
      return userId === tdf?.ownerId;
    },
    normalizeCanonicalId(value) {
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    },
    serverConsole() {},
    encryptData(value) {
      return value;
    },
    getApiKeyResolutionDeps() {
      return {} as ReturnType<ProcessPackageUploadDeps['getApiKeyResolutionDeps']>;
    },
    legacyTrim(value) {
      return typeof value === 'string' ? value.trim() : '';
    },
    async upsertPackage(record) {
      state.contentWrites += 1;
      state.storedTdf = {
        _id: record.tdfId,
        ownerId: 'owner-1',
        stimuliSetId: 17,
        stimulusFileName: record.stimFileName,
        content: { fileName: record.fileName, tdfs: record.tdfs },
        rawStimuliFile: record.stimuli,
        stimuli: [],
        tdfFileName: record.fileName,
        tdfRevision: 1,
        packageWriteJobId: record.mutationJobId,
        tdfAvailability: 'available',
      };
      return { res: 'upserted', stimuliSetId: 17, tdfId: record.tdfId };
    },
    async updateStimDisplayTypeMap() {},
    async getStimuliSetIdByFilename() {
      return undefined;
    },
    async saveMediaFile() {
      return null;
    },
    toCanonicalDynamicAssetPath() {
      return '';
    },
    normalizeUploadedMediaLookupKey(value) {
      return typeof value === 'string' ? value.trim().toLowerCase() : '';
    },
    async getCurrentUser() {
      return null;
    },
    sendEmail() {},
    ownerEmail: 'owner@example.test',
    UserUploadQuota: {
      async upsertAsync() {},
    },
    AuditLog: {
      async insertAsync() {},
    },
    Tdfs: {
      find(selector) {
        return {
          async fetchAsync() {
            const ids = (selector._id as { $in?: string[] } | undefined)?.$in || [];
            return ids.includes('known-tdf-id') ? [existingTdf] : [];
          },
        };
      },
      async findOneAsync(selector) {
        if (selector._id !== 'known-tdf-id') return null;
        if (selector.packageWriteJobId !== undefined && selector.packageWriteJobId !== state.storedTdf.packageWriteJobId) return null;
        return state.storedTdf;
      },
      async upsertAsync() {},
      async updateAsync(selector, modifier) {
        if (selector._id === 'known-tdf-id') {
          Object.assign(state.storedTdf, modifier.$set || {});
          for (const key of Object.keys(modifier.$unset || {})) delete state.storedTdf[key];
        }
        return 1;
      },
      async removeAsync() { return 1; },
    },
    async getResponseKCMapForTdf() {
      return {};
    },
    async processAudioFilesForTDF(tdfDoc) {
      return tdfDoc;
    },
    async canonicalizeStimDisplayMediaRefs() {},
    getNewItemFormat() {
      return [];
    },
    async canonicalizeFlatStimuliMediaRefs() {},
  };
}

describe('package upload identity confirmation integration', function() {
  let zipPath = '';

  afterEach(function() {
    if (zipPath && fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    zipPath = '';
  });

  for (const rootVisibility of ['true', 'false']) {
    for (const childFirst of [false, true]) {
      it(`keeps a ${rootVisibility === 'true' ? 'public' : 'private'} root and guards its condition write with the ${childFirst ? 'child' : 'root'} first`, async function() {
        this.timeout(15000);
        const zip = new JSZip();
        const root = { tutor: { setspec: { lessonname: 'Study', stimulusfile: 'stimuli.json',
          userselect: rootVisibility, condition: ['child.json'] } } };
        const child = { tutor: { setspec: { lessonname: 'Condition', stimulusfile: 'stimuli.json', userselect: 'true' }, unit: [{}] } };
        for (const name of childFirst ? ['child.json', 'root.json'] : ['root.json', 'child.json']) {
          zip.file(name, JSON.stringify(name === 'root.json' ? root : child));
        }
        zip.file('stimuli.json', JSON.stringify({ setspec: { clusters: [] } }));
        zipPath = await writePackage(zip);
        const state: IntegrationState = { contentWrites: 0, removedAssetIds: [], storedTdf: null };
        const deps = createWorkflowDeps(state);
        const tdfs = new Mongo.Collection<any>(`packageVisibility${Random.id()}`);
        let nextStimuliSet = 101;
        const methods = createPackageMethods({ ...deps, Tdfs: tdfs,
          usersCollection: { async findOneAsync() { return { profile: { displayName: 'Synthetic teacher' } }; } },
          allocateNextStimuliSetId: () => nextStimuliSet++,
        } as unknown as Parameters<typeof createPackageMethods>[0]);
        const asset = { _id: 'asset-visibility', path: zipPath, userId: 'owner-1', ext: 'zip',
          name: 'condition-package.zip', size: fs.statSync(zipPath).size };
        const conditionIds = 'content.tdfs.tutor.setspec.conditionTdfIds';
        await tdfs.rawCollection().createIndex({ [conditionIds]: 1 }, {
          unique: true, partialFilterExpression: { [`${conditionIds}.0`]: { $exists: true } },
        });
        try {
          const result = await methods.processPackageUpload.call({ userId: 'owner-1' }, asset, 'owner-1', '', false);
          assert.equal(result?.status, 'complete');
          const storedRoot = await tdfs.findOneAsync({ tdfFileName: 'root.json' });
          const storedChild = await tdfs.findOneAsync({ tdfFileName: 'child.json' });
          assert.equal(storedRoot?.content.tdfs.tutor.setspec.userselect, rootVisibility);
          assert.equal(storedChild?.content.tdfs.tutor.setspec.userselect, 'false');
          assert.deepEqual(storedRoot?.content.tdfs.tutor.setspec.conditionTdfIds, [storedChild?._id]);
          assert.equal(storedRoot?.packageWriteJobId, state.mutationJob._id);
          assert.equal(storedChild?.packageWriteJobId, state.mutationJob._id);
          assert.equal(storedChild?.tdfRevision, 1);
        } finally {
          await tdfs.rawCollection().drop();
        }
      });
    }
  }

  it('rejects two roots claiming one condition before starting an upload mutation', async function() {
    const zip = new JSZip();
    for (const lessonname of ['First root', 'Second root']) {
      zip.file(`${lessonname}.json`, JSON.stringify({ tutor: { setspec: {
        lessonname, stimulusfile: 'stimuli.json', condition: ['child.json'],
      } } }));
    }
    zip.file('child.json', JSON.stringify({ tutor: {
      setspec: { lessonname: 'Condition', stimulusfile: 'stimuli.json' }, unit: [{}],
    } }));
    zip.file('stimuli.json', JSON.stringify({ setspec: { clusters: [] } }));
    zipPath = await writePackage(zip);
    const state: IntegrationState = { contentWrites: 0, removedAssetIds: [], storedTdf: null };
    const deps = createWorkflowDeps(state);
    const asset = { _id: 'asset-shared-condition', path: zipPath, userId: 'owner-1', ext: 'zip',
      name: 'identity-package.zip', size: fs.statSync(zipPath).size };
    await assert.rejects(() => processPackageUploadWorkflow({ userId: 'owner-1' }, asset, 'owner-1', false, deps),
      /Each condition TDF must belong to one experiment root/);
    assert.equal(state.mutationJob, undefined);
    assert.equal(state.contentWrites, 0);
  });

  it('preflights without writes, rejects stale confirmation, then commits the exact TDF id', async function() {
    this.timeout(15_000);
    zipPath = await writeIdentityPackage('known-tdf-id');
    const state: IntegrationState = { contentWrites: 0, removedAssetIds: [], storedTdf: null };
    const deps = createWorkflowDeps(state);
    const asset = {
      _id: 'asset-confirm',
      path: zipPath,
      userId: 'owner-1',
      ext: 'zip',
      name: 'identity-package.zip',
      size: fs.statSync(zipPath).size,
    };

    const initial = await processPackageUploadWorkflow(
      { userId: 'owner-1' }, asset, 'owner-1', false, deps
    ) as any;
    assert.equal(initial.status, 'confirmation-required');
    assert.equal(state.contentWrites, 0);
    assert.ok(state.mutationJob.confirmationExpiresAt instanceof Date);
    assert.ok(state.mutationJob.cleanupAt instanceof Date);

    const stale = await processPackageUploadWorkflow(
      { userId: 'owner-1' }, asset, 'owner-1', false, deps, undefined,
      { confirmedIdentityFingerprint: '0'.repeat(64) }
    ) as any;
    assert.equal(stale.status, 'confirmation-required');
    assert.equal(state.contentWrites, 0);

    const committed = await processPackageUploadWorkflow(
      { userId: 'owner-1' }, asset, 'owner-1', false, deps, undefined,
      {
        confirmedIdentityFingerprint: state.mutationJob.identityFingerprint,
        expectedArchiveSha256: state.mutationJob.archiveSha256,
        mutationJobId: initial.uploadPlanId,
      }
    ) as any;
    assert.equal(committed.results[0].result, true);
    assert.equal(committed.results[0].tdfId, 'known-tdf-id');
    assert.equal(state.contentWrites, 1);
    assert.equal(state.storedTdf._id, 'known-tdf-id');
    assert.equal(state.storedTdf.stimuliSetId, 17);
    assert.equal(state.mutationJob.status, 'complete');
    assert.equal(state.mutationJob.confirmationExpiresAt, undefined);
    assert.ok(state.mutationJob.cleanupAt.getTime() > Date.now());
  });

  it('uses the authorized asset-removal path when confirmation is canceled', async function() {
    zipPath = await writeIdentityPackage('known-tdf-id');
    const state: IntegrationState = { contentWrites: 0, removedAssetIds: [], storedTdf: null };
    const deps = createWorkflowDeps(state);
    const asset = {
      _id: 'asset-cancel',
      path: zipPath,
      userId: 'owner-1',
      ext: 'zip',
      name: 'identity-package.zip',
      size: fs.statSync(zipPath).size,
    };
    const initial = await processPackageUploadWorkflow(
      { userId: 'owner-1' }, asset, 'owner-1', false, deps
    ) as any;
    assert.equal(initial.status, 'confirmation-required');

    const assetMethods = createContentAssetMaintenanceMethods({
      Tdfs: {
        find: () => ({ fetchAsync: async () => [] }),
        findOneAsync: async () => null,
        removeAsync: async () => 0,
      },
      DynamicAssets: {
        find: () => ({ fetchAsync: async () => [], countAsync: async () => 0 }),
        findOneAsync: async (selector: any) => selector._id === asset._id ? asset : null,
        removeAsync: async (selector: any) => {
          state.removedAssetIds.push(String(selector._id));
          return 1;
        },
      },
      serverConsole() {},
      normalizeCanonicalId(value: unknown) {
        return typeof value === 'string' && value.trim() ? value.trim() : null;
      },
      getStimuliSetIdCandidates: () => [],
      deleteTdfRuntimeData: async () => {},
      updateStimDisplayTypeMap: async () => {},
      rebuildStimDisplayTypeMapSnapshot: async () => {},
      getStimDisplayTypeMapDeps: () => ({}),
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => false }),
    });
    await assetMethods.removeAssetById.call({ userId: 'owner-1' }, asset._id);

    assert.equal(state.contentWrites, 0);
    assert.deepEqual(state.removedAssetIds, ['asset-cancel']);
  });

  it('rolls back a create when another upload claims the supplied id after preflight', async function() {
    zipPath = await writeIdentityPackage('concurrent-id');
    const state: IntegrationState = { contentWrites: 0, removedAssetIds: [], storedTdf: null };
    const deps = createWorkflowDeps(state);
    deps.upsertPackage = async () => {
      const error = new Error('E11000 duplicate key error collection: Tdfs index: _id_ dup key');
      (error as any).code = 11000;
      throw error;
    };
    const asset = {
      _id: 'asset-concurrent',
      path: zipPath,
      userId: 'owner-1',
      ext: 'zip',
      name: 'identity-package.zip',
      size: fs.statSync(zipPath).size,
    };

    await assert.rejects(
      () => processPackageUploadWorkflow({ userId: 'owner-1' }, asset, 'owner-1', false, deps),
      /duplicate key/i,
    );
    assert.equal(state.contentWrites, 0);
    assert.equal(state.mutationJob.status, 'rolled-back');
  });

  it('rolls an applied update back before rethrowing a package-domain failure', async function() {
    zipPath = await writeIdentityPackage('known-tdf-id');
    const state: IntegrationState = { contentWrites: 0, removedAssetIds: [], storedTdf: null };
    const deps = createWorkflowDeps(state);
    deps.processAudioFilesForTDF = async () => {
      throw new Error('post-processing failed');
    };
    const asset = {
      _id: 'asset-rollback',
      path: zipPath,
      userId: 'owner-1',
      ext: 'zip',
      name: 'identity-package.zip',
      size: fs.statSync(zipPath).size,
    };
    const initial = await processPackageUploadWorkflow(
      { userId: 'owner-1' }, asset, 'owner-1', false, deps
    ) as any;

    await assert.rejects(
      () => processPackageUploadWorkflow(
        { userId: 'owner-1' }, asset, 'owner-1', false, deps, undefined,
        {
          confirmedIdentityFingerprint: state.mutationJob.identityFingerprint,
          expectedArchiveSha256: state.mutationJob.archiveSha256,
          mutationJobId: initial.uploadPlanId,
        },
      ),
      /post-processing failed/,
    );

    assert.equal(state.mutationJob.status, 'rolled-back');
    assert.equal(state.storedTdf.tdfFileName, 'previous-name.json');
    assert.equal(state.storedTdf.content.fileName, 'previous-name.json');
    assert.equal(state.storedTdf.tdfAvailability, 'repair-required');
    assert.equal(state.storedTdf.tdfRevision, 0);
  });

  it('leaves a newer writer untouched when a package fails during post-processing', async function() {
    zipPath = await writeIdentityPackage('known-tdf-id');
    const state: IntegrationState = { contentWrites: 0, removedAssetIds: [], storedTdf: null };
    const deps = createWorkflowDeps(state);
    let winner: any;
    deps.processAudioFilesForTDF = async () => {
      winner = { ...structuredClone(state.storedTdf), packageWriteJobId: 'winning-job', tdfFileName: 'winner.json' };
      state.storedTdf = structuredClone(winner);
      throw new Error('forced synthetic package failure');
    };
    const asset = { _id: 'asset-failed-contender', path: zipPath, userId: 'owner-1', ext: 'zip',
      name: 'identity-package.zip', size: fs.statSync(zipPath).size };
    const review = await processPackageUploadWorkflow({ userId: 'owner-1' }, asset, 'owner-1', false, deps) as any;
    await assert.rejects(() => processPackageUploadWorkflow({ userId: 'owner-1' }, asset, 'owner-1', false, deps, undefined, {
      confirmedIdentityFingerprint: state.mutationJob.identityFingerprint,
      expectedArchiveSha256: state.mutationJob.archiveSha256,
      mutationJobId: review.uploadPlanId,
    }), /forced synthetic package failure/);
    assert.equal(state.mutationJob.status, 'rolled-back');
    assert.equal(winner.tdfRevision, 1);
    assert.deepEqual(state.storedTdf, winner);
  });
});
