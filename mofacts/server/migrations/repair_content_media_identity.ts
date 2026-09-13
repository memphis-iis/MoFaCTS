import { contentMediaStimuliSetId } from '../../common/fileUploadPolicy';

type RecordValue = Record<string, unknown>;
type Asset = {
  _id: string;
  name?: string;
  meta?: { uploadPurpose?: string; tdfId?: string; stimuliSetId?: unknown };
};
type State = {
  lastId: string | null;
  scanned: number;
  updated: number;
  unresolved: number;
  completedAt?: string;
};
type Deps = {
  DynamicAssets: { collection: {
    find: (selector: RecordValue, options?: RecordValue) => { fetchAsync: () => Promise<Asset[]> };
    updateAsync: (selector: RecordValue, modifier: RecordValue) => Promise<unknown>;
  } };
  Tdfs: { find: (selector: RecordValue, options?: RecordValue) => {
    fetchAsync: () => Promise<Array<{ _id: string; stimuliSetId?: unknown }>>;
  } };
  DynamicSettings: {
    findOneAsync: (selector: RecordValue) => Promise<{ value?: State } | null>;
    upsertAsync: (selector: RecordValue, modifier: RecordValue) => Promise<unknown>;
  };
  AuditLog: { upsertAsync: (selector: RecordValue, modifier: RecordValue) => Promise<unknown> };
  serverConsole: (...args: unknown[]) => void;
};

export const CONTENT_MEDIA_IDENTITY_REPAIR_KEY = 'migration.contentMediaIdentity.v1';
const BATCH_SIZE = 100;
const MAX_ASSETS_PER_STARTUP = 5000;

/**
 * Correct only the separate-media uploader's type mismatch. TDFs, package media,
 * filenames, asset IDs and bytes are unchanged. A recorded TDF link and identical
 * textual value are required; another lesson or a missing link is never guessed.
 * Audit write intents preserve exact before/after values for reviewed rollback.
 */
export async function repairContentMediaIdentity(deps: Deps): Promise<State> {
  const previous = await deps.DynamicSettings.findOneAsync({ key: CONTENT_MEDIA_IDENTITY_REPAIR_KEY });
  if (previous?.value?.completedAt) return previous.value;
  const state: State = previous?.value
    ? { ...previous.value }
    : { lastId: null, scanned: 0, updated: 0, unresolved: 0 };
  let processed = 0;
  while (processed < MAX_ASSETS_PER_STARTUP) {
    // Scan bounded _id-indexed pages, including other purposes. No filtered full scan.
    const assets = await deps.DynamicAssets.collection.find(
      state.lastId === null ? {} : { _id: { $gt: state.lastId } },
      { fields: { _id: 1, name: 1, 'meta.uploadPurpose': 1, 'meta.tdfId': 1, 'meta.stimuliSetId': 1 },
        sort: { _id: 1 }, limit: BATCH_SIZE },
    ).fetchAsync();
    if (assets.length === 0) {
      state.completedAt = new Date().toISOString();
      break;
    }
    const media = assets.filter(asset => asset.meta?.uploadPurpose === 'content-media');
    const tdfIds = [...new Set(media.map(asset => asset.meta?.tdfId).filter((id): id is string => typeof id === 'string' && !!id))];
    const tdfs = tdfIds.length ? await deps.Tdfs.find(
      { _id: { $in: tdfIds } }, { fields: { _id: 1, stimuliSetId: 1 } },
    ).fetchAsync() : [];
    const byId = new Map(tdfs.map(tdf => [tdf._id, tdf]));
    for (const asset of assets) {
      if (asset.meta?.uploadPurpose === 'content-media') {
        const before = asset.meta.stimuliSetId;
        const after = contentMediaStimuliSetId(byId.get(asset.meta.tdfId || ''));
        let issue = '';
        if (after === null || contentMediaStimuliSetId(asset.meta) === null) {
          issue = 'Missing or invalid recorded lesson/media identity';
        } else if (before !== after) {
          if (String(before) !== String(after)) {
            issue = 'Recorded media identity no longer matches the linked lesson';
          } else if (!asset.name) {
            issue = 'Missing asset name; cannot check for an existing media collision';
          } else {
            const conflicts = await deps.DynamicAssets.collection.find(
              { _id: { $ne: asset._id }, name: asset.name, 'meta.stimuliSetId': after },
              { fields: { _id: 1 }, limit: 1 },
            ).fetchAsync();
            if (conflicts.length) {
              issue = 'A same-name asset already exists under the lesson identity';
            } else {
              // Journal before the conditional write. A crash can leave an intent;
              // rollback must compare the current asset with these exact values.
              await deps.AuditLog.upsertAsync(
                { _id: `${CONTENT_MEDIA_IDENTITY_REPAIR_KEY}:${asset._id}` },
                { $setOnInsert: {
                  action: 'content-media-identity-repair', actorUserId: null, targetUserId: null,
                  createdAt: new Date(),
                  details: { migration: CONTENT_MEDIA_IDENTITY_REPAIR_KEY, assetId: asset._id,
                    tdfId: asset.meta.tdfId, before, after, writeIntent: true },
                } },
              );
              const changed = await deps.DynamicAssets.collection.updateAsync(
                { _id: asset._id, name: asset.name, 'meta.uploadPurpose': 'content-media',
                  'meta.tdfId': asset.meta.tdfId, 'meta.stimuliSetId': before },
                { $set: { 'meta.stimuliSetId': after } },
              );
              if (changed === 1) state.updated += 1;
              else issue = 'Asset changed concurrently; no repair applied';
            }
          }
        }
        if (issue) {
          state.unresolved += 1;
          deps.serverConsole('[Content media identity repair] unresolved', { assetId: asset._id, reason: issue });
        }
      }
      state.scanned += 1;
      state.lastId = asset._id;
      processed += 1;
    }
    await deps.DynamicSettings.upsertAsync(
      { key: CONTENT_MEDIA_IDENTITY_REPAIR_KEY }, { $set: { value: state } },
    );
    deps.serverConsole('[Content media identity repair] progress', { ...state });
  }
  await deps.DynamicSettings.upsertAsync(
    { key: CONTENT_MEDIA_IDENTITY_REPAIR_KEY }, { $set: { value: state } },
  );
  deps.serverConsole('[Content media identity repair] scan status', {
    ...state, pending: !state.completedAt, needsReview: state.unresolved > 0,
  });
  return state;
}
