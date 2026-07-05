# Content Runtime Surface Plan

## Status

Planning document. This describes a target architecture and migration sequence; it does not describe the current implementation as complete.

## Problem

The learner runtime has outgrown the word "card". The current `CardScreen` boundary now owns launch, resume, timing, reveal, progress display, unit continuation, and session-surface selection for multiple content modes. Calling that boundary a card screen obscures its actual role and encourages card-specific assumptions to leak into SPARC, video, and future session types.

SPARC is also represented at the wrong level in parts of the runtime. Some SPARC behavior is currently handled as a branch inside generic flashcard rendering, which makes it easy to conflate these concerns:

- A session surface owns high-level layout and flow.
- A flashcard controller coordinates normal MoFaCTS stimulus/response/feedback behavior.
- A video controller coordinates video playback, checkpoint, and resume behavior.
- A SPARC controller coordinates SPARC runtime state, learner actions, and integration with the content runtime.
- A timer policy decides whether the MoFaCTS runtime clock applies.
- A submission adapter translates a surface-specific action into a canonical response event.

The recent response-timer regression exposed this coupling: a display-level "owns interaction" concept was used as if it also meant "owns the timer." SPARC can own rich interaction events without owning or disabling the standard response timer.

## Target Shape

Use `ContentSurface` as the app-owned top-level runtime shell.

```text
ContentSurface
  FlashcardSessionSurface
    FlashcardController

  VideoSessionSurface
    VideoController

  SparcSessionSurface
    SparcController
```

`AutoTutorSession` and H5P are deprecated for this planning pass and should not drive the target architecture. Existing H5P behavior should be preserved until removal, but it should not shape new names or boundaries.

## Boundary Rules

`ContentSurface` owns:

- launch and resume orchestration
- state machine actor lifecycle
- response and feedback timing
- reveal/fade orchestration
- blocking asset readiness
- performance/progress summary wiring
- unit continuation and route-level cleanup
- choosing the active session surface

Session surfaces own:

- session-level layout
- content-mode-specific chrome
- mode-specific viewport behavior
- delegating mode-specific coordination to their controller
- forwarding learner events back to `ContentSurface`

Flashcard controllers own:

- normal MoFaCTS stimulus/response/feedback coordination
- flashcard input, reveal, feedback, and readiness coordination
- canonical response emission back to `ContentSurface`

Video controllers own:

- video playback coordination
- checkpoint, resume, rewind, and end-of-video coordination
- canonical checkpoint/question events back to `ContentSurface`

SPARC controllers own:

- SPARC runtime state coordination
- SPARC learner action processing
- SPARC history/model integration
- exposing canonical events back to `ContentSurface`

Timer policy owns:

- whether the standard MoFaCTS response timer is active
- what visible event starts the response timer
- whether an embedded activity provides a proven equivalent response clock

Timer policy must not be inferred from vague display ownership names.

## Naming Targets

Rename the runtime shell:

- `CardScreen.svelte` -> `ContentSurface.svelte`
- `cardRoute:*` launch timing labels may remain temporarily if they refer to the legacy route, but new runtime labels should use `contentRuntime:*`.
- `cardMachine` can remain temporarily during the first rename if changing it would expand scope too much. The long-term name should be `contentRuntimeMachine` or `sessionRuntimeMachine`.

Clarify session surfaces:

- `StandardCardSessionSurface` -> `FlashcardSessionSurface`
- `VideoCardSessionSurface` -> `VideoSessionSurface`
- new `SparcSessionSurface`

Clarify flashcard runtime naming:

- `TrialContent` and related `trial*` helpers are legacy names for normal flashcard runtime pieces.
- The target coordinator name is `FlashcardController`.
- SPARC-specific session layout must not live inside the flashcard runtime.
- The flashcard runtime must not route to SPARC.

Clarify video runtime naming:

- `VideoCardSessionSurface` -> `VideoSessionSurface`
- `videoCard*` and `cardVideo*` helpers are legacy names for video runtime pieces.
- The target coordinator name is `VideoController`.

Clarify SPARC runtime naming:

- There is no SPARC trial concept.
- `SparcTrialSurface` is an obsolete implementation name.
- The learner-facing replacement is `SparcSessionSurface`.
- The runtime coordinator formerly discussed as a SPARC session service should be named `SparcController`.
- Existing SPARC editor/visual setup code is not the learner runtime surface. Editor operability and any authoring/runtime surface reuse belong in a future plan.
- `display.type === "sparc"` is old display-adapter plumbing and must not select the top-level session surface.

Clarify policy names:

- Avoid `ownsInteraction` when the code means timer behavior.
- Prefer explicit names such as `usesStandardResponseTimeout`, `suppressesStandardResponseTimeout`, or `providesOwnResponseClock`.
- Keep submission ownership separate from timer ownership.

## Explicit Naming Schema

Use this schema as the target vocabulary. New code should not introduce parallel names for the same responsibility.

| Target name | Responsibility | Replaces or absorbs |
| --- | --- | --- |
| `ContentSurface` | Route-mounted learner runtime shell; launch/resume orchestration; active session-surface selection; state-machine actor lifecycle; timing/reveal/progress wiring. | `CardScreen.svelte` and runtime-shell uses of `card*` naming. |
| `FlashcardSessionSurface` | Flashcard session layout for learning and assessment unit types. | `StandardCardSessionSurface.svelte`. |
| `FlashcardController` | Normal MoFaCTS stimulus/response/feedback coordination. | `TrialContent`, `trialContent*`, `trialDisplay*`, `cardTrial*`, `cardReview*`, `activeTrial*`, and `incomingTrial*` pieces that are truly flashcard-runtime coordination. |
| `VideoSessionSurface` | Video session layout. | `VideoCardSessionSurface.svelte`. |
| `VideoController` | Video playback, checkpoints, resume, rewind, question handoff, and end-of-video coordination. | `videoSessionRuntime`, `videoSessionBridge`, `videoMachineBridge`, `videoCard*`, and `cardVideo*` pieces that are truly video-runtime coordination. |
| `SparcSessionSurface` | Learner-facing SPARC session surface, selected by `unit.sparcsession`. | Runtime use of `SparcTrialSurface` and the SPARC branch inside flashcard runtime. |
| `SparcController` | SPARC runtime state, learner actions, production-rule actions, history/model integration, and canonical event exposure back to `ContentSurface`. | `sparcController*`, `sparcProductionRule*`, `sparcProgressReporter*`, `sparcTrialDisplay*`, and `sparcTrialDisplayRuntimeContextCache` pieces that are still needed after removing the SPARC trial concept. |

Rules:

- Do not add a target object while leaving its obsolete predecessor as an active parallel path.
- A rename phase must list what is being removed, renamed, or deliberately deferred.
- If a current helper does not fit the target owner cleanly, stop and classify it before building on it.
- `display.type === "sparc"` must not select the top-level session surface.
- SPARC editor/authoring cleanup is deferred to a future plan. The current `sparcEdit` path appears gated by old `display.type === "sparc"` detection and should not drive the learner runtime architecture in this pass. When `SparcTrialSurface` is renamed to `SparcSessionSurface`, update editor imports/usages to the renamed surface so obsolete naming does not remain, but do not otherwise make the editor operational in this pass.
- In theory, flashcard, video, and SPARC surfaces could later be reused in authoring/preview contexts. That is out of scope for this plan.

## Current To Target Map

This table is the removal checklist. Each implementation phase should update it if inventory proves a row inaccurate.

