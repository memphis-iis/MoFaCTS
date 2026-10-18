# Seed a fresh instructional library

`mofacts/scripts/transferInstructionalLibrary.cjs` prepares a portable copy of the
shared instructional content and seeds an **empty instructional library** in an
existing MoFaCTS database. It is an operator command, separate from deployment.
Preparing the script or deploying MoFaCTS does not execute a transfer.

The first version supports the configured **local filesystem storage** used by
the localhost watcher and current production application. It fails explicitly
for S3 storage. Node 24 and the existing application MongoDB driver are required;
no dependency installation or new application endpoint is involved.

## Scope and persistence contract

The bundle contains completed `SparcInstructionalLibrary` entries, their exact
retrieval embeddings, question choices/keys, video timestamps
and transcripts, source KC associations, shared move manifests and current raster files. Pending image generations are excluded.
All current content IDs remain unchanged. The v2 format has no exclusion state, parent links or image-revision history. Asset paths are rebased
to the destination's configured `storage.local.dynamicAssetsPath`.

It never copies users, learner histories, progress, assignments, private primitive
requests, exposure records, generation leases, settings or credentials. Image
owner/session/generation metadata  are omitted.
The existing `Assets` collection receives only the referenced shared figure
records; unrelated assets remain untouched. Video bytes remain on YouTube.
Full-video transcript preparation caches and provider job checkpoints are not
needed for runtime retrieval and are not transferred. Lesson packages are not
copied: video `origins` retain their **source** lesson/page/KC provenance rather
than claiming an automatic association with a newly uploaded destination package.
Runtime semantic retrieval does not depend on those source lesson IDs.

The destination application must first run the matching unified-library code.
Do not run the import during deployment or concurrent content generation/editing.
The tool rejects nonempty instructional-library, shared-manifest
collections, populated former library collections, and existing destination asset
IDs. It has no overwrite or merge mode. An existing application database is
expected; this does not replace the database.

## 1. Export later, when the transfer is authorized

From PowerShell, using the workstation's existing private operator inputs:

```powershell
$MofactsRoot = 'C:\dev\MoFaCTS'
$OperatorRoot = Join-Path $env:USERPROFILE 'OneDrive\Desktop'
$LibraryBundle = Join-Path $MofactsRoot ('deploy\local-data\instructional-library-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))

node "$MofactsRoot\mofacts\scripts\transferInstructionalLibrary.cjs" export `
  --bundle $LibraryBundle `
  --settings "$OperatorRoot\settings.local.json" `
  --env-file "$MofactsRoot\deploy\.env.local" `
  --mongo-url-key MOFACTS_NATIVE_MONGO_URL `
  --database MoFACT-meteor3 `
  --replica-set mofacts-rs
if ($LASTEXITCODE -ne 0) { throw 'Instructional library export failed; do not upload an incomplete bundle' }
```

The bundle directory must not exist beforehand; its parent must exist. The final
`manifest.json` is the completion marker. Retain the printed `manifestSha256`
separately from the bundle and use it in the following commands. The tool logs
counts/progress, not source records or connection strings. Keep the bundle private:
it includes authored content, answer keys and retrieval vectors. The default
location above is already ignored by Git.

Export reads a MongoDB snapshot. It refuses dangling image, primitive
or video references. Bounds are 10,000 shared records in total, 128 MiB of metadata,
and the existing application limit per image. Collection cursors and import writes
use batches of 100. If a bound is reached, stop and revise the explicit transfer
contract rather than silently truncating data.

## 2. Inspect and stage the completed bundle

These are operator instructions for a future authorized transfer; they are not
part of a normal application deploy. Replace the hash with the export's exact
printed value, without deriving it again from a possibly changed remote bundle.

```powershell
$LibraryManifestSha256 = 'REPLACE_WITH_THE_64_CHARACTER_EXPORT_HASH'
node "$MofactsRoot\mofacts\scripts\transferInstructionalLibrary.cjs" inspect `
  --bundle $LibraryBundle --manifest-sha256 $LibraryManifestSha256
