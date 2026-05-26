# Lesson Launch/Resume Cleanup Plan

## Goal

Make lesson launch, initialization, resume, and delivery-settings resolution maintainable under the current TDF schema.

The target runtime should have clear invariants:

- dashboard/listing TDF projections are metadata only
- `/card` receives only a full launch-ready TDF, except for condition roots before condition resolution
- persisted experiment state contains durable control-plane state only
- mapping signatures are written only after launch context is complete
- `deliverySettings` is the only runtime delivery-configuration surface
- obsolete fallback paths are deleted instead of preserved as compatibility layers

## Non-Goals

- Do not reintroduce `deliveryparams` or `uiSettings` runtime reads.
- Do not add broad compatibility fallbacks for ambiguous stale `Session` state.
- Do not mutate existing learner progress records as part of the cleanup unless a separate repair/migration is explicitly approved.
- Do not use local Meteor CLI runs as release-confidence checks.

## Current Problem Shape

The launch/resume runtime currently has three state surfaces that can disagree:

- `Session`, which stores live navigation/runtime context.
- `ExperimentStateStore`, which caches persisted experiment state on the client.
- `global_experiment_state`, which stores durable resume/control-plane fields.

Recent partial-TDF failures likely came from treating the `dashboardTdfsListing` projection as runnable TDF content. That projection intentionally includes only:

- `content.tdfs.tutor.setspec`
- `content.tdfs.tutor.unit.learningsession`

This is enough for dashboard display and configure visibility, but it can make instruction-only units appear as empty objects. If that partial TDF reaches `/card`, unit type derivation fails because the unit has no `assessmentsession`, `learningsession`, `videosession`, or instruction fields.

## Canonical Runtime Invariants

Before entering `/card` for a runnable lesson:

- `currentTdfFile` must contain `tdfs.tutor.setspec`.
- `currentTdfFile.tdfs.tutor.unit` must be a non-empty full unit array.
- Each runnable unit must contain exactly enough structure to derive its type:
  - `assessmentsession` for schedule units
  - `learningsession` for model units
  - `videosession` for video units
  - instruction fields and no session object for instruction-only units
- `currentUnitNumber` must be a zero-based active unit index.
- `currentTdfUnit` must equal `currentTdfFile.tdfs.tutor.unit[currentUnitNumber]`.
- A condition root without a unit array is valid only before condition resolution, never as a runnable card TDF.

Persisted `global_experiment_state.experimentState` should allow only durable control-plane fields:

- `clusterMapping`
- `mappingSignature`
- `conditionTdfId`
- `experimentXCond`
- `subTdfIndex`
- `schedule`
- `scheduleUnitNumber`
- `currentRootTdfId`
- `currentTdfId`
- `currentUnitNumber`
- `lastUnitCompleted`
- `experimentTarget`
- `lastActionTimeStamp`

Fields outside that contract should not be written or read as if they persist.

`subTdfIndex` is durable for multi-TDF lessons. It identifies the selected sub-TDF/condition path a learner began with and must survive refresh/resume, especially when randomized or condition-like multi-TDF flows are involved.

## Minimal Patch Sequence

### 1. Add One Launch-Ready TDF Loader

Create one client helper that all launch/resume entry points use.

Suggested name:

- `loadLaunchReadyTdf(tdfId, options)`

Responsibilities:

- subscribe or call `getTdfById` as needed
- normalize single-object `tutor.unit` to an array if still required
- reject dashboard/listing projections as not launch-ready
- allow unitless condition roots only when explicitly requested
- apply learner TDF config when requested
- return the boxed TDF document plus full content

Replace duplicated full-TDF logic in:

- `mofacts/client/views/home/learningDashboard.ts`
- `mofacts/client/views/home/home.ts`
- `mofacts/client/views/experiment/svelte/services/resumeService.ts`

### 2. Split Launch Logic From UI Surfaces

Make one canonical launch initializer for both Learning Dashboard and experiment/direct-entry starts.

Suggested shape:

- `prepareLessonLaunchFromDashboard(rowContext)`
- `navigateForPreparedLessonLaunch(preparedLaunch)`

Keep UI-specific concerns in the templates/routes, but move shared work out:

- active TDF context
- condition root setup
- full TDF load
- learner config application
- audio settings setup
- experiment-state lookup
- entry-intent classification
- multi-TDF routing

Learning Dashboard is the only normal content-launch surface. Experiment sign-in/direct-card bootstrap launch through `client/lib/lessonLaunchRunner.ts`:

- `client/lib/router.ts`
- `client/views/login/signIn.ts`

