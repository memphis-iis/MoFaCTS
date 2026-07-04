# Admin Upload Lifecycle Plan

This plan covers the upload lifecycle/coherence work that is separate from the admin visual professionalization plan. The goal is to reduce duplicated upload behavior and make package uploads, generated package uploads, and media uploads report progress through one understandable client-side model.

## Current Context

The main content upload page already has an optimistic package upload path in `mofacts/client/views/experimentSetup/contentUpload.ts`:

- `doPackageUpload` creates a `pendingUploads` entry immediately.
- The pending row moves through upload/checking/processing/completed/error states.
- Package processing calls `processPackageUpload`.
- Successful uploads trigger content list refresh and eventually replace the pending row with the real lesson row.

There are related but separate upload paths:

- Anki wizard generated package upload in `mofacts/client/views/experimentSetup/apkgWizard.ts`.
- Canvas/IMSCC import flow reached from `contentUpload`.
- Media file upload inside the content manager row-level media panel.
- Older/general content file upload logic still present in `doFileUpload`.

The duplicated upload code causes inconsistent progress labels, confirmation behavior, refresh behavior, and completion behavior. This is a different problem from admin styling: even a well-styled UI can still feel unprofessional if upload state changes are inconsistent or duplicated across flows.

## Goals

- Use one client-side package upload lifecycle for direct `.zip`, Anki-generated packages, and Canvas-generated packages.
- Keep package upload state explicit, observable, and testable.
- Preserve existing server method boundaries and security checks.
- Make overwrite/confirmation handling consistent across upload entry points.
- Make final list refresh and pending-row replacement deterministic.
- Reduce duplicated calls to `DynamicAssets.insert`, `processPackageUpload`, `tdfUpdateConfirmed`, and refresh triggers in UI code.

## Non-Goals

- Do not redesign server-side package parsing or persistence.
- Do not change required TDF fields, schemas, package format, or media storage behavior unless a specific defect requires it.
- Do not add new dependencies.
- Do not port the whole content manager to Svelte as part of this plan.
- Do not remove legacy-looking code without confirming whether it is still an active path.
- Do not hide upload failures with silent retry or compatibility fallback behavior.

## Invariants

- `MOFACTS_CONFIG_REPO`, if present, must resolve to `C:\dev\mofacts_config`.
- Package processing continues to use the supported server method boundary.
- Server methods remain responsible for database access, authorization, persistence, and package processing.
- Client code may orchestrate file upload progress, visible state, and user confirmations.
- The UI must fail clearly when upload integrity, package processing, or confirmation fails.
- Existing ownership, sharing, public/private, quota, and delete behaviors must be preserved.
- Any change that alters package fields, TDF fields, config keys, payloads, or schemas requires compatibility checks against `C:\dev\mofacts_config`.

## Proposed Architecture

Introduce a shared client-side package upload controller or service, likely under `mofacts/client/lib/` or a nearby content-upload-specific module if the scope should remain narrower.

The controller should expose a small lifecycle API:

```text
startPackageUpload({
  file,
  source,
  emailInsteadOfAlert,
  onState,
  confirmOverwrite,
  confirmTdfUpdate,
  refreshContentList
})
```

State model:

```text
idle
checking-existing-package
awaiting-overwrite-confirmation
removing-existing-package
computing-integrity
uploading
processing-package
awaiting-tdf-update-confirmation
confirming-tdf-update
refreshing-content-list
completed
error
cancelled
```

State payload should include:

```text
uploadId
source
fileName
lessonName
progress
message
hint
packageAssetId
stimuliSetId
startedAtMs
error
confirmationRequest
```

Sources should be explicit:

```text
direct-zip
anki-generated-package
canvas-generated-package
media-file
```

Media-file upload may remain a separate controller if package and media lifecycles diverge too much. It should still share the same admin progress/status presentation where possible.

## Plan

### Phase 1: Map Active Upload Paths

Inventory all upload entry points and classify them as active, obsolete, or uncertain.

Known starting points:

- `contentUpload.ts` direct `.zip` input.
- `contentUpload.ts` media manager uploads.
- `contentUpload.ts` older `doFileUpload`.
- `apkgWizard.ts` generated package upload.
- IMSCC wizard upload path.
- manual content creator package save/upload path if still active.

For each path, record:

- selected file type,
- client upload mechanism,
- server method calls,
- overwrite behavior,
- confirmation behavior,
- progress behavior,
- refresh behavior,
- success/failure behavior,
- whether it updates `pendingUploads` or another state store.

