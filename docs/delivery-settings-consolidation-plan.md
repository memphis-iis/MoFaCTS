# Delivery Settings Consolidation Plan

## Goal

Unify learner-runtime configuration under one clearer concept: `deliverySettings`.

The current TDF model splits learner-runtime behavior across `deliveryparams`, `setspec.uiSettings`, unit `deliveryparams`, unit `uiSettings`, and unit-template equivalents. That split is historical. It does not describe the product boundary very well because many "delivery parameters" affect UI behavior, and many "UI settings" affect delivery of the learning experience.

The goal is not to invent a large taxonomy. The goal is to make authoring, schemas, runtime reads, and migration simpler by treating these fields as one delivery-settings surface.

## Proposed Model

Use `deliverySettings` as the conceptual and eventual schema owner for learner-runtime behavior.

Examples of fields that belong under this concept:

- feedback visibility, labels, layout, and optional feedback parts
- drill, study, review, ready-prompt, and force-correct timing
- force-correct flow settings
- answer-evaluation switches that affect learner experience
- prompt placement, buttons, colors, performance display, timeout display
- speech/audio delivery settings that are authored in the TDF

The old distinction between `deliveryparams` and `uiSettings` should become a storage/migration detail, not the primary product model.

## Current Physical Storage

Current supported storage paths include:

| Current path | Role today |
| --- | --- |
| `tutor.deliveryparams` | Lesson/root delivery parameter defaults. |
| `tutor.setspec.uiSettings` | Lesson/root UI settings. |
| `tutor.unit[].deliveryparams` | Unit-level delivery parameter overrides. |
| `tutor.unit[].uiSettings` | Unit-level UI setting overrides. |
| `tutor.setspec.unitTemplate[].deliveryparams` | Unit-template delivery parameter defaults. |
| `tutor.setspec.unitTemplate[].uiSettings` | Unit-template UI setting defaults. |

Target storage paths should be:

| Target path | Role |
| --- | --- |
| `tutor.deliverySettings` | Lesson/root delivery settings. |
| `tutor.unit[].deliverySettings` | Unit-level delivery setting overrides. |
| `tutor.setspec.unitTemplate[].deliverySettings` | Unit-template delivery setting defaults. |

## Migration Principle

Do not silently rely on old paths forever.

There are two valid migration strategies:

1. Read old paths temporarily, warn clearly, and convert content in a controlled follow-up.
2. Convert all known TDFs before switching runtime/schema to the new path.

The preferred approach is a short compatibility window with an explicit conversion step:

- runtime can read old paths only through a named migration normalization layer
- the normal runtime model receives only `deliverySettings`
- warnings should identify which old path was used
- server-stored TDFs and local config-directory TDFs should be converted by a repeatable script
- after conversion, remove legacy reads

## Read Precedence During Migration

During the compatibility window, the normalization layer should merge old and new fields into one `deliverySettings` object.

Recommended precedence:

1. Explicit `deliverySettings` value wins.
2. Legacy `uiSettings` contributes only fields not already present in `deliverySettings`.
3. Legacy `deliveryparams` contributes only fields not already present in `deliverySettings`.
4. If a field appears in both legacy paths and maps to the same new key, report a warning unless the values are identical.

This avoids hidden behavior changes when authors start moving individual fields.

## Conversion Scope

The conversion script should handle both server content and local files.

Server content:

- TDF documents stored in the application database.
- Package/import records that store embedded TDF JSON.
- Any cached learner TDF configuration payloads that persist old paths.

Local content:

- TDF files in the project configuration/content directory.
- TDF fixtures and test data in this repository.
- Any example TDFs used by docs or upload tests.

The script should support dry-run mode before writing:

- list files/documents that would change
- list field moves by old path and new path
- report conflicts
- report unknown legacy fields

## Field Mapping

Initial mechanical mapping:

| Legacy path | Target path |
| --- | --- |
| `tutor.deliveryparams.*` | `tutor.deliverySettings.*` |
| `tutor.setspec.uiSettings.*` | `tutor.deliverySettings.*` |
| `tutor.unit[].deliveryparams.*` | `tutor.unit[].deliverySettings.*` |
| `tutor.unit[].uiSettings.*` | `tutor.unit[].deliverySettings.*` |
| `tutor.setspec.unitTemplate[].deliveryparams.*` | `tutor.setspec.unitTemplate[].deliverySettings.*` |
| `tutor.setspec.unitTemplate[].uiSettings.*` | `tutor.setspec.unitTemplate[].deliverySettings.*` |

