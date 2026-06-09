import { expect } from 'chai';
import { createContentMethods } from './contentMethods';
import { DYNAMIC_ASSET_PUBLICATION_FIELDS } from '../publications';

function createContentDeps(overrides: Record<string, unknown> = {}) {
  const docs = [
    {
      _id: 'tdf-a',
      ownerId: 'user-a',
      stimuliSetId: '42',
      packageFile: 'package.zip',
      packageAssetId: 'asset-package',
      conditionCounts: [3],
      rawStimuliFile: { shouldNotReturn: true },
      stimuli: [{ shouldNotReturn: true }],
      content: {
        fileName: 'lesson-a.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Lesson A',
              userselect: 'false',
              condition: ['condition-a.json'],
              conditionTdfIds: ['condition-a'],
              stimulusfile: 'stim-a.json'
            },
            unit: [
              { learningsession: { stimulusfile: 'stim-extra.json' } }
            ]
          }
        }
      }
    },
    {
      _id: 'tdf-b',
      ownerId: 'user-a',
      stimuliSetId: 42,
      conditionCounts: [],
      content: {
        fileName: 'lesson-b.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Lesson B',
              userselect: 'true',
              condition: []
            },
            unit: []
          }
        }
      }
    }
  ];

  const deps = {
    ManualContentDrafts: {
      find: () => ({ fetchAsync: async () => [] }),
      findOneAsync: async () => null,
      updateAsync: async () => undefined,
      insertAsync: async () => undefined,
      removeAsync: async () => undefined
    },
    Tdfs: {
      find: (selector: any) => ({
        fetchAsync: async () => selector?._id?.$in
          ? docs.filter((doc) => selector._id.$in.includes(doc._id))
          : docs,
        countAsync: async () => docs.length
      }),
      findOneAsync: async () => null,
      updateAsync: async () => undefined,
      removeAsync: async () => undefined
    },
    Stims: {
      find: () => ({
        fetchAsync: async () => [
          { _id: 'stim-a', meta: { fileName: 'stim-a.json' } },
          { _id: 'stim-extra', meta: { fileName: 'stim-extra.json' } }
        ]
      })
    },
    DynamicAssets: {
      find: () => ({ fetchAsync: async () => [], countAsync: async () => 0 }),
      findOneAsync: async () => null,
      removeAsync: async () => undefined,
      collection: {
        rawCollection: () => ({
          aggregate: () => ({
            toArray: async () => [
              { _id: '42', count: 2 },
              { _id: 42, count: 1 }
            ]
          })
        }),
        updateAsync: async () => undefined
      }
    },
    storageBoundary: {},
    usersCollection: { findOneAsync: async () => null },
    UserUploadQuota: { findOneAsync: async () => null },
    AuditLog: { insertAsync: async () => undefined },
    serverConsole: () => undefined,
    isPlainRecord: (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value),
    cloneJsonLike: <T>(value: T) => JSON.parse(JSON.stringify(value)),
    normalizeCanonicalId: (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null,
    getTdfsByFileNameOrId: async () => [
      { _id: 'condition-a', content: { fileName: 'condition-a.json' } }
    ],
    canAccessContentUploadTdf: async () => true,
    getOrBuildCurrentPackageAsset: async () => ({ link: '/package.zip' }),
    parseLocalMediaReference: () => ({}),
    extractSrcFromHtml: () => [],
    getStimuliSetIdCandidates: () => [],
    findDynamicAssetsScopedBatch: async () => [],
    decryptData: (value: string) => value,
    deleteTdfRuntimeData: async () => undefined,
    updateStimDisplayTypeMap: async () => undefined,
    rebuildStimDisplayTypeMapSnapshot: async () => undefined,
    getStimDisplayTypeMapDeps: () => ({}),
    getMethodAuthorizationDeps: () => ({}),
    resolveConditionTdfIds: async () => []
  };

  return { ...deps, ...overrides } as any;
}

