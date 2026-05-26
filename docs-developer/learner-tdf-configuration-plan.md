# Learner TDF Configuration Plan

## Goal

Add a learner-facing configuration area to the Learning Dashboard so users can adjust a small set of practice settings for each available lesson/system without editing the underlying TDF.

The UI should present novice-friendly controls, while the stored data remains TDF-like and sparse. Saved values are learner-specific and lesson-specific. When a learner starts or continues practice, the runtime should prefer the saved learner configuration over the original TDF values.

The implementation should center on one shared configuration module. The dashboard UI, save method, and practice launch merge should all use the same allowlist, labels, defaults, coercion, validation, and path mapping.

## User Experience

Each standard lesson/system card on the Learning Dashboard gets a Configure button. Pressing Configure opens an inline area under that system. The section is not a modal.

The Configure button is globally available for standard Learning Dashboard systems. The first implementation does not require per-course or per-TDF opt-in.

The inline area uses a three-level flow that progressively narrows the learner's choice:

1. Select which TDF scope to configure: lesson/set specification or a specific unit.
2. Select which kind of settings to change: delivery parameters or UI parameters.
3. Edit the actual settings and save.

Each selection step replaces the contents of the inline area with the next level. The first two levels do not save changes; they only navigate the learner to the relevant setting group. The actual settings level includes a Save button. Saving writes the sparse override to the learner dashboard cache and closes the inline area.

The current dashboard listing intentionally excludes `content.tdfs.tutor.unit` for performance. Opening Configure should fetch the full TDF only for the selected lesson if unit data is not already present. Do not add units back to the dashboard listing publication just to support configuration.

The inline area contains simple controls instead of raw TDF field names. Examples:

- Toggle: show performance while practicing
- Select: spoken audio mode
- Slider: microphone sensitivity
- Number or slider: answer timeout

The UI should show only essential fields. It should not expose arbitrary TDF editing.

When the inline area opens, its starting values are loaded from the original TDF, with any saved learner overrides layered on top. In other words, the learner sees the effective value that will be used in practice. If no learner override exists for a field, the displayed value comes directly from the TDF.

If a value is customized, the settings level should make that visible and allow the learner to reset it to the TDF default.

## Storage Model

Learner changes are saved in the learner dashboard cache document for that TDF/system. The cache stores only changed values, not a copied TDF.

Because the Learning Dashboard cache is already per user, learner configuration stored there is personal by default. Store learner TDF configuration in the same `UserDashboardCache` document, but keep it separate from `tdfStats` because dashboard cache refresh/update methods recompute `tdfStats`.

Recommended shape:

```json
{
  "userId": "learner123",
  "tdfStats": {},
  "learnerTdfConfigs": {
    "tdfOrRootId": {
      "source": {},
      "overrides": {}
    }
  },
  "version": 1
}
```

This keeps configuration scoped to the learner cache without making progress-stat recomputation responsible for preserving nested custom fields inside each stats entry.

The original TDF remains the source for starting/default values. The learner dashboard cache should not need to be pre-populated with every configurable field; it should be populated only when the learner changes a setting.

The saved `overrides` structure should be TDF-like:

```json
{
  "setspec": {
    "audioPromptMode": "feedback",
    "audioInputSensitivity": 45,
    "uiSettings": {
      "displayPerformance": true
    }
  },
  "unit": {
    "0": {
      "deliveryparams": {
        "drill": 30000,
        "reviewstudy": 6000
      }
    },
    "1": {
      "deliveryparams": {
        "drill": 45000
      }
    }
  }
}
```

The `unit` object uses zero-based string indices. Unit `"0"` means the first TDF unit, unit `"1"` means the second TDF unit, and so on. This matches array indexing, serializes cleanly in Mongo, and avoids ambiguity while preserving a sparse override shape.

The saved configuration should also carry lightweight source metadata so stale overlays can be detected:

```json
{
  "source": {
    "tdfId": "abc123",
    "tdfUpdatedAt": "2026-05-06T14:00:00.000Z",
    "unitCount": 2,
    "unitSignature": [
      "Intro",
      "Practice"
    ]
  },
  "overrides": {
    "setspec": {},
    "unit": {}
  }
}
```

The exact timestamp/hash field should use whatever reliable TDF metadata already exists. If the TDF has an updated timestamp, use that. If not, compute a small deterministic signature from the configurable source fields, ordered unit labels, and unit count.

Do not use display labels alone as the only unit signature; labels are useful for diagnostics, but repeated or edited labels should not cause unit overrides to drift onto different units.

## Shared Configuration Module

Add a pure TypeScript module, likely under `mofacts/common/`, that owns learner-config behavior:

- allowlisted field definitions
- novice labels and control metadata
- TDF path for each field
- scope support: `setspec` or `unit`
- family support: UI parameters or delivery parameters
- value conversion between UI units and TDF storage units
- validation and normalization
- sparse override pruning
- stale source metadata checks
- pure `applyLearnerTdfConfig(baseTdf, learnerConfig)` merge

The client can use this module for rendering and validation. The server save method can use the same module for validation before writing cache data. The practice runtime can use the same module for the final merge.

Keep the merge immutable from the caller's point of view: clone only the TDF branches that receive overrides, return the original object unchanged when there are no applicable overrides, and never mutate the published Minimongo document directly.

## Runtime Application

There should be one clear stage where learner configuration is applied to the TDF.

Whenever the client retrieves or prepares the TDF for a practice run, it should call an override function that merges learner configuration from the dashboard cache into the TDF. The merge should always prefer learner cache values over TDF values for allowlisted fields.

Conceptually:

```ts
const baseTdf = getTdfForLesson(tdfId);
const learnerConfig = getLearnerDashboardTdfConfig(tdfId);
const configuredTdf = applyLearnerTdfConfig(baseTdf, learnerConfig);
```

Practice startup and practice continuation should both receive the configured TDF. Changes should apply immediately: if a learner edits a setting and then starts or continues practice, the next TDF preparation should use the updated override values.

For the current dashboard launch path, the cleanest first hook is after the full TDF content has been loaded and `normalizeTutorUnits(curTdfContent)` has run, but before `Session.set('currentTdfFile', curTdfContent)` in `mofacts/client/views/home/learningDashboard.ts`. That lets audio preparation, Svelte init, unit engine setup, and downstream session state all see one configured TDF.

Continuation/resume needs the same hook wherever `resumeService.ts` restores or fetches `currentTdfFile`. Avoid a second ad hoc merge implementation there; call the same helper.

The runtime should not need to know whether a value came from the original TDF or from learner configuration, except for logging/audit where useful.

Invalid saved settings should fail clearly or be blocked before save. They should not silently fall back.

Before applying learner overrides, compare the saved source metadata with the current TDF. If the metadata indicates the TDF has changed, handle it explicitly:

- Set-spec overrides can usually remain valid if the allowlisted fields still validate.
- Unit overrides should be considered stale if the unit count or ordered unit signature changed.
- Stale unit overrides should not be silently applied to different unit indices.
- The UI should tell the learner that unit-specific settings need review or reset.

If stale unit overrides exist at launch time, skip those unit overrides and log/display a clear client message. Set-spec overrides may still apply if they pass validation. This is a visible, explicit partial apply, not a silent fallback.

## Server Methods And Publication

Add narrow methods instead of exposing raw cache writes:

- `saveLearnerTdfConfig(tdfId, configPatch)` validates the user, TDF access, source metadata, allowlisted paths, and values, then updates `UserDashboardCache.learnerTdfConfigs[tdfId]`.
- `resetLearnerTdfConfig(tdfId, scope?)` removes either all overrides for a TDF or a selected scope/family.

