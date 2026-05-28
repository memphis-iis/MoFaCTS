# Content Manager Query Audit

Date: 2026-05-28

## Runtime Index Creation

- `mofacts/server/serverComposition.ts:893` calls `runServerStartup(...)` during server startup.
- `mofacts/server/startup/serverStartup.ts:16` imports `createPerformanceIndexes`.
- `mofacts/server/startup/serverStartup.ts:271` defines `runServerStartup`.
- `mofacts/server/startup/serverStartup.ts:287` calls `await createPerformanceIndexes()` unconditionally after package asset backfill and before experiment-state index cleanup.
- The call is wrapped in a logged `try/catch`; a failed index build is visible in server logs and does not silently switch to a different path.

Conclusion: performance index creation is wired into the local/dev/server startup flow. No settings gate or environment condition was found that skips it.

## Current Data Flow

- Content manager route loads the `contentUpload` template through the router at `mofacts/client/lib/router.ts:858`.
- Ordinary table display calls `getContentUploadListIds` from `mofacts/client/views/experimentSetup/contentUpload.ts:718`.
- Visible row summaries are then loaded by `getContentUploadSummariesForIds` from `mofacts/client/views/experimentSetup/contentUpload.ts:759`.
- The list method only returns ids and a one-row lookahead count. Server selector/projection/sort/limit are in `mofacts/server/methods/contentMethods.ts:417`.
- The summary method reads compact TDF fields at `mofacts/server/methods/contentMethods.ts:202`. It excludes `stimuli`, `rawStimuliFile`, and full `content`.
- Summary condition and stimulus-file existence lookups are batched at `mofacts/server/methods/contentMethods.ts:250`.
- Summary asset counts are batched by `meta.stimuliSetId` aggregation at `mofacts/server/methods/contentMethods.ts:397`.
- Full content-manager details are lazy. Row expansion subscribes to `tdfForContentUploadDetails` at `mofacts/client/views/experimentSetup/contentUpload.ts:652`, and the publication includes full `stimuli`/`rawStimuliFile` at `mofacts/server/publications.ts:810`.
- Media lists are lazy. Clicking Manage Media subscribes to `assets` at `mofacts/client/views/experimentSetup/contentUpload.ts:673`; the client reads subscribed assets at `mofacts/client/views/experimentSetup/contentUpload.ts:438`.
- `files.assets.all` is not subscribed by the content manager ordinary table path. It is used by the editor and runtime paths at `mofacts/client/views/experimentSetup/contentEdit.ts:54` and `mofacts/client/lib/router.ts:1061`, `mofacts/client/lib/router.ts:1130`, `mofacts/client/lib/router.ts:1140`.

## Query Inventory

### Content Upload List

- Method: `getContentUploadListIds`, `mofacts/server/methods/contentMethods.ts:417`
- Selector: `{ $or: [{ ownerId: userId }, { 'accessors.userId': userId }] }`
- Projection: `{ _id: 1 }`
- Sort: `{ 'content.tdfs.tutor.setspec.lessonname': 1, _id: 1 }`
- Limit: `limit + 1`
- Reactivity: non-reactive method call, refreshed by client triggers
- Index coverage: `perf_owner_lessonname_id` and `perf_accessors_user_lessonname_id`

```javascript
db.tdfs.find(
  { $or: [{ ownerId: USER_ID }, { 'accessors.userId': USER_ID }] },
  { _id: 1 }
).sort({ 'content.tdfs.tutor.setspec.lessonname': 1, _id: 1 }).limit(LIMIT + 1).explain('executionStats')
```

### Content Upload Summaries

- Method: `getContentUploadSummariesForIds`, `mofacts/server/methods/contentMethods.ts:181`
- Selector: `{ _id: { $in: TDF_IDS } }`
- Projection: compact owner/package/setspec/unit stimulusfile fields at `mofacts/server/methods/contentMethods.ts:206`
- Sort: none; client preserves requested ids
- Limit: method rejects more than 200 ids
- Reactivity: non-reactive method call
- Index coverage: default `_id_`

