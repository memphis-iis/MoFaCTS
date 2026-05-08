# Learner TDF Configuration Plan

## Goal

Add a learner-facing configuration area to the Learning Dashboard so users can adjust a small set of practice settings for each available lesson/system without editing the underlying TDF.

The UI should present novice-friendly controls, while the stored data remains TDF-like and sparse. Saved values are learner-specific and lesson-specific. When a learner starts or continues practice, the runtime should prefer the saved learner configuration over the original TDF values.

## User Experience

Each lesson/system card on the Learning Dashboard gets a Configure button. Pressing Configure opens an inline area under that system. The section is not a modal.

The Configure button is globally available for every Learning Dashboard system. The first implementation does not require per-course or per-TDF opt-in.

The inline area contains simple controls instead of raw TDF field names. Examples:

- Toggle: show performance while practicing
- Select: spoken audio mode
- Slider: microphone sensitivity
- Number or slider: answer timeout

The UI should show only essential fields. It should not expose arbitrary TDF editing.

When the inline area opens, its starting values are loaded from the original TDF, with any saved learner overrides layered on top. In other words, the learner sees the effective value that will be used in practice. If no learner override exists for a field, the displayed value comes directly from the TDF.

If a value is customized, the inline area should make that visible and allow the learner to reset it to the TDF default.

## Storage Model

Learner changes are saved in the learner dashboard cache for that TDF/system. The cache stores only changed values, not a copied TDF.

Because the Learning Dashboard cache is already per user, learner configuration stored there is personal by default. The configuration should be nested under the cached entry for the relevant TDF/system rather than stored as a separate global preference.

The original TDF remains the source for starting/default values. The learner dashboard cache should not need to be pre-populated with every configurable field; it should be populated only when the learner changes a setting.

The saved structure should be TDF-like:

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

The `unit` object uses a unit-N marker. Unit `0` means the first TDF unit, unit `1` means the second TDF unit, and so on. This avoids ambiguity while preserving a sparse override shape.

The saved configuration should also carry lightweight source metadata so stale overlays can be detected:

```json
{
  "source": {
    "tdfId": "abc123",
    "tdfUpdatedAt": "2026-05-06T14:00:00.000Z",
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

The exact timestamp/hash field should use whatever reliable TDF metadata already exists. If the TDF has an updated timestamp, use that. If not, compute a small signature from the configurable source fields and ordered unit labels.

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

The runtime should not need to know whether a value came from the original TDF or from learner configuration, except for logging/audit where useful.

Invalid saved settings should fail clearly or be blocked before save. They should not silently fall back.

Before applying learner overrides, compare the saved source metadata with the current TDF. If the metadata indicates the TDF has changed, handle it explicitly:

- Set-spec overrides can usually remain valid if the allowlisted fields still validate.
- Unit overrides should be considered stale if the unit count or ordered unit signature changed.
- Stale unit overrides should not be silently applied to different unit indices.
- The UI should tell the learner that unit-specific settings need review or reset.

## Section Layout

The inline Configure area is divided by TDF scope.

For a one-unit tutor:

- Lesson settings
- Unit 1 settings

For a two-unit tutor:

- Lesson settings
- Unit 1 settings
- Unit 2 settings

For an N-unit tutor:

- Lesson settings
- Unit 1 settings
- Unit 2 settings
- ...
- Unit N settings

Lesson settings map to `setspec` fields. Unit sections map to `unit[N]` fields.

Unit labels should prefer the TDF unit name when available, with a stable fallback such as `Unit 1`, `Unit 2`, etc.

The Configure button appears for every system. Unit-level sections are generated from every TDF unit. If a unit does not use a displayed setting in practice, the implementation may hide or disable that individual control, but the system still has a Configure area.

## Initial Setting Targets

Start with a very small allowlist.

### Set Spec

These are good first candidates because they are learner-facing and apply cleanly at the lesson/system level:

- `setspec.audioPromptMode`
- `setspec.audioInputSensitivity`
- `setspec.uiSettings.displayPerformance`

Audio settings should be per-system rather than global-only because audio usefulness depends heavily on the lesson/system. A learner may want question audio in one lesson, feedback audio in another, and silence elsewhere.

### Unit Delivery Parameters

Expose three or four essential `unit[N].deliveryparams` values:

- `unit[N].deliveryparams.drill`
- `unit[N].deliveryparams.reviewstudy`
- `unit[N].deliveryparams.correctprompt`
- `unit[N].deliveryparams.purestudy`

These are concrete learner-facing pacing controls:

- answer timeout
- incorrect review duration
- correct feedback duration
- study-card duration

They should be shown as novice-friendly controls, likely in seconds, even if the underlying TDF value is milliseconds.

## Unit-Level Behavior

Unit-level settings are configured per unit.

If a tutor has one unit, the unit setting is straightforward: the learner edits the only unit's delivery parameters.

If a tutor has multiple units, the Configure area shows one unit section per TDF unit. Saving a value in Unit 2 updates only the override bucket for `unit["1"]`.

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
- delivery timing fields: non-negative integer milliseconds

The UI can display timing fields in seconds, but storage should use the TDF-compatible millisecond values.

## Open Questions

- Should global/profile audio settings become defaults for new systems, with per-system settings overriding them?
- Should learners be able to copy one unit's settings to all units?
- Should applied learner overrides be recorded in history/session data for later analysis?
