import * as fs from 'fs';
import * as path from 'path';

type UnknownRecord = Record<string, unknown>;

type DynamicAssetRecord = {
  _id: unknown;
  extension?: unknown;
  ext?: unknown;
  path?: unknown;
  _storagePath?: unknown;
  meta?: { storageBackend?: unknown };
  versions?: { original?: { path?: unknown } };
};

type MigrationState = {
  storageRoot: string;
  lastId: unknown;
  scanned: number;
  updated: number;
  unresolved: number;
  skippedS3: number;
  completedAt?: string;
};

type MigrationDeps = {
  DynamicAssets: {
    collection: {
      find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<DynamicAssetRecord[]> };
      updateAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
    };
  };
  DynamicSettings: {
    findOneAsync: (selector: UnknownRecord) => Promise<{ value?: Partial<MigrationState> } | null>;
    upsertAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
  };
  serverConsole: (...args: unknown[]) => void;
  storageBackend: 'local' | 's3';
  storageRoot: string;
  verifyReadableFile?: (filePath: string) => Promise<void>;
};

const MIGRATION_KEY = 'migration.dynamicAssetLocalPaths.v1';
const BATCH_SIZE = 100;
const MAX_ASSETS_PER_STARTUP = 5000;
const SAFE_ASSET_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_EXTENSION = /^[A-Za-z0-9]+$/;

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getCanonicalDynamicAssetLocalPath(asset: DynamicAssetRecord, storageRoot: string): string {
  const assetId = normalizeString(asset._id);
  const extension = normalizeString(asset.extension || asset.ext).replace(/^\./, '');
  if (!SAFE_ASSET_ID.test(assetId)) {
    throw new Error(`Dynamic asset id "${assetId}" is not a safe local filename`);
  }
  if (!SAFE_EXTENSION.test(extension)) {
    throw new Error(`Dynamic asset ${assetId} extension "${extension}" is not a safe local filename extension`);
  }

  const resolvedRoot = path.resolve(storageRoot);
  const candidate = path.resolve(resolvedRoot, `${assetId}.${extension}`);
  if (path.dirname(candidate) !== resolvedRoot) {
    throw new Error(`Dynamic asset ${assetId} resolved outside local storage root`);
  }
  return candidate;
}

function hasCanonicalPaths(asset: DynamicAssetRecord, storageRoot: string, canonicalPath: string): boolean {
  return normalizeString(asset.path) === canonicalPath
    && normalizeString(asset.versions?.original?.path) === canonicalPath
    && normalizeString(asset._storagePath) === storageRoot;
}

function initialState(storageRoot: string): MigrationState {
  return {
    storageRoot,
    lastId: null,
    scanned: 0,
    updated: 0,
    unresolved: 0,
    skippedS3: 0,
  };
}

async function saveState(deps: MigrationDeps, state: MigrationState): Promise<void> {
  await deps.DynamicSettings.upsertAsync(
    { key: MIGRATION_KEY },
    { $set: { value: state } },
  );
}

export async function migrateDynamicAssetLocalPaths(deps: MigrationDeps): Promise<MigrationState | null> {
  if (deps.storageBackend !== 'local') {
    deps.serverConsole('[Dynamic asset path migration] skipped for S3 storage');
    return null;
  }

  const storageRoot = path.resolve(deps.storageRoot);
  const previous = await deps.DynamicSettings.findOneAsync({ key: MIGRATION_KEY });
  if (previous?.value?.completedAt && previous.value.storageRoot === storageRoot) {
    return previous.value as MigrationState;
  }

  let state = initialState(storageRoot);
  if (previous?.value?.storageRoot === storageRoot) {
    const { completedAt: _completedAt, ...resumableState } = previous.value;
    state = {
      ...state,
      ...resumableState,
      storageRoot,
    };
  }
  const verifyReadableFile = deps.verifyReadableFile || (async (filePath: string) => {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      throw new Error('not a regular file');
    }
    await fs.promises.access(filePath, fs.constants.R_OK);
  });
  let processedThisStartup = 0;
  let reachedEnd = false;

  while (processedThisStartup < MAX_ASSETS_PER_STARTUP) {
    const assets = await deps.DynamicAssets.collection.find(
      state.lastId === null ? {} : { _id: { $gt: state.lastId } },
      {
        fields: {
          _id: 1,
          extension: 1,
          ext: 1,
          path: 1,
          _storagePath: 1,
          'meta.storageBackend': 1,
          'versions.original.path': 1,
        },
        sort: { _id: 1 },
        limit: BATCH_SIZE,
      },
    ).fetchAsync();

    if (assets.length === 0) {
      reachedEnd = true;
      break;
    }

    for (const asset of assets) {
      state.scanned += 1;
      processedThisStartup += 1;
      state.lastId = asset._id;

      if (asset.meta?.storageBackend === 's3') {
        state.skippedS3 += 1;
        continue;
      }

      try {
        const canonicalPath = getCanonicalDynamicAssetLocalPath(asset, storageRoot);
        if (hasCanonicalPaths(asset, storageRoot, canonicalPath)) {
          continue;
        }
        await verifyReadableFile(canonicalPath);
        const changed = await deps.DynamicAssets.collection.updateAsync(
          {
            _id: asset._id,
            path: asset.path,
            'versions.original.path': asset.versions?.original?.path,
          },
          {
            $set: {
              path: canonicalPath,
              'versions.original.path': canonicalPath,
              _storagePath: storageRoot,
            },
          },
        );
        if (changed !== 1) {
          throw new Error('record changed concurrently');
        }
        state.updated += 1;
      } catch (error: unknown) {
        state.unresolved += 1;
        deps.serverConsole('[Dynamic asset path migration] unresolved asset', {
          assetId: normalizeString(asset._id),
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await saveState(deps, state);
    deps.serverConsole('[Dynamic asset path migration] progress', {
      scanned: state.scanned,
      updated: state.updated,
      unresolved: state.unresolved,
      skippedS3: state.skippedS3,
      storageRoot,
    });
  }

  if (!reachedEnd) {
    await saveState(deps, state);
    deps.serverConsole('[Dynamic asset path migration] paused', state);
    return state;
  }

  if (state.unresolved > 0) {
    const incomplete = { ...state, lastId: null };
    await saveState(deps, incomplete);
    deps.serverConsole('[Dynamic asset path migration] incomplete', incomplete);
    return incomplete;
  }

  const completed: MigrationState = {
    ...state,
    lastId: null,
    completedAt: new Date().toISOString(),
  };
  await saveState(deps, completed);
  deps.serverConsole('[Dynamic asset path migration] complete', completed);
  return completed;
}

export const DYNAMIC_ASSET_LOCAL_PATH_MIGRATION_KEY = MIGRATION_KEY;