```javascript
db.tdfs.find(
  { _id: { $in: TDF_IDS } },
  {
    _id: 1,
    ownerId: 1,
    packageFile: 1,
    packageAssetId: 1,
    stimuliSetId: 1,
    conditionCounts: 1,
    'content.fileName': 1,
    'content.tdfs.tutor.setspec.lessonname': 1,
    'content.tdfs.tutor.setspec.userselect': 1,
    'content.tdfs.tutor.setspec.textToSpeechAPIKey': 1,
    'content.tdfs.tutor.setspec.speechAPIKey': 1,
    'content.tdfs.tutor.setspec.openRouterApiKey': 1,
    'content.tdfs.tutor.setspec.condition': 1,
    'content.tdfs.tutor.setspec.conditionTdfIds': 1,
    'content.tdfs.tutor.setspec.stimulusfile': 1,
    'content.tdfs.tutor.unit.learningsession.stimulusfile': 1
  }
).explain('executionStats')
```

### Condition TDF Lookup

- Call path: `getContentUploadSummariesForIds` to `getTdfsByFileNameOrId`, `mofacts/server/methods/contentMethods.ts:250`
- Selector shape: `{ $or: [{ _id: { $in: KEYS } }, { 'content.fileName': { $in: KEYS } }] }`
- Projection: enough to resolve `_id` and `content.fileName`
- Index coverage: default `_id_`, `perf_fileName`

```javascript
db.tdfs.find(
  { $or: [{ _id: { $in: CONDITION_KEYS } }, { 'content.fileName': { $in: CONDITION_KEYS } }] },
  { _id: 1, 'content.fileName': 1 }
).explain('executionStats')
```

### Stim Lookup

- Call path: `getContentUploadSummariesForIds`, `mofacts/server/methods/contentMethods.ts:255`
- Selector: `{ 'meta.fileName': { $in: STIM_FILE_NAMES } }`
- Projection: `{ _id: 1, 'meta.fileName': 1 }`
- Index coverage: `perf_meta_fileName`

```javascript
db.stim_files.find(
  { 'meta.fileName': { $in: STIM_FILE_NAMES } },
  { _id: 1, 'meta.fileName': 1 }
).explain('executionStats')
```

### Summary Asset Counts

- Call path: `getAssetCountsByStimuliSetId`, `mofacts/server/methods/contentMethods.ts:397`
- Selector: `{ 'meta.stimuliSetId': { $in: STIMULI_SET_ID_CANDIDATES } }`
- Projection: aggregate group only
- Index coverage: `perf_stimuliSetId_id`

```javascript
db.Assets.aggregate([
  { $match: { 'meta.stimuliSetId': { $in: STIMULI_SET_ID_CANDIDATES } } },
  { $group: { _id: '$meta.stimuliSetId', count: { $sum: 1 } } }
], { explain: true })
```

### `assets` Publication Auth Lookup

- Publication: `assets`, `mofacts/server/publications.ts:434`
- TDF auth selector: `{ stimuliSetId: { $in: STIMULI_SET_ID_CANDIDATES } }`
- Projection: `{ ownerId: 1, accessors: 1 }`
- Index coverage: `perf_stimuliSetId`

```javascript
db.tdfs.find(
  { stimuliSetId: { $in: STIMULI_SET_ID_CANDIDATES } },
  { ownerId: 1, accessors: 1 }
).explain('executionStats')
```

### `assets` Publication Asset Lookup

- Publication: `assets`, `mofacts/server/publications.ts:479`
- Selector: `{ 'meta.stimuliSetId': { $in: STIMULI_SET_ID_CANDIDATES } }`
- Projection: `DYNAMIC_ASSET_PUBLICATION_FIELDS`, `mofacts/server/publications.ts:43`
- Index coverage: `perf_stimuliSetId_id`
- Reactivity: Meteor publication cursor

```javascript
db.Assets.find(
  { 'meta.stimuliSetId': { $in: STIMULI_SET_ID_CANDIDATES } },
  {
    _id: 1, name: 1, fileName: 1, type: 1, size: 1, uploadedAt: 1, userId: 1,
    path: 1, meta: 1, ext: 1, extension: 1, extensionWithDot: 1,
    isImage: 1, isAudio: 1, isVideo: 1, versions: 1
  }
).explain('executionStats')
```

