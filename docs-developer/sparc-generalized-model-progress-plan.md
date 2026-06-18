# SPARC Generalized Model Progress Plan

## Goal

Make SPARC progress reporting use the same adaptive logistic model state that powers ordinary learning-session card practice. A SPARC progress widget should be a placement and rendering request, not a separate display-side calculation.

This replaces the older hard-coded fractions/skill readout direction with a shared model-progress surface that can be used by multiple learning components.

## Confirmed Direction

- The probability values come from the adaptive logistic regression model used by learning-session practice.
- SPARC should generalize that model/progress capability across components.
- The progress widget can be placed inline in the SPARC document or in the right sidebar using the visual editor.
- Inline SPARC rendering should reuse the shared progress chart/readout where possible.
- Sidebar rendering should reuse the existing learning-session `Progress` panel behavior.
- With a small number of skills, the inline widget must shrink to the content instead of reserving a tall blank panel.
- The old hard-coded fraction-screen skill readout is not the target behavior and should be retired once the shared model-progress path covers the use case.
- Each SPARC lesson/unit that uses skill/model references must define the adaptive probability model in the TDF unit, the same way learning sessions do.
- The stimulus file or SPARC stimulus registry may identify model targets, but it must not become the place where the probability model is defined.
- No silent fallbacks: if a unit requests progress but the model-progress provider is unavailable or malformed, the runtime should fail clearly or show an explicit unavailable state according to the placement contract.

## Current Code Evidence

The current practice progress implementation is already split into useful boundaries:

- `mofacts/client/views/experiment/svelte/services/learningProgressPanel.ts` builds item-progress snapshots from `engine.getCardProbabilitiesNoCalc()`.
- `mofacts/client/views/experiment/svelte/services/learningProgressPanelRuntime.ts` owns snapshot commit timing, sidebar open state, and viewport state.
- `mofacts/client/views/experiment/svelte/components/LearningProgressPanel.svelte` owns the right-side shell and tab.
- `mofacts/client/views/experiment/svelte/components/LearningProgressChart.svelte` owns the reusable chart visualization.
- `mofacts/client/views/experiment/svelte/components/CardScreen.svelte` wires the runtime snapshot into the standard card surface.

SPARC already has partial progress hooks:

- `learning-components/units/sparcsession/SparcSessionUnitEngine.ts` creates SPARC session engines by composing the adaptive logistic engine.
- `learning-components/units/sparcsession/sparcSessionRuntimeConfig.ts` already resolves SPARC model configuration from `unit.sparcsession`, including `clusterlist` and `calculateProbability`.
- `learning-components/models/adaptive-logistic/AdaptiveLogisticUnitEngine.ts` already exposes `getCardProbabilitiesNoCalc()`, `applyModelPracticeUpdate()`, and `queryModelPracticeState()`.
- `learning-components/units/sparcsession/sparcSessionContracts.ts` defines SPARC model targets in terms of shared model-practice identities.
- `learning-components/units/sparcsession/sparcAuthoringCatalog.ts` exposes both `skill-bar` and `learning-progress` authored atom types.
- `mofacts/client/views/experiment/svelte/components/SparcNode.svelte` already renders `learning-progress` by delegating to `LearningProgressChart`.
- `mofacts/client/views/experiment/svelte/components/CardScreen.svelte` already checks a SPARC `progressReporter.placement === 'sidebar'` shape to decide whether a SPARC display requests the sidebar.

The main gap is architectural: the progress snapshot builder is still coupled to `engine.unitType === 'model'`, while SPARC engines are `sparcsession` even though they are backed by the same adaptive logistic state.

## Architectural Invariants

1. The adaptive logistic model is the source of truth.
2. Progress display code must never recalculate learner probabilities independently.
3. SPARC widgets may choose placement and visual density, but not model semantics.
4. The same model-progress contract should support learning sessions, SPARC sessions, and future model-backed components.
5. Progress visibility should respect hidden items and delivery settings.
6. The right sidebar must remain a session-shell concern, not a SPARC document layout hack.
7. Inline progress must be a SPARC node, participate in normal document layout, and size from its content.
8. A missing or invalid model-progress provider must be explicit. Do not substitute fake rows, static fills, or hard-coded skill data.
9. Learner-facing progress should not expose answer text or sensitive item labels unless a future role-aware product decision explicitly adds that.
10. Existing working learning-session progress behavior is regression-sensitive and should be preserved.
11. A SPARC unit that references model skills must carry its model definition in the TDF unit-level `sparcsession` object, not in the stimulus file.

