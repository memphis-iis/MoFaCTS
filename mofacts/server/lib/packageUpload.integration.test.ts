import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createContentAssetMaintenanceMethods } from '../methods/contentAssetMaintenanceMethods';
import { processPackageUploadWorkflow } from './packageUpload';
import type { ProcessPackageUploadDeps } from './packageUploadShared';

const JSZip = require('jszip');

type IntegrationState = {
  contentWrites: number;
  removedAssetIds: string[];
  storedTdf: any;
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
      unit: [],
    },
  }));
  zip.file('stimuli.json', JSON.stringify({ setspec: { clusters: [] } }));
  const zipPath = path.join(os.tmpdir(), `mofacts-package-identity-${Date.now()}-${Math.random()}.zip`);
  fs.writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
  return zipPath;
}

function createWorkflowDeps(state: IntegrationState): ProcessPackageUploadDeps {
  const existingTdf = {
    _id: 'known-tdf-id',
    ownerId: 'owner-1',
    stimuliSetId: 17,
    content: {
      fileName: 'previous-name.json',
      tdfs: { tutor: { setspec: { lessonname: 'Previous lesson' }, unit: [] } },
    },
  };
  state.storedTdf = existingTdf;

  return {
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
        return selector._id === 'known-tdf-id' ? state.storedTdf : null;
      },
      async upsertAsync() {},
    },
    async resolveConditionTdfIds() {
      return [];
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

  it('preflights without writes, rejects stale confirmation, then commits the exact TDF id', async function() {
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

    const stale = await processPackageUploadWorkflow(
      { userId: 'owner-1' }, asset, 'owner-1', false, deps, undefined,
      { confirmedIdentityFingerprint: '0'.repeat(64) }
    ) as any;
    assert.equal(stale.status, 'confirmation-required');
    assert.equal(state.contentWrites, 0);

    const committed = await processPackageUploadWorkflow(
      { userId: 'owner-1' }, asset, 'owner-1', false, deps, undefined,
      { confirmedIdentityFingerprint: initial.preflightFingerprint }
    ) as any;
    assert.equal(committed.results[0].result, true);
    assert.equal(committed.results[0].tdfId, 'known-tdf-id');
    assert.equal(state.contentWrites, 1);
    assert.equal(state.storedTdf._id, 'known-tdf-id');
    assert.equal(state.storedTdf.stimuliSetId, 17);
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
    await assetMethods.removeAssetById.call({ userId: 'owner-1' }, initial.packageAssetId);

    assert.equal(state.contentWrites, 0);
    assert.deepEqual(state.removedAssetIds, ['asset-cancel']);
  });
});
