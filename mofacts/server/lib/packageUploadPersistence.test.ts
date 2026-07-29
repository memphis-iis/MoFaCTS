import { strict as assert } from 'node:assert';
import { processParsedPackageTdfs } from './packageUploadPersistence';
import type {
  DynamicAssetLike,
  PackageUploadRuntimeState,
  ProcessPackageUploadDeps,
} from './packageUploadShared';
import type { UploadedPackageFile } from './packageParser';

function packageDeps(overrides: Partial<ProcessPackageUploadDeps> = {}): ProcessPackageUploadDeps {
  return {
    TdfMutationJobs: {
      async insertAsync() { return 'upload-plan-1'; },
      async findOneAsync() { return null; },
      async updateAsync() { return 1; },
    },
    DynamicAssets: {
      collection: {
        async findOneAsync() {
          return null;
        },
      },
    },
    storageBoundary: {} as ProcessPackageUploadDeps['storageBoundary'],
    async userIsInRoleAsync() {
      return false;
    },
    async userCanManageTdf() {
      return true;
    },
    normalizeCanonicalId(value: unknown) {
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    },
    serverConsole() {},
    encryptData(value: string) {
      return `encrypted:${value}`;
    },
    getApiKeyResolutionDeps() {
      return {} as ReturnType<ProcessPackageUploadDeps['getApiKeyResolutionDeps']>;
    },
    legacyTrim(value: unknown) {
      return typeof value === 'string' ? value.trim() : '';
    },
    async upsertPackage() {
      return { stimuliSetId: 1 };
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
    normalizeUploadedMediaLookupKey(value: unknown) {
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
      find() {
        return { async fetchAsync() { return []; } };
      },
      async findOneAsync() {
        return null;
      },
      async upsertAsync() {},
      async updateAsync() { return 1; },
      async removeAsync() { return 1; },
    },
    async getResponseKCMapForTdf() {
      return {};
    },
    async processAudioFilesForTDF() {
      return {};
    },
    async canonicalizeStimDisplayMediaRefs() {
      return {};
    },
    getNewItemFormat() {
      return [];
    },
    async canonicalizeFlatStimuliMediaRefs() {
      return {};
    },
    ...overrides,
  };
}

function packageFiles(): UploadedPackageFile[] {
  const tdfContents = {
    tutor: {
      setspec: {
        lessonname: 'Collision Lesson',
        stimulusfile: 'collision_stims.json',
      },
      unit: [{
        unitname: 'Practice',
        learningsession: {
          clusterlist: '0',
        },
      }],
    },
  };
  const stimContents = {
    setspec: {
      name: 'collision_stims',
      clusters: [{
        clusterKC: 'kc-a',
        stims: [{
          text: 'Prompt text',
          correctResponse: 'Answer',
        }],
      }],
    },
  };
  return [{
    name: 'collision_tdf.json',
    path: 'collision_tdf.json',
    extension: 'json',
    contents: tdfContents,
    packageFile: 'package.zip',
    type: 'tdf',
  }, {
    name: 'collision_stims.json',
    path: 'collision_stims.json',
    extension: 'json',
    contents: stimContents,
    packageFile: 'package.zip',
    type: 'stim',
  }];
}

describe('packageUploadPersistence', function() {
  it('propagates failed package upsert results instead of reporting package completion', async function() {
    const state: PackageUploadRuntimeState = {
      fileName: '',
      filePath: '',
      uploadActorUserId: 'user-a',
      stimSetId: undefined,
      uploadedMediaPathMapsByStimSetId: new Map(),
      mediaMutations: [],
      mutationJobId: null,
      identityPlan: {
        fingerprint: 'fingerprint',
        updates: [],
        creates: [{ tdfId: 'collision-tdf', fileName: 'collision_tdf.json', lessonName: 'Collision Lesson' }],
        entries: [{
          tdfId: 'collision-tdf',
          incomingTdfId: null,
          fileName: 'collision_tdf.json',
          action: 'create',
          lessonName: 'Collision Lesson',
          conditionTdfIds: [],
          targetRevision: 0,
          beforeImage: null,
        }],
      },
    };
    const errorMessage = 'TDF file name "collision_tdf.json" is already used by another user.';

    const result = await processParsedPackageTdfs({
      unzippedFiles: packageFiles(),
      fileObj: {
        _id: 'package-asset',
        path: 'package.zip',
        name: 'package.zip',
      } satisfies DynamicAssetLike,
      packageFile: 'package-asset.zip',
      packageAssetId: 'package-asset',
      zipPath: 'package.zip',
      owner: 'user-a',
      isTeacherOrAdmin: false,
      emailToggle: false,
      deps: packageDeps({
        async upsertPackage() {
          return {
            result: false,
            errmsg: errorMessage,
          };
        },
      }),
      state,
    });

    assert.equal(result.results.length, 1);
    assert.equal(result.results[0]?.result, false);
    assert.equal(result.results[0]?.errmsg, errorMessage);
    assert.equal(result.results[0]?.tdfFileName, 'collision_tdf.json');
    assert.equal(result.touchedStimuliSetIds.size, 0);
  });
});
