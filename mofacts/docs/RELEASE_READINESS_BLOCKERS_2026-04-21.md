# Release Readiness Blockers Before First Formal Tag

Date: 2026-04-21

Scope: `C:\dev\mofacts\svelte-app\mofacts`

Branch audited: `Video-System-Upgrade`

Goal: identify issues that should be resolved before MoFaCTS begins formal versioning, for example a first `v0.1.0` Git tag and GitHub Release.

## Current Judgment

The modern app is close enough to begin formal release preparation, but it should not be tagged as the first formal version until the public Meteor method surface is hardened and a small set of release metadata/checks are aligned.

The strongest blocker is not runtime stability or the current package metadata. It is that several older callable Meteor methods remain registered in the public DDP method table without clear authentication, role, or ownership boundaries.

The `package.json` version is not considered authoritative for this audit. The authoritative release marker should be the Git tag, GitHub Release, and citation metadata once the release is intentionally cut.

## Implementation Progress

Started: 2026-04-21

Completed in the first implementation pass:

1. Public TDF lookup methods now use access-checked wrappers instead of exposing raw lookup helpers directly.
2. Public stimulus lookup by `stimuliSetId` now verifies that the caller can access a TDF associated with that stimuli set.
3. Raw helper-style methods with no direct client caller were removed from the public method registry:
   - `getStimuliSetByFileName`
   - `getMaxResponseKC`
4. `getHistoryByTDFID` is no longer registered as a public Meteor method. The internal server export remains available for server-only reporting code.
5. `getResponseKCMapForTdf` now requires access to the requested TDF before returning response/KC mappings.
6. `updateStimDisplayTypeMap` is now admin-only. `getStimDisplayTypeMap` and `getStimDisplayTypeMapVersion` remain callable because the active client sync path depends on them; they expose boolean display capability metadata, not stimulus content.
7. `insertHistory` now requires an authenticated current user, rejects cross-user history insertion, normalizes `userId`/`TDFId`, and validates TDF access before writing.
8. `getOutcomesForAdaptiveLearning` now requires the current user or admin and validates current-user TDF access before returning outcomes.
9. `getStudentPerformanceForClassAndTdfId`, `getClassPerformanceByTDF`, condition-count mutation methods, course read/mutation methods, server status/verbosity controls, login user-agent updates, and favicon generation now have explicit role or ownership checks.
10. Focused authorization regression tests were added in `server/serverComposition.test.ts` for the newly hardened surfaces.

Completed in the second implementation pass:

1. `sendUserErrorReport` now requires the current authenticated user, rejects cross-user submissions, truncates text/log fields, and caps serialized session/state payload size.
2. `serverLog` and `debugLog` now require authentication and cap log text length.
3. `ensureClientVerbositySetting` is now admin-only, matching its admin-controls caller.
4. Broad course listing via `getAllCourses` is now admin-only.
5. Due-date exception reads through `checkForUserException` are now current-user or admin only.
6. Content owner lookup helpers now require authentication and scope returned owner names to owners of caller-accessible TDFs unless the caller is admin.
7. `getTdfsByOwnerId` now requires owner/admin and returns a projected summary instead of full TDF documents.
8. Additional helper-only methods were removed from public registration:
   - `getStimSetFromLearningSessionByClusterList`
   - `getUserLastFeedbackTypeFromHistory`
   - `getSourceSentences`
   - `checkForTDFData`
   - `getTdfNamesByOwnerId`
   - `resolveAssignedRootTdfIdsForUser`
9. `/dynamic-assets/:assetId` now enforces the documented bearer-link/public-media contract by serving only assets marked `meta.public: true` and rejecting asset paths outside the configured dynamic-assets storage root.

Completed in the third implementation pass:

1. MTurk workflow listing and AWS credential updates now require teacher/admin role instead of merely being logged in.
2. MTurk worker lookup now verifies that the requested experiment exists and that the caller is admin or owns the experiment TDF.
3. Legacy MTurk lockout scheduling now allows the intended experiment-participant self-scheduling flow while rejecting callers who are neither admin, owner, nor a matching experiment participant.
4. Legacy MTurk lockout scheduling no longer logs the full owner profile object.
5. Package upload processing now rejects package assets uploaded by another user unless the caller is admin.
6. `saveContentFile` now uses method context, requires teacher/admin, and rejects non-admin attempts to upload content for another owner.
7. `tdfUpdateConfirmed` now requires authentication and verifies the caller can manage an existing TDF or owns the new pending update unless admin.
8. Additional authorization regression tests were added for MTurk and content/package helper deny paths.

Still blocking a final tag:

1. Remediate the remaining `NEEDS_WRAPPER` findings recorded in [PUBLIC_METHOD_INVENTORY_2026-04-21.md](PUBLIC_METHOD_INVENTORY_2026-04-21.md), especially raw learner state/history methods and `getUserIdforUsername`.
2. Add release metadata/version marker work.
3. Record canonical Docker build/deploy verification for the exact release commit.

## Release Blockers

### 1. Public Meteor Method Surface Needs An Explicit Authorization Pass

`server/serverComposition.ts` registers a broad method set through:

- `methods`
- `asyncMethods`
- `...analyticsMethods`
- `...courseMethods`
- several helper functions

Evidence:

- `server/serverComposition.ts` registers `Meteor.methods({...methods, ...asyncMethods})`.
- `asyncMethods` includes `...analyticsMethods`, `...courseMethods`, `getTdfByFileName`, `getStimuliSetById`, `getResponseKCMapForTdf`, `getMaxResponseKC`, and other helper-style functions.

Why this blocks release:

Before a formal tag, every public DDP method should have a documented access contract. Helper functions may be safe internally but become a security boundary once registered as Meteor methods.

Smallest remediation:

1. Create an explicit allowlist of public methods.
2. For each method, document one of:
   - public unauthenticated and rate-limited,
   - authenticated self-only,
   - owner/accessor-only,
   - teacher/admin,
   - admin-only,
   - internal only and not registered as a method.
3. Remove helper-only functions from `Meteor.methods` if no client requires direct calls.
4. Add tests for the riskiest deny cases.

### 2. TDF Read Methods Can Return Full Content Without A Caller Access Check

Evidence:

- `server/lib/tdfLookup.ts`
  - `getTdfById()` returns the TDF when called without `this.userId`.
  - `getTdfByFileName()` returns a full TDF by filename and does not inspect method context.
- `server/serverComposition.ts`
  - `getTdfByFileName` and `getTdfById` are registered into the public method table.

Why this blocks release:

Full TDF documents can include lesson content, experiment configuration, embedded media references, version metadata, and potentially encrypted API key fields. Even if keys remain encrypted, full-content lookup by guessed id or filename is too broad for a formal release boundary.

Smallest remediation:

1. Split internal lookup helpers from public Meteor methods.
2. Require authentication for public TDF lookup.
3. Public lookup should enforce the canonical access policy:
   - owner,
   - shared accessor,
   - public/self-selectable where intended,
   - assigned course root,
   - valid experiment target participant,
   - valid condition TDF for an accessible root.
4. Project fields for each use case instead of returning full documents by default.

### 3. Stimulus Lookup By Stimuli Set Id Is Publicly Callable Without Access Validation

Evidence:

- `server/lib/stimulusLookup.ts`
  - `getStimuliSetById(stimuliSetId)` returns stimuli for any matching `stimuliSetId`.
- `server/serverComposition.ts`
  - `getStimuliSetById` is registered as a Meteor method.

Why this blocks release:

Stimulus sets are content. Access should be derived from an accessible TDF/root TDF, not from possession or guessing of a `stimuliSetId`.

Smallest remediation:

1. Keep the low-level helper internal.
2. Add a public method that takes a TDF context, not only `stimuliSetId`.
3. Validate access to that TDF/root/condition before returning stimuli.
4. Return only the fields needed by the client.

### 4. Analytics And History Methods Include Unsafe Public Reads/Writes

Evidence:

- `server/methods/analyticsMethods.ts`
  - `insertHistory(historyRecord)` has no visible method-context authorization or ownership validation.
  - `getHistoryByTDFID(TDFId)` returns all history for a TDF.
  - `getStudentPerformanceForClassAndTdfId(instructorId, date)` accepts an instructor id rather than deriving authority from the caller.
  - `updateTdfConditionCounts(TDFId, conditionCounts)` mutates TDF metadata.
  - `resetTdfConditionCounts(TDFId)` mutates TDF metadata.

Why this blocks release:

History rows and performance exports are student data. Mutation of history or condition counts affects data integrity and experimental state. A formal release should not expose these operations without explicit caller validation.

Smallest remediation:

1. For history insertion, require authenticated caller and validate that the history record user/TDF context matches the current session and canonical access rules.
2. Remove or restrict `getHistoryByTDFID`; prefer owner/admin/teacher-scoped data export paths.
3. Derive instructor identity from `this.userId` unless admin override is explicitly required.
4. Require owner/admin for condition-count mutation.
5. Add negative tests for cross-user and unauthenticated calls.

### 5. Course And Class Mutation Methods Need Role/Ownership Hardening

Evidence:

- `server/methods/courseMethods.ts`
  - `getAllCourses()`
  - `getAllCoursesForInstructor(instructorId)`
  - `editCourseAssignments(newCourseAssignment)`
  - `addCourse(mycourse)`
  - `editCourse(mycourse)`
  - `addUserDueDateException(userId, tdfId, classId, date)`
  - `removeUserDueDateException(userId, tdfId)`

These methods are returned from `createCourseMethods()` and then registered publicly through `...courseMethods`.

Why this blocks release:

Course assignment and due-date exception writes affect learner access and reporting. They should be teacher-owned-course or admin-only. Read methods should not allow arbitrary instructor id probing.

Smallest remediation:

1. Require authentication on all course methods.
2. Require admin or course-owning teacher for course/assignment mutation.
3. Require admin or course-owning teacher for due-date exception mutation.
4. Derive instructor id from `this.userId` for non-admin requests.
5. Add tests for student denial and teacher cross-course denial.

### 6. System/Debug Methods Need A Release Boundary Review

Evidence:

- `server/methods/systemMethods.ts`
  - `getServerStatus()` is callable without visible auth.
  - `sendUserErrorReport(...)` accepts user/session/log payloads without visible auth or rate limit.
  - `logUserAgentAndLoginTime(userID, userAgent)` writes to a user selected by parameter.
  - `serverLog(data)`, `debugLog(logtxt)`, `setVerbosity(level)`, `getVerbosity()` are public methods.

Why this blocks release:

Some of these are operationally useful, but public debug and logging endpoints can become abuse, privacy, or availability risks. `setVerbosity` should not be public because it changes server behavior.

Smallest remediation:

1. Make verbosity changes admin-only.
2. Require auth or rate-limit unauthenticated error reporting.
3. Ensure `logUserAgentAndLoginTime` only updates the current user or is removed if obsolete.
4. Limit server logging methods to admin or remove public exposure.
5. Keep health/status data minimal if intentionally public.

### 7. Dynamic Asset Route Needs A Documented Privacy Contract

Evidence:

- `server/runtime/dynamicAssetsRoute.ts`
  - `/dynamic-assets/:assetId` serves any asset by id if the file exists.
  - The route does not check current user, TDF access, owner, or asset metadata.

Why this may block release:

This is acceptable only if dynamic assets are intentionally bearer-link/public media. If uploaded media can contain private course or research content, unauthenticated access by asset id is too broad.

Smallest remediation:

1. Decide and document the intended model:
   - public bearer-link assets, or
   - access-controlled assets.
2. If public, make sure asset ids are sufficiently unguessable and do not expose directory paths or metadata.
3. If private, enforce access through TDF/stimuliSet ownership/accessor/public/course/experiment rules.
4. Add a regression test around the chosen policy.

### 8. Formal Version/Citation Metadata Is Not Yet Aligned

Evidence:

- `svelte-app/CITATION.cff` exists and currently has `version: 1.0.0`.
- `package.json` also has `version: 1.0.0`, but this is not authoritative for the formal release decision.
- The app does not appear to expose a clear runtime version/build marker in the UI or an admin/status API.

Why this blocks a clean first formal release:

Researchers and maintainers need a durable way to identify the exact software used. Git tags and GitHub Releases can do this, but citation metadata and app-visible version/build info should not contradict the intended first formal release.

Smallest remediation:

1. Choose first formal tag, recommended: `v0.1.0`.
2. Update `CITATION.cff` to match the formal release when tagging.
3. Add an app/admin/about/status version marker that includes:
   - release version,
   - Git commit,
   - build date or image tag.
4. Treat `package.json` as internal npm metadata unless the project decides to align it.

### 9. Supported Verification Is Incomplete Until The Canonical Build/Deploy Path Is Checked

Evidence from audit:

- `npm run typecheck`: passed.
- `npm run lint`: passed with warnings only.
- `npm audit --omit=dev`: passed with 0 vulnerabilities.
- `npm run typecheck:vendor`: failed in third-party declaration files.
- `npm run knip`: reported unused exports/types.
- `npm run test:ci` was not run during the audit because local Meteor test commands are not the canonical release-confidence path in this repository unless explicitly requested.

Why this blocks release:

The formal release should be backed by the supported verification route, especially the Docker compose/build/deploy path used for real environments.

Smallest remediation:

1. Run the required app checks:
   - `npm run lint`
   - `npm run typecheck`
2. Run the test suite in the supported CI environment or explicitly document why local Meteor tests were skipped.
3. Run the canonical Docker build/deploy validation path or have the release owner record it.
4. Document the exact commit, image tag, settings source, and database target used in the validation.

## Method Remediation Work Order

This section converts the blocker audit into implementation work. It is intentionally biased toward small, reviewable patches.

### Patch Slice 1: Public Method Registry And Helper Exposure

Goal: stop treating internal helpers as public API by accident.

| Method or group | Current risk | Intended access | Action | Client callers found | Test needed |
| --- | --- | --- | --- | --- | --- |
| `getTdfByFileName` | Full TDF lookup by filename with no method-context access check. | Authenticated, canonical TDF access only. | Replace public method with access-checked wrapper or remove if publications cover needed flow. Keep raw helper internal. | `client/views/turkWorkflow.ts`, `client/lib/router.ts`, resume services. | Unauthenticated denied; unrelated student denied; valid experiment participant allowed. |
| `getTdfById` | Returns full TDF when no `this.userId` is present. | Authenticated, canonical TDF access only. | Require method context for public call. Keep internal helper separate if needed. | `home.ts`, `learningDashboard.ts`, `unitProgression.ts`, router resume paths. | Unauthenticated denied; inaccessible TDF denied; public/assigned/accessor allowed. |
| `getStimuliSetById` | Stimuli returned by guessed/known `stimuliSetId`. | Access through accessible TDF/root/condition context. | Introduce access-checked method that accepts TDF context; make raw helper internal. | `svelteInit.ts`. | Student cannot fetch unrelated stimuliSetId; assigned/public lesson can fetch. |
| `getStimuliSetByFileName` | Stimulus lookup by filename, helper-style method. | Internal only unless a specific public use is proven. | Remove from public method table or wrap with TDF access validation. | No direct client caller found in audit grep. | Method absent or denied from client. |
| `getResponseKCMapForTdf` | Returns answer-to-KC mapping for any TDF id. | Only for a TDF the caller can practice/manage. | Add access check or move computation client-side where data is already authorized. | `unitEngine.ts`; package upload internals. | Cross-TDF denied. |
| `getMaxResponseKC` | Full collection aggregate exposed. | Admin/internal only. | Remove from public table unless current client use exists. | No direct client caller found in audit grep. | Non-admin denied or method absent. |
| `updateStimDisplayTypeMap` | Runtime map rebuild/update exposed. | Admin/internal only. | Keep admin-only if UI needs it; otherwise remove public exposure. | `adminControls.ts`. | Student/teacher denied; admin allowed. |
| `getStimDisplayTypeMap`, `getStimDisplayTypeMapVersion` | Global derived data exposure. | Public/authenticated if map contains no sensitive content; otherwise admin/internal. | Decide policy and project minimal data. | No direct client caller found in audit grep. | Policy-specific. |