| Current name/path | Current role | Target owner/name | Action | Removal condition |
| --- | --- | --- | --- | --- |
| `mofacts/client/views/experiment/svelte/components/CardScreen.svelte` | Route-mounted learner runtime shell. | `ContentSurface.svelte` | Rename. | All imports/mounts use `ContentSurface`; route can remain `/card` temporarily. |
| `mofacts/client/views/experiment/svelte/services/cardSessionRuntime.ts` | Builds current session-surface snapshot and video instruction state under card naming. | `ContentSurface` runtime helper or renamed content/session runtime helper. | Rename/classify after `ContentSurface` exists. | No session-surface selection helper remains card-specific unless it truly refers to the legacy route. |
| `mofacts/client/views/experiment/svelte/services/cardMachineRuntime.ts` | XState actor lifecycle controller under card naming. | `ContentSurface` / `contentRuntimeMachine` controller. | Rename in the machine-name phase. | Machine actor lifecycle no longer uses `cardMachine*` names unless preserved as temporary route compatibility. |
| `mofacts/client/views/experiment/svelte/components/StandardCardSessionSurface.svelte` | Learning/assessment flashcard session layout. | `FlashcardSessionSurface.svelte` | Rename. | Learning and assessment sessions render through `FlashcardSessionSurface`. |
| `mofacts/client/views/experiment/svelte/components/TrialContent.svelte` | Current normal flashcard rendering, but also contains obsolete SPARC/H5P branches. | `FlashcardController`-owned flashcard runtime pieces. | Classify and split/rename. Do not blindly rename if it still routes SPARC. | Flashcard runtime has no SPARC branch and is owned by `FlashcardController`. |
| `mofacts/client/views/experiment/svelte/services/trialContentProps.ts` | Builds props for current `TrialContent`. | `FlashcardController` helper. | Rename/classify with flashcard controller work. | Prop building name reflects flashcard runtime, not generic trial content. |
| `mofacts/client/views/experiment/svelte/components/ActiveTrialContentSlot.svelte` | Active slot for current flashcard display handoff under trial naming. | `FlashcardController` helper or flashcard slot component. | Rename/classify with flashcard controller work. | Slot name no longer implies generic trial ownership if it is flashcard-only. |
| `mofacts/client/views/experiment/svelte/components/IncomingTrialContentSlot.svelte` | Incoming slot for prepared flashcard display handoff under trial naming. | `FlashcardController` helper or flashcard slot component. | Rename/classify with flashcard controller work. | Slot name no longer implies generic trial ownership if it is flashcard-only. |
| `mofacts/client/views/experiment/svelte/services/activeTrialDisplayState.ts` | Active flashcard display state under trial naming. | `FlashcardController` helper. | Rename/classify with flashcard controller work. | Name reflects flashcard display state if no longer generic. |
| `mofacts/client/views/experiment/svelte/services/activeTrialRevealController.ts` | Visible-reveal controller for the active flashcard under trial naming. | `FlashcardController` helper, unless reveal stays shared in `ContentSurface`. | Classify before renaming. | Reveal ownership is explicit: shared content runtime or flashcard controller. |
| `mofacts/client/views/experiment/svelte/services/trialFadeTransitionController.ts` | Transition controller for current flashcard handoff under trial naming. | `FlashcardController` helper, unless transition stays shared in `ContentSurface`. | Classify before renaming. | Transition ownership is explicit. |
| `mofacts/client/views/experiment/svelte/services/cardTrialEventController.ts` | Flashcard event coordination under card/trial naming. | `FlashcardController` helper. | Rename/classify. | Event controller name reflects flashcard behavior. |
| `mofacts/client/views/experiment/svelte/services/cardReviewEventController.ts` | Card review/feedback event coordination. | `FlashcardController` helper. | Rename/classify. | Review/feedback event controller name reflects flashcard behavior. |
| `mofacts/client/views/experiment/svelte/services/cardTextInputController.ts` | Text input coordination for normal response UI. | `FlashcardController` helper. | Rename/classify. | Input controller name reflects flashcard response behavior. |
| `mofacts/client/views/experiment/svelte/components/VideoCardSessionSurface.svelte` | Video session layout under card naming. | `VideoSessionSurface.svelte` | Rename. | Video sessions render through `VideoSessionSurface`. |
| `mofacts/client/views/experiment/svelte/services/videoSessionRuntime.ts` | Video instruction/runtime controller already close to target. | `VideoController`. | Rename or fold into `VideoController`. | Video session runtime controller is exposed through `VideoController` naming. |
| `mofacts/client/views/experiment/svelte/services/videoSessionBridge.ts` | Video checkpoint/end bridge. | `VideoController` helper. | Fold or rename under `VideoController`. | Checkpoint/end handling is owned by `VideoController`. |
| `mofacts/client/views/experiment/svelte/services/videoMachineBridge.ts` | Video resume/rewind bridge to machine/player. | `VideoController` helper. | Fold or rename under `VideoController`. | Resume/rewind handling is owned by `VideoController`. |
| `mofacts/client/views/experiment/svelte/services/videoCardInit.ts` | Video initialization under card naming. | `VideoController` or video init helper. | Rename/classify. | No `videoCard*` name remains for current video runtime. |
| `mofacts/client/views/experiment/svelte/services/cardVideoRuntime.ts` | Video runtime helper under card naming. | `VideoController` helper. | Rename/classify. | No `cardVideo*` name remains for current video runtime. |
| `mofacts/client/views/experiment/svelte/services/cardVideoEventRuntime.ts` | Video event runtime helper under card naming. | `VideoController` helper. | Rename/classify. | No `cardVideo*` event runtime name remains for current video runtime. |
| `mofacts/client/views/experiment/svelte/components/SparcTrialSurface.svelte` | Current SPARC learner visual runtime component name with an obsolete trial name. It is also referenced by inactive or not-yet-operational SPARC editor code. | Learner runtime role moves to `SparcSessionSurface.svelte`. | Rename/rework for learner runtime. Leave editor operability for a future plan. | Learner runtime no longer imports or renders `SparcTrialSurface`; no learner-runtime SPARC trial concept remains. |
| `mofacts/client/views/experiment/svelte/services/sparcTrialDisplay.ts` | Resolves `display.type === "sparc"` display plumbing. | `SparcController` or deleted. | Remove from top-level session selection; rename only if still needed inside SPARC runtime. | `display.type === "sparc"` is not used to choose the session surface. |
| `mofacts/client/views/experiment/svelte/services/sparcTrialDisplayRuntimeContextCache.ts` | SPARC display runtime context cache under trial-display naming. | `SparcController` helper or deleted. | Rename/classify with SPARC controller work. | No needed SPARC runtime cache uses `trialDisplay` naming. |
| `mofacts/client/views/experiment/svelte/services/sparcControllerDialogueCommit.ts` | SPARC controller dialogue commit helper already near target naming. | `SparcController` helper. | Keep or fold. | Dialogue commit is exposed through `SparcController` naming. |
| `mofacts/client/views/experiment/svelte/services/sparcControllerDialogueOpenRouter.ts` | SPARC dialogue routing helper already near target naming. | `SparcController` helper. | Keep or fold. | Dialogue routing is exposed through `SparcController` naming. |
| `mofacts/client/views/experiment/svelte/services/sparcProductionRuleActionCommit.ts` | SPARC production-rule action commit helper. | `SparcController` helper. | Keep, fold, or rename under controller. | Production-rule actions are coordinated through `SparcController`. |
| `mofacts/client/views/experiment/svelte/services/sparcProgressReporter.ts` | SPARC progress reporter helper. | `SparcController` helper or SPARC surface helper. | Classify during SPARC controller work. | Progress reporter ownership is explicit. |
| `mofacts/client/views/experimentSetup/sparc/SparcVisualSurface.svelte` | SPARC content-file visual editing canvas mounted through `experimentSetup/sparcEdit.ts`, but current access appears tied to old `display.type === "sparc"` detection. | Future SPARC editor plan; during this plan only update its import/use from `SparcTrialSurface` to `SparcSessionSurface` after the rename. | Minimal rename cleanup only. Do not make the editor operational. | Visual-editor code no longer imports `SparcTrialSurface`; future editor plan decides operability and authoring behavior. |