if ($LASTEXITCODE -ne 0) { throw 'Bundle verification failed' }

$ProdKey = Join-Path $OperatorRoot 'prodkey.pem'
$ProdHost = 'ubuntu@YOUR_PRODUCTION_HOST'
$LibraryBundleName = Split-Path $LibraryBundle -Leaf
ssh -i $ProdKey $ProdHost "umask 077; mkdir -p /var/www/mofacts/library-seed"
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the private transfer directory' }
scp -i $ProdKey -r $LibraryBundle "${ProdHost}:/var/www/mofacts/library-seed/"
if ($LASTEXITCODE -ne 0) { throw 'Bundle upload failed' }
ssh -i $ProdKey $ProdHost "sudo docker exec mofacts mkdir -p /tmp/mofacts-library-seed && sudo docker cp /var/www/mofacts/library-seed/$LibraryBundleName/. mofacts:/tmp/mofacts-library-seed"
if ($LASTEXITCODE -ne 0) { throw 'Could not stage the bundle in the running application container' }
```

The bundle carries a copy of the tool and its pure source-owned contracts. It
uses the running image's **existing Meteor MongoDB driver** at the same explicit
path used by `/docker/connect-to-mongo.sh`. Credentials stay in the container's
existing environment and mounted settings; no credential appears in arguments.

## 3. Dry-run first; seed only when authorized

The first command only validates bundle checksums, record relationships,
connection/database/replica-set identity, an empty destination, and file conflicts.
It does not write database records or destination images.

```powershell
$LibraryImportCommand = 'node /tmp/mofacts-library-seed/tool/scripts/transferInstructionalLibrary.cjs import --bundle /tmp/mofacts-library-seed --settings /run/mofacts/settings.json --mongo-driver /opt/bundle/bundle/programs/server/npm/node_modules/meteor/npm-mongo/node_modules/mongodb --manifest-sha256 ' + $LibraryManifestSha256
ssh -i $ProdKey $ProdHost "sudo docker exec mofacts $LibraryImportCommand"
if ($LASTEXITCODE -ne 0) { throw 'Library seed preflight failed; nothing was imported' }

# Run the following ONLY when the production import itself is authorized.
ssh -i $ProdKey $ProdHost "sudo docker exec mofacts $LibraryImportCommand --apply"
if ($LASTEXITCODE -ne 0) { throw 'Library seed failed; inspect its reported stage before retrying' }
```

Apply copies checksum-verified image files first, then inserts all database
records in one snapshot/majority transaction. The same transaction invalidates
the derived browsing state; the normal browser rebuilds topic/subgroup labels.
No application restart is required for imported content.

Failure before database commit leaves the instructional collections empty.
Already-copied private files can remain unreferenced; an explicit retry accepts
only exactly matching bytes. A successful seed is not repeated: a second import
stops because the destination library is now populated. After success, use the
Content library to check figures, question choices, video playback and source KC
metadata. Counts and checksum verification establish transfer integrity, not
pedagogical quality or a completed production acceptance walkthrough.

Rollback is an abort of the database transaction before commit. After a successful
commit, removal of imported content would be a separate, explicitly authorized
operation that must account for any learner references created afterward. The
tool does not delete existing content or implement a destructive undo command.

## Verification during preparation

```powershell
cd C:\dev\MoFaCTS\mofacts
node --test scripts/transferInstructionalLibrary.test.cjs
npm run lint
```

The tests use synthetic database adapters and temporary images. They cover every
shared kind, privacy filtering, version/reference durability, portable paths,
dry-run behavior, fresh-only enforcement, checksum failures and transaction
rollback/retry. They do not run an actual export, MongoDB import, SSH operation or
production transfer. Real database/asset acceptance remains a later authorized
step after deployment.