Implementation note: prefer creating clearly named public wrappers such as `getAccessibleTdfById` over overloading internal helpers with `this` behavior. This makes future audits simpler.

### Patch Slice 2: Analytics, History, And Data Integrity Methods

Goal: ensure learner data and experimental integrity are only changed by the current learner or an authorized instructor/admin.

| Method | Current risk | Intended access | Action | Client callers found | Test needed |
| --- | --- | --- | --- | --- | --- |
| `insertHistory` | Inserts arbitrary history record without visible caller/TDF validation. | Authenticated current user only, with TDF access validation. | Require `this.userId`; set/verify `historyRecord.userId`; validate root/condition TDF context. | `instructions.ts`, `plyrHelper.ts`, `historyLogging.ts`, `VideoSessionMode.svelte`. | User cannot insert for another user; inaccessible TDF denied; valid trial accepted. |
| `getHistoryByTDFID` | Returns all histories for a TDF. | Internal only or owner/admin scoped export. | Remove from public table unless needed; use download/report methods for authorized exports. | No direct client caller found in audit grep. | Method absent or non-owner denied. |
| `getOutcomesForAdaptiveLearning` | Accepts arbitrary `userId` and `TDFId`; returns learner history-derived outcomes. | Current user only unless teacher/admin with class relationship. | Derive user id from `this.userId` for student flow; add teacher/admin override only with relationship check. | `adaptiveQuestionLogic.ts`. | Student cannot query another user; unrelated teacher denied. |
| `getStudentPerformanceForClassAndTdfId` | Accepts instructor id parameter and aggregates class data. | Current instructor's courses, or admin. | Derive instructor from `this.userId`; admin may pass explicit instructor id. | `instructorReporting.ts`. | Teacher cannot query another teacher's courses. |
| `getClassPerformanceByTDF` | Class/TDF performance data. | Course-owning teacher/admin. | Verify caller owns class/course or is admin before aggregation. | `instructorReporting.ts`. | Cross-class denied. |
| `getStimSetFromLearningSessionByClusterList` | Derived stimulus content by stimuliSetId. | Same TDF/stimulus access model as stimulus lookup. | Add accessible TDF context or make internal. | No direct client caller found in audit grep. | Inaccessible stimuli denied. |
| `updateTdfConditionCounts` | Mutates condition counts for any TDF id. | Active learner update for current accessible root, or owner/admin repair. | Validate current user has access to the root and that payload is structurally valid; consider moving server-side. | `unitProgression.ts`, `resumeService.ts`. | Inaccessible TDF denied; malformed counts denied. |
| `resetTdfConditionCounts` | Mutates condition counts for any TDF id. | Owner/accessor/admin only. | Require content-management access. | `contentUpload.ts`. | Student denied; owner allowed. |
| `downloadDataByTeacher` | Mostly self/admin safe, but name implies teacher export. | Self or admin only unless expanded intentionally. | Keep `requireUserMatchesOrHasRole`; confirm admin-only cross-user. | No direct client caller found in audit grep. | Non-admin cross-user denied. |
| `downloadDataByFile`, `downloadDataById` | Already owner-gated. | Owner only, admin only if intentionally added. | Keep; add tests if missing. | data download UI. | Accessor/student denied for raw data export. |