If apparent legacy or redundant paths are discovered, stop before deleting or building on them. Document what depends on them and ask whether they should be preserved, replaced, or removed.

### Phase 2: Extract Package Upload Service

Extract the direct `.zip` lifecycle from `contentUpload.ts` into a reusable function while preserving behavior.

First extraction should be behavior-preserving:

- still checks for existing asset by name,
- still computes upload integrity,
- still inserts into `DynamicAssets`,
- still calls `processPackageUpload`,
- still handles `awaitClientTDF`,
- still calls `tdfUpdateConfirmed`,
- still reports errors clearly,
- still triggers content list refresh after success.

The first caller should remain `contentUpload`.

Add focused unit tests for lifecycle state transitions if feasible without Meteor integration. Where Meteor/DynamicAssets are too coupled, isolate pure state helpers first and test those.

### Phase 3: Replace Anki Wizard Duplicate Upload Logic

Change `apkgWizard.ts` to call the shared package upload service for generated packages.

Expected effect:

- Anki-generated upload uses the same overwrite confirmation behavior as direct package upload.
- Progress labels and completion semantics become consistent.
- The wizard no longer needs to duplicate `DynamicAssets.insert`, `processPackageUpload`, and `tdfUpdateConfirmed` orchestration.
- The wizard can show its own local UI by adapting shared state to its existing `uploadStatus`, `uploadError`, and `uploadComplete` helpers.

Avoid `location.reload()` as the normal completion path unless a clear invariant requires it. Prefer refreshing the content list or returning to the content manager with visible completion state.

### Phase 4: Integrate Canvas/IMSCC Generated Package Upload

Apply the same shared service to the Canvas/IMSCC generated package path.

Verify whether IMSCC import stays fully local until the generated MoFaCTS package is uploaded, as currently described in the UI.

### Phase 5: Rationalize Media Upload State

Decide whether media uploads should use:

- the same upload service with `source: media-file`, or
- a smaller shared `createUploadProgressController` used by both package and media uploads.

Media uploads differ from package uploads because they attach to a TDF/stimuli set and do not call `processPackageUpload`. Do not force them into the package lifecycle if that makes the abstraction misleading.

Minimum target:

- consistent progress display,
- consistent error display,
- no routine browser alerts,
- deterministic refresh of row-level media lists,
- clear overwrite confirmation.

### Phase 6: Cleanup and Remove Confirmed Redundancy

After all active package paths call the shared service:

- remove duplicate package upload orchestration from wizard files,
- collapse obsolete helper state,
- keep any retained alternative path explicitly named by domain behavior,
- document any retained legacy path with owner, invariant, expected lifetime, and verification.

## Verification

For TypeScript-bearing changes:

```bash
cd mofacts
npm run typecheck
```

For lintable TypeScript/JavaScript/Svelte changes:

```bash
cd mofacts
npm run lint
```

For UI/runtime behavior:

1. Start native hotfix dev app from `deploy/`:

```powershell
.\hotfix-dev.ps1 start -SettingsPath "$env:USERPROFILE\OneDrive\Desktop\settings.local.json"
```

2. Use the MoFaCTS Playwright sidecar against `http://host.docker.internal:3200`.
3. Smoke-test:
   - direct `.zip` upload,
   - generated Anki package upload,
   - generated IMSCC package upload if local sample data is available,
   - media upload inside an existing lesson,
   - overwrite/cancel path,
   - overwrite/confirm path,
   - package processing failure path if a known-invalid sample is available.

Report:

- route tested,
- visible result,
- console errors,
- network errors,
- final content list state,
- whether pending/progress state was replaced by the real lesson row correctly.

## Risks

- Upload code is user-trust-sensitive. A visual improvement that changes persistence behavior would be worse than the current roughness.
- Existing duplicate paths may encode subtle differences. Extract behavior first, then simplify.
- Browser-native confirmations are crude but safe. Replacement confirmation UI must still block destructive actions.
- Content list refresh is reactive and throttled today. Pending-to-real-row replacement must be tested with slow package processing and delayed summary hydration.
- If package fields or TDF structures change unexpectedly, dependent config/content repositories must be checked before proceeding.

## Recommended First Implementation Slice

1. Map all active package upload callers.
2. Extract the direct `doPackageUpload` lifecycle into a shared service without changing behavior.
3. Adapt `contentUpload` to the service.
4. Run typecheck/lint.
5. Smoke-test direct `.zip` upload.
6. Only then convert the Anki wizard upload path.

