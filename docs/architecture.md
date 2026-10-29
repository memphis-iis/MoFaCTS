# Architecture Overview

MoFaCTS, the Mobile Fact and Concept Training System, is a Meteor/Svelte web application for adaptive learning practice, assessment, and research.

## Main Application Areas

- `mofacts/client/`: browser application, including learner-facing practice flows, administration screens, content upload, and Svelte components.
- `mofacts/common/`: shared types, helpers, and logic used by client and server code.
- `mofacts/server/`: server startup, publications, methods, authentication, imports, exports, and persistence logic.
- `mofacts/packages/`: local Meteor packages used by the application.
- `mofacts/public/`: static client assets and theme resources.
- `deploy/`: Docker Compose build and deployment workflow.

## Learning Content

MoFaCTS lessons are driven by Tutor Definition Files (TDFs). A TDF defines lesson structure, stimulus and response behavior, scheduling parameters, and supporting metadata. TDFs may reference text, images, audio, video, cloze prompts, multiple-choice options, typed responses, and speech-recognition-based responses.

## Adaptive Practice

The learner-facing flow combines content from TDFs with adaptive scheduling logic based on cognitive memory models. The application records learner interactions and uses those interactions to select and present later practice opportunities.

## Client Runtime

The central application theme owns presentation, including generated instructional markup and shared tables. See [central application presentation](theme-presentation.md) for stylesheet ownership and verification.

The active learner card experience uses Svelte components and state-machine-oriented runtime logic. Existing Meteor client code still provides routing, data subscriptions, account context, administrative workflows, and integration points.

## Learning Component Modularity

Reusable unit behavior lives under `learning-components/`. Component registration and explicit runtime capabilities define unit/trial boundaries. SPARC owns current AutoTutor dialogue; the original standalone AutoTutor runtime is removed. See [the removal boundary](standalone-autotutor-removal.md). See `../docs-developer/modularity-extension-boundary-plan.md`.

For current contributor work, treat `learning-components/` as the source root for unit behavior:

- Unit packages live under `learning-components/units/`.
- Unit manifests live in `learning-components/units/*/manifest.ts`.
- The default in-repo component catalog is `learning-components/defaultLearningComponentCatalog.ts`.
- The app-facing unit creation facade is `learning-components/units/createUnitEngine.ts`.
- The app path `mofacts/client/views/experiment/unitEngine.ts` should stay a behavior-preserving dependency facade.

The public package at `packages/unit-engine-api` is not the implementation entry point yet; it is a scaffold for a future stable contract. See [development.md](development.md#modify-or-add-a-unit-type) and [learning-component-contracts.md](learning-component-contracts.md) before adding or changing a unit type.

## Server Runtime

Server code handles persistence, authentication and authorization checks, content upload, external integrations, import/export workflows, and data access that cannot safely run on the client.

New server methods should be added only when the task requires database access, authentication enforcement, secret handling, or external service access. Pure computation should live in `common/` or client-side code.

### Incremental Dashboard Progress

Practice saves record history without rebuilding dashboard summaries. `server/lib/historyCommitStorage.ts` owns single-record and assessment-batch commits: each new row receives a per-user `historySequence` in the same Mongo transaction as the source counter update. Duplicate durable writes receive no new sequence. Server-only `HistoryCommitState` stores that counter and a `repairRevision`; it is independent of the disposable dashboard cache. All active history writers must use this owner.

On dashboard entry, `dashboardHistoryRefresh.ts` reads only the committed sequence range after `lastHistorySequence`, in projected batches of at most 1,000 rows. It resolves the lessons in those rows, updates their existing statistics, and retains unchanged lessons. Statistics and the consumed source position commit together in one snapshot transaction. The cache's `historyTdfTargets` records the source-to-root grouping actually summarized; a changed grouping encountered with new activity requests a full repair in that same snapshot. Interface timestamps and arbitrary history IDs do not certify freshness.

Full scans are reserved for missing, old-version or incomplete caches, explicit administrator refresh, and repair after reset, archival, restore or a detected grouping change. Initialization includes existing unsequenced histories without modifying them. Reset and bounded archival advance the affected learner's repair revision atomically with their history mutation. Administrative cache pruning invalidates its processed position. Restore validates committed sequences, reconciles source counters and clears derived dashboard fields while retaining learner settings before replacing database collections. Account deletion removes source metadata too.

The normal delta index is `{userId, historySequence}` with uniqueness limited to sequenced rows. Initialization/repair uses `{userId, _id}`; archival uses its TDF/user/archive/ID index. The supported replica set supplies snapshot transactions and write-conflict retries. A first-source or durable-ID duplicate-key race permits one fresh transaction; other failures propagate. Update all history-writing application instances together when first introducing this contract; older writers cannot remain active after a versioned cache baseline is established. Required source indexes are created by the normal startup index owner.

The isolated regression path is `node scripts/sparcAutoTutorRules.test.cjs --include-history-contracts` from `mofacts/`. It exercises synthetic transaction boundaries and aggregate parity. Actual Meteor/Mongo integration requires the supported integration environment and fresh authorization for `npm run test:ci`.

### Administrative Queries and History Downloads

`filteredUsers` publishes a bounded snapshot of the requested user page. Its returned role-assignment cursor is reactive only for those users and includes `user._id` and `inheritedRoles._id`, the fields consumed by the role UI. Re-subscribing replaces page membership through Meteor's normal publication lifecycle. It does not publish the deployment's full role-assignment collection.

Owned-lesson exports use `downloadDataByTeacher` or `downloadDataById` to authorize an exact lesson scope and issue a five-minute, single-use `/data-download/owned-history` URL. The HTTP boundary rechecks the user and scope before reading and again after sorting, before returning data. Lesson discovery projects only the required IDs and authorization metadata; history queries group at most 500 lesson IDs and return projected rows in cursor batches of 500. The existing TSV formatter and student/time ordering are retained. Backpressure and connection cancellation propagate to cursor and scratch-file cleanup.

`server/lib/boundedExternalSort.ts` owns the stable external sort shared by exports and course migration ordering. It uses bounded in-memory runs, a bounded merge fan-in and private temporary files; records retain their Date and numeric values. Successful completion, errors and cancellation remove the active run. Canonical startup cleans only this owner's marked runs whose process is no longer alive. These files contain sensitive export or migration data and must remain in the server's private temporary storage.

The obsolete `getOutcomesForAdaptiveLearning` method and unbounded `userHistory` publication have been removed. Adaptive learning reads raw authorized outcomes through `getAdaptiveOutcomeRows`; dashboard reads use the incremental cache contract above. `listSparcMoveLibrary` remains an authorized administrative listing pending confirmation of external consumers; new UI work uses the unified instructional-component listing.

## Deployment

The canonical deployment workflow is Docker Compose under `deploy/`. Public documentation should point to that workflow for release-confidence build and deployment validation.
