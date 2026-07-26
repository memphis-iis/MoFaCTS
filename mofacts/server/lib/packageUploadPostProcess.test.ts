import { strict as assert } from 'node:assert';
import { postProcessUploadedTdfs } from './packageUploadPostProcess';
import type {
  PackageUploadRuntimeState,
  ProcessPackageUploadDeps,
} from './packageUploadShared';
import type { UploadedPackageFile } from './packageParser';

function packageState(): PackageUploadRuntimeState {
  return {
    fileName: 'package.zip',
    filePath: 'package.zip',
    uploadActorUserId: 'user-a',
    stimSetId: 7,
    uploadedMediaPathMapsByStimSetId: new Map(),
  };
}

function packageDeps(params: {
  readonly tdf: Record<string, any>;
  readonly upserted?: Record<string, any>[];
  readonly embeddingInputs?: string[][];
  readonly embeddings?: number[][];
}): ProcessPackageUploadDeps {
  return {
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
    normalizeCanonicalId(value: unknown) {
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    },
    serverConsole() {},
    encryptData(value: string) {
      return `encrypted:${value}`;
    },
    getApiKeyResolutionDeps() {
      return {
        async getUserById() {
          return {
            services: {
              openRouter: {
                keyEncrypted: 'encrypted-openrouter-key',
              },
            },
          };
        },
        async getTdfById() {
          return {
            ownerId: 'user-a',
            content: {
              tdfs: {
                tutor: {
                  setspec: {},
                },
              },
            },
          };
        },
        async hasHistoryWithTdf() {
          return false;
        },
        async userIsInRoleAsync() {
          return false;
        },
        decryptData() {
          return 'openrouter-key';
        },
      };
    },
    async callOpenRouterEmbeddings(options) {
      params.embeddingInputs?.push(options.input);
      return {
        embeddings: params.embeddings ?? options.input.map((_, index) => {
          const vector = new Array(options.input.length).fill(0);
          vector[index] = 1;
          return vector;
        }),
        responseBody: {},
      };
    },
    legacyTrim(value: unknown) {
      return typeof value === 'string' ? value.trim() : '';
    },
    async upsertPackage() {
      return {};
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
      async findOneAsync() {
        return params.tdf;
      },
      async upsertAsync(_selector, document) {
        params.upserted?.push(document);
      },
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

function tdfWithDisplay(display: Record<string, any>) {
  return {
    _id: 'tdf-a',
    tdfFileName: 'lesson_tdf.json',
    stimuliSetId: 7,
    content: {
      tdfs: {
        tutor: {
          setspec: {},
          unit: [{}],
        },
      },
    },
    rawStimuliFile: {
      setspec: {
        clusters: [{
          clusterKC: 'kc-e1',
          stims: [{ text: 'Do not use this cluster text for E1.' }],
        }, {
          clusterKC: 'kc-e2',
          stims: [{ text: 'Do not use this cluster text for E2.' }],
        }, {
          clusterKC: 'kc-unrelated',
          stims: [{ text: 'Unrelated non-expectation cluster.' }],
        }],
        sparcPages: [{
          pageId: 'page-a',
          display,
        }],
      },
    },
  };
}

function uploadedTdfFile(): UploadedPackageFile {
  return {
    name: 'lesson_tdf.json',
    path: 'lesson_tdf.json',
    extension: 'json',
    contents: {},
    packageFile: 'package.zip',
    type: 'tdf',
  };
}

function graphFacts(display: Record<string, any>): Record<string, any>[] {
  return (display.workingMemoryFacts as Record<string, any>[]).filter((fact) => (
    fact.factType === 'kcGraph.node' || fact.factType === 'kcGraph.relationship'
  ));
}

describe('packageUploadPostProcess SPARC AutoTutor graph generation', function() {
  it('generates an expectation-scoped KC graph when workingMemoryFacts is missing', async function() {
    const display = {
      unitType: 'sparc-autotutor-dialogue',
      autoTutorTargets: {
        expectations: [{
          clusterKC: 'kc-e1',
          text: 'Expectation one text.',
        }, {
          clusterKC: 'kc-e2',
          text: 'Expectation two text.',
        }],
        misconceptions: [],
      },
    };
    const tdf = tdfWithDisplay(display);
    const upserted: Record<string, any>[] = [];
    const embeddingInputs: string[][] = [];

    await postProcessUploadedTdfs({
      unzippedFiles: [uploadedTdfFile()],
      deps: packageDeps({ tdf, upserted, embeddingInputs }),
      state: packageState(),
    });

    assert.deepEqual(embeddingInputs, [[
      'Expectation one text.',
      'Expectation two text.',
    ]]);
    const facts = graphFacts(display);
    assert.deepEqual(
      facts.filter((fact) => fact.factType === 'kcGraph.node')
        .map((fact) => fact.slots.clusterKC)
        .sort(),
      ['kc-e1', 'kc-e2'],
    );
    assert.deepEqual(
      facts.filter((fact) => fact.factType === 'kcGraph.relationship')
        .map((fact) => `${fact.slots.sourceClusterKC}->${fact.slots.targetClusterKC}`)
        .sort(),
      ['kc-e1->kc-e2', 'kc-e2->kc-e1'],
    );
    assert.equal(upserted.length, 1);
  });

  it('regenerates stale or partial KC graph facts for the expectation set', async function() {
    const display = {
      unitType: 'sparc-autotutor-dialogue',
      workingMemoryFacts: [{
        factType: 'kcGraph.node',
        slots: {
          clusterKC: 'kc-e1',
          description: 'Stale node',
          centrality: 0,
        },
      }, {
        factType: 'kcGraph.relationship',
        slots: {
          sourceClusterKC: 'kc-e1',
          targetClusterKC: 'kc-old',
          strength: 1,
        },
      }, {
        factType: 'dialogue.thresholds',
        slots: {
          coverageThreshold: 0.8,
        },
      }],
      autoTutorTargets: {
        expectations: [{
          clusterKC: 'kc-e1',
          text: 'Expectation one text.',
        }, {
          clusterKC: 'kc-e2',
          text: 'Expectation two text.',
        }],
        misconceptions: [],
      },
    };
    const tdf = tdfWithDisplay(display);

    await postProcessUploadedTdfs({
      unzippedFiles: [uploadedTdfFile()],
      deps: packageDeps({ tdf }),
      state: packageState(),
    });

    assert.deepEqual(
      graphFacts(display)
        .filter((fact: Record<string, any>) => fact.factType === 'kcGraph.relationship')
        .map((fact: Record<string, any>) => `${fact.slots.sourceClusterKC}->${fact.slots.targetClusterKC}`)
        .sort(),
      ['kc-e1->kc-e2', 'kc-e2->kc-e1'],
    );
    assert.equal(
      display.workingMemoryFacts.some((fact: Record<string, any>) => (
        fact.factType === 'dialogue.thresholds'
      )),
      true,
    );
  });
});