describe('contentMethods content upload summaries', function() {
  it('returns compact summaries with batch asset counts for string and numeric stimuliSetId values', async function() {
    let aggregatePipeline: any[] | null = null;
    const deps = createContentDeps({
      DynamicAssets: {
        find: () => ({ fetchAsync: async () => [], countAsync: async () => 0 }),
        findOneAsync: async () => null,
        removeAsync: async () => undefined,
        collection: {
          rawCollection: () => ({
            aggregate: (pipeline: any[]) => {
              aggregatePipeline = pipeline;
              return {
                toArray: async () => [
                  { _id: '42', count: 2 },
                  { _id: 42, count: 1 }
                ]
              };
            }
          }),
          updateAsync: async () => undefined
        }
      }
    });
    const methods = createContentMethods(deps);

    const summaries = await methods.getContentUploadSummariesForIds.call({ userId: 'user-a' }, ['tdf-a', 'tdf-b']);

    expect(aggregatePipeline).to.deep.equal([
      { $match: { 'meta.stimuliSetId': { $in: ['42', 42] } } },
      { $group: { _id: '$meta.stimuliSetId', count: { $sum: 1 } } }
    ]);
    expect(summaries.map((summary: any) => summary.assetCount)).to.deep.equal([3, 3]);
    for (const summary of summaries as any[]) {
      expect(summary).to.not.have.property('content');
      expect(summary).to.not.have.property('stimuli');
      expect(summary).to.not.have.property('rawStimuliFile');
    }
  });

  it('keeps asset publications limited to fields needed by client link and metadata views', function() {
    expect(DYNAMIC_ASSET_PUBLICATION_FIELDS).to.deep.equal({
      _id: 1,
      name: 1,
      fileName: 1,
      type: 1,
      size: 1,
      uploadedAt: 1,
      userId: 1,
      path: 1,
      meta: 1,
      ext: 1,
      extension: 1,
      extensionWithDot: 1,
      isImage: 1,
      isAudio: 1,
      isVideo: 1,
      versions: 1
    });
  });

  it('dry-runs orphan DynamicAssets cleanup against active TDF references', async function() {
    const tdfs = [
      { _id: 'tdf-active', stimuliSetId: 1, packageAssetId: 'package-live', packageFile: 'package-live.zip' },
    ];
    const assets = [
      { _id: 'media-active', name: 'active.jpg', ext: 'jpg', size: 10, meta: { stimuliSetId: 1 } },
      { _id: 'media-orphan', name: 'orphan.jpg', ext: 'jpg', size: 20, meta: { stimuliSetId: 2 } },
      { _id: 'package-orphan', name: 'old.zip', ext: 'zip', size: 30, meta: {} },
      { _id: 'package-live', name: 'package-live.zip', ext: 'zip', size: 40, meta: {} },
      { _id: 'unscoped-media', name: 'scratch.png', ext: 'png', size: 50, meta: {} },
    ];
    const removed: string[] = [];
    const deps = createContentDeps({
      Tdfs: {
        find: () => ({ fetchAsync: async () => tdfs, countAsync: async () => tdfs.length }),
        findOneAsync: async () => null,
        updateAsync: async () => undefined,
        removeAsync: async () => undefined
      },
      DynamicAssets: {
        find: () => ({ fetchAsync: async () => assets, countAsync: async () => assets.length }),
        findOneAsync: async () => null,
        removeAsync: async (selector: any) => { removed.push(selector._id); },
        collection: {
          rawCollection: () => ({ aggregate: () => ({ toArray: async () => [] }) }),
          updateAsync: async () => undefined
        }
      },
      getStimuliSetIdCandidates: (value: unknown) => {
        const text = String(value);
        const numberValue = Number(text);
        return Number.isFinite(numberValue) ? [text, numberValue] : [text];
      },
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => true })
    });
    const methods = createContentMethods(deps);

    const result = await methods.cleanupOrphanDynamicAssets.call({ userId: 'admin-user' }, { dryRun: true });

    expect(result.dryRun).to.equal(true);
    expect(result.orphanCount).to.equal(2);
    expect(result.sizeBytes).to.equal(50);
    expect(result.assets.map((asset: any) => asset.assetId)).to.deep.equal(['media-orphan', 'package-orphan']);
    expect(removed).to.deep.equal([]);
  });

  it('removes scoped DynamicAssets when deleting the last TDF for a package stimuli set', async function() {
    const tdfs = [
      { _id: 'tdf-delete', ownerId: 'owner', stimuliSetId: 88, packageAssetId: 'package-delete', stimuli: [] },
    ];
    const assets = [
      { _id: 'package-delete', name: 'package-delete.zip', ext: 'zip', userId: 'owner', meta: {} },
      { _id: 'media-delete', name: 'lesson.jpg', ext: 'jpg', meta: { stimuliSetId: 88 } },
      { _id: 'media-keep', name: 'other.jpg', ext: 'jpg', meta: { stimuliSetId: 99 } },
    ];
    const removed: string[] = [];
    const deps = createContentDeps({
      Tdfs: {
        find: (selector: any) => ({
          fetchAsync: async () => {
            if (selector?.$or) {
              return tdfs.filter((tdf) => tdf.packageAssetId === 'package-delete');
            }
            if (selector?.stimuliSetId?.$in) {
              return tdfs.filter((tdf) => selector.stimuliSetId.$in.includes(tdf.stimuliSetId));
            }
            return tdfs;
          },
          countAsync: async () => tdfs.length
        }),
        findOneAsync: async () => null,
        updateAsync: async () => undefined,
        removeAsync: async (selector: any) => {
          const index = tdfs.findIndex((tdf) => tdf._id === selector._id);
          if (index >= 0) {
            tdfs.splice(index, 1);
          }
        }
      },
      DynamicAssets: {
        find: (selector: any) => ({
          fetchAsync: async () => {
            if (selector?.['meta.stimuliSetId']?.$in) {
              return assets.filter((asset) => selector['meta.stimuliSetId'].$in.includes(asset.meta?.stimuliSetId));
            }
            return assets;
          },
          countAsync: async () => assets.length
        }),
        findOneAsync: async (selector: any) => assets.find((asset) => asset._id === selector._id) || null,
        removeAsync: async (selector: any) => {
          removed.push(selector._id);
          const index = assets.findIndex((asset) => asset._id === selector._id);
          if (index >= 0) {
            assets.splice(index, 1);
          }
        },
        collection: {
          rawCollection: () => ({ aggregate: () => ({ toArray: async () => [] }) }),
          updateAsync: async () => undefined
        }
      },
      getStimuliSetIdCandidates: (value: unknown) => {
        const text = String(value);
        const numberValue = Number(text);
        return Number.isFinite(numberValue) ? [text, numberValue] : [text];
      },
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => true })
    });
    const methods = createContentMethods(deps);

    await methods.deletePackageFile.call({ userId: 'admin-user' }, 'package-delete');

    expect(removed).to.deep.equal(['package-delete', 'media-delete']);
    expect(assets.map((asset) => asset._id)).to.deep.equal(['media-keep']);
  });
});