## TDF Unit-Level Model Definition

SPARC should follow the same model ownership pattern as learning sessions:

- The TDF unit defines the adaptive model setup.
- The stimulus/stimulus-registry layer defines model identities and node attachments.
- Runtime progress reads live model state from the engine initialized from the TDF unit definition.

For SPARC, the relevant unit shape is `unit[].sparcsession`, parallel to `unit[].learningsession`.

Required or conditionally required fields for model-backed SPARC progress should include:

- `sparcsession.clusterlist`: the cluster/stim scope used to initialize the adaptive model.
- `sparcsession.calculateProbability`: the probability function source, when the lesson does not intentionally use the model default.
- Existing delivery settings such as `optimalThreshold`, `resetStudentPerformance`, and `disableProgressReport`, resolved the same way as learning sessions.

For the first fractions package update, seed the SPARC unit's `sparcsession.calculateProbability` from a simple existing stock model rather than inventing a new formula. The `Gen-Z Slang` learning-session config in `C:\dev\mofacts_config\Gen-Z Slang\Gen-Z Slang_TDF.json` is a good source pattern:

```js
p.y = -0.77
  + .665 * pFunc.logitdec(
    p.overallOutcomeHistory.slice(
      Math.max(p.overallOutcomeHistory.length - 60, 0),
      p.overallOutcomeHistory.length
    ),
    .966
  )
  + .51 * p.stimSuccessCount
  + 11.1 * pFunc.recency(p.stimSecsSinceLastShown, .443);
p.probability = 1.0 / (1.0 + Math.exp(-p.y));
return p;
```

The implementation can keep the exact compact one-line TDF string used by the config package; the formatted form above is only for readability in this plan.

The SPARC authored document and `stimulusRegistry` remain essential, but their role is identity binding:

- `stimulusId` is the author-facing attachment key.
- `stimuliSetId`, `stimulusKC`, `clusterKC`, `KCId`, `KCDefault`, and `KCCluster` identify the model target.
- Node-level `stimulusIds` or production-rule `model-practice` effects resolve through the registry.
- None of these fields should smuggle in the probability formula or model initialization policy.

Validation should make this explicit:

1. If a SPARC document has model-practice effects, model conditions, model-targeted nodes, or progress reporters, the containing TDF unit must have a coherent `sparcsession` model configuration.
2. If the `sparcsession` model configuration is missing while model features are authored, fail validation with a clear message.
3. If a SPARC document has stimulus registry entries but no model-backed behaviors, allow it only if the registry is being used as non-adaptive metadata; otherwise authors will get confusing "progress unavailable" states.
4. If `clusterlist` references clusters not present in the active stimulus set, fail through the existing cluster-list validation path rather than substituting another scope.

## Proposed Design

### 1. Introduce A Shared Model Progress Provider Contract

Add a small, explicit client-visible capability in `learning-components/runtime/` or a nearby shared runtime module:

```ts
export type ModelProgressItem = {
  readonly id: string;
  readonly stimulusKC: string | number;
  readonly clusterKC?: string | number;
  readonly probability: number;
  readonly introduced: boolean;
  readonly current: boolean;
  readonly canUse: boolean;
};

export type ModelProgressProvider = {
  readonly getModelProgressItems: () => readonly ModelProgressItem[];
};
```

This contract should be intentionally narrower than `cardProbabilities`. It gives UI code item progress without exposing the scheduler's mutable internals.

Implementation details:

- Add a helper in the adaptive logistic model layer that converts `cardProbabilities.cards[].stims[]` into `ModelProgressItem[]`.
- Preserve current filtering semantics: ignore cards/stims with `canUse === false`, and keep hidden-item filtering in the snapshot builder or controller where delivery/session context is already available.
- Mark `current` from the engine's current card reference.
- Keep `probability` normalized to `[0, 1]`; invalid probabilities should cause the snapshot builder to report an unavailable state, not silently clamp bad model data.

### 2. Expose The Provider From The Adaptive Logistic Engine

Update `createAdaptiveLogisticUnitEngine()` so the returned engine implements `getModelProgressItems()`.

