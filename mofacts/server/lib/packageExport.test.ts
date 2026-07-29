import { strict as assert } from 'node:assert';

import { getOrBuildCurrentPackageAsset } from './packageExport';

const JSZip = require('jszip');

function tdfDoc(id: string, lessonName: string, options: { conditions?: string[]; conditionTdfIds?: string[] } = {}) {
  return {
    _id: id,
    ownerId: 'owner-1',
    stimuliSetId: `${id}-stim-set`,
    rawStimuliFile: { setspec: { clusters: [] } },
    content: {
      fileName: `${id}.json`,
      tdfs: {
        tutor: {
          setspec: {
            lessonname: lessonName,
            stimulusfile: 'shared-stims.json',
            ...(options.conditions ? { condition: options.conditions } : {}),
            ...(options.conditionTdfIds ? { conditionTdfIds: options.conditionTdfIds } : {}),
          },
          ...(options.conditions ? {} : { unit: [{}] }),
        },
      },
    },
  };
}

describe('packageExport identity', function() {
  it('exports stable TDF ids and rewrites root condition filenames to exported members', async function() {
    const root = tdfDoc('root-id', 'Root Lesson', {
      conditions: ['child-id.json'],
      conditionTdfIds: ['child-id'],
    });
    const child = tdfDoc('child-id', 'Child Lesson');
    const docs = [root, child];
    let zipBuffer: Buffer | null = null;

    await getOrBuildCurrentPackageAsset('root-id', {
      parseLocalMediaReference() {
        return { raw: '', isExternal: false };
      },
      extractSrcFromHtml() {
        return [];
      },
      getStimuliSetIdCandidates(value: any) {
        return value == null ? [] : [value];
      },
      async findDynamicAssetsScopedBatch() {
        return [];
      },
      normalizeCanonicalId(value: unknown) {
        return typeof value === 'string' && value.trim() ? value.trim() : null;
      },
      decryptData(value: string) {
        return value;
      },
      DynamicAssets: {
        async findOneAsync() {
          return null;
        },
        async writeAsync(data: Buffer) {
          zipBuffer = data;
          return { _id: 'export-asset', link: () => '/export.zip' };
        },
        async removeAsync() {},
        link() {
          return '/export.zip';
        },
      },
      storageBoundary: { backend: 'local' },
      Tdfs: {
        async findOneAsync(selector: any) {
          return docs.find((doc) => doc._id === selector._id) || null;
        },
        find(selector: any) {
          return {
            async fetchAsync() {
              return selector?._id?.$in ? docs.filter((doc) => selector._id.$in.includes(doc._id)) : [];
            },
          };
        },
        async updateAsync() {},
      },
    } as any);

    assert.ok(zipBuffer);
    const zip = await JSZip.loadAsync(zipBuffer!);
    const rootExport = JSON.parse(await zip.file('Root Lesson.json').async('string'));
    const childExport = JSON.parse(await zip.file('Child Lesson.json').async('string'));
    assert.equal(rootExport.tdfId, 'root-id');
    assert.equal(childExport.tdfId, 'child-id');
    assert.deepEqual(rootExport.tutor.setspec.conditionTdfIds, ['child-id']);
    assert.deepEqual(rootExport.tutor.setspec.condition, ['Child Lesson.json']);
    assert.ok(zip.file('shared-stims.json'));
  });
});