### `files.assets.all` Publication

- Publication: `files.assets.all`, `mofacts/server/publications.ts:261`
- Ordinary content manager table: not used
- Editor/runtime use: `contentEdit` and card/instructions routes
- TDF selector varies by role. Admin: `{}`. Teacher: owner/shared/public/experimentTarget. Student: owner/shared/accessed/public plus optional experimentTarget.
- Accessible TDF projection: `{ stimuliSetId: 1, 'content.tdfs.tutor.setspec.condition': 1 }`
- Condition selector: `{ $or: [{ _id: { $in: CONDITION_REFS } }, { 'content.fileName': { $in: CONDITION_REFS } }] }`
- Asset selector: either `{ userId: userId }` or `{ $or: [{ userId: userId }, { 'meta.stimuliSetId': { $in: ACCESSIBLE_STIM_SET_IDS } }] }`
- Asset projection: `DYNAMIC_ASSET_PUBLICATION_FIELDS`
- Index coverage: role selectors use `perf_ownerId`, `perf_accessors_userId`, `perf_experimentTarget`, `perf_fileName`; asset query uses `perf_userId_name` prefix for `userId` and `perf_stimuliSetId_id`
- Risk: this publication is still broad for runtime/editor, but it is no longer in the content-manager table path and now sends a constrained file shape.

```javascript
db.tdfs.find(
  {
    $or: [
      { ownerId: USER_ID },
      { 'accessors.userId': USER_ID },
      { 'content.tdfs.tutor.setspec.userselect': 'true' },
      { 'content.tdfs.tutor.setspec.experimentTarget': { $exists: true, $ne: null } }
    ]
  },
  { stimuliSetId: 1, 'content.tdfs.tutor.setspec.condition': 1 }
).explain('executionStats')
```

```javascript
db.Assets.find(
  { $or: [{ userId: USER_ID }, { 'meta.stimuliSetId': { $in: ACCESSIBLE_STIM_SET_IDS } }] },
  {
    _id: 1, name: 1, fileName: 1, type: 1, size: 1, uploadedAt: 1, userId: 1,
    path: 1, meta: 1, ext: 1, extension: 1, extensionWithDot: 1,
    isImage: 1, isAudio: 1, isVideo: 1, versions: 1
  }
).explain('executionStats')
```

### Package And Media Lookups

- Content upload package download/reuse: `mofacts/server/lib/packageExport.ts:585`, selector `{ _id: reusablePackageAssetId }`, default `_id_`.
- Package export member TDFs: `mofacts/server/lib/packageExport.ts:267` and `mofacts/server/lib/packageExport.ts:306`, selectors by `_id`, default `_id_`.
- Package export media batch: `mofacts/server/lib/mediaReferences.ts:237`, selector `{ 'meta.stimuliSetId': { $in }, $or: [{ _id: { $in } }, { name: { $in } }, { fileName: { $in } }] }`, covered by `perf_stimuliSetId_id`, `perf_stimuliSetId_name`, and `perf_stimuliSetId_fileName`.
- Package upload media overwrite check: `mofacts/server/methods/packageMethods.ts:221`, selector `{ name, 'meta.stimuliSetId': stimSetId }` or `{ name, userId }`, covered by `perf_stimuliSetId_name` or `perf_userId_name`.
- Editor/manual media tip lookup: `mofacts/server/methods/packageMethods.ts:595` and `mofacts/server/methods/packageMethods.ts:687`, selector `{ userId, name }`, covered by `perf_userId_name`.
- `getUserAssetByName`: `mofacts/server/methods/contentMethods.ts:716`, selector `{ userId, $or: [{ name }, { fileName }] }`, covered by `perf_userId_name` and `perf_userId_fileName`.
- Package delete matching TDFs: `mofacts/server/methods/contentMethods.ts:771`, selector `{ $or: [{ packageAssetId }, { packageFile: { $in } }] }`, covered by `perf_packageAssetId` and `perf_packageFile`.
- Public asset audit: `mofacts/server/methods/contentMethods.ts:958`, selector `{ 'meta.public': true }`, sort `{ uploadedAt: -1 }`, covered by `perf_public_uploadedAt`.