The existing `dashboardCache` publication already publishes the learner's own cache document. If the full config object is small and per user, it can ride on that publication. If it grows, project `learnerTdfConfigs` explicitly rather than broadening unrelated dashboard data.

`initializeDashboardCache`, `updateDashboardCacheForTdf`, and admin refresh flows should preserve `learnerTdfConfigs`. Do not overwrite the whole cache document with a shape that drops learner configuration.

## Inline Flow

The inline Configure area behaves like a small stepper embedded in the dashboard card. It is not a modal, and navigating between steps should replace the inline contents rather than expanding a large form.

### Level 1: Scope

The learner first chooses which part of the TDF they want to configure.

For a one-unit tutor:

- Lesson settings
- Unit 1

For a two-unit tutor:

- Lesson settings
- Unit 1
- Unit 2

For an N-unit tutor:

- Lesson settings
- Unit 1
- Unit 2
- ...
- Unit N

Lesson settings map to `setspec` fields. Unit selections map to `unit[N]` fields.

Unit labels should prefer the TDF unit name when available, with a stable fallback such as `Unit 1`, `Unit 2`, etc.

The Configure button appears for every standard system. Unit-level choices are generated from every TDF unit. If a unit does not use a displayed setting in practice, the implementation may hide or disable that individual control at the settings level, but the system still has a Configure area.

For owner-visible condition-pool root rows that have no direct unit array, the first implementation should either configure only the selected child TDF from the condition selector or show a clear inline message that root-level configuration is not available until a concrete condition is selected. Do not invent root-to-child propagation in the first release.

Selecting an item at this level clears/replaces the inline contents and moves to Level 2.

### Level 2: Setting Type

After the learner chooses Lesson settings or a specific unit, they choose the setting family:

- Delivery parameters
- UI parameters

For this learner-facing flow, UI parameters include presentation and interaction preferences, including audio prompt controls. This keeps the second level simple even though some stored fields live directly under `setspec` rather than inside `setspec.uiSettings`.

For Lesson settings, the available families should reflect allowlisted `setspec` fields. For example, if the first release only exposes `setspec` UI/audio fields and no `setspec` delivery parameters, the UI should hide the unavailable family instead of leading to an empty settings screen.

For Unit settings, delivery parameters are the first target. Unit UI parameters can use the same flow once allowlisted unit UI fields are added.

Selecting a setting family clears/replaces the inline contents and moves to Level 3.

### Level 3: Actual Settings

The final level shows the editable controls for the selected scope and setting family. This is the only level with a Save button.

The settings level should include:

- current effective values, loaded from TDF defaults plus learner overrides
- clear novice labels rather than raw TDF paths
- reset affordances for customized values
- Save button
- Cancel or Back affordance

Saving validates the selected settings, writes changed values to the learner dashboard cache, prunes reset values from the sparse override, and closes the inline area.

When a saved value matches the current TDF default, remove that path from `overrides`. If a scope becomes empty after pruning, remove the empty scope object too.

## Initial Setting Targets

Start with a very small allowlist.

### Set Spec

These are good first candidates because they are learner-facing and apply cleanly at the lesson/system level:

- `setspec.audioPromptMode`
- `setspec.audioInputSensitivity`
- `setspec.uiSettings.displayPerformance`

In the three-level flow, these appear under:

- Lesson settings
- UI parameters
- actual audio/performance controls

Audio settings should be per-system rather than global-only because audio usefulness depends heavily on the lesson/system. A learner may want question audio in one lesson, feedback audio in another, and silence elsewhere.

Implementation note: the existing launch path currently loads non-experiment audio state primarily from `Meteor.user().audioSettings`. If `audioPromptMode` and `audioInputSensitivity` are exposed as per-system TDF overrides, the launch audio-state setup must read the configured TDF/effective values so the UI state and runtime TDF do not disagree.

### Unit Delivery Parameters

Expose three or four essential `unit[N].deliveryparams` values:

- `unit[N].deliveryparams.drill`
- `unit[N].deliveryparams.reviewstudy`
- `unit[N].deliveryparams.correctprompt`
- `unit[N].deliveryparams.purestudy`

In the three-level flow, these appear under:

- Unit N
- Delivery parameters
- actual pacing controls

These are concrete learner-facing pacing controls:

- answer timeout
- incorrect review duration
- correct feedback duration
- study-card duration

They should be shown as novice-friendly controls, likely in seconds, even if the underlying TDF value is milliseconds.

Use bounded numeric controls rather than open-ended free text. The first release can use conservative min/max limits that match existing field registry expectations where available.

## Unit-Level Behavior

Unit-level settings are configured per unit.

If a tutor has one unit, the unit setting is straightforward: the learner edits the only unit's delivery parameters.

If a tutor has multiple units, Level 1 shows one choice per TDF unit. Saving a value in Unit 2 updates only the override bucket for `unit["1"]`.

The first implementation should avoid global "apply to all units" behavior. That can be added later after the per-unit model is stable.

## Allowlist Rules

Only allowlisted fields should be editable and mergeable. Do not accept arbitrary cache values and apply them to a TDF.

Avoid learner overrides for fields that affect topology, randomization, assignment, retention scheduling, or research design. Initial exclusions include:

- `setspec.shuffleclusters`
- `setspec.swapclusters`
- `setspec.loadbalancing`
- `setspec.condition`
- `setspec.randomizedDelivery`
- `unit[N].learningsession.clusterlist`
- `unit[N].assessmentsession.clusterlist`
- `unit[N].adaptive`
- `unit[N].adaptiveLogic`
- `unit[N].adaptiveUnitTemplate`
- `unit[N].deliveryparams.lockoutminutes`
- scoring fields such as `correctscore`, `incorrectscore`, and `scoringEnabled`

## Validation

Validation should happen before saving and again before applying overrides at practice startup.

Suggested initial validation:

- `audioPromptMode`: one of `silent`, `question`, `feedback`, `all`
- `audioInputSensitivity`: number between 20 and 80
- `displayPerformance`: boolean
- delivery timing fields: non-negative integer milliseconds with a practical upper bound

The UI can display timing fields in seconds, but storage should use the TDF-compatible millisecond values.

Validation should reject unknown paths, unknown unit indices, invalid scope/family combinations, and empty patches that claim to save changes. Return actionable messages suitable for inline display.

## Implementation Order

1. Add the shared common module with allowlist metadata, value conversion, validation, source metadata, pruning, and pure merge behavior.
2. Add focused unit tests for the common module before wiring UI: set-spec merge, unit merge, stale unit rejection, pruning to sparse overrides, and invalid value rejection.
3. Add server methods for save/reset and tests that prove cache stats are preserved.
4. Add dashboard inline Configure UI and fetch full TDF only when a row is opened.
5. Apply config in dashboard start/continue before `currentTdfFile` is stored.
6. Apply the same config in resume/condition resolution paths that restore or replace `currentTdfFile`.
7. Run `npm run typecheck` from `mofacts/`.

## Testing Notes

At minimum, cover:

- pure merge does not mutate the input TDF
- only allowlisted paths are applied
- reset removes matching override paths from the sparse object
- stale unit metadata blocks unit overrides but allows valid set-spec overrides
- `updateDashboardCacheForTdf` preserves `learnerTdfConfigs`
- dashboard Configure fetches full TDF data only for the active row
- launch after save uses the configured TDF for both start and continue
- resume after save uses the configured TDF

## Open Questions

- Should global/profile audio settings become defaults for new systems, with per-system settings overriding them?
- Should learners be able to copy one unit's settings to all units?
- Should applied learner overrides be recorded in history/session data for later analysis?
- For condition-pool roots, should learner settings eventually attach to the assigned concrete child TDF, the root TDF, or both with explicit inheritance rules?