Because `createSparcSessionUnitEngine()` returns `{ ...adaptiveEngine, ...sparcMethods }`, SPARC will inherit the provider without SPARC-specific probability code.

This is the key generalization: `learning-session`, `sparcsession`, and any later model-backed unit type can expose the same capability through the same engine boundary.

For SPARC, this depends on the unit-level TDF `sparcsession` configuration being present and coherent before engine initialization. The provider should not try to infer a model from the SPARC document or stimulus registry if the TDF unit omitted the model definition.

### 3. Refactor The Snapshot Builder Around Capability, Not Unit Type

Refactor `learningProgressPanel.ts` from:

- `engine.unitType === 'model'`
- `engine.getCardProbabilitiesNoCalc()`

to:

- `typeof engine.getModelProgressItems === 'function'`
- read `ModelProgressItem[]`

Keep a temporary internal adapter only if needed to preserve learning-session behavior during the change. That adapter must be named as a legacy compatibility adapter and covered by tests; it should not become a silent fallback.

Target behavior:

- Learning sessions continue to produce the same rows as before.
- SPARC sessions produce rows from the same adaptive logistic state.
- Non-model units get an explicit unavailable snapshot such as `Progress requires a model-progress provider.`

### 4. Formalize SPARC Progress Placement

Add a typed SPARC display-level progress reporter configuration, likely in `SparcTrialDisplayAdapter.ts`:

```ts
progressReporter?: {
  placement: 'document' | 'sidebar';
  nodeId?: string;
  label?: string;
  showReferenceLines?: boolean;
  compact?: boolean;
};
```

Recommended semantics:

- `placement: 'document'`: render only authored `learning-progress` nodes in the SPARC document.
- `placement: 'sidebar'`: show the shared right sidebar `Progress` panel for this SPARC display.
- If both a document node and sidebar placement are present, this should be valid only if explicitly allowed. My recommendation is to allow both only when the display-level config says so, because otherwise authors can accidentally duplicate learner progress.
- If a `learning-progress` node is authored without display-level `progressReporter`, treat it as document placement. The node is the placement request.
- If sidebar placement is requested and the model-progress provider is unavailable, show an explicit unavailable sidebar state.

Avoid tying placement to the old `skillRail` or fraction-specific layout names.

### 5. Keep Sidebar Ownership In The Session Shell

Update the `CardScreen.svelte` wiring so SPARC sidebar decisions are expressed through a small service rather than inline reactive conditionals.

Suggested helper:

`mofacts/client/views/experiment/svelte/services/sparcProgressReporter.ts`

Responsibilities:

- Normalize `display.progressReporter`.
- Detect whether the active SPARC display requests sidebar progress.
- Detect whether the active SPARC display requests document progress.
- Return a clear placement state for `CardScreen` and `SparcTrialSurface`.

Then update `CardScreen.svelte`:

- Use the shared model progress snapshot for all model-progress providers.
- Disable the ordinary sidebar only when the SPARC display is document-only.
- Enable the sidebar when SPARC explicitly requests `placement: 'sidebar'`.
- Keep the existing `disableProgressReport` delivery setting as a hard off switch unless product decides SPARC-authored sidebar placement should override it. My recommendation is that `disableProgressReport` remains a hard off switch.

### 6. Make Inline Progress Size To Content

The existing `LearningProgressChart.svelte` compact mode already calculates height from row count:

```css
height: calc(
  var(--progress-row-count) * var(--progress-bar-height)
  + (var(--progress-row-count) - 1) * var(--progress-bar-gap)
);
```

Preserve and test that behavior for 0, 1, 7, 8, and hundreds of items.

Refinements:

- Keep inline `compact={true}` for SPARC document nodes by default.
- Add optional node/display config only if authors need a non-compact document report later.
- Ensure `.sparc-learning-progress` does not impose a large min-height.
- If stats are desired inline later, add a `summary="hidden" | "compact" | "full"` option rather than growing the widget by default.

### 7. Retire The Old Hard-Coded Skill Readout

The `skill-bar` atom currently renders a static fill from authored node data. That should not be used for live model progress.

Recommended migration:

