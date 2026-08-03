import { expect } from 'chai';
import * as path from 'path';
import {
  DYNAMIC_ASSET_LOCAL_PATH_MIGRATION_KEY,
  getCanonicalDynamicAssetLocalPath,
  migrateDynamicAssetLocalPaths,
} from './migrate_dynamic_asset_local_paths';

function createHarness(records: any[], storageRoot = path.resolve('/srv/dynamic-assets')) {
  let migrationState: any = null;
  const updates: any[] = [];
  const logs: any[] = [];
  const readable = new Set(records.map((record) =>
    getCanonicalDynamicAssetLocalPath(record, storageRoot)
  ));

  return {
    storageRoot,
    updates,
    logs,
    get migrationState() { return migrationState; },
    deps: {
      DynamicAssets: {
        collection: {
          find(selector: any) {
            const after = selector?._id?.$gt;
            const selected = records
              .filter((record) => after == null || record._id > after)
              .sort((left, right) => left._id.localeCompare(right._id))
              .slice(0, 100);
            return { async fetchAsync() { return selected; } };
          },
          async updateAsync(selector: any, modifier: any) {
            updates.push({ selector, modifier });
            return 1;
          },
        },
      },
      DynamicSettings: {
        async findOneAsync(selector: any) {
          expect(selector).to.deep.equal({ key: DYNAMIC_ASSET_LOCAL_PATH_MIGRATION_KEY });
          return migrationState;
        },
        async upsertAsync(_selector: any, modifier: any) {
          migrationState = { value: modifier.$set.value };
        },
      },
      serverConsole(...args: any[]) { logs.push(args); },
      storageBackend: 'local' as const,
      storageRoot,
      async verifyReadableFile(filePath: string) {
        if (!readable.has(filePath)) throw new Error('missing file');
      },
    },
  };
}

describe('dynamic asset local path migration', function() {
  it('derives the local file from durable asset id and extension', function() {
    expect(getCanonicalDynamicAssetLocalPath({
      _id: 'asset-1',
      extension: 'webp',
    }, path.resolve('/srv/dynamic-assets'))).to.equal(
      path.resolve('/srv/dynamic-assets', 'asset-1.webp')
    );
  });

  it('updates every FilesCollection path field and records completion', async function() {
    const harness = createHarness([{
      _id: 'asset-1',
      extension: 'webp',
      path: 'C:\\old\\dynamic-assets\\asset-1.webp',
      _storagePath: 'C:\\old\\dynamic-assets',
      versions: { original: { path: 'C:\\old\\dynamic-assets\\asset-1.webp' } },
    }]);

    const result = await migrateDynamicAssetLocalPaths(harness.deps);

    expect(harness.updates).to.have.length(1);
    expect(harness.updates[0].modifier).to.deep.equal({
      $set: {
        path: path.resolve(harness.storageRoot, 'asset-1.webp'),
        'versions.original.path': path.resolve(harness.storageRoot, 'asset-1.webp'),
        _storagePath: harness.storageRoot,
      },
    });
    expect(result).to.include({ scanned: 1, updated: 1, unresolved: 0 });
    expect(result?.completedAt).to.be.a('string');
  });

  it('does not rewrite a record when the canonical file is unavailable', async function() {
    const harness = createHarness([{
      _id: 'asset-1',
      extension: 'webp',
      path: 'C:\\old\\dynamic-assets\\asset-1.webp',
      versions: { original: { path: 'C:\\old\\dynamic-assets\\asset-1.webp' } },
    }]);
    harness.deps.verifyReadableFile = async () => { throw new Error('missing file'); };

    const result = await migrateDynamicAssetLocalPaths(harness.deps);

    expect(harness.updates).to.have.length(0);
    expect(result).to.include({ scanned: 1, updated: 0, unresolved: 1, lastId: null });
    expect(result?.completedAt).to.equal(undefined);
  });

  it('runs again when the configured local storage root changes', async function() {
    const record = {
      _id: 'asset-1',
      extension: 'webp',
      path: '/old-root/asset-1.webp',
      _storagePath: '/old-root',
      versions: { original: { path: '/old-root/asset-1.webp' } },
    };
    const harness = createHarness([record], path.resolve('/new-root'));
    (harness as any).deps.DynamicSettings.findOneAsync = async () => ({
      value: {
        storageRoot: path.resolve('/old-root'),
        lastId: null,
        scanned: 1,
        updated: 1,
        unresolved: 0,
        skippedS3: 0,
        completedAt: new Date().toISOString(),
      },
    });

    const result = await migrateDynamicAssetLocalPaths(harness.deps);

    expect(harness.updates).to.have.length(1);
    expect(result).to.include({ storageRoot: path.resolve('/new-root'), scanned: 1, updated: 1 });
  });
});
