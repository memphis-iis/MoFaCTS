# Instruction Question Feature Removal Plan

## Product decision

MoFaCTS instruction screens are passive pre-unit content. They may show authored instruction text or an image, optionally enforce a minimum/maximum instruction time, and provide Continue/back navigation.

Remove the abandoned `unitinstructionsquestion` / `instructionQuestionResult` feature from all authoring, routing, runtime, model, history, and documentation surfaces.

## Verified current state

- `instructions.html` renders instruction text, an optional image, timing/lockout UI, Continue, and optional back navigation. It renders no instruction question or affirmative/negative controls.
- `instructions.ts` still contains an unused `instructionQuestion` helper and click handlers for DOM ids that do not exist.
- The handlers write `instructionQuestionResults` (plural), while history logging and cleanup use `instructionQuestionResult` (singular).
- Adaptive probability preparation reads `card.instructionQuestionResult`, but the former selection path wrote a top-level value instead. The authored response therefore never had a coherent path into the model.
- `C:\dev\mofacts_config` contains no `unitinstructionsquestion`, `instructionQuestionResult`, or `instructionQuestionResults` uses.
- The public wiki contains three stale references: two descriptions of `unitinstructionsquestion` and one probability-parameter row for `p.instructionQuestionResult`.
- History compression currently writes `instructionQuestionResult` under the independent object key `61`. This is a compression-map key, not a TDF or database schema identifier or a positional column.

## Invariants

1. Instruction screens continue to support text, image, Continue/back navigation, and configured timing/lockout behavior.
2. SPARC remains the supported mechanism for interactive instructional questions.
3. Existing TDFs must be inventoried before schema enforcement changes. Do not silently discard authored `unitinstructionsquestion` content.
4. No compatibility fallback or alternate runtime path is introduced.

## Phase 1: production-data and authored-content gate

Before changing schema acceptance:

1. Query the production TDF collection for documents containing `content.tdfs.tutor.unit.unitinstructionsquestion`.
2. Search active production `calculateProbability` sources for `instructionQuestionResult`.
3. Record counts and TDF identifiers without exporting learner data.

Decision:

- If all inventories are empty, proceed with direct removal.
- If authored values exist, stop and choose an explicit migration for each affected TDF: convert the text to passive `unitinstructions`, rebuild it as SPARC interaction, or remove it intentionally. Do not silently reinterpret it.

## Phase 2: remove active instruction-screen wiring

Remove `unitinstructionsquestion` from:

- `instructions.ts` helper, displayed-stimulus construction, and nonexistent affirmative/negative handlers.
- Lesson-entry and instruction-presence decisions in `lessonLaunchEntryRoute.ts`, `lessonLaunchLockPolicy.ts`, `tdfUtils.ts`, `router.ts`, `engineConstructors.ts`, and `contentSurfaceInit.ts`.
- Unit-like TypeScript shapes used by those paths.
- Package HTML-field processing, media-reference scanning, package-save typing, dashboard projections, and field applicability rules.

Retain the existing behavior that `unitinstructions`, `picture`, or a configured instruction lockout can open the instruction surface.

## Phase 3: remove active model and session state

Remove:

- `instructionQuestionResults` from `UnitEngineSessionKeys.ts`.
- `instructionQuestionResult` from session cleanup and active history-record writers.
- Card, stimulus, and response initialization fields in `modelStateFactory.ts`.
- Resume-model copying and learning-history reconstruction aggregation for this field.
- `p.instructionQuestionResult` from adaptive probability parameter construction.
- AutoTutor and video placeholder values.
- Tests and fixtures that exist only to carry this field.

Before removing the probability parameter, complete the Phase 1 probability-source inventory. A TDF that references it must be migrated explicitly.

## Phase 4: remove history compression support

Remove the `61` to `instructionQuestionResult` entry from `HISTORY_KEY_MAP`. Do not renumber any remaining keys: the compressed record is an object whose numeric keys are decoded independently, not a positional row.

Update the compression-map invariant test so it verifies unique keys and field names and stable existing assignments without requiring every integer between the minimum and maximum to be present. Historical key `61` can remain an unknown, ignored property when old records are decompressed; it cannot shift or reinterpret keys `62+`.

## Phase 5: remove authoring/schema support

1. Remove `unitinstructionsquestion` from `UNIT_FIELD_REGISTRY` and the unit field allowlist. This registry is the source for MoFaCTS package authoring/validation schemas; the tracked config repository does not contain separate schema definitions for this field.
2. Run `npm run generate:schemas` from `mofacts/`.
3. Inspect the generated `public/tdfSchema.json` diff to confirm only the intended field disappears.
4. Update schema/field-registry tests and dashboard snapshot fixtures.
5. Verify package upload produces a clear validation error for newly uploaded packages that still contain the removed field.

This is an intentional schema change. The Phase 1 inventory/migration gate must be complete first.

## Phase 6: documentation cleanup

Update `C:\dev\MoFaCTS.wiki` only to remove its three stale references:

- Remove `unitinstructionsquestion` from instruction-only unit documentation and content-creation reference tables.
- Remove `p.instructionQuestionResult` from learning-session probability parameters.
- Retain instruction-screen documentation for text, images, Continue/back controls, and timing/lockout settings.

No config-repository content edit is currently indicated because the tracked config inventory is empty.

## Verification

Run from `mofacts/`:

1. `npm run generate:schemas`
2. `npm run typecheck`
3. `npm run lint`

Add or update tests proving:

- Text-only, image-only, timed, and lockout instruction screens still route and continue correctly.
- A unit without instruction text/image/lockout enters content directly.
- `unitinstructionsquestion` is rejected by new package/schema validation after the production inventory gate.
- Current history reconstruction no longer projects instruction-question model state.
- A representative historical compressed row containing key `61` leaves that retired property unused while keys `60` and `62+` still decode to their unchanged field names.
- Adaptive probability parameters no longer expose `instructionQuestionResult`.

For runtime verification, use the native hotfix app and MoFaCTS Playwright sidecar only after implementation and static checks pass. Smoke-test one normal instruction screen, one timed/locked instruction screen, and transition into both a learning session and a SPARC session.

## Deployment and rollback

- Deploy application/schema removal only after affected production TDFs, if any, have been migrated and validated.
- The code change is rollbackable by redeploying the prior application version; content migrations require their own explicit backup and rollback record.
- Do not delete or rewrite historical learner rows. Removing the independent decoder entry does not require a history migration.

## Completion criteria

- No active source, schema, package, route, model, session, or documentation surface advertises or consumes instruction questions.
- Instruction text/image/timer/Continue behavior is unchanged.
- Interactive instruction guidance points to SPARC.
- New packages cannot author the removed field.
- Existing compressed history fields other than the retired key retain their existing independent mappings.