Experiment/direct-entry callers should not import launch code from `home.ts`; they now use the shared launch runner.

### 3. Make Experiment State Writes Match The Persisted Contract

Delete or replace writes for fields currently filtered out by `mergeExperimentState`, including:

- `currentTdfFile`
- `currentTdfUnit`
- `lastUnitStarted`
- `unitType`
- `TDFId`

Then remove read paths that expect those fields to come back from persisted state.

Confirmed impossible fallback:

- `instructions.ts` tries to recover `experimentState.currentTdfFile`, but `experimentState.ts` filters that field out.

### 4. Stage Mapping Writes Later

Mapping state should be created only after these are resolved:

- full current TDF content
- root TDF id
- active condition TDF id, if any
- stimuli set id
- current stimuli set
- stim count

Do not write `mappingSignature` or `clusterMapping` during a partial or failed launch.

If launch has no durable learner progress, missing or incompatible mapping can be recreated and overwritten.

### 5. Split Launch-History From Mapping-Progress Semantics

Keep these as separate predicates:

- launch/resume history: enough to decide whether Start should resume or start fresh
- mapping-progress evidence: enough to hard-stop a mapping mismatch

`currentUnitNumber` and `lastUnitCompleted` may identify where the learner was, but by themselves should not hard-stop a mapping mismatch.

Hard-stop only when durable progress evidence exists, such as:

- non-empty learning history
- non-empty persisted outcome/study history
- assessment schedule artifact plus completed assessment trials
- video checkpoint history
- valid schedule cursor evidence

Instruction-only progress should not hard-stop mapping mismatch.

### 6. Add One Delivery Settings Resolver

Replace scattered delivery-settings merge/sanitize logic with one resolver.

Suggested name:

- `resolveCurrentDeliverySettings({ tdfFile, unit, experimentXCond, unitType, tdfName })`

Responsibilities:

- select per-condition deliverySettings array entry when applicable
- merge tutor-level and unit-level settings
- apply timing/control defaults
- apply display defaults
- normalize aliases
- validate supported display/runtime values
- return one complete runtime object

Use it from:

- `svelteInit.ts`
- `resumeService.ts`
- `unitProgression.ts`
- `unitEngineService.ts`
- legacy `unitProgression.ts`, if still active
- card machine prepared-trial paths

### 7. Make `/card` Preconditions Explicit

At the top of card initialization, fail clearly if:

- `currentTdfFile` is missing
- `currentTdfFile` is a listing projection
- `currentUnitNumber` is missing for non-initial entry
- `currentUnitNumber` is out of bounds
- `currentTdfUnit` does not match the full TDF unit list
- condition root resolution was required but did not produce a runnable condition TDF

These should be errors or user-visible launch failures, not silent reconstruction attempts.

### 8. Add Focused Regression Tests

Add tests for:

- dashboard listing projection with instruction-only unit 0 must not reach card bootstrap as runnable content
- Start on a fresh two-unit lesson writes no meaningful progress before launch preconditions pass
- instruction-only continue advances to unit 1 without making mapping mismatch hard-stop later
- failed launch with only mapping artifacts can be retried as no-progress
- full TDF loader accepts condition root only in condition-resolution mode
- deliverySettings resolver merges tutor and unit settings consistently

## Dead/Cruft Deletion Candidates

### High Confidence

- Runtime reads of `experimentState.currentTdfFile`.
- Runtime reads/writes of `experimentState.currentTdfUnit`.
- Writes of `lastUnitStarted` if no current persisted contract uses it.
- Writes of `unitType` and `TDFId` into experiment state.
- Filtering out `subTdfIndex`; it should be intentionally added to the durable experiment-state contract for multi-TDF resume.
- Duplicate `pickDeliverySettings` helpers.
- Duplicate dashboard/home launch code.
- Session fallbacks that restore `currentTdfUnit` from persisted full TDF state.
- Delivery settings double-set sequences such as setting `getCurrentDeliverySettings()` and then immediately setting sanitized merged settings.

### Medium Confidence

- `sessionCleanUp()` branches that preserve unit state for `/card` transitions once launch preconditions become explicit.
- Legacy non-Svelte `unitProgression.ts` branches if the Svelte path is now canonical.
- Any remaining non-dashboard launch behavior that is not routed through `client/lib/lessonLaunchRunner.ts` or Learning Dashboard.

### Keep For Now

- `normalizeTutorUnits`, if uploaded/generated TDFs may still contain a single unit object.
- `deliverySettingsMigration.ts`, conversion scripts, and migration tests.
- Dashboard partial publications, as long as their outputs are treated as metadata only.
- `getTdfById` server access helpers, because they are the authorization boundary for full content.