## Verified SPARC Selection Invariant

Learner-runtime SPARC session selection should use `unit.sparcsession`.

Evidence checked before implementation:

- `mofacts/client/views/experiment/engineConstructors.ts` maps a unit with `sparcsession` to `SPARC_UNIT`.
- `mofacts/client/views/experiment/engineConstructors.contracts.test.ts` asserts `{ sparcsession: {} } -> 'sparc'`.
- `learning-components/units/sparcsession/` reads unit-level `sparcsession` configuration, including `pageId`.
- `C:\dev\mofacts_config` scan found 56 TDF JSON files with `sparcsession`, 56 stimulus JSON files with `setspec.sparcPages`, and no current config files using cluster `stim.display.type === "sparc"`.

Current gap:

- `mofacts/client/views/experiment/svelte/services/sessionSurfaceMode.ts` currently selects only `autotutor | video | card`; it does not yet expose a `sparc` session surface mode.
- Phase 4 should add `sparc` session surface selection from `currentTdfUnit.sparcsession`.
- `display.type === "sparc"` must not be used as the top-level session selector.

## Migration Plan

Each phase should be one reviewable change unless the diff proves smaller than expected. Do not combine a pure rename phase with behavior extraction.

Classification is phase-local. Do not perform a full repository-wide rename inventory for every `card*`, `trial*`, `videoCard*`, `cardVideo*`, and `sparc*` helper before starting implementation. Instead, classify the helpers immediately relevant to the phase being implemented, record the classification in the phase notes, and update the Current To Target Map if the inventory changes the plan.

Phase-local classification scope:

- Phase 1: `CardScreen`, `cardSessionRuntime`, `cardMachineRuntime`, route-facing `card*` names.
- Phase 2: `TrialContent`, `trialContent*`, `trialDisplay*`, `cardTrial*`, `cardReview*`, `activeTrial*`, `incomingTrial*`.
- Phase 3: `VideoCardSessionSurface`, `videoSessionRuntime`, `videoSessionBridge`, `videoMachineBridge`, `videoCard*`, `cardVideo*`.
- Phase 4: `SparcTrialSurface`, `sparcTrialDisplay*`, `sparcController*`, `sparcProductionRule*`, `sparcProgressReporter*`.

The purpose of classification is to remove or rename obsolete names as the new owner is introduced, not to add a clean new layer while leaving the old active path behind.

Before starting any phase, run these inventory commands from the repository root and paste the relevant findings into the implementation notes for that phase:

```powershell
rg -n "CardScreen|ContentScreen|ContentSurface|StandardCardSessionSurface|VideoCardSessionSurface|TrialContent|SparcTrial|sparcOwns|ownsInteraction|SuppressesStandardTimeout" mofacts/client/views/experiment
rg -n "CardScreen|ContentScreen|ContentSurface|StandardCardSessionSurface|VideoCardSessionSurface|TrialContent" mofacts/common mofacts/client learning-components
```

## Rename Glossary By Phase

Use this glossary as the source of truth for planned names.

| Phase | Current name | Target name | Notes |
| --- | --- | --- | --- |
| 0 | `trialDisplayOwnsInteraction` used as timer policy | `trialDisplaySuppressesStandardTimeout` or equivalent timer-specific name | Submission ownership and timer policy stay separate. |
| 1 | `CardScreen.svelte` | `ContentSurface.svelte` | Route-mounted runtime shell. |
| 1 | `cardRoute:*` log labels | keep temporarily | Only rename labels when they describe runtime internals rather than the legacy route. |
| 1 | `cardMachine` | keep temporarily | Rename later after session surfaces are stable. |
| 2 | `TrialContent.svelte` and `trial*` flashcard helpers | `FlashcardController`-owned runtime pieces | Normal stimulus/response/feedback behavior. Must not route to SPARC. |
| 3 | `StandardCardSessionSurface.svelte` | `FlashcardSessionSurface.svelte` | Used by learning and assessment unit types that share `FlashcardController`. |
| 3 | `VideoCardSessionSurface.svelte` | `VideoSessionSurface.svelte` | Video session/checkpoint shell. |
| 3 | `videoCard*` and `cardVideo*` runtime helpers | `VideoController`-owned runtime pieces | Video playback/checkpoint/resume behavior. |
| 4 | SPARC branch inside `TrialContent` / flashcard runtime | `SparcSessionSurface.svelte` | Selected by `unit.sparcsession`; not embedded inside flashcard routing. |
| 4 | `SparcTrialSurface.svelte` runtime role | `SparcSessionSurface.svelte` | Remove the SPARC trial concept; keep only genuinely non-runtime editor helpers separate if needed. |
| 4 | SPARC session service concept | `SparcController` | Controller/coordinator name for SPARC runtime state and events. |
| 5 | `cardMachine*` state-machine core | `contentRuntimeMachine*` or `sessionRuntimeMachine*` | Decide after Phase 4. |

### Phase 0: Lock Timer Policy Boundary

Goal: prevent the architecture refactor from preserving the response-timer coupling that caused the attributed-image timeout regression.

Current files likely touched:

- `mofacts/client/views/experiment/svelte/machine/guards.ts`
- `mofacts/client/views/experiment/svelte/machine/cardMachinePresentingState.ts`
- `mofacts/client/views/experiment/svelte/machine/cardMachineOptions.ts`
- `mofacts/client/views/experiment/svelte/machine/guards.contracts.test.ts`
- display services returned by `rg "OwnsInteraction|SuppressesStandardTimeout|ResponseClock|mainTimeout"`

Steps:

- Audit every guard or helper with names like `ownsInteraction`.
- Split submission ownership from timeout ownership.
- Require each display/session type to declare one of:
  - standard MoFaCTS response timer applies
  - display provides its own response clock
  - no response timer is applicable
- Document why any display suppresses the standard timer.
- Do not infer timer behavior from whether a display has custom input controls.
- Preserve existing H5P behavior until H5P removal, but do not use H5P as a design driver.

Implementation sequence:

1. Create or keep a timer-specific helper such as `trialDisplaySuppressesStandardTimeout`.
2. Ensure the helper only returns true for displays that truly provide or require a nonstandard response clock.
3. Add explicit tests for each active content family:
   - normal flashcard display uses standard response timeout
   - attributed-image flashcard display uses standard response timeout after visible reveal
   - SPARC session does not suppress or alter the standard timer through display-ownership names
4. Keep submission ownership helpers named separately only as temporary implementation cleanup targets; remove obsolete SPARC display-ownership names during SPARC surface extraction.

Expected diff shape:

- guard/helper rename or split
- tests naming timer behavior per content family
- no session-surface extraction

Stop and reassess if:

- a display suppresses the standard timer without a documented equivalent clock or explicit no-timer requirement
- timer policy starts depending on layout components

Verification:

- Unit tests proving SPARC does not suppress the standard timer through obsolete display ownership.
- UI smoke for timeout and feedback advance behavior.
- `npm run typecheck`
- `npm run lint`

