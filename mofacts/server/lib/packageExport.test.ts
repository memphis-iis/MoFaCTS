import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { strict as assert } from 'node:assert';

import { getOrBuildCurrentPackageAsset, collectKnownPackageMediaReferences, rewriteKnownMediaReferencesForPackageExport } from './packageExport';

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
  it('round-trips simulation HTML, JSON catalog and source attachments with launch parameters', () => {
    const payload = { atomType: 'simulation', simulation: { asset: { url: '/dynamic-assets/html/sim.html?accessibility', sha256: '0'.repeat(64),
      catalog: { url: '/dynamic-assets/catalog/sim.catalog.json', sha256: '1'.repeat(64) },
      attachments: [{ url: '/dynamic-assets/source/sim-source.zip', sha256: '2'.repeat(64) }] } } };
    const deps = { parseLocalMediaReference: (raw: string) => ({ raw, isExternal: false, assetId: raw.split('/')[2], fileName: raw.split('/').at(-1)!.split('?')[0], isLocalMediaLike: false }) } as any;
    assert.deepEqual([...collectKnownPackageMediaReferences(payload, deps)], ['/dynamic-assets/html/sim.html?accessibility', '/dynamic-assets/catalog/sim.catalog.json', '/dynamic-assets/source/sim-source.zip']);
    rewriteKnownMediaReferencesForPackageExport(payload, deps);
    assert.equal(payload.simulation.asset.url, 'sim.html?accessibility');
    assert.equal(payload.simulation.asset.catalog.url, 'sim.catalog.json');
    assert.equal(payload.simulation.asset.attachments[0]!.url, 'sim-source.zip');
  });
  it('exports stable TDF ids and rewrites root condition filenames to exported members', async function() {
    const root = tdfDoc('root-id', 'Root Lesson', {
      conditions: ['child-id.json'],
      conditionTdfIds: ['child-id'],
    });
    const child = tdfDoc('child-id', 'Child Lesson');
    const suppliedFacts = [
      { factType: 'dialogue.graduation', slots: { requiredTargetCount: 1 } },
      { factType: 'kcGraph.node', slots: { clusterKC: 'kc-1', centrality: 0.6 } },
      { factType: 'kcGraph.relationship', slots: { strength: 0.6 } },
      { factType: 'kcGraph.chain', slots: { startingKC: 'kc-1', order: ['kc-1'] } },
    ];
    (root.rawStimuliFile.setspec as any).sparcPages = [{ display: { workingMemoryFacts: suppliedFacts } }];
    (child.rawStimuliFile.setspec as any).sparcPages = [{ display: { workingMemoryFacts: suppliedFacts } }];
    const clusters = [{ stims: [{ autoTutor: { id: 'script-1', expectationRelationships: { a: { b: 0.6 } },
      expectationRelationshipProvenance: { model: 'embedding-model' } } }] }];
    (root.rawStimuliFile.setspec as any).clusters = clusters;
    (child.rawStimuliFile.setspec as any).clusters = clusters;
    const docs = [root, child];
    let zipBuffer: Buffer | null = null;
    let storedAsset: any = null;
    let writes = 0;

    const directory = await mkdtemp(join(tmpdir(), 'mofacts-export-test-'));
    try {
    const dependencies = {
      storageRoot: directory,
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
        async findOneAsync(_selector: unknown, options?: { fields?: unknown }) {
          assert.equal(options?.fields, undefined, 'Cached download needs complete FilesCollection metadata');
          return storedAsset;
        },
        async addFile(filePath: string, options: any) {
          zipBuffer = await readFile(filePath); writes++;
          storedAsset = { _id: 'export-asset', name: options.fileName, meta: options.meta, _downloadRoute: '/cdn/storage', _collectionName: 'Assets' };
          return { _id: 'export-asset', link: () => '/export.zip' };
        },
        async removeAsync() {},
        link(file: any) {
          assert.equal(file._downloadRoute, '/cdn/storage');
          assert.equal(file._collectionName, 'Assets');
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
        async updateAsync(_selector: unknown, modifier: any) {
          for (const doc of docs) Object.assign(doc, modifier.$set);
        },
      },
    } as any;
    await getOrBuildCurrentPackageAsset('root-id', dependencies);
    const cached = await getOrBuildCurrentPackageAsset('root-id', dependencies);
    assert.equal(cached.reusedExisting, true);
    assert.equal(cached.link, '/export.zip');
    assert.equal(writes, 1);

    assert.ok(zipBuffer);
    const zip = await JSZip.loadAsync(zipBuffer!);
    const rootExport = JSON.parse(await zip.file('Root Lesson.json').async('string'));
    const childExport = JSON.parse(await zip.file('Child Lesson.json').async('string'));
    assert.equal(rootExport.tdfId, 'root-id');
    assert.equal(childExport.tdfId, 'child-id');
    assert.deepEqual(rootExport.tutor.setspec.conditionTdfIds, ['child-id']);
    assert.deepEqual(rootExport.tutor.setspec.condition, ['Child Lesson.json']);
    assert.ok(zip.file('shared-stims.json'));
    const stimuliExport = JSON.parse(await zip.file('shared-stims.json').async('string'));
    assert.deepEqual(stimuliExport.setspec.sparcPages[0].display.workingMemoryFacts, [suppliedFacts[0]]);
    assert.equal((root.rawStimuliFile.setspec as any).sparcPages[0].display.workingMemoryFacts.length, suppliedFacts.length);
    assert.deepEqual(stimuliExport.setspec.clusters[0].stims[0].autoTutor, { id: 'script-1' });
    assert.ok(clusters[0]!.stims[0]!.autoTutor.expectationRelationships);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