### Patch Slice 3: Course, Assignment, And Reporting Methods

Goal: make course/class actions depend on the caller's actual course relationship.

| Method | Current risk | Intended access | Action | Client callers found | Test needed |
| --- | --- | --- | --- | --- | --- |
| `getAllCourses` | Returns all courses. | Admin only, or remove if unused. | Restrict or remove public exposure. | No direct client caller found in audit grep. | Student denied. |
| `getAllCourseSections` | Authenticated but broad. | Authenticated if section discovery is intentional, otherwise teacher/admin. | Decide product policy; project minimal fields. | `classEdit.ts`, `classSelection.ts`. | Policy-specific. |
| `getAllCoursesForInstructor` | Accepts arbitrary instructor id. | Current teacher's courses; admin override. | Derive instructor from `this.userId` for non-admin. | `instructorReporting.ts`, `tdfAssignmentEdit.ts`. | Teacher cannot query another instructor. |
| `getAllCourseAssignmentsForInstructor` | Accepts arbitrary instructor id. | Current teacher's assignments; admin override. | Derive instructor from `this.userId` for non-admin. | `tdfAssignmentEdit.ts`. | Teacher cannot query another instructor. |
| `getTdfAssignmentsByCourseIdMap` | Accepts arbitrary instructor id. | Current teacher/admin. | Derive instructor from caller except admin. | `instructorReporting.ts`. | Cross-teacher denied. |
| `editCourseAssignments` | Mutates assignments without visible caller role check. | Course-owning teacher/admin. | Require caller owns target course or is admin. | `tdfAssignmentEdit.ts`. | Student denied; unrelated teacher denied. |
| `addCourse` | Creates courses without visible role check. | Teacher/admin; teacher should become owner. | Require teacher/admin; force `teacherUserId` from caller unless admin explicitly sets it. | `classEdit.ts`. | Student denied; teacher cannot create course for another teacher. |
| `editCourse` | Mutates course/sections without visible role check. | Course-owning teacher/admin. | Fetch existing course and verify ownership before update. | `classEdit.ts`. | Cross-teacher denied. |
| `addUserToTeachersClass` | Checks teacher owns section but lets caller enroll self. | Current user self-enrollment into valid teacher section, or teacher/admin enrollment. | Keep if product wants self-join; validate section/course status and avoid arbitrary user enrollment. | `classSelection.ts`. | User cannot enroll another user; invalid teacher/section denied. |
| `addUserDueDateException` | Mutates user exceptions without visible caller role check. | Course-owning teacher/admin. | Verify class/course owner and TDF assignment. | `instructorReporting.ts`. | Student denied; unrelated teacher denied. |
| `removeUserDueDateException` | Mutates user exceptions without visible caller role check. | Course-owning teacher/admin. | Same as add path. | `instructorReporting.ts`. | Student denied; unrelated teacher denied. |
| `checkForUserException` | Reads another user's exceptions by user id. | Current user self, course-owning teacher, or admin. | Add relationship check. | No direct client caller found in audit grep. | Cross-user denied. |

### Patch Slice 4: Content Upload And Owner Lookup Helpers

Goal: avoid broad content/owner metadata exposure through convenience methods.

