# Content media identity and repair

The selected TDF owns the value and BSON type of `stimuliSetId`. Separate media
uploads copy that value from the content summary, not an HTML attribute. The
server checks the same value and type after enforcing upload authorization.
Media listing and duplicate-name detection use that exact identifier.

Asset publications also retain `_downloadRoute`, `_collectionName`, and the
top-level `public` routing flag consumed by `FilesCollection.link`. Omitting those
fields produces an invalid preview URL even when the asset is correctly listed.
The library's `public` routing flag is distinct from `meta.public`, which the
application uses for access visibility. Publishing the flag does not change it
or grant access. Preview and editor links use the same projected asset documents.

Previously, file selection read an HTML attribute (always text), while the media
list used the TDF's numeric identifier. Drag-and-drop used jQuery's automatic
conversion, so the two upload paths could persist different types. Both paths
now use the same summary value. The media identifier attribute has been removed.
An outdated client that submits the wrong type receives `invalid-upload-target`;
reload the page after deployment.

## Existing uploads

Normal application startup invokes `repairContentMediaIdentity` after interrupted
package mutations have been reconciled. No separate build/deploy command or
package re-upload is needed. The repair changes only `meta.stimuliSetId` on assets
whose `meta.uploadPurpose` is `content-media` and whose recorded `meta.tdfId`
resolves to a TDF with the **same textual identifier value**. It copies that TDF's
exact type. It does not infer ownership from filenames or search for another TDF.

Missing/invalid links, different values (including leading-zero differences),
same-name collisions in the destination scope, and concurrent asset edits are
reported and left unchanged. Package-imported media, assets without this upload
purpose, TDFs, stimulus content, learner histories, asset IDs, URLs, and file bytes
are unchanged. Existing package/read-side handling of historical identifiers is
outside this repair; no additional compatibility lookup is introduced.

The scan uses `_id`-indexed pages of 100 assets, projects only the required fields,
batches TDF lookups by `_id`, and processes at most 5,000 assets per startup. Name
collision checks use the existing `meta.stimuliSetId`/`name` asset index. Progress
is checkpointed in DynamicSettings under `migration.contentMediaIdentity.v1`.
Interrupted scans resume from the previous page; updates compare the original
asset identity before writing. A completed scan does not run again. A scan capped
at 5,000 resumes at the next application startup.

## Verification after deployment

1. Inspect `[Content media identity repair] scan status` in application logs.
   `pending: false` means scanning finished. `needsReview: true` means some records
   were intentionally not repaired; inspect their logged reasons. Completion of
   the scan is not a claim that every record was repaired.
2. Reload Content, expand the affected lesson's media panel, and verify that its
   existing image appears and its link opens. Do not upload a duplicate to test it.
3. With synthetic content, verify both file selection and drag-and-drop uploads,
   then reopen the panel and confirm duplicate-name detection.

Local regression coverage exercises old and new uploads, intentional string
identifiers, missing/wrong links, duplicate names, concurrent changes, a crash
between update and checkpoint, and the startup limit. These pure unit checks do
not replace a Meteor/browser upload check after deployment.

## Recovery and reviewed rollback

Before each attempted metadata update, AuditLog receives a deterministic,
idempotent `content-media-identity-repair` record containing the asset ID, recorded
TDF ID, and exact `before`/`after` values. This is a **write intent**: a crash or
concurrent edit can prevent the write. Compare each current asset with the journal
before drawing conclusions. Checkpoint counts can undercount successful changes
if a process stops after a write but before the page checkpoint; journals and
current asset values are the verification source in that case.

Do not roll back automatically. If a reviewed rollback is authorized, quiesce media
writes, select the exact journaled assets, require their current purpose/TDF/value
to still match the journaled target, and restore only `meta.stimuliSetId` to
`before` with a conditional update. A mismatch requires investigation. Retain the
journal and checkpoint; do not clear the checkpoint or re-run the repair against
an intentionally rolled-back state. No file restoration or learner-data migration
is involved.