### Phase 1: Rename The Outer Runtime Boundary

Goal: make the top-level ownership visible without changing behavior.

Current files likely touched:

- `mofacts/client/views/experiment/svelte/components/CardScreen.svelte`
- `mofacts/client/views/experiment/card.ts`
- tests or references returned by `rg "CardScreen"`

Steps:

- Rename `CardScreen.svelte` to `ContentSurface.svelte`.
- Update `card.ts` so the legacy card route imports and mounts `ContentSurface`.
- Keep route/template names unchanged unless the route itself changes later.
- Add a small compatibility comment in `card.ts` explaining that the legacy `card` route mounts the content runtime surface.
- Do not rename every `card*` helper in the same step.
- Do not rename `cardMachine`, `CardStore`, or card runtime services in this phase.
- Do not change component props in this phase.

Suggested mechanical commands:

```powershell
Move-Item -LiteralPath mofacts/client/views/experiment/svelte/components/CardScreen.svelte -Destination mofacts/client/views/experiment/svelte/components/ContentSurface.svelte
rg -n "CardScreen" mofacts/client/views/experiment
```

Expected diff shape:

- one file rename
- import/reference updates
- optional mount-boundary comment
- no state-machine or behavior changes

Stop and reassess if:

- the rename requires changing runtime props
- tests reveal behavior coupling to the old component name
- a generated or bundled file appears in the diff

Verification:

- `npm run typecheck`
- `npm run lint`
- Hotfix dev smoke test reaches the learner app.
- Browser smoke route: `http://localhost:3200` or `http://host.docker.internal:3200` through the MoFaCTS Playwright sidecar.

### Phase 2: Establish `FlashcardController`

Goal: make the normal MoFaCTS stimulus/response/feedback coordinator explicit.

Current files likely touched:

- `mofacts/client/views/experiment/svelte/components/TrialContent.svelte`
- `mofacts/client/views/experiment/svelte/components/ActiveTrialContentSlot.svelte`
- `mofacts/client/views/experiment/svelte/components/IncomingTrialContentSlot.svelte`
- `mofacts/client/views/experiment/svelte/components/StandardCardSessionSurface.svelte`
- `mofacts/client/views/experiment/svelte/components/VideoCardSessionSurface.svelte`
- flashcard runtime services returned by `rg "TrialContent|trialContent|TrialDisplay|trialDisplay|cardTrial|cardReview|activeTrial|incomingTrial"`

Steps:

- Identify the current normal flashcard coordinator pieces.
- Introduce or rename the coordinator boundary to `FlashcardController`.
- Keep `FlashcardSessionSurface` responsible for layout and `FlashcardController` responsible for flashcard runtime coordination.
- Preserve behavior and event contracts exactly.
- Do not preserve SPARC routing inside flashcard runtime as a valid design.
- If removing SPARC routing requires `SparcSessionSurface`, record that dependency and defer removal to Phase 4.
- Do not add compatibility fallback paths.

Suggested inventory commands:

```powershell
rg -n "TrialContent|trialContent|TrialDisplay|trialDisplay|cardTrial|cardReview|activeTrial|incomingTrial|FlashcardController" mofacts/client/views/experiment/svelte
```

Expected diff shape:

- controller boundary or rename for flashcard coordination
- import/reference updates only where they name the controller boundary
- no behavior changes
- no session-surface selection changes unless Phase 4 is also in scope

Stop and reassess if:

- the flashcard runtime is still doing SPARC session selection in a way that makes the controller boundary misleading
- removing SPARC routing requires `SparcSessionSurface` first

Verification:

- Existing Svelte runtime tests.
- `npm run typecheck`
- `npm run lint`

### Phase 3: Rename Session Surfaces And Establish `VideoController`

Goal: remove card-specific naming from session-level components and make video coordination explicit.

Current files likely touched:

- `mofacts/client/views/experiment/svelte/components/StandardCardSessionSurface.svelte`
- `mofacts/client/views/experiment/svelte/components/VideoCardSessionSurface.svelte`
- `mofacts/client/views/experiment/svelte/components/ContentSurface.svelte`
- `mofacts/client/views/experiment/svelte/services/videoSessionRuntime.ts`
- `mofacts/client/views/experiment/svelte/services/videoSessionBridge.ts`
- `mofacts/client/views/experiment/svelte/services/videoMachineBridge.ts`
- `mofacts/client/views/experiment/svelte/services/videoCardInit.ts`
- `mofacts/client/views/experiment/svelte/services/cardVideoRuntime.ts`
- `mofacts/client/views/experiment/svelte/services/cardVideoEventRuntime.ts`
- tests or references returned by `rg "StandardCardSessionSurface|VideoCardSessionSurface"`

