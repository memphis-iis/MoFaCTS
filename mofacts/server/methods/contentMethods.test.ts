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
});