1. Leave `skill-bar` as a generic static visual atom for now if existing documents depend on it.
2. Rename its authoring description to make clear it is static/authored, not model-backed.
3. Prefer `learning-progress` in authoring UI for model-backed progress.
4. Remove any fractions-screen/generated content that creates hard-coded skill bars for live progress.
5. If no real content needs static `skill-bar`, deprecate it in the authoring catalog after one cleanup pass.

This avoids breaking authored documents while ending the misleading "skill-bar equals model progress" path.

## Implementation Sequence

### Phase 1: Provider Contract And Tests

Files likely touched:

- `learning-components/runtime/modelProgressProvider.ts`
- `learning-components/models/adaptive-logistic/modelProgressProvider.ts`
- `learning-components/models/adaptive-logistic/AdaptiveLogisticUnitEngine.ts`
- new tests near the adaptive logistic model tests

Tasks:

1. Define `ModelProgressProvider` and `ModelProgressItem`.
2. Add a pure helper that extracts progress items from adaptive logistic `cardProbabilities`.
3. Add unit tests for:
   - valid probabilities
   - current item marking
   - `canUse === false`
   - introduced state
   - invalid probability rejection
   - stable ids based on cluster/stim indices and stimulus KC
4. Expose `getModelProgressItems()` from the adaptive logistic engine.

### Phase 1B: SPARC Model Configuration Validation

Files likely touched:

- `learning-components/units/sparcsession/sparcSessionRuntimeConfig.ts`
- `learning-components/units/sparcsession/sparcSessionRuntimeConfig.test.ts`
- `learning-components/units/sparcsession/sparcDocumentValidation.ts`
- `learning-components/units/sparcsession/sparcDocumentValidation.test.ts`
- `mofacts/common/tdfFieldRegistries.ts` if schema/authoring descriptions need clarification

Tasks:

1. Add a helper that detects whether a SPARC document uses model-backed features:
   - `learning-progress` atoms
   - display-level `progressReporter`
   - model-practice production-rule effects
   - model reactive conditions
   - model-targeted node attachments
2. Require a coherent TDF unit `sparcsession` model definition when those features are present.
3. Keep the model definition in the TDF unit, not the stimulus file.
4. Add tests showing that missing unit-level model config fails clearly.
5. Add tests showing that a valid `sparcsession.clusterlist` and `sparcsession.calculateProbability` unlock model-backed progress.
6. Update field descriptions if current wording makes it sound like the stimulus registry owns the model.

### Phase 2: Shared Snapshot Builder

Files likely touched:

- `mofacts/client/views/experiment/svelte/services/learningProgressPanel.ts`
- `mofacts/client/views/experiment/svelte/services/learningProgressPanel.test.ts`
- `mofacts/client/views/experiment/svelte/services/learningProgressPanelRuntime.test.ts`

Tasks:

1. Replace raw `unitType` gating with `ModelProgressProvider` capability detection.
2. Build rows from `getModelProgressItems()`.
3. Keep hidden-item filtering by `stimulusKC`.
4. Keep threshold logic from delivery settings.
5. Preserve old learning-session expected snapshots in tests.
6. Add a SPARC-like engine test: `unitType: 'sparcsession'` plus `getModelProgressItems()` should be available.
7. Add a non-provider unavailable test.
8. Add a SPARC missing-model-config test at the runtime boundary so the failure happens before a fake empty progress report can appear.

### Phase 3: SPARC Placement Service

Files likely touched:

- `learning-components/trial-displays/sparc/SparcTrialDisplayAdapter.ts`
- `learning-components/trial-displays/sparc/SparcTrialDisplayAdapter.test.ts`
- `mofacts/client/views/experiment/svelte/services/sparcProgressReporter.ts`
- `mofacts/client/views/experiment/svelte/services/sparcProgressReporter.test.ts`
- `mofacts/client/views/experiment/svelte/components/CardScreen.svelte`

Tasks:

1. Normalize `progressReporter` in the SPARC trial display adapter.
2. Reject invalid placement values with clear errors.
3. Add a client service that resolves:
   - `isSparcDisplay`
   - `requestsSidebar`
   - `requestsDocument`
   - `effectiveProgressDisabled`
4. Replace the current inline `currentSparcProgressReporter` logic in `CardScreen.svelte` with that service.
5. Preserve the default ordinary learning-session sidebar behavior.

### Phase 4: Inline SPARC Widget Polish

Files likely touched:

- `mofacts/client/views/experiment/svelte/components/SparcNode.svelte`
- `mofacts/client/views/experiment/svelte/components/LearningProgressChart.svelte`
- component/service tests as available

Tasks:

1. Keep `learning-progress` document nodes compact by default.
2. Ensure the chart height is row-count based for small item counts.
3. Ensure unavailable inline progress is concise and does not create a large blank region.
4. Optionally pass node-level options for `label`, `compact`, and `showReferenceLines` after the display-level contract is stable.

### Phase 5: Authoring UI Updates

Files likely touched:

- `learning-components/units/sparcsession/sparcAuthoringCatalog.ts`
- `learning-components/units/sparcsession/sparcAuthoringCatalog.test.ts`
- `mofacts/client/views/experimentSetup/sparc/SparcAuthoringEditor.svelte`

Tasks:

1. Update `learning-progress` catalog description to say it is model-backed and can be placed inline or requested as a sidebar.
2. Update `skill-bar` catalog description to say it is static/authored.
3. Add authoring controls for progress placement if the display-level `progressReporter` is edited in this UI.
4. Keep stimulus registry editing as the source of model identities.
5. Validate that model-backed progress cannot be configured without valid stimulus identities.
6. Add or surface unit-level `sparcsession` model fields for SPARC lessons that use skills, rather than asking authors to define model behavior in the stimulus registry.
7. Show clear authoring diagnostics when a progress node exists but the TDF unit lacks `sparcsession.clusterlist` or the intended probability model.

### Phase 6: Fractions Screen Migration

Files to find during implementation:

- Generated SPARC content or sample TDF content that creates the old static fractions skill readout.
- Any hard-coded `skill-bar` nodes in SPARC fractions fixtures/examples.
- Any `progressReporter` display objects produced by SPARC conversion code.
- The canonical fractions TDF/stimulus package in `C:\dev\mofacts_config`.

Tasks:

1. Replace static hard-coded progress readout nodes with `learning-progress` nodes or display-level `progressReporter`.
2. For inline placement, use authored `atomType: 'learning-progress'`.
3. For sidebar placement, use display-level `progressReporter: { placement: 'sidebar' }`.
4. Update the fractions TDF unit so it defines a real SPARC adaptive model in `sparcsession`, including `clusterlist`, `unitMode`, and `calculateProbability`.
5. Use a simple stock probability model pattern, preferably the Gen-Z Slang model above, unless a fractions-specific model has already been deliberately chosen.
6. Update the fractions stimulus file so each model-practiced action has a concrete stimulus identity:
   - Lowest common denominator entry should have a stable `stimulusKC` such as `fractions.lcd`.
   - Numerator conversion, denominator conversion, simplification, and equivalent-fraction steps should get their own stable KCs if they are independently practiced.
   - `KCId` and `KCDefault` must equal `stimulusKC`; `KCCluster` must equal `clusterKC`.
7. Wire correctness-producing SPARC actions to model practice observations. For example, when the learner enters the lowest common denominator and the production rule marks that action correct, the resulting history row should credit the LCD stimulus KC as correct.
8. Verify that after the correct LCD action is inserted, the next progress snapshot reflects the model update from the newly written correctness history.
9. Remove dead CSS or hard-coded static-fill generation once no active content uses it.

### Phase 7: Package Upload And MCP Verification

Run this only after the model-provider code, SPARC placement code, and canonical fractions TDF/stimulus package update are complete and locally verified.

Use the MoFaCTS Playwright MCP sidecar for browser-level verification:

1. Start or verify the hotfix dev app and the MoFaCTS Playwright MCP sidecar.
2. Log in through the app UI using the configured local/admin account.
3. Navigate to the content-management/upload surface through the UI.
4. Delete the old uploaded fractions lesson/package version.
5. Upload the new fractions package from the canonical `C:\dev\mofacts_config` package files.
6. Launch the uploaded lesson as a learner.
7. Open the progress report in the configured placement, inline or sidebar.
8. Perform the target fractions action, especially entering the lowest common denominator.
9. Confirm the action is marked correct when it is correct.
10. Confirm a model-practice history row is written for the intended stimulus KC.
11. Confirm the progress bars move after the correct action updates the adaptive model.
12. Repeat one incorrect action and one correct action so both history and probability movement are visible.

Do not treat MCP upload testing as a substitute for unit tests, typecheck, or lint. It is the final browser-level proof that the updated package and app runtime are connected correctly.

