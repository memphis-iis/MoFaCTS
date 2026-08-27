import { strict as assert } from 'node:assert';

import type { UploadedPackageFile } from './packageParser';
import { preflightPackageTdfIdentities } from './packageTdfIdentity';

function tdfFile(name: string, options: {
  tdfId?: unknown;
  conditions?: string[];
  conditionTdfIds?: Array<string | null>;
  experimentTarget?: string;
} = {}): UploadedPackageFile {
  return {
    name,
    path: name,
    extension: 'json',
    packageFile: 'package.zip',
    type: 'tdf',
    contents: {
      ...(Object.prototype.hasOwnProperty.call(options, 'tdfId') ? { tdfId: options.tdfId } : {}),
      tutor: {
        setspec: {
          lessonname: name.replace('.json', ''),
          stimulusfile: 'stims.json',
          ...(options.conditions ? { condition: options.conditions } : {}),
          ...(options.conditionTdfIds ? { conditionTdfIds: options.conditionTdfIds } : {}),
          ...(options.experimentTarget ? { experimentTarget: options.experimentTarget } : {}),
        },
        ...(options.conditions ? {} : { unit: [{}] }),
      },
    },
  };
}

function packageFiles(...tdfs: UploadedPackageFile[]): UploadedPackageFile[] {
  return [
    ...tdfs,
    {
      name: 'stims.json',
      path: 'stims.json',
      extension: 'json',
      packageFile: 'package.zip',
      type: 'stim',
      contents: { setspec: { clusters: [] } },
    },
  ];
}

function deps(existing: any[] = [], manageable = true) {
  return {
    Tdfs: {
      find(selector: any) {
        return {
          async fetchAsync() {
            if (selector?._id?.$in) {
              return existing.filter((doc) => selector._id.$in.includes(doc._id));
            }
            const targets = selector?.['content.tdfs.tutor.setspec.experimentTarget']?.$in;
            if (targets) {
              return existing.filter((doc) => targets.includes(doc?.content?.tdfs?.tutor?.setspec?.experimentTarget));
            }
            const names = [
              ...(selector?.$or?.[0]?.['content.fileName']?.$in || []),
              ...(selector?.$or?.[1]?.tdfFileName?.$in || []),
            ];
            return existing.filter((doc) => names.includes(doc?.content?.fileName) || names.includes(doc?.tdfFileName));
          },
        };
      },
      async findOneAsync(selector: any) {
        return existing.find((doc) => doc._id === selector._id) || null;
      },
    },
    async userCanManageTdf() {
      return manageable;
    },
  };
}