Steps:

- Rename `StandardCardSessionSurface` to `FlashcardSessionSurface`.
- Rename `VideoCardSessionSurface` to `VideoSessionSurface`.
- Establish `VideoController` as the video coordination boundary.
- Classify existing video helpers as either `VideoController` responsibilities or local video helper functions.
- Update imports, tests, and component references.
- Preserve behavior and props during the rename.
- Do not move SPARC logic in this phase.
- Keep the same event forwarding contract from the surfaces to `ContentSurface`.
- Confirm that learning and assessment unit types both continue through `FlashcardSessionSurface` and `FlashcardController`.

Suggested mechanical commands:

```powershell
Move-Item -LiteralPath mofacts/client/views/experiment/svelte/components/StandardCardSessionSurface.svelte -Destination mofacts/client/views/experiment/svelte/components/FlashcardSessionSurface.svelte
Move-Item -LiteralPath mofacts/client/views/experiment/svelte/components/VideoCardSessionSurface.svelte -Destination mofacts/client/views/experiment/svelte/components/VideoSessionSurface.svelte
rg -n "StandardCardSessionSurface|VideoCardSessionSurface|videoCard|cardVideo|VideoController" mofacts/client/views/experiment
```

Expected diff shape:

- two file renames
- import/reference updates
- optional `VideoController` rename/extraction if small and behavior-preserving
- no prop contract changes
- no machine changes

Stop and reassess if:

- session-surface props differ in ways that suggest hidden behavior extraction
- SPARC-specific logic must move to complete the rename
- video controller extraction is larger than a rename/classification pass

Verification:

- Existing Svelte runtime tests.
- `npm run typecheck`
- `npm run lint`

### Phase 4: Create `SparcSessionSurface` And `SparcController`

Goal: make SPARC a first-class learner session surface and remove the obsolete SPARC-trial path from flashcard rendering.

Current files likely touched:

- `mofacts/client/views/experiment/svelte/components/ContentSurface.svelte`
- flashcard runtime files currently named `TrialContent`, `trialContent*`, or `trialDisplay*`
- `mofacts/client/views/experiment/svelte/components/SparcTrialSurface.svelte`
- `mofacts/client/views/experiment/svelte/services/sparcTrialDisplay.ts`
- SPARC runtime coordination service files, to be renamed or collapsed into `SparcController`
- `mofacts/client/views/experiment/svelte/services/sessionSurfaceMode.ts`
- SPARC runtime references returned by `rg "sparcOwns|SparcTrial|sparcTrialDisplay|sparcSessionService|SparcController"`

Steps:

- Select `SparcSessionSurface` from unit content when the current TDF unit has a `sparcsession` object.
- Add `SparcSessionSurface` next to the flashcard and video surfaces.
- Move SPARC learner visual/session behavior out of the flashcard runtime.
- Introduce `SparcController` as the SPARC runtime coordinator name.
- Keep canonical learner event forwarding through `ContentSurface`.
- Remove the SPARC routing branch from the flashcard runtime.
- Remove learner-runtime dependence on `display.type === "sparc"` as the top-level session selector.
- Remove or rename `SparcTrialSurface` for learner runtime. There is no SPARC trial concept.
- Do not create a SPARC-within-SPARC structure.
- Do not preserve embedded SPARC-as-flashcard behavior as a compatibility path.
- Do not make the SPARC editor operational in this pass.

Implementation sequence:

1. Add a pure resolver in `sessionSurfaceMode.ts`, for example `resolveSessionSurfaceKind(unit)`, returning a small string union such as `'flashcard' | 'video' | 'sparc'`.
2. Make the resolver return `'sparc'` when `unit.sparcsession` is a non-null object.
3. Make the resolver return `'flashcard'` for learning and assessment unit types that share the flashcard surface.
4. Add tests for representative units:
   - `{ learningsession: {...} }` -> `'flashcard'`
   - `{ assessmentsession: {...} }` -> `'flashcard'`
   - `{ sparcsession: {...} }` -> `'sparc'`
   - video session unit -> `'video'`
5. Rename/rework learner-runtime use of `SparcTrialSurface.svelte` into `SparcSessionSurface.svelte`.
6. Create or rename the SPARC runtime coordinator to `SparcController`.
7. Route SPARC session mode from `ContentSurface` to `SparcSessionSurface`.
8. Attach `SparcController` only in learner runtime.
9. Remove SPARC routing from the flashcard runtime.
10. Perform only the minimal SPARC editor rename cleanup:
    - do not try to make `/sparcEdit/:tdfId` operational here
    - update editor imports/usages from `SparcTrialSurface` to `SparcSessionSurface`
    - do not change editor behavior beyond the rename