## Verification Plan

Run from `mofacts/` when TypeScript-bearing app code changes:

```powershell
npm run typecheck
```

Run lint when Svelte/TypeScript/JavaScript files change:

```powershell
npm run lint
```

Targeted tests to add or update:

- Adaptive logistic model progress provider tests.
- `learningProgressPanel.test.ts`.
- `learningProgressPanelRuntime.test.ts`.
- `sparcProgressReporter.test.ts`.
- `SparcTrialDisplayAdapter.test.ts`.
- `sparcAuthoringCatalog.test.ts`.
- Existing SPARC session tests that cover model-practice updates.
- A fractions/SPARC fixture test proving a correct lowest-common-denominator action writes a correct model-practice observation for the LCD stimulus KC.

UI verification:

1. Start the native hotfix dev app through `deploy/hotfix-dev.ps1` using the explicit local settings path from `C:\dev\mofacts_config\deploy and build.txt`.
2. Use the MoFaCTS Playwright sidecar against `http://host.docker.internal:3200`.
3. Verify ordinary learning-session progress still works.
4. Verify SPARC inline progress with 1, 7, 8, and hundreds of items.
5. Verify SPARC sidebar progress opens/closes and dispatches resize events.
6. Verify `disableProgressReport` disables the sidebar.
7. Verify unavailable provider states are explicit.
8. After uploading the updated fractions package, verify the LCD action marks correct and moves the associated model-progress bar.

## Documentation Impact

If implementation changes authored SPARC schema or editor behavior:

- Update concise public authoring docs under `docs/` if authors need to know the new progress reporter contract.
- Document that SPARC skill/model references require TDF unit-level `sparcsession` model configuration, parallel to learning-session model configuration.
- Document the fractions package as the first real migrated example once its TDF and stimulus file use the shared model-progress path.
- Update `docs-developer/learning-session-progress-panel-plan.md` only if it would otherwise mislead maintainers about the now-shared provider boundary.
- If TDF schema fields change, regenerate schemas and inspect generated diffs.

## Product Decisions To Confirm During Implementation

These are not blockers for the architecture, but they should be confirmed before final UI polish:

1. Should `disableProgressReport` always override SPARC-authored sidebar placement? Recommendation: yes.
2. Should a SPARC document be allowed to show both an inline progress node and the sidebar at the same time? Recommendation: only with an explicit `allowMultipleProgressReports` or similar opt-in, otherwise reject or warn in authoring validation.
3. Should inline progress ever show target and mean reference lines? Recommendation: default no; allow later if instructors request it.
4. Should learners see stimulus labels for SPARC KCs? Recommendation: no for now, matching the current learning-session panel privacy posture.
5. Should `skill-bar` remain as a static visual atom or be deprecated entirely? Recommendation: keep temporarily, relabel as static, then remove only after content audit.
6. Which exact SPARC authoring path should expose `sparcsession.clusterlist` and `sparcsession.calculateProbability` for lessons that use skill references? Recommendation: expose or validate them at the unit/TDF level, not inside the stimulus registry editor.
7. Which fractions KCs are first-class model targets beyond lowest common denominator? Recommendation: start with LCD, numerator conversion, denominator conversion, equivalent-fraction selection, and simplification only if each maps to a distinct correctness-producing action.

## Acceptance Criteria

- Ordinary learning-session progress continues to use the existing right sidebar and the same model probabilities.
- SPARC sessions can provide progress snapshots through the same model-progress provider contract.
- A SPARC `learning-progress` node renders live model probabilities inline without hard-coded fills.
- SPARC lessons with model skill references require a coherent TDF unit-level `sparcsession` adaptive model definition.
- A SPARC display can request the shared right sidebar progress panel.
- Inline progress shrinks vertically for small item counts.
- Hundreds of items remain scrollable/usable in the sidebar.
- The old fractions progress readout no longer drives live model progress.
- The canonical fractions TDF/stimulus package is updated to use a real `sparcsession` model and model-practice observations.
- MCP browser verification deletes the old fractions lesson, uploads the new package, and proves correct fractions actions move the relevant skill/model progress bars.
- Tests cover the provider boundary, snapshot builder, SPARC placement resolution, and small-count compact sizing.
- No silent fallback path fabricates progress when model state is unavailable.