| Method | Current risk | Intended access | Action | Client callers found | Test needed |
| --- | --- | --- | --- | --- | --- |
| `getTdfOwnersMap` | Returns usernames for arbitrary owner ids. | Only owners of TDFs visible in current content-upload list, or admin. | Restrict to owner ids tied to caller-accessible TDFs; project display identifier only. | No direct client caller found in audit grep. | Arbitrary user lookup denied. |
| `getTdfsByOwnerId` | Returns all TDFs for arbitrary owner id. | Current owner/admin only, or remove. | Remove if unused; otherwise require self/admin and project fields. | No direct client caller found in audit grep. | Cross-owner denied. |
| `getAccessors`, `getAccessorsTDFID` | Accessor list exposure. | TDF owner only. | `getAccessorsTDFID` already checks owner; confirm `getAccessors` projection and owner check are sufficient. | `contentUpload.ts`. | Accessor/non-owner denied. |
| `processPackageUpload`, `saveContentFile`, `saveTdfContent`, `saveTdfStimuli`, `copyTdf`, `deletePackageFile`, `removeAssetById`, `removeMultipleAssets` | High-impact content mutation paths. | Owner/accessor/admin as already mostly implemented. | Keep existing checks, add negative tests around owner/accessor boundaries and package asset ownership. | Content upload/editor flows. | Cross-owner asset/TDF mutation denied. |
| `getPackageDownloadLink`, `getStimuliFileForTdf` | Content export/download. | Owner/accessor only. | Existing checks look aligned; add tests. | `contentUpload.ts`. | Public/student without upload access denied. |

### Patch Slice 5: System, Debug, And Operational Methods

Goal: keep operational tools useful without making them public controls.

| Method | Current risk | Intended access | Action | Client callers found | Test needed |
| --- | --- | --- | --- | --- | --- |
| `getServerStatus` | Disk/server status exposed. | Admin only unless intentionally public health data. | Require admin; keep `/health` for public health if needed. | `adminControls.ts`. | Student denied. |
| `setVerbosity`, `getVerbosity` | Server logging behavior exposed. | Admin only. | Require admin. | `adminControls.ts`, sign-in debug indirectly uses debug methods. | Student denied; admin allowed. |
| `serverLog`, `debugLog` | Public-ish log injection/PII risk. | Remove, admin-only, or replace with rate-limited structured client log endpoint. | Prefer remove if only legacy sign-in traces use it. | `signIn.ts`. | Anonymous/student cannot spam server logs. |
| `sendUserErrorReport` | Accepts arbitrary user/session/log payload without visible auth/rate-limit. | Authenticated self or rate-limited anonymous crash reporting. | Set `user` from `this.userId` when present; rate-limit; cap payload sizes. | `client/index.ts`, `historyLogging.ts`. | Payload too large denied; unauthenticated rate-limited. |
| `logUserAgentAndLoginTime` | Updates any user id passed by client. | Current user only. | Ignore parameter or require it equals `this.userId`. | `signIn.ts`. | Cannot update another user. |
| `generateFaviconsFromLogo` | ImageMagick subprocess from user-supplied data. | Admin only. | Require admin like other theme mutation methods; cap payload size. | No direct client caller found; theme property flow uses deferred generation after admin check. | Student denied; large payload denied. |
| `ensureClientVerbositySetting`, `setClientVerbosity` | Admin setting path. | `ensure` may be admin/internal; `set` already admin-only. | Consider making `ensure` admin-only or startup-only. | `adminControls.ts`. | Student denied if kept public. |

### Patch Slice 6: MTurk/Turk Workflow Methods

Goal: keep legacy MTurk operations scoped to experiment owners/admins.

| Method | Current risk | Intended access | Action | Client callers found | Test needed |
| --- | --- | --- | --- | --- | --- |
| `getTurkWorkflowExperiments` | Already scoped to owner/admin. | Owner/admin. | Keep; add test if missing. | `turkWorkflow.ts`. | Non-owner cannot list others' experiments. |
| `getUsersByExperimentId` | Authenticated but not visibly owner/admin scoped. | Experiment owner/admin. | Verify caller owns experiment or is admin before listing workers. | `turkWorkflow.ts`. | Non-owner denied. |
| `saveUserAWSData` | Stores encrypted AWS credentials for current user. | Current user only. | Keep; confirm no secret logging. | `turkWorkflow.ts`. | Unauthenticated denied. |
| Legacy `server/turk_methods.ts` methods | Large older method set registered separately. | Owner/admin/current worker depending on method. | Audit separately before release; do not assume focused method split covered it. | `turkWorkflow.ts`, experiment instructions. | At least one deny test per public MTurk mutation/export. |