Field renames should be handled in the same conversion layer when they are already decided.

Examples from the feedback cleanup:

| Old field | New field |
| --- | --- |
| `correctMessage` | `correctLabelText` |
| `incorrectMessage` | `incorrectLabelText` |
| `singleLineFeedback` | `feedbackLayout` |
| `forcecorrectprompt` | `forceCorrectPrompt` |

Removed fields should not be migrated:

| Removed field | Action |
| --- | --- |
| `onlyShowSimpleFeedback` | Drop and report. |
| `allowFeedbackTypeSelect` | Drop and report. |

## Schema Plan

Phase 1 should not break existing authored TDFs.

Recommended schema sequence:

1. Add `deliverySettings` to generated schemas.
2. Keep legacy `deliveryparams` and `uiSettings` in schema for one migration window, marked deprecated in schema descriptions.
3. Update authoring UI to write only `deliverySettings`.
4. Run conversion for server content and local configuration files.
5. Remove legacy paths from schema after migration is complete.

The generated schema should make the conceptual model visible:

- `deliverySettings` should have a clear title and description.
- each field should still have a short label and long description.
- deprecated old paths should say exactly where the field moved.

## Runtime Cutover Plan

Do not keep a long-term runtime compatibility normalizer.

Instead, convert known TDF content first, then move runtime reads to the new `deliverySettings` path and fail clearly if old paths appear after the migration window.

Target runtime path:

```text
converted TDF
  -> deliverySettings
  -> stores/components/machines read deliverySettings
```

Rules:

- Runtime components should not read from `deliveryparams` or `uiSettings` after conversion is verified.
- Migration compatibility should live only in conversion scripts, not normal app startup.
- Unknown or conflicting fields should be reported by conversion reports.
- After the migration, old-shape TDFs should fail clearly instead of being silently normalized.

## Conversion Script Plan

Add a repeatable conversion script with these modes:

```text
dry-run local files
dry-run server documents
write local files
write server documents
```

For local files, the script should accept an explicit root directory for the configuration/content repository.

For server documents, the script should require an explicit environment and backup/export step before writes.

The report should include:

- count of TDFs scanned
- count of TDFs changed
- moved paths
- dropped removed fields
- conflicts requiring manual review
- files/documents skipped

Server database conversion has started with `convertDeliverySettingsInDatabase(...)`, which is imported by the server bundle and exposed on `globalThis` for deliberate server-side invocation.

Dry-run examples:

```ts
await convertDeliverySettingsInDatabase();
await convertDeliverySettingsInDatabase({ dryRun: true, limit: 10 });
await convertDeliverySettingsInDatabase({ dryRun: true, tdfIds: ['abc123'] });
```

Write example:

```ts
await convertDeliverySettingsInDatabase({
  dryRun: false,
  confirmWrite: 'convert-delivery-settings',
});
```

Write mode removes legacy `deliveryparams` and `uiSettings` paths after creating `deliverySettings`. Dry-run mode reports the same changes without writing.

## Open Decisions

1. Resolved for the initial implementation: root delivery settings live under `tutor.deliverySettings`, matching the old root `tutor.deliveryparams` scope while absorbing root `tutor.setspec.uiSettings`.
2. After server conversion is verified, when should runtime reads switch from split stores/paths to `deliverySettings`?
3. Should learner-config overrides keep their current internal shape during migration, or move to `deliverySettings` at the same time?
4. Should user audio settings remain outside `deliverySettings`, with TDF-authored audio fields treated as defaults/overrides?
5. Which repository is the canonical owner of the local configuration/content TDF conversion script?

## Implementation Progress

Completed first slice:

1. Added a pure `migrateTdfDeliverySettings(...)` helper in `mofacts/common/lib/deliverySettingsMigration.ts`.
2. The helper produces `deliverySettings` at root, unit, and unit-template scopes and removes legacy `deliveryparams` / `uiSettings` paths by default.
3. The helper applies the planned merge precedence: explicit `deliverySettings` first, then legacy `uiSettings`, then legacy `deliveryparams`.
4. The helper reports warnings for legacy field renames, removed fields, unknown fields, and conflicts where an explicit `deliverySettings` value already exists.
5. Added tests for root merge, precedence conflicts, legacy feedback field mapping, removed fields, unknown fields, deprecated `feedbackType`, unit scope, and unit-template scope.
6. Added additive generated-schema support for `tutor.deliverySettings`, `tutor.unit[].deliverySettings`, and `tutor.setspec.unitTemplate[].deliverySettings`.
7. Added a dry-run-first database conversion utility, `convertDeliverySettingsInDatabase(...)`, exposed server-side but not auto-run.