Expected diff shape:

- one learner-runtime `SparcSessionSurface.svelte`
- one `SparcController` module or renamed coordinator
- resolver/test changes naming the selection rule
- smaller or removed SPARC branch inside the flashcard runtime, not a larger one
- removal or rename of `SparcTrial*` names
- no timer-policy changes except explicit tests proving behavior is unchanged

Stop and reassess if:

- SPARC session behavior depends on generic card-session props in a way that would require a broad prop redesign
- current content uses SPARC displays inside non-SPARC units and the user has not decided whether to remove or preserve that path
- the flashcard runtime still needs to inspect SPARC-specific content to render correctly
- editor/authoring cleanup beyond import/use rename becomes necessary to complete learner runtime cleanup
- any code path still requires a concept named SPARC trial after the move

Verification:

- SPARC session route smoke test.
- Flashcard learning-session smoke test.
- Assessment-session smoke test if changed.
- Console/network check through the MoFaCTS Playwright sidecar.
- `npm run typecheck`
- `npm run lint`

### Phase 5: Decide The Long-Term Machine Name

Goal: align the state machine name with the runtime boundary.

Options:

- `contentRuntimeMachine`: emphasizes app-owned runtime shell.
- `sessionRuntimeMachine`: emphasizes session-level flow.
- Keep `cardMachine` only as a temporary compatibility name.

Recommendation:

Use `contentRuntimeMachine` once the outer component is `ContentSurface` and SPARC has a first-class surface. Rename after the surface extraction, not before, to avoid a broad mechanical diff while behavior is still moving.

Implementation sequence:

1. Inventory `cardMachine*` files and classify them:
   - state machine core
   - runtime services
   - trial-specific helpers
   - legacy compatibility names
2. Rename only the state-machine core first if the classification is clean.
3. Leave `CardStore` alone unless a separate store-boundary plan exists.
4. Update logs only where they are runtime-boundary logs. Preserve historical log labels if dashboards or tests depend on them.

Expected diff shape:

- mostly mechanical file/import renames
- no behavior changes
- tests updated for names only

Stop and reassess if:

- state-machine naming is entangled with route or persistence names
- history payload fields include card-machine names

## Phase Checklist Template

Use this checklist in the PR or commit notes for each phase:

- Inventory commands run and findings reviewed.
- No generated or bundled files changed.
- No unrelated behavior changes included.
- Existing user-facing path preserved.
- New names match this plan or the plan was updated first.
- Required tests/checks run from `mofacts/`.
- UI smoke performed when runtime rendering changes.

## Non-Goals

- Do not redesign TDF schemas as part of the rename.
- Do not preserve embedded SPARC-as-flashcard routing as a compatibility path.
- Do not introduce SPARC-within-SPARC layering.
- Do not preserve obsolete legacy paths by adding compatibility fallbacks.
- Do not let AutoTutor drive this architecture pass.
- Do not move pedagogical unit-engine logic from `learning-components/` into `mofacts/`.
- Do not make SPARC editor/authoring operational in this pass.
- Do not plan flashcard/video/SPARC authoring-preview reuse in this pass.

## Open Questions

- What current SPARC runtime coordination code should become `SparcController`, and what can be deleted instead of renamed?
- What separate future plan should make the SPARC editor operational, including how it should reach `/sparcEdit/:tdfId` and whether it reuses `SparcSessionSurface` without `SparcController`?
- Does H5P truly provide an equivalent response clock, or is it only suppressing the standard timer because completion is activity-owned?
- Which `card*` service names are route-compatibility names, and which are runtime-boundary names that should be renamed after `ContentSurface` lands?

## Acceptance Criteria

- The top-level runtime component is named `ContentSurface`.
- Session surfaces are named by session mode, not by cards.
- SPARC session behavior is reachable through `SparcSessionSurface`.
- SPARC runtime coordination is named `SparcController`.
- `FlashcardController` / flashcard runtime does not route to SPARC.
- Learner runtime no longer uses `SparcTrial*` names or a SPARC trial concept.
- `display.type === "sparc"` does not select the top-level session surface.
- Standard response timer policy is explicit and separately tested from display submission ownership.
- Attributed-image flashcards and normal flashcards start response timing only after visible reveal.
- SPARC runtime timing behavior is explicit and not controlled by obsolete display-ownership names.