## Risks In Current Local Patches

- The shared launch-ready boundary is now used by dashboard/home launch and resume, but still needs focused regression tests.
- `resumeService.ts` now persists selected xcond/mapping/condition/current-unit state after the current unit is resolved, but mapping signature creation still happens before all later engine reset work completes.
- `cardEntryIntent` and mapping policy use different definitions of meaningful state. That is probably correct conceptually but needs explicit naming and tests.
- Delivery settings are now current-schema only and use a canonical resolver; remaining risk is missing resolver tests for timing/display merge coverage.

## Implemented Slices

- Added a shared launch-ready TDF loader and routed Learning Dashboard plus experiment/direct-entry launch through it.
- Added `subTdfIndex` to the durable experiment-state contract.
- Removed new writes of filtered experiment-state fields such as `currentTdfFile`, `currentTdfUnit`, `lastUnitStarted`, `unitType`, and `TDFId`.
- Removed stale recovery from persisted `currentTdfFile` during standard Svelte init and instruction continue.
- Persisted resume-staged durable decisions after the active unit is proven loadable.
- Delayed standard-init mapping state writes until after engine initialization/resume loading succeeds, while still applying the mapping record to live `Session` state for the engine.
- Added one Svelte runtime delivery display-settings resolver and replaced duplicated local `pickDeliverySettings` helpers in standard init, resume, unit progression, and unit-engine trial preparation.
- Replaced the display-only resolver with a full client `resolveCurrentDeliverySettings` helper that resolves timing/model settings and display settings from the same authored `deliverySettings` object, then routed `getCurrentDeliverySettings` and Svelte/test callers through it.
- Extracted shared lesson launch preparation for Learning Dashboard and experiment/direct-entry launch, moved resume root/condition loading to the launch-ready TDF boundary, removed resume's late missing-units fetch fallback, and added explicit standard `/card` preconditions before mapping/engine initialization.
- Removed redundant delivery-settings writes in standard init/resume and replaced stale multi-TDF lock checks that depended on unpersisted `lastUnitStarted/currentTdfUnit` with durable `currentUnitNumber` plus the loaded full unit list.
- Moved the delivery-settings validator out of Svelte utilities into `client/lib`, added `refreshCurrentDeliverySettingsStore()` as the explicit store-refresh invariant, and removed the `msig_v1_*` mapping-signature compatibility exception.
- Collapsed `CARD_REFRESH_REBUILD` into a bootstrap-only signal. Card initialization dispatch now receives the resolved real intent, and refresh classification treats either `currentUnitNumber >= unitCount` or `lastUnitCompleted >= unitCount - 1` as completed.
- Added `client/views/experiment/engineConstructors.ts` as the current engine-construction boundary. Svelte init/resume no longer import root `unitEngine.ts` constructors directly, and resume engine reset now fails clearly for units that have no runnable session or instruction-only content.
- Added `client/lib/lessonLaunchRunner.ts` for experiment/direct-entry launch. `/card` bootstrap and experiment sign-in no longer import `selectTdf` from `home.ts`, and the home page no longer owns runnable lesson launch code.
- Removed `Session.get('unitEngine')` coupling from `client/lib/plyrHelper.ts`. Plyr/video helper initialization now requires an explicit current engine handle, and the Svelte video service passes `context.engine` instead of relying on Session.
- Removed lesson-version product architecture. Dashboard no longer gates by lineage/current-version metadata, upload/edit no longer blocks overwrites with "publish vN+1", and runtime resume warnings now describe saved-progress incompatibility instead of version routing.

## Mapping Signature Policy

`msig_v1_*` was a format-migration exception: old persisted mapping signatures were allowed to mismatch the current `msig_v2_*` calculation without being treated as incompatible progress. That bridge has been removed. A persisted old-format signature now follows the same resume-compatibility policy as any other stale mapping signature.

## Non-Svelte Root Experiment Dependency Map

These are not deletion-ready dead files. They are older/root experiment modules that still sit under current product routes.

`client/views/experiment/unitProgression.ts` is still product-active through:

- `client/views/experiment/instructions.ts`, which imports `revisitUnit` and `unitIsFinished`.
- `client/views/experiment/unitEngine.ts`, which imports `unitIsFinished`.
- `/instructions`, which is a current product route rendered by `client/lib/router.ts`.

`client/views/experiment/unitEngine.ts` is still product-active through:

- `client/views/experiment/engineConstructors.ts`, which wraps `createScheduleUnit`, `createModelUnit`, `createEmptyUnit`, and `createVideoUnit`.
- `client/views/experiment/svelte/services/unitEngineService.ts` and `client/views/experiment/svelte/services/resumeService.ts`, which now depend on `engineConstructors.ts`.
- `client/views/experiment/svelte/services/svelteInit.ts`, `client/views/experiment/svelte/machine/actions.ts`, and `client/views/experiment/svelte/machine/services.ts`, which depend on `unitEngineService.ts`.

Tester-only paths do not import the root engine directly:

- `client/views/test.ts` uses `getCardDataFromEngine` from the Svelte `unitEngineService.ts`.
- Svelte integration tests import the Svelte `unitEngineService.ts`, not the root `unitEngine.ts` directly.

Related product residue:

- `client/lib/plyrHelper.ts` is still product/compat-active for root video cleanup and helper paths, but it no longer reads `Session.get('unitEngine')`.
- `client/views/home/home.ts` is not the normal content-launch UI and no longer exports `selectTdf`. Experiment/direct-entry launch now runs through `client/lib/lessonLaunchRunner.ts`.

Safe cleanup applied there for now:

- root `unitProgression.ts` now uses `refreshCurrentDeliverySettingsStore()` instead of writing `deliverySettingsStore.set(getCurrentDeliverySettings())` directly.

Deletion should wait for explicit extraction/replacement:

- Move engine constructors out of `client/views/experiment/unitEngine.ts` into a neutral engine factory or Svelte-owned runtime module.
- Move instruction progression off root `unitProgression.ts` or make a shared progression service used by both `/instructions` and Svelte card completion.
- Done: experiment/direct-entry launch has moved off `home.selectTdf` and onto `client/lib/lessonLaunchRunner.ts`.
- Done: remove `Session.get('unitEngine')` helper coupling after video/audio paths use an explicit current-engine handle.

## Legacy Field Audit

Current `deliveryparams` / `uiSettings` search results classify as:

- Active runtime bug: none found in app runtime paths after the current cleanup.
- Migration-only legacy support: `common/lib/deliverySettingsMigration.ts` and `scripts/convertConfigDeliverySettings.ts`.
- Test fixture: `common/lib/deliverySettings.test.ts` intentionally exercises migration from legacy fields.
- Documentation/plans: delivery-settings cutover/consolidation docs and older planning docs.

No current-schema runtime path should read `deliveryparams` or `uiSettings`; new runtime code should use `deliverySettings` through `resolveCurrentDeliverySettings`.

## Verification Plan

After TypeScript-bearing changes:

```bash
cd C:\dev\MoFaCTS\mofacts
npm run typecheck
```

Recommended targeted tests before broader verification:

- card entry intent tests
- mapping progress policy tests
- resume runtime integration tests
- prepared advance integration tests
- delivery settings resolver tests
- learner TDF config tests

Do not run:

- `meteor run`
- Docker build/push/deploy commands

## Open Questions

1. Resolved: `client/views/home/home.ts` is not the supported normal content-launch surface. Content launch should come from Learning Dashboard. Experiment sign-in/direct-card bootstrap now imports `selectTdf` from `client/lib/lessonLaunchRunner.ts`, so `home.ts` no longer owns runnable launch code.
2. Resolved: multi-TDF `subTdfIndex` is durable resume state. It must survive refresh/logout and belongs in the allowed experiment-state contract.
3. Resolved: instruction-only units count as units. Completing one should advance `currentUnitNumber`/unit completion state. The cleanup question is narrower: instruction-only completion alone should not be treated as mapping-relevant trial progress that hard-stops a mapping mismatch.
4. Resolved: `msig_v1_*` mapping-signature compatibility was deleted. Old signatures now follow normal mismatch policy.
5. Likely resolved: `lastUnitStarted` appears redundant with `currentUnitNumber`. Prefer removing it from new writes and from resume decisions unless a specific lockout/reporting path proves it still needs a separate durable meaning.
6. Should `currentUnitNumber === unit.length` be the only completion sentinel, or should `lastUnitCompleted === unit.length - 1` also block relaunch?
7. Are video checkpoint completions persisted only in history, or is there a separate durable state field the cleanup must preserve?

## Final Recommendation

Do the cleanup as a boundary-first patch series:

1. full TDF boundary
2. experiment-state contract cleanup
3. mapping write staging
4. deliverySettings resolver
5. dead-code deletion

Avoid adding more fallbacks while doing this. The system becomes maintainable when ambiguous state is rejected at the boundary instead of reconstructed deeper in the runtime.