Not done yet:

1. Runtime components still read the existing `deliveryparams` and `uiSettings` stores/paths.
2. Learner-config override shape still uses the existing split model.
3. No local-file conversion script exists yet.
4. Legacy schema paths are still present during this migration window.

## Recommended Next Step

Before implementing, create a field inventory that lists every current `deliveryparams` and `uiSettings` field with:

- current path
- target `deliverySettings` key
- field rename, if any
- supported/deprecated/removed status
- runtime readers
- schema visibility
- conversion behavior

That inventory should be generated or checked against the field registries so the migration does not rely on memory.

## Initial Field Inventory

This initial inventory is generated from the current schema-visible `deliveryparams` and `uiSettings` fields, plus known legacy fields already handled by the feedback cleanup. It should become the checklist for the eventual migration script.

| Current field | Target field | Conversion behavior |
| --- | --- | --- |
| `deliveryparams.forceCorrection` | `deliverySettings.forceCorrection` | Supported current field; move mechanically. |
| `deliveryparams.scoringEnabled` | removed | Scoring is not currently implemented in the Svelte runtime; drop during conversion. |
| `deliveryparams.forceSpacing` | `deliverySettings.forceSpacing` | Supported current field; move mechanically. |
| `deliveryparams.optimalThreshold` | `deliverySettings.optimalThreshold` | Supported current field; move mechanically. |
| `deliveryparams.studyFirst` | `deliverySettings.studyFirst` | Supported current field; move mechanically. |
| `deliveryparams.purestudy` | `deliverySettings.purestudy` | Supported current field; move mechanically. |
| `deliveryparams.drill` | `deliverySettings.drill` | Supported current field; move mechanically. |
| `deliveryparams.practicetimer` | `deliverySettings.practicetimer` | Supported current field; move mechanically. |
| `deliveryparams.practiceseconds` | `deliverySettings.practiceseconds` | Supported current field; move mechanically. |
| `deliveryparams.displayMinSeconds` | `deliverySettings.displayMinSeconds` | Supported current field; move mechanically. |
| `deliveryparams.displayMaxSeconds` | `deliverySettings.displayMaxSeconds` | Supported current field; move mechanically. |
| `deliveryparams.reviewstudy` | `deliverySettings.reviewstudy` | Supported current field; move mechanically. |
| `deliveryparams.correctprompt` | `deliverySettings.correctprompt` | Supported current field; move mechanically. |
| `deliveryparams.skipstudy` | `deliverySettings.skipstudy` | Supported current field; move mechanically. |
| `deliveryparams.lockoutminutes` | `deliverySettings.lockoutminutes` | Supported current field; move mechanically. |
| `deliveryparams.fontsize` | `deliverySettings.fontsize` | Supported current field; move mechanically. |
| `deliveryparams.lfparameter` | `setspec.lfparameter` | Misplaced legacy set-spec field; move to `tutor.setspec.lfparameter` only when the set spec does not already define it, otherwise drop duplicate or report conflict. |
| `deliveryparams.correctscore` | removed | Legacy scoring field; scoring is not currently implemented in the Svelte runtime. |
| `deliveryparams.incorrectscore` | removed | Legacy scoring field; scoring is not currently implemented in the Svelte runtime. |
| `deliveryparams.autostopTranscriptionAttemptLimit` | `deliverySettings.autostopTranscriptionAttemptLimit` | Supported current field; move mechanically. |
| `deliveryparams.timeuntilaudio` | `deliverySettings.timeuntilaudio` | Supported current field; move mechanically. |
| `deliveryparams.prestimulusdisplaytime` | `deliverySettings.prestimulusdisplaytime` | Supported current field; move mechanically. |
| `deliveryparams.forceCorrectPrompt` | `deliverySettings.forceCorrectPrompt` | Supported current field; move mechanically. |
| `deliveryparams.forcecorrecttimeout` | `deliverySettings.forcecorrecttimeout` | Supported current field; move mechanically. |
| `deliveryparams.checkOtherAnswers` | `deliverySettings.checkOtherAnswers` | Supported current field; move mechanically. |
| `deliveryparams.falseAnswerLimit` | `deliverySettings.falseAnswerLimit` | Supported current field; move mechanically. |
| `deliveryparams.allowPhoneticMatching` | `deliverySettings.allowPhoneticMatching` | Supported current field; move mechanically. |
| `deliveryparams.branchingEnabled` | `deliverySettings.branchingEnabled` | Supported current field; move mechanically. |
| `deliveryparams.resetStudentPerformance` | `deliverySettings.resetStudentPerformance` | Supported current field; move mechanically. |
| `deliveryparams.allowRevistUnit` | `deliverySettings.allowRevistUnit` | Supported current field; move mechanically. |
| `deliveryparams.readyPromptStringDisplayTime` | `deliverySettings.readyPromptStringDisplayTime` | Supported current field; move mechanically. |
| `deliveryparams.studyOnlyFields` | `deliverySettings.studyOnlyFields` | Supported current field; move mechanically. |
| `deliveryparams.drillFields` | `deliverySettings.drillFields` | Supported current field; move mechanically. |
| `uiSettings.stimuliPosition` | `deliverySettings.stimuliPosition` | Supported current field; move mechanically. |
| `uiSettings.displayCorrectFeedback` | `deliverySettings.displayCorrectFeedback` | Supported current field; move mechanically. |
| `uiSettings.displayIncorrectFeedback` | `deliverySettings.displayIncorrectFeedback` | Supported current field; move mechanically. |
| `uiSettings.correctLabelText` | `deliverySettings.correctLabelText` | Supported current field; move mechanically. |
| `uiSettings.incorrectLabelText` | `deliverySettings.incorrectLabelText` | Supported current field; move mechanically. |
| `uiSettings.correctColor` | `deliverySettings.correctColor` | Supported current field; move mechanically. |
| `uiSettings.incorrectColor` | `deliverySettings.incorrectColor` | Supported current field; move mechanically. |
| `uiSettings.displayUserAnswerInFeedback` | `deliverySettings.displayUserAnswerInFeedback` | Supported current field; move mechanically. |
| `uiSettings.feedbackLayout` | `deliverySettings.feedbackLayout` | Supported current field; move mechanically. |
| `uiSettings.displayCorrectAnswerInIncorrectFeedback` | `deliverySettings.displayCorrectAnswerInIncorrectFeedback` | Supported current field; move mechanically. |
| `uiSettings.displayPerformance` | `deliverySettings.displayPerformance` | Supported current field; move mechanically. |
| `uiSettings.displayTimeoutBar` | `deliverySettings.displayTimeoutBar` | Supported current field; move mechanically. |
| `uiSettings.choiceButtonCols` | `deliverySettings.choiceButtonCols` | Supported current field; move mechanically. |
| `uiSettings.displaySubmitButton` | `deliverySettings.displaySubmitButton` | Supported current field; move mechanically. |
| `uiSettings.inputPlaceholderText` | `deliverySettings.inputPlaceholderText` | Supported current field; move mechanically. |
| `uiSettings.displayConfirmButton` | `deliverySettings.displayConfirmButton` | Supported current field; move mechanically. |
| `uiSettings.continueButtonText` | `deliverySettings.continueButtonText` | Supported current field; move mechanically. |
| `uiSettings.skipStudyButtonText` | `deliverySettings.skipStudyButtonText` | Supported current field; move mechanically. |
| `uiSettings.caseSensitive` | `deliverySettings.caseSensitive` | Supported current field; move mechanically. |
| `uiSettings.displayQuestionNumber` | `deliverySettings.displayQuestionNumber` | Supported current field; move mechanically. |
| `uiSettings.experimentLoginText` | `deliverySettings.experimentLoginText` | Supported current field; move mechanically. |
| `deliveryparams.allowFeedbackTypeSelect` | none | Removed; do not migrate. |
| `uiSettings.correctMessage` | `deliverySettings.correctLabelText` | Renamed; migrate value if present. |
| `uiSettings.incorrectMessage` | `deliverySettings.incorrectLabelText` | Renamed; migrate value if present. |
| `uiSettings.singleLineFeedback` | `deliverySettings.feedbackLayout` | Renamed shape; true -> `inline`, false/missing -> `stacked`. |
| `uiSettings.onlyShowSimpleFeedback` | none | Removed; do not migrate. |
| `deliveryparams.forcecorrectprompt` | `deliverySettings.forceCorrectPrompt` | Renamed casing; migrate value if present. |