```javascript
db.Assets.find(
  {
    'meta.stimuliSetId': { $in: STIMULI_SET_ID_CANDIDATES },
    $or: [{ _id: { $in: ASSET_IDS } }, { name: { $in: FILE_NAMES } }, { fileName: { $in: FILE_NAMES } }]
  },
  { _id: 1, name: 1, fileName: 1, path: 1, meta: 1 }
).explain('executionStats')
```

```javascript
db.Assets.find(
  { userId: USER_ID, $or: [{ name: FILE_NAME }, { fileName: FILE_NAME }] },
  { _id: 1, name: 1, fileName: 1 }
).explain('executionStats')
```

```javascript
db.tdfs.find(
  { $or: [{ packageAssetId: PACKAGE_ASSET_ID }, { packageFile: { $in: PACKAGE_FILE_CANDIDATES } }] },
  { _id: 1, ownerId: 1, stimuliSetId: 1, stimuli: 1 }
).explain('executionStats')
```

```javascript
db.Assets.find(
  { 'meta.public': true },
  { _id: 1, name: 1, userId: 1, size: 1, type: 1, uploadedAt: 1, meta: 1 }
).sort({ uploadedAt: -1 }).limit(LIMIT).explain('executionStats')
```

## Decisions

- `ContentUploadSummaries` read model: not needed now. The ordinary table path fetches ids, then compact summaries for at most 200 ids, with batched condition/stim existence lookups and batched asset counts. It still inspects unit `learningsession.stimulusfile` values, but not full unit content, `stimuli`, or `rawStimuliFile`. That is within the compact-row invariant. A read model would add rebuild triggers for TDF edits, uploads, package export, access changes, and asset changes without removing a current bottleneck.
- Redis: not needed. There is no cross-process background coordination problem in this content-manager flow. The work is synchronous request/response reads and normal Meteor publications.
- Missing media warnings: kept lazy on row expansion. Exact missing-media checks require full `stimuli` details from `tdfForContentUploadDetails`; doing this in ordinary row summaries would violate the compact-row invariant.
- `files.assets.all`: not used by the content manager table. It remains for editor/runtime paths, now with an explicit projection. A later runtime/editor pass can replace it with narrower route-specific publications.

## Local Measurement

Local database checked through the running `deploy-mongodb-1` container against `MoFACT-meteor3` on 2026-05-28. The sample data set was small: 20 `tdfs`, 1372 `Assets`, and no populated `stim_files` collection.

After starting the native hotfix dev service, startup created the new indexes. Confirmed local indexes included `perf_owner_lessonname_id`, `perf_packageFile`, `perf_accessors_userId`, `perf_accessors_user_lessonname_id`, `perf_userId_name`, `perf_userId_fileName`, `perf_stimuliSetId_name`, `perf_stimuliSetId_fileName`, `perf_stimuliSetId_id`, and `perf_public_uploadedAt`.

Representative local `executionStats`:

| Query | nReturned | totalKeysExamined | totalDocsExamined | winningIndex |
| --- | ---: | ---: | ---: | --- |
| content upload list for sample owner | 20 | 20 | 0 | `perf_owner_lessonname_id` |
| summary TDF `_id $in` for 5 ids | 5 | 9 | 5 | `_id_` |
| asset lookup by `meta.stimuliSetId` | 121 | 122 | 121 | `perf_stimuliSetId_name` |
| summary asset-count aggregation | 1 | 121 | 0 | `perf_stimuliSetId_name` |
| owned asset lookup by `userId`/`name` | 5 | 5 | 5 | `perf_userId_name` |
| public asset audit sorted by upload date | 10 | 10 | 10 | `perf_public_uploadedAt` |

The local optimizer chose `perf_stimuliSetId_name` for the stimuli-set-only asset query/aggregation because it has the same leading key as `perf_stimuliSetId_id`; either index covers the `meta.stimuliSetId` predicate.