describe('packageTdfIdentity', function() {
  it('creates an id-less TDF without consulting a colliding filename', async function() {
    const plan = await preflightPackageTdfIdentities({
      unzippedFiles: packageFiles(tdfFile('AllConditionsRoot.json')),
      packageAssetId: 'asset-1',
      ownerId: 'owner-1',
      deps: deps([{ _id: 'old-id', content: { fileName: 'AllConditionsRoot.json' } }]),
    });

    assert.equal(plan.updates.length, 0);
    assert.equal(plan.entries[0]?.action, 'create');
    assert.match(plan.entries[0]?.tdfId || '', /^tdf_[a-f0-9]{24}$/);
  });

  it('updates an exact manageable tdfId and preserves an unused portable id for creation', async function() {
    const existing = { _id: 'known-id', ownerId: 'owner-1', stimuliSetId: 9, content: { fileName: 'old.json' } };
    const updatePlan = await preflightPackageTdfIdentities({
      unzippedFiles: packageFiles(tdfFile('renamed.json', { tdfId: 'known-id' })),
      packageAssetId: 'asset-2',
      ownerId: 'owner-1',
      deps: deps([existing]),
    });
    const createPlan = await preflightPackageTdfIdentities({
      unzippedFiles: packageFiles(tdfFile('portable.json', { tdfId: 'portable-id' })),
      packageAssetId: 'asset-3',
      ownerId: 'owner-1',
      deps: deps([]),
    });

    assert.equal(updatePlan.entries[0]?.action, 'update');
    assert.equal(updatePlan.entries[0]?.tdfId, 'known-id');
    assert.equal(createPlan.entries[0]?.action, 'create');
    assert.equal(createPlan.entries[0]?.tdfId, 'portable-id');
  });

  it('rejects unauthorized, malformed, and duplicate ids before persistence', async function() {
    await assert.rejects(() => preflightPackageTdfIdentities({
      unzippedFiles: packageFiles(tdfFile('foreign.json', { tdfId: 'foreign-id' })),
      packageAssetId: 'asset-4',
      ownerId: 'owner-1',
      deps: deps([{ _id: 'foreign-id', ownerId: 'owner-2' }], false),
    }), /cannot manage/);

    await assert.rejects(() => preflightPackageTdfIdentities({
      unzippedFiles: packageFiles(tdfFile('invalid.json', { tdfId: 'not valid' })),
      packageAssetId: 'asset-5',
      ownerId: 'owner-1',
      deps: deps([]),
    }), /invalid tdfId/);

    await assert.rejects(() => preflightPackageTdfIdentities({
      unzippedFiles: packageFiles(
        tdfFile('one.json', { tdfId: 'same-id' }),
        tdfFile('two.json', { tdfId: 'same-id' })
      ),
      packageAssetId: 'asset-6',
      ownerId: 'owner-1',
      deps: deps([]),
    }), /duplicate tdfId/);
  });

  it('resolves packaged conditions by allocated ids and rejects inconsistent explicit mappings', async function() {
    const plan = await preflightPackageTdfIdentities({
      unzippedFiles: packageFiles(
        tdfFile('root.json', { conditions: ['child.json'] }),
        tdfFile('child.json'),
      ),
      packageAssetId: 'asset-7',
      ownerId: 'owner-1',
      deps: deps([]),
    });
    const childId = plan.entries.find((entry) => entry.fileName === 'child.json')?.tdfId;
    assert.deepEqual(plan.entries.find((entry) => entry.fileName === 'root.json')?.conditionTdfIds, [childId]);

    await assert.rejects(() => preflightPackageTdfIdentities({
      unzippedFiles: packageFiles(
        tdfFile('root.json', { conditions: ['child.json'], conditionTdfIds: ['different-id'] }),
        tdfFile('child.json', { tdfId: 'child-id' }),
        tdfFile('different-child.json', { tdfId: 'different-id' }),
      ),
      packageAssetId: 'asset-8',
      ownerId: 'owner-1',
      deps: deps([
        { _id: 'child-id', ownerId: 'owner-1' },
        { _id: 'different-id', ownerId: 'owner-1' },
      ]),
    }), (error: any) => error?.error === 'condition-identity-mismatch');

    await assert.rejects(() => preflightPackageTdfIdentities({
      unzippedFiles: packageFiles(tdfFile('root.json', { conditions: ['missing.json'] })),
      packageAssetId: 'asset-9',
      ownerId: 'owner-1',
      deps: deps([{ _id: 'unrelated-child', content: { fileName: 'missing.json' } }]),
    }), /child is not in the package/);
  });

  it('rekeys every TDF and remaps condition ids when importing as a copy', async function() {
    const children = ['typed-adaptive', 'choice-adaptive', 'typed-fixed', 'choice-fixed'];
    const plan = await preflightPackageTdfIdentities({
      unzippedFiles: packageFiles(
        tdfFile('root.json', {
          tdfId: 'root-existing',
          conditions: children.map((name) => `${name}.json`),
          conditionTdfIds: children.map((name) => `${name}-existing`),
        }),
        ...children.map((name) => tdfFile(`${name}.json`, { tdfId: `${name}-existing` })),
      ),
      packageAssetId: 'asset-copy',
      ownerId: 'owner-1',
      identityMode: 'copy',
      deps: deps([
        { _id: 'root-existing', ownerId: 'owner-1' },
        ...children.map((name) => ({ _id: `${name}-existing`, ownerId: 'owner-1' })),
      ]),
    });
    const root = plan.entries.find((entry) => entry.fileName === 'root.json')!;
    const copiedChildren = children.map((name) => plan.entries.find((entry) => entry.fileName === `${name}.json`)!);
    assert.equal(plan.updates.length, 0);
    assert.notEqual(root.tdfId, 'root-existing');
    copiedChildren.forEach((child, index) => assert.notEqual(child.tdfId, `${children[index]}-existing`));
    assert.deepEqual(root.conditionTdfIds, copiedChildren.map((child) => child.tdfId));

    await assert.rejects(() => preflightPackageTdfIdentities({
      unzippedFiles: packageFiles(
        tdfFile('copy-one.json', { tdfId: 'duplicate-source-id' }),
        tdfFile('copy-two.json', { tdfId: 'duplicate-source-id' }),
      ),
      packageAssetId: 'asset-copy-duplicate',
      ownerId: 'owner-1',
      identityMode: 'copy',
      deps: deps([]),
    }), /duplicate tdfId/);
  });

  it('rejects case-insensitive duplicate package names and ambiguous experiment targets', async function() {
    await assert.rejects(() => preflightPackageTdfIdentities({
      unzippedFiles: packageFiles(tdfFile('Lesson.json'), tdfFile('lesson.JSON')),
      packageAssetId: 'asset-names',
      ownerId: 'owner-1',
      deps: deps([]),
    }), /more than one entry named/i);

    await assert.rejects(() => preflightPackageTdfIdentities({
      unzippedFiles: packageFiles(tdfFile('demo.json', { tdfId: 'new-demo', experimentTarget: 'public-demo' })),
      packageAssetId: 'asset-target',
      ownerId: 'owner-1',
      deps: deps([{
        _id: 'existing-demo',
        tdfAvailability: 'available',
        content: { tdfs: { tutor: { setspec: { experimentTarget: 'public-demo' } } } },
      }]),
    }), (error: any) => error?.error === 'ambiguous-experiment-target');
  });
});