## Suggested Implementation Order

1. Add a method registry comment/table near `serverComposition.ts` or a test fixture listing every registered method and intended access class.
2. Remove unused helper methods from `asyncMethods` first. This reduces the public surface before deeper edits.
3. Split internal lookup helpers from public access-checked methods for TDF and stimuli reads.
4. Harden history insertion and condition-count mutation.
5. Harden course/assignment/due-date mutations.
6. Harden system/debug methods.
7. Add targeted deny tests after each slice.
8. Run `npm run typecheck` and `npm run lint` after every slice.

## Minimum Negative Test Matrix

Add tests at the method-factory level where possible, plus one integration-style test for actual `Meteor.methods` registration if practical.

1. Anonymous caller cannot call TDF/stimulus read methods.
2. Student cannot fetch a private/unassigned TDF by id, filename, or stimuliSetId.
3. Student cannot insert history for another user.
4. Student cannot mutate `conditionCounts` for an arbitrary TDF.
5. Teacher cannot query another teacher's course list or performance data.
6. Teacher cannot edit another teacher's course assignments.
7. Accessor can manage content only where accessor policy allows it, but cannot download owner-only raw data.
8. Admin can perform admin-only operational actions.
9. Public/error-report endpoint rejects oversized payloads and is rate-limited.
10. Removed helper methods are not present in the registered method map.

## Important Follow-Ups After Blockers

These should not necessarily block `v0.1.0` if the release is clearly marked pre-1.0, but they should be tracked.

1. Replace AES-CBC encrypted secret storage with authenticated encryption for new writes, with a migration/read compatibility plan for existing encrypted values.
2. Prefer server-side API proxying so Google Speech/TTS keys do not need to be returned to clients.
3. Reduce lint warning count, especially unused code in old helper modules.
4. Resolve or intentionally document `typecheck:vendor` declaration conflicts.
5. Clean up Knip unused export findings after method exposure cleanup.
6. Review `legacy-app/` messaging in repo docs so modern-app maintainers know `svelte-app/mofacts` is canonical for active development.
7. Consider moving to a clean modern-only repo after the first formal release is cut and cited.

## Recommended Minimum Remediation Checklist Before Tagging

1. Method inventory complete: every registered Meteor method has an access classification.
2. Public helper exposure reduced: internal helpers are no longer directly registered.
3. TDF/stimulus reads require canonical access checks and return scoped fields.
4. History/data export methods enforce owner/teacher/admin boundaries.
5. Course/class mutation methods enforce admin or course-owning teacher boundaries.
6. Debug/system methods are admin-only, authenticated, rate-limited, or removed.
7. Dynamic asset privacy model is documented and enforced.
8. `CITATION.cff` and release notes reflect the intended first formal release.
9. Runtime version/build marker exists.
10. Verification results are recorded for lint, typecheck, tests, and canonical deploy/build validation.

## Suggested Release Strategy

Use semantic versioning for formal releases.

Recommended first formal tag: `v0.1.0`

Recommended sequence:

1. Harden the method surface on `Video-System-Upgrade` or a dedicated release-prep branch.
2. Merge to `main` once reviewed.
3. Tag `main` as `v0.1.0`.
4. Create a GitHub Release with:
   - summary of the modern app baseline,
   - known limitations,
   - verification evidence,
   - Docker/image tag if applicable.
5. Enable or update Zenodo DOI integration so the release is citable.

If a pre-release is useful before full hardening, use `v0.1.0-rc.1` rather than calling the current branch final.
