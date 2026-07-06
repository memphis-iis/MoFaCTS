# CardStore Decomposition Plan

## Status

Implemented.

This document captures the `CardStore` compliance audit against the root
`AGENTS.md` rules and turns it into a staged cleanup plan. It is intentionally
developer-facing because the work is about runtime ownership, adapter boundaries,
and implementation risk rather than public setup or learner-facing behavior.

The audit decisions in this document were the cleanup baseline. The deletion
criteria have now passed against the implementation state described here.

The target is removal, not preservation: `CardStore` should be split, moved into
clear domain-owned runtime modules, and deleted with no loss of learner-runtime
function. There should be no object named `CardStore` at the end of the cleanup.

Implementation outcome:

- `mofacts/client/views/experiment/modules/cardStore.ts` and its direct test were deleted.
- Runtime state moved to named owners such as `activeTrialDisplayRuntimeState`,
  `trialProgressionState`, `trialReadinessState`, `feedbackRuntimeState`,
  `audioRuntimeState`, `scoreRuntimeState`, `hiddenVisibilityRuntimeState`,
  `trialTimingState`, `videoRuntimeState`, and `debugRuntimeState`.
- `rg -n "CardStore|cardStore|syncCardStore|getCardValue|setCardValue" mofacts/client mofacts/common learning-components C:\dev\mofacts_config` returned no live app, component, or config hits.
- `npm run typecheck` and `npm run lint` passed from `mofacts/`.

## Scope

In scope:

- `mofacts/client/views/experiment/modules/cardStore.ts`
- App-owned callers under `mofacts/client/`
- The unit-engine adapter boundary in
  `mofacts/client/views/experiment/unitEngineRuntimeContext.ts`
- The indirect shared component dependency in
  `learning-components/units/shared/interactionStepAssembly.ts`
- Tests that preserve current behavior while the boundary is tightened

Out of scope for the first behavior-preserving passes unless explicitly
approved:

- Changing learner runtime behavior
- Adding compatibility fallback paths
- Adding npm, Meteor, Docker, or system dependencies
- Reworking learner runtime flows beyond the state-boundary migration needed to
  remove `CardStore`

## Current Compliance Snapshot

### Invariants Verified

- `MOFACTS_CONFIG_REPO` resolved to `C:\dev\mofacts_config`.
- `MOFACTS_WIKI_REPO` resolved to `C:\dev\MoFaCTS.wiki`.
- Both dependent repositories existed.
- `learning-components/` did not directly import `CardStore`.
- The existing architecture plan already identifies `CardStore` as deliberately
  out of scope for the previous content-runtime surface rename and says it needs
  a separate boundary audit.

### Good Current Shape

- `CardStore` is app-owned and lives in `mofacts/`, which matches the AGENTS
  app/runtime ownership rule.
- Component code reaches app state through `unitEngineRuntimeContext.ts` rather
  than importing Meteor or `CardStore` directly.
- Session reads and writes exposed to learning components are allow-listed.
- Existing routine logging in inspected paths uses app logging helpers rather
  than raw client `console.*`.
- A small direct test file exists for core `CardStore` defaults and selected
  lifecycle behavior.

### Compliance Risks

1. `CardStore` is typed as `any`.

   `mofacts/client/views/experiment/modules/cardStore.ts` declares
   `const CardStore: any`, and most public methods accept `any`. This weakens
   explicit contracts and makes it easy to introduce parallel representations
   without noticing. The fix is not to make `CardStore` a polished stable API;
   it is to constrain the removal surface enough that migration mistakes become
   visible.

2. Generic string-key access leaks across boundaries.

   `getCardValue`, `setCardValue`, `getSrValue`, `setSrValue`,
   `getTrialStateValue`, and `setTrialStateValue` accept arbitrary keys. The
   most important boundary leak is the unit-engine card-state adapter:

   - `unitEngineRuntimeContext.ts` exposes `setCardValue(key, value)`.
   - `interactionStepAssembly.ts` calls `setCardValue('currentAnswer', value)`.

   This is less disciplined than the neighboring session adapter, which
   validates allowed read/write keys.

3. One singleton mixes multiple runtime domains.

   `CardStore` currently owns or mirrors state for trial progression, speech
   recognition, TTS, media warmup, timeout handles, feedback timing, debug
   toggles, scoring, hidden items, video source, display state, and reconstructed
   learning aggregates. Some of that breadth is intentional today, but the
   ownership boundaries are implicit.

4. Some defaults encode unclear behavior.

   `ignoreOutOfGrammarResponses` is seeded as `false`, while
   `getIgnoreOutOfGrammarResponses()` has a branch intended to return
   `undefined` only when the key is not explicitly set. That behavior is used by
   the speech-recognition path when comparing cached state to TDF-derived state,
   but the invariant is not obvious from the store contract.

5. Some historic internal spellings are preserved as runtime contracts.

   The store has keys such as `trialEndTimeStamp`. These spellings may be
   harmless internal ReactiveDict keys, but changing them casually could break
   code that still uses generic string access. They should be treated as existing
   contracts until proven otherwise.

6. Test coverage is too thin for a boundary cleanup.

   Existing tests cover initialization of a few defaults, hidden item defensive
   copying, paused lock bounds, and active timeout handle lifecycle. They do not
   cover several high-risk invariants that a typing or adapter cleanup could
   accidentally change.

## Architecture Direction

`CardStore` is old vocabulary and now close to meaningless. It should not remain
as a generic runtime object. The cleanup should balance safety and architecture
movement at first: preserve behavior with tests and thin migration surfaces, but
move steadily toward domain names that describe the behavior they own.

Definition precision:

- `CardStore` is not a domain. It is a historical process-wide state bag that
  mixed storage, reactive mirroring, reset coordination, and cross-domain
  communication.
- The replacement modules are not a renamed `CardStore` split into drawers.
  Each module must own a specific behavior and expose narrow commands/queries
  for that behavior.
- A domain module may use `ReactiveDict`, `Session`, Svelte state, or plain
  module state internally only when that storage choice is part of its explicit
  runtime contract. Storage shape is not the module boundary.
- A temporary bridge is allowed only to keep current behavior alive while callers
  move. It is not a compatibility layer and must carry a deletion condition.
- "Typing CardStore" means documenting and constraining the demolition surface
  enough to avoid accidental behavior changes while removing it. It does not
  mean creating a stable `CardStore` API.

Ownership classification rule:

- `trial` means the active learner interaction cycle: prepare/display one
  prompt or activity step, gate input, accept or reject an answer/action, record
  timing/history, show feedback when applicable, and advance. It is not
  synonymous with flashcards and it is not a bucket for all runtime state.
- `flashcard` means behavior that depends on the flashcard surface or flashcard
  presentation model specifically. Do not use `flashcard` for generic prompt,
  answer, timing, feedback, audio, progression, or model state just because the
  current route or file name says "card".
- `studentModel` means learner/model aggregates and model-facing operations
  shared by unit types. It does not own active display state, readiness,
  timing, feedback, audio, video, or UI locks.
- `audioRuntimeState` means SR/TTS/recording/transcription/audio-lock
  coordination. It can observe or affect the active trial, but it does not own
  trial display, progression, timing, or learner-model aggregates.

Target properties:

- No final object or module is named `CardStore`.
- Generic `card` naming is removed where it is not specifically about flashcard
  behavior.
- Pure "card" objects are not retained as final architecture.
- Objects that are truly flashcard-specific may use `flashcard` names.
- Component code continues to receive explicit app capabilities rather than
  importing app internals.
- App-state keys exposed to shared/component code are allow-listed or replaced
  by narrow methods.
- Public runtime state APIs have typed input and output.
- Existing odd key names are either documented as internal persisted reactive
  keys or migrated deliberately in a separate behavior-preserving step.
- Tests encode current behavior before implementation cleanup begins.

Candidate final domain owners:

- `studentModel`: owns compact learner/model aggregates and model-facing
  operations after launch or resume. It is not a snapshot of the whole learner
  runtime.
- `trialReadiness`: owns display/input readiness events and gates for the active
  learner interaction. It does not own audio recording state, feedback content,
  or flashcard-specific presentation.
- `trialDisplayState`: owns the prepared display payload, current answer,
  original question, alternate display index, and choice-response display state
  for the active learner interaction. It does not own progression counters,
  model aggregates, or flashcard-specific presentation.
- `trialProgressionState`: owns the active question/progression cursor and
  progression reset behavior for the active learner interaction. It does not own
  display payloads or learner-model aggregates.
- `audioRuntimeState`: owns speech recognition, TTS request, recording,
  transcription wait state, sample rate, and audio lock coordination. If the
  content runtime machine also tracks audio context, one side must be named as
  authoritative and the other as derived or event-fed.
- `trialTimingState`: owns trial timing, timeout identifiers, timeout handles,
  and feedback timing markers for the active learner interaction. It does not
  own feedback content or audio recording timing.
- `feedbackRuntimeState`: owns feedback lifecycle flags and feedback values.
  Scoring may be separate if score display and feedback semantics diverge.
- `scoreRuntimeState`: owns score display and scoring flags if those semantics
  diverge from feedback lifecycle. It does not own feedback content or learner
  model aggregates.
- `videoRuntimeState`: owns video source/checkpoint runtime state if the video
  flow still needs mutable app-owned state after resume.
- `flashcardRuntimeState`: owns only behavior proven to be flashcard-specific,
  not generic trial, learner, audio, or model state.
- `debugRuntimeState`: owns debug flags and developer toggles, if they remain
  needed.

Naming rule:

- Use `content`, `learner`, `trial`, `studentModel`, `audio`, `speech`,
  `feedback`, `video`, `sparc`, or `flashcard` according to ownership.
- Avoid generic `card` names unless the object is explicitly about flashcard
  behavior.
- When in doubt between `trial` and `flashcard`, choose `trial` only for active
  interaction mechanics that can apply to flashcard, assessment, video, SPARC,
  or future unit surfaces; choose `flashcard` only after proving the behavior is
  flashcard-specific.

## Implementation Plan

### Phase 1: Freeze the Demolition Contract

Purpose: reduce accidental behavior changes before extraction and deletion.

Implementation work:

- Define local literal key unions for card, speech-recognition, trial, and
  timeout dictionaries only where they prevent typo-driven changes during
  migration.
- Do not export a broad `CardStoreApi` or use typing work to make `CardStore`
  feel like a stable public contract.
- If a temporary object type is needed for compiler help, keep it local to
  `cardStore.ts`, name it as a removal scaffold, and link each method group to
  the inventory row that will delete it.
- Narrow simple method signatures from `any` to `unknown`, `boolean`, `number`,
  `string`, arrays, or existing shared types where the current behavior is clear.
- Keep `ReactiveDict` keys and behavior unchanged.
- Treat this as a temporary inventory guard, not the desired end state.
- Prefer tests and narrow boundary removal over spending time perfecting
  `CardStore` types.
- Do not split files in the same change as a typing-only guard pass.

Verification:

- Run `npm run typecheck` from `mofacts/`.
- Run `npm run lint` from `mofacts/` if lintable TypeScript/JavaScript changes
  are made.

### Phase 2: Close the Component Boundary Leak

Purpose: replace the current generic `card-state` capability with explicit
runtime capabilities.

Implementation work:

- Replace `setCardValue: (key: string, value: unknown) => void` in
  `ApplyPreparedInteractionStepDependencies` with a narrow method such as
  `setCurrentAnswer(value: string | undefined): void`.
- Update `createAppUnitEngineRuntimeContext()` to expose the narrow method.
- Keep session key allow-list behavior unchanged.
- Remove `setCardValue` from the unit-engine capability surface if no component
  still needs generic runtime-state writes.
- Keep app-internal generic access temporarily if older Blaze/global callers
  still need it, but mark it app-internal and not part of the component contract.

Verification:

- Add or update tests around prepared interaction state application so
  `currentAnswer` is still mirrored into the app runtime state.
- Run `npm run typecheck` from `mofacts/`.
- Run `npm run lint` from `mofacts/`.

### Phase 3: Encode Risky Invariants in Tests

Purpose: preserve behavior before any split, rename, or semantic cleanup.

Required tests:

- `ignoreOutOfGrammarResponses` default and explicit set behavior.
- `setCurrentAnswer` / `getCurrentAnswer` behavior through the app adapter.
- `setTrialEndTimestamp` / `getTrialEndTimestamp` behavior.
- `resetReactiveDefaults()` behavior for the existing `cardState`,
  `speechRecognition`, `trialStateMachine`, and `timeouts` dictionaries.
- Defensive copying expectations for mutable values beyond `hiddenItems`, if
  those values are intended to be protected.

Verification:

- Run the relevant local test command if one is already wired for these tests.
- Run `npm run typecheck` from `mofacts/`.
- Run `npm run lint` from `mofacts/`.

### Phase 4: Extract Named Runtime Domains

Purpose: move state out of `CardStore` into behavior-named app-owned modules.

Implementation work:

- Create domain modules over the existing runtime data first, then move callers
  incrementally.
- Move reconstructed model state to `studentModel`.
- Move display/input readiness to a trial-readiness module for the active
  learner interaction.
- Move current display payload, answer state, alternate display index, original
  question, and choice-response display state to a trial-display module.
- Move question/progression cursor state to a trial-progression module for the
  active learner interaction.
- Move speech/TTS/recording/transcription state to an audio-runtime module.
- Move timeout identifiers, handles, and timing markers to a trial-timing module.
- Move feedback lifecycle and feedback values to a feedback-runtime module.
- Move video resume/source state to a video-runtime module if it remains needed.
- Move truly flashcard-specific state to a `flashcard`-named module only after
  proving it depends on the flashcard surface rather than generic active-trial
  mechanics.
- Avoid introducing parallel names for the same concept. If both `CardStore` and
  a new module exist temporarily, document the source of truth and the expected
  removal step in the same change.

Verification:

- Run `npm run typecheck` from `mofacts/`.
- Run `npm run lint` from `mofacts/`.
- For UI/runtime behavior changes, use the native hotfix dev server plus the
  MoFaCTS Playwright sidecar smoke test.

### Phase 5: Delete `CardStore`

Purpose: remove the generic object after all call sites have moved.

Implementation approach:

- Search for `CardStore`, `cardStore`, generic `getCardValue`, and generic
  `setCardValue` across `mofacts/`, `learning-components/`, docs, and
  `C:\dev\mofacts_config`.
- Remove the module only after no app/runtime caller depends on it.
- Remove or rename remaining pure `card` vocabulary that no longer means
  flashcard behavior.
- Keep flashcard-specific names only for flashcard-specific code.

Verification:

- Run `npm run typecheck` from `mofacts/`.
- Run `npm run lint` from `mofacts/`.
- Use the native hotfix dev server plus the MoFaCTS Playwright sidecar smoke
  test for learner runtime routes touched by the extraction.

## Implementation Gates

These gates define completion for the cleanup. They are not evidence that this
plan is still a draft; they are the conditions that prevent the implementation
from appearing successful while still failing the real goal of removing
`CardStore` and generic card vocabulary without behavior loss.

1. The plan needs explicit deletion gates, not just migration phases.

   Gate:

   - Phase 1 may add temporary typing around the demolition surface. Without a
     hard deletion gate, that scaffold could become the new permanent broad
     store.

   Required implementation condition:

   - Do not export a broad `CardStoreApi`.
   - Every temporary `CardStore` type, helper, or bridge must have an owning
     target domain and a removal condition.
   - Phase 5 success requires zero imports of `CardStore`, zero `cardStore`
     module references, and zero generic `getCardValue` / `setCardValue` access
     in app and component runtime code.

2. Use the full current-state inventory before extraction begins.

   Risk:

   - `CardStore` has many callers across services, machine actions, app globals,
     resume, SR, TTS, unit progression, history logging, and tests. Moving by
     domain without an inventory risks leaving hidden mirrors or duplicate
     sources of truth.

   Implementation requirement:

   - Use the inventory table below to map every `CardStore` method/key to:
     current callers, owning target module, temporary bridge status, tests
     required, and deletion condition.
   - If a pre-implementation search finds new callers or removed callers, update
     the affected row before moving code.

   Implementation-ready inventory:

   - Evidence source: current `CardStore` methods and `rg` results across
     `mofacts/client`, `mofacts/common`, and `learning-components`.
   - Treat paired getter/setter methods as one state contract row when they
     operate on the same key or dictionary.
   - Before moving any row, re-run the row-specific search. This table is a
     migration map, not permission to skip current-state verification.
   - Every temporary bridge must be deleted or narrowed by its deletion
     condition. Do not add a new broad facade that outlives the migration row it
     serves.

   | Current state or method | Current callers | Target owner | Temporary bridge? | Tests required before or with move | Deletion condition |
   | --- | --- | --- | --- | --- | --- |
   | `initialize()` / `destroy()` / `resetReactiveDefaults()`; backing dictionaries `cardState`, `speechRecognition`, `trialStateMachine`, and `timeouts` | `cardStore.test.ts`; `sessionUtils.ts` cleanup calls `resetReactiveDefaults()`; Svelte runtime tests initialize the store | Final domain reset/bootstrap functions owned by each runtime state module | Yes, only as the existing global reset coordinator until domain reset functions exist | Existing `cardStore.test.ts`; cleanup/reset tests covering the existing `cardState`, `speechRecognition`, `trialStateMachine`, and `timeouts` dictionaries | No production caller imports `CardStore`; tests initialize/reset domain modules directly |
   | `getCardValue(key)` / `setCardValue(key, value)` | Global layout wrappers in `mofacts/client/index.ts`; wrappers in `mofacts/client/views/experiment/card.ts`; unit-engine adapter currently exposes component-facing `setCardValue`; `interactionStepAssembly.ts` only writes `currentAnswer` | No final owner. Replace with named APIs in the owning domain for each key | Yes, app-internal only while `index.ts` and `card.ts` wrappers are moved | Layout/global helper tests or smoke coverage for `enterKeyLock`, `pausedLocks`, `displayFeedback`, and `currentScore`; prepared interaction test for `currentAnswer` | Zero component-facing generic runtime writes; no active app caller needs raw key access; wrappers in `card.ts` and `index.ts` removed or backed by named APIs |
   | `getSrValue(key)` / `setSrValue(key)` | `index.ts` reads `waitingForTranscription`; direct named SR methods are used by SR/TTS services and Svelte init | `audioRuntimeState` for named speech/audio state | Yes, app-internal read bridge only until `index.ts` moves | Resize/paused sensitivity or global busy-state test covering `recording`, `inputReady`, and `waitingForTranscription`; SR start/stop test | No caller uses string-key SR access; global busy-state reads named audio/readiness APIs |
   | `getTrialStateValue()` / `setTrialStateValue()` / `getCurrentTrialState()` / `setCurrentTrialState()` / `resetTrialStateDefaults()` | No active non-test caller found in current search, but methods seed `trialStateMachine.current` | Content runtime machine state or delete if proven unused | Maybe. Prefer deletion after proving no production caller exists | Search proof plus direct reset/default test if retained; content runtime state transition tests if moved | Either deleted as unused or replaced by a named content-runtime machine API with no `CardStore` trial-state dictionary |
   | Audio warmup flags: `isTtsWarmedUp()` / `setTtsWarmedUp()`, `isSrWarmedUp()` / `setSrWarmedUp()`, `isAudioWarmupInProgress()` / `setAudioWarmupInProgress()`, `isAudioRecorderInitialized()` / `setAudioRecorderInitialized()` | No active non-test caller found in current search for the named methods; keys are seeded in defaults | `audioRuntimeState` if retained, otherwise delete after proof | Maybe. Keep only if a current warmup service needs them | Search proof; audio warmup/recorder initialization test if retained | Unused warmup flags deleted, or retained flags are owned by `audioRuntimeState` and no longer seeded by `CardStore` |
   | Audio mode and transcription state: `isAudioInputModeEnabled()` / `setAudioInputModeEnabled()`, `isWaitingForTranscription()` / `setWaitingForTranscription()` | `svelteInit.ts` sets audio-input mode; `speechRecognitionService.ts` sets waiting-for-transcription; `index.ts` reads generic `waitingForTranscription`; direct tests cover default audio-input mode | `audioRuntimeState`; machine audio context may hold a derived/read-only view | Yes, until `index.ts`, SR service, and Svelte init read/write the audio owner | SR enabled/disabled launch test; waiting-for-transcription guard test; reset/default test | SR service, Svelte init, and global busy-state use `audioRuntimeState`; no SR dictionary remains |
   | Recording and TTS lock state: `isRecording()` / `setRecording()`, `isRecordingLocked()` / `setRecordingLocked()`, `isTtsRequested()` / `setTtsRequested()` | `speechRecognitionService.ts`; `ttsService.ts`; `mediaRuntimeActions.ts`; machine `services.ts`; `index.ts` reads recording | `audioRuntimeState` with explicit coordination to content runtime machine audio context | Yes, but source of truth must be named in the moving change | SR start/stop; TTS request and lock clear paths; machine guard for recording-locked/waiting state; global busy-state smoke | SR/TTS/machine callers use `audioRuntimeState` or machine events; any machine mirror is documented as derived or removed |
   | `getSampleRate()` / `setSampleRate()` | `speechRecognitionService.ts` stores stream sample rate and reads it when submitting audio | `audioRuntimeState` | Yes | SR recording submission test covering sampled audio payload metadata | SR service uses `audioRuntimeState.getSampleRate()`; no `CardStore` sample-rate key |
   | `getIgnoreOutOfGrammarResponses()` / `setIgnoreOutOfGrammarResponses()` | `lessonLaunchInitializer.ts`, `router.ts`, `speechRecognitionService.ts`; source field is `setspec.speechIgnoreOutOfGrammarResponses` in TDF/config | Resolved delivery/TDF settings cache in `audioRuntimeState`, seeded by launch/router from delivery settings | Yes, as a resolved boolean cache only | TDF/config true, false, and missing default tests; SR out-of-grammar rejection/acceptance test; reset/default test confirming no independent store setting | SR reads resolved config from audio runtime or delivery settings capability; no independent `CardStore` grammar-filter state |
   | Choice-response state: `isButtonTrial()` / `setButtonTrial()`, `getButtonList()` / `setButtonList()`, `getButtonEntriesTemp()` / `setButtonEntriesTemp()` | `sessionRuntimeActions.ts`, `unitEngineService.ts`, `speechRecognitionService.ts`; `buttonEntriesTemp` has no active non-test caller found in current search | `trialDisplayState` as choice-response display state for the active learner interaction; use `flashcardRuntimeState` only if a follow-up proves the behavior depends on the flashcard surface specifically | Yes | Choice-response display; SR behavior on choice-response trials; prepared-trial application test; search proof for `buttonEntriesTemp` before delete | Non-flashcard surfaces no longer depend on button-named `CardStore` state; unused temp entry state deleted or moved to named display owner |
   | Readiness and display gates: `isDisplayReady()` / `setDisplayReady()`, `isInputReady()` / `setInputReady()`, `getDisplayFeedback()` / `setDisplayFeedback()`, `isEnterKeyLocked()` / `setEnterKeyLock()` | `cardRuntimeState.ts` mirrors display/input readiness; tests assert readiness mirrors; `index.ts` reads input readiness and generic display feedback/enter-key values; `instructions.ts` clears enter-key lock | `trialReadiness` for display/input and enter-key gating in the active learner interaction; `feedbackRuntimeState` for display feedback | Yes, but only as read/write mirrors while `Session` and global layout helpers still exist | Launch/resume display/input enable-disable; enter-key lock after instructions; feedback display toggle; `cardRuntimeState.test.ts` updated to target the new owner | No `CardStore` or `Session` mirror is needed for readiness, feedback-display, or enter-key lock |
   | Pause/busy locks: `getPausedLocks()` / `setPausedLocks()` / `incrementPausedLocks()` / `decrementPausedLocks()` | `speechRecognitionService.ts` checks paused locks; `index.ts` generic wrapper may read/write; direct tests cover bounds | `trialReadiness` as an input-gating lock for the active learner interaction, with `audioRuntimeState` consuming the read-only paused/blocked signal when SR decides whether to record | Yes | Pause/resume lock bounds; SR does not record while paused; global helper behavior if still exposed | SR and layout callers use named pause-lock/readiness API; generic key access removed |
   | Feedback lifecycle flags: `isInFeedback()` / `setInFeedback()`, `isFeedbackUnset()` / `setFeedbackUnset()`, `getFeedbackTypeFromHistory()` / `setFeedbackTypeFromHistory()` | `resumeService.ts`; old and Svelte `unitProgression.ts`; history/resume paths | `feedbackRuntimeState` | Yes | Resume feedback state; feedback-after-history behavior; unit progression reset behavior | Resume and progression callers use `feedbackRuntimeState`; no `CardStore` feedback lifecycle keys |
   | Feedback answer/scoring values: `getFeedbackForAnswer()` / `setFeedbackForAnswer()`, `getIsCorrectAccumulator()` / `setIsCorrectAccumulator()`, `getCurrentScore()` / `setCurrentScore()`, `getScoringEnabled()` / `setScoringEnabled()` | `cardRuntimeState.ts` sets scoring enabled default; `resumeService.ts` sets scoring enabled; global `index.ts` wrappers may expose `currentScore`; no active non-test caller found for feedback-for-answer or correctness accumulator methods | `feedbackRuntimeState` for answer feedback; `scoreRuntimeState` for score/scoring-enabled | Maybe for unused feedback accumulator fields; yes for score while layout wrappers remain | Scoring-enabled launch/resume; score display/global helper behavior if active; search proof before deleting unused feedback accumulator fields | Score callers use score owner; unused feedback accumulator fields deleted, or feedback services own them by named API |
   | Visibility/model selection: `getHiddenItems()` / `setHiddenItems()` / `addHiddenItem()` / `resetHiddenItems()`, `getNumVisibleCards()` / `setNumVisibleCards()` / `adjustNumVisibleCards()`, `wasReportedForRemoval()` / `setWasReportedForRemoval()` | Unit-engine adaptive model capability; `ContentSurface.svelte`; `svelteInit.ts`; `sessionUtils.ts`; direct tests cover hidden-item copying; no active non-test caller found for removal-reporting methods | `studentModel` for hidden items if they are model-selection exclusions; `trialDisplayState` for visible count and removal-reporting if they are active-surface display bookkeeping | Yes | Hidden-item defensive copy/reset; adaptive model selection; Svelte init/session cleanup; visible-card count; search proof before deleting removal-reporting | Adaptive model callers use `studentModel`; display-only callers use `trialDisplayState`; no `CardStore` visibility keys |
   | Progression cursor: `getQuestionIndex()` / `setQuestionIndex()` / `incrementQuestionIndex()` / `resetQuestionIndex()` | Old and Svelte `unitProgression.ts`; `unitEngineService.ts`; `sessionRuntimeActions.ts`; `resumeService.ts`; `historyLogging.ts`; resume/prepared-advance tests; `sessionUtils.ts` reset | `trialProgressionState` | Yes | Standard flashcard progression; assessment schedule progression; resume from history; history display-order logging; session cleanup reset | All progression, resume, history, and unit-engine callers use `trialProgressionState`; no `CardStore` question index |
   | Display payload and answer state: `getCurrentDisplay()` / `setCurrentDisplay()`, `getCurrentAnswer()` / `setCurrentAnswer()`, `getUserAnswer()` / `setUserAnswer()`, `getAlternateDisplayIndex()` / `setAlternateDisplayIndex()`, `getOriginalQuestion()` / `setOriginalQuestion()` | `cardRuntimeState.ts` owns current-answer helper; `unitEngineService.ts`; `unitEngineRuntimeContext.ts`; `interactionStepAssembly.ts`; `resumeService.ts`; `historyLogging.ts`; resume tests | `trialDisplayState`; component adapter exposes narrow methods such as `setCurrentAnswer`, `setAlternateDisplayIndex`, and `setOriginalQuestion` | Yes, but component-facing generic `setCardValue` should be removed first | Prepared interaction application; resume cleanup; alternate-display history logging; current-answer reset; unit-engine adapter contract test | Learning components no longer receive generic card-state writes; display/resume/history callers use `trialDisplayState` |
   | Trial timing and timeout identifiers: `getTrialStartTimestamp()` / `setTrialStartTimestamp()`, `getTrialEndTimestamp()` / `setTrialEndTimestamp()`, `getCardStartTimestamp()` / `setCardStartTimestamp()`, `getCurTimeoutId()` / `setCurTimeoutId()`, `getCurIntervalId()` / `setCurIntervalId()`, `getVarLenTimeoutName()` / `setVarLenTimeoutName()`, `getMainCardTimeoutStart()` / `setMainCardTimeoutStart()`, `getScrollListCount()` / `setScrollListCount()` | `resumeService.ts`; `historyLogging.ts` consumes trial timestamps from context; direct methods mostly appear in reset/resume paths; key `trialEndTimeStamp` is historic spelling | `trialTimingState`; timeout handles remain runtime-only and non-persisted | Yes | Trial start/end timing; timeout feedback; resume reset; history logging around `CFResponseTime`; preserve `trialEndTimeStamp` spelling unless separately migrated | Timing services and resume use `trialTimingState`; timeout handles are owned by timing service; no `CardStore` timing keys |
   | Active timeout handle: `getActiveTimeoutHandle()` / `setActiveTimeoutHandle()` / `clearActiveTimeoutHandle()`; backing timeout key `name` | Direct `cardStore.test.ts`; no active non-test caller found in current search | `trialTimingState` or delete if unused | Maybe | Search proof; active-timeout lifecycle test if retained | Deleted as unused or owned by timeout service with no `CardStore` timeout dictionary |
   | Timeout/feedback flags: `isTimeout()` / `setIsTimeout()`, `shouldSkipTimeout()` / `setSkipTimeout()`, `getFeedbackTimeoutBegins()` / `setFeedbackTimeoutBegins()`, `getFeedbackTimeoutEnds()` / `setFeedbackTimeoutEnds()` | No active non-test caller found in current search for named methods; likely historical timeout/feedback state | `trialTimingState` plus `feedbackRuntimeState`, or delete after proof | Maybe | Search proof; timeout feedback behavior if retained | Unused flags deleted, or active timeout/feedback services own them by named API |
   | Review countdown: `getReviewStudyCountdown()` / `setReviewStudyCountdown()` | No active non-test caller found in current search | `trialProgressionState` or delete if obsolete | Maybe | Search proof; review/study countdown behavior if retained | Deleted as unused or moved to named review/progression owner |
   | Video state: `getVideoSource()` / `setVideoSource()` | `resumeService.ts` sets restored video source | `videoRuntimeState` | Maybe, if only resume writes and no active read exists | Video checkpoint/resume/source test; search proof for read path before deleting getter | Video resume flow uses `videoRuntimeState`; no `CardStore` video source |
   | Debug state: `getDebugTrialState()` / `setDebugTrialState()` over `_debugTrialState`, `getDebugParms()` / `setDebugParms()` | `profileDebugToggles.ts`; no active non-test caller found for debug trial-state methods | `debugRuntimeState` or delete if the debug surface is obsolete | Maybe | Profile debug toggle behavior if retained; search proof before deleting debug-trial state | Debug UI uses `debugRuntimeState`, or obsolete debug state is removed |
   | Reconstructed learner progress: `setReconstructedLearningState()` writes `clusterState`, `stimulusState`, `responseState`, `numQuestionsAnswered`, `numQuestionsAnsweredCurrentUnit`, `numCorrectAnswers` | Not directly called in current `rg` results, but reconstruction is produced by `historyReconstruction.ts` and consumed by adaptive model/unit-engine resume paths through surrounding runtime state | `studentModel` | No broad bridge. If this path is reconnected, seed `studentModel` directly from history reconstruction | Resume reconstruction; learning-session model; SPARC model; aggregate answer counters; no response-less SPARC regression | `studentModel` is the only owner of reconstructed aggregate state; no `CardStore` aggregate keys |

3. The target domain owners need source-of-truth rules.

   Risk:

   - The plan names candidate owners such as `studentModel`, `trialReadiness`,
     `trialDisplayState`, `trialProgressionState`, `audioRuntimeState`,
     `trialTimingState`, `feedbackRuntimeState`, `scoreRuntimeState`,
     `videoRuntimeState`, `flashcardRuntimeState`, and `debugRuntimeState`, but
     each implementation change must still state which owner is authoritative
     for the values it moves.

   Implementation requirement:

   - For each domain owner introduced in code, state whether it owns durable
     runtime state, state-machine context, `Session`, `ReactiveDict`, plain
     module state, or a read-only derived view.
   - Temporary mirrors must name the source of truth and removal condition.
   - Do not move a value into a new module just because it used to share a
     `CardStore` dictionary. Move it only when the new owner describes the
     behavior that writes, reads, and validates that value.

   Plain meaning:

   - This is about preventing two modules from both believing they own the same
     value. For example, if `audioRuntimeState` and the content runtime machine
     both track `waitingForTranscription`, one must be authoritative and the
     other must be derived, event-fed, or temporary.
   - The goal is not to add bureaucracy; it is to avoid hidden parallel state.

   First-wave authority matrix:

   | Owner | Authoritative for | May read or derive | Temporary mirrors allowed | Must not own | First removal gate |
   | --- | --- | --- | --- | --- | --- |
   | `trialDisplayState` | Prepared display payload, current answer, user answer, original question, alternate display index, and choice-response display state for the active learner interaction | Read active progression cursor only when building display-facing context; read `studentModel` only through explicit model capabilities | May mirror existing `Session`/`CardStore` current-answer and display payload keys only until component adapter and resume/history callers move | Question/progression cursor, learner-model aggregates, SR/TTS state, feedback lifecycle, timing handles, flashcard-only presentation | Component-facing `setCardValue('currentAnswer', value)` is replaced by narrow display-state methods and no learning component can write generic runtime keys |
   | `trialReadiness` | Display/input readiness gates, enter-key gate, and pause/busy input locks for the active learner interaction | May read `audioRuntimeState` busy state or receive audio events when input should be blocked | May mirror `Session.displayReady` / `Session.inputReady` and `CardStore` readiness keys while global layout and old helpers still read them | Display payload, feedback values, audio recording state, model aggregates, progression cursor | Readiness callers use named readiness API; `CardStore` and `Session` readiness mirrors are removed or read-only and scheduled for deletion |
   | `trialProgressionState` | Active question/progression cursor and progression reset behavior for the active learner interaction | May read `studentModel` or assessment state through explicit capabilities when selecting/advancing | May mirror `CardStore.questionIndex` while history logging, resume, and unit-engine service still read it | Display payload, answer text, timing handles, audio state, feedback values | History, resume, progression, and unit-engine callers use the progression owner; no `CardStore` question-index reads/writes remain |
   | `trialTimingState` | Trial start/end timestamps, card/start timing while the name remains, timeout ids, active timeout handles, interval ids, timeout names, and feedback timing markers | May receive display/progression events to mark timing boundaries; may expose read-only timing snapshots to history logging | May mirror historic `trialEndTimeStamp` and timeout keys until resume/history/timeout callers move | Feedback content, display payload, audio sample rate, model aggregates | Timing services and resume/history logging use timing owner; no `CardStore` timing or timeout dictionary reads/writes remain |
   | `feedbackRuntimeState` | Feedback lifecycle flags, display-feedback state, feedback type restored from history, feedback-for-answer values, and timeout feedback values if retained | May read trial timing snapshots and answer/correctness results through explicit parameters or capabilities | May mirror `CardStore` feedback flags while unit progression and resume callers move | Trial readiness gates, audio locks, progression cursor, learner-model aggregates | Resume/progression/feedback services use feedback owner; no `CardStore` feedback lifecycle/value keys remain |
   | `scoreRuntimeState` | Current score, scoring-enabled flag, and correctness accumulator if retained as score behavior | May read feedback/result events; may expose display-ready score snapshots | May mirror `CardStore.currentScore` and `CardStore.scoringEnabled` while global layout and resume callers move | Feedback lifecycle, display payload, learner-model aggregates | Score display/resume callers use score owner; unused correctness accumulator fields are deleted or owned here by named API |
   | `studentModel` | Reconstructed learner/model aggregates, hidden/model-exclusion items if they are model-selection exclusions, and model-facing operations shared by unit types | May read history reconstruction results on launch/resume; may expose compact model capabilities to unit engines | No broad `CardStore` bridge. If an existing path must stay live briefly, seed `studentModel` directly and document the old key removal | Active display state, readiness, timing, feedback, audio, video, flashcard presentation | Adaptive model callers use `studentModel`; no `CardStore` aggregate or model-exclusion keys remain |
   | `audioRuntimeState` | SR/TTS request state, recording state, recording locks, transcription wait state, audio input mode, sample rate, grammar-filter resolved cache, and audio warmup flags if retained | May consume read-only trial readiness/input-blocked signals and active choice-response metadata needed by SR matching | May mirror content runtime machine audio context only if one side is named authoritative in the same change; may mirror old `CardStore` audio keys until SR/TTS/global busy callers move | Trial display payload, progression cursor, timing handles, learner-model aggregates, feedback content | SR/TTS/global busy callers use audio owner or documented machine events; no `CardStore` SR/audio dictionaries remain |
   | `videoRuntimeState` | Video source/checkpoint runtime state if mutable app-owned state is still needed after resume | May read progression/display context through explicit capabilities | Maybe, only while resume writes the old `videoSource` key and a current read path is found | Generic display state, learner model, audio locks, flashcard presentation | Video resume/source flow uses video owner, or the old video key is deleted if no read path exists |
   | `flashcardRuntimeState` | Only behavior proven to depend on the flashcard surface or flashcard presentation model specifically | May read generic trial display/readiness/progression through explicit capabilities | No broad bridge from old `CardStore`; add only for a proven flashcard-specific migration row | Generic prompt/answer/timing/feedback/audio/progression/model state | Every retained `flashcard*` value has a flashcard-specific caller and no generic `card` vocabulary remains |
   | `debugRuntimeState` | Debug flags and developer toggles that remain active | May read domain snapshots for diagnostics without becoming their owner | Maybe, while profile debug UI moves from `CardStore.debugParms` | Runtime behavior state for trials, audio, model, feedback, or video | Debug UI uses debug owner, or obsolete debug state is deleted |

4. `studentModel` needs a precise contract.

   Gate:

   - The plan says reconstructed learner progress should move to `studentModel`,
     but does not define whether `studentModel` owns only post-resume
     reconstruction, live model state during the lesson, or both.

   Required implementation condition:

   - Define `studentModel` as the shared app-owned model state used by all unit
     types that access the adaptive model.
   - For efficiency and modularity, make `studentModel` the owner of compact
     model aggregates and model-facing operations, not a broad runtime snapshot.
   - Seed `studentModel` from history reconstruction on launch/resume.
   - Let unit engines consume `studentModel` through explicit capabilities rather
     than reading app runtime globals.
   - Keep per-surface display state, audio state, and timing state out of
     `studentModel`.
   - Specify fields, read/write capabilities, and relationship to adaptive unit
     engines before moving code.

5. Generic `card` vocabulary remains too broad to remove safely without a
   classification pass.

   Gate:

   - Some current `card` names refer to the old route, some to flashcard behavior,
     some to model-selected trials, and some to broad learner runtime. The plan
     says to remove generic `card`, but not how to classify each use.

   Required implementation condition:

   - Add a naming classification pass with categories: keep temporarily for
     `/card` route compatibility, rename to `flashcard`, rename to `trial`,
     rename to `content`/`learner`, rename to `studentModel`, or delete.

6. Verification is not yet strong enough for "no loss of function."

   Gate:

   - Typecheck, lint, and a generic smoke test are necessary but not sufficient.
     The affected behavior crosses flashcard, assessment schedule, SPARC, video,
     SR/TTS, resume, history logging, and model reconstruction.

   Required implementation condition:

   - Add a behavior matrix covering at least: standard flashcard launch/answer,
     assessment schedule progression, resume from history, SR answer acceptance
     and out-of-grammar rejection, TTS recording lock behavior, video checkpoint
     question flow, SPARC submission/history, and H5P duplicate-submit handling
     if H5P remains enabled during the migration.

7. Dependent documentation can preserve obsolete architecture if it is not
   included in the finish criteria.

   Gate:

   - Existing developer docs still contain broad "card runtime" planning
     vocabulary. Some of that may describe historical phases, but some can steer
     future agents back toward card-named architecture.

   Required implementation condition:

   - Phase 5 should include a docs audit for active guidance documents. Historical
     notes can remain if clearly historical; current guidance should use the new
     domain names.
   - Old developer planning docs that primarily preserve obsolete card-runtime
     architecture may be deleted when they no longer describe an active intended
     path.

8. Submission-lock cleanup verification is reconciled.

   Gate:

   - The unused submission-lock path was removed during this planning follow-up.
   - A current search finds only this document's historical references to the
     submission-lock cleanup; no live app or learning-component code references
     remain.

   Reconciliation performed:

   - `rg -n "submissionLock|SubmissionLock|submission lock|submission-lock|setSubmission|isSubmission|clearSubmission|resetSubmission" mofacts learning-components docs-developer`
     returned only documentation references.
   - `npm run typecheck` passed from `mofacts/`.
   - `npm run lint` passed from `mofacts/`.

## Implementation Risk Audit

### High Risk

- Changing generic keys before proving no caller depends on the raw string.

  Risk: typo-shaped keys may have hidden call sites through `getCardValue` or
  `setCardValue`.

  Mitigation: search for raw key strings in `mofacts/`, `learning-components/`,
  and `C:\dev\mofacts_config` before renaming any key. Add tests for the current
  getter/setter behavior first.

- Treating `CardStore` as flashcard-only.

  Risk: the store is used by the broader learner runtime, including speech,
  media, video, feedback, and progression flows.

  Mitigation: classify each value by the ownership rule: active learner
  interaction state goes to `trial*`; flashcard names are used only for behavior
  proven to depend on the flashcard surface; learner-model aggregates go to
  `studentModel`; SR/TTS/recording/transcription goes to `audioRuntimeState`.

- Breaking speech-recognition behavior around
  `ignoreOutOfGrammarResponses`.

  Risk: default, cached, and TDF-derived values may be subtly different in
  launch, refresh, and per-trial speech recognition paths.

  Mitigation: decide whether the value is truly tri-state. Add tests before
  typing or changing defaults.

- Creating parallel state surfaces without a migration invariant.

  Risk: facades over `CardStore` could become permanent redundant
  representations.

  Mitigation: if facades are introduced, document owner, source of truth,
  expected lifetime, and verification in the same change.

### Medium Risk

- Over-typing too much in one change.

  Risk: broad type changes can force unrelated runtime edits.

  Mitigation: type public method signatures first while preserving internal
  values as `unknown` where needed.

- Assuming existing tests are enough.

  Risk: the current direct tests do not cover SR, feedback, scoring, adapter, or
  reset behavior deeply enough for confident refactoring.

  Mitigation: add focused tests before moving callers.

- Moving store logic into `learning-components/`.

  Risk: violates dependency direction. Learning components should receive app
  capabilities, not import app state.

  Mitigation: keep all Meteor/ReactiveDict state in `mofacts/`; expose only
  explicit dependencies to shared/component code.

- Updating docs too late.

  Risk: the architecture plan already marks `CardStore` as pending a separate
  audit; implementation without a plan makes future cleanup harder.

  Mitigation: use this document as the plan anchor and update it when decisions
  are resolved.

### Low Risk

- Keeping `CardStore` temporarily during early cleanup.

  Risk is low only if each temporary use has a removal path. The final state must
  not retain an object called `CardStore`.

- Adding app-owned types without changing runtime behavior.

  Risk is low if no dictionary keys, defaults, or getter/setter semantics change.

## Investigated Issues And Plan Decisions

1. Speech grammar filtering belongs to TDF/config, with `CardStore` only caching
   the resolved value.

   Findings:

   - The authored field is `setspec.speechIgnoreOutOfGrammarResponses`.
   - It is registered in `mofacts/common/tdfFieldRegistries.ts` with default
     `"true"`.
   - The generated schema accepts `"true"`, `"false"`, or boolean values.
   - `C:\dev\mofacts_config` contains lessons explicitly setting both `"true"`
     and `"false"`.
   - `mofacts/client/lib/speechRecognitionConfig.ts` defaults missing values to
     `true` and throws on invalid values.

   Plan decision:

   - Treat TDF/config as the source of truth.
   - Treat `CardStore.ignoreOutOfGrammarResponses` as a launch/audio-runtime
     cache of the resolved boolean for SR grammar filtering, not as an
     independent source of truth.
   - Do not add an "unset; go read the TDF" state to `CardStore`.

2. `getCardValue` and `setCardValue` are generic app-runtime state accessors, and
   the component-facing use should be narrowed.

   Findings:

   - App code in `mofacts/client/index.ts` uses local wrappers around these
     methods for `enterKeyLock`, `pausedLocks`, `displayFeedback`, and
     `currentScore`.
   - `mofacts/client/views/experiment/card.ts` exports wrappers, but no active
     in-repo caller was found.
   - The unit-engine adapter exposes `setCardValue`, but the shared component
     path only uses it to write `currentAnswer`.

   Plan decision:

   - Keep the generic methods temporarily for app-internal runtime code while the
     global layout path still uses them.
   - Remove generic runtime-state access from the learning-component capability
     surface.
   - Replace the component-facing `setCardValue('currentAnswer', value)` with a
     narrow `setCurrentAnswer(value)` dependency.

3. Submission lock was an unused coarse guard and should not shape the plan.

   Findings:

   - The `CardStore` submission lock had no active callers outside
     `cardStore.ts`.
   - The session cleanup key was only maintained by cleanup tests.
   - Current duplicate-submit protection lives closer to the actual submit
     surfaces, for example H5P/SPARC duplicate suppression in
     `trialDisplaySubmission.ts`.

   Plan decision:

   - Do not preserve a global submission lock as a store-boundary requirement.
   - Prefer idempotent submit handling in the controller/state-machine path that
     receives the submit event.
   - The unused submission-lock code path was removed during this audit follow-up.

4. `trialEndTimeStamp` is a real history/runtime spelling and should not be
   renamed in this cleanup.

   Findings:

   - `trialEndTimeStamp` appears in instruction logging, resume tests, and
     history logging.
   - History payloads use timestamp field names such as `CFResponseTime`, so
     changing timestamp names can affect stored-history interpretation.

   Plan decision:

   - Leave `trialEndTimeStamp` alone in this CardStore boundary cleanup.
   - If this spelling is ever changed, do it as a separate history-compatible
     migration with tests around instruction, resume, and history logging paths.

5. Reconstructed learner progress is shared `studentModel` state.

   Findings:

   - `setReconstructedLearningState()` stores `clusterState`, `stimulusState`,
     `responseState`, and aggregate answer counters.
   - Those values come from `mofacts/client/lib/history/historyReconstruction.ts`.
   - The adaptive model and multiple unit engines use this reconstructed model
     shape, including learning-session and SPARC-session tests.

   Plan decision:

   - Move this state toward an app-owned `studentModel` module/capability.
   - Keep it available to all unit types that access the adaptive model.
   - Do not move it into `trial*`, `flashcard*`, display, readiness, timing, or
     audio owners.
   - Treat it as shared learner model state rather than active interaction or
     presentation state.

6. Readiness and lock state has multiple current owners; split by behavior, not
   by variable name.

   Findings:

   - `displayReady` and `inputReady` are controlled by
     `trialDisplayActions.ts`, stored through `cardRuntimeState.ts`, and mirrored
     into both `CardStore` and `Session`.
   - `recordingLocked` and `waitingForTranscription` are part of the content
     runtime machine audio context and are guarded in `guards.ts`.
   - `speechRuntimeActions.ts` updates machine-level SR state.
   - `speechRecognitionService.ts` mirrors recording and transcription state into
     `CardStore`.
   - `ttsService.ts` mirrors TTS request and recording-lock state into
     `CardStore`.
   - `ContentSurface.svelte` reads the machine audio context.
   - `FlashcardController.svelte` has local SR UI status, but the durable runtime
     coordination is not owned solely by the controller.

   Expert-oriented design guidance:

   - Model readiness as explicit state-machine state or domain-specific runtime
     state, not as one global bag of booleans.
   - Keep ownership close to the behavior: display/input readiness belongs to the
     active learner interaction in `trialReadiness`;
     recording/TTS/transcription readiness belongs to `audioRuntimeState`.
   - Coordinate domains through explicit events and guards rather than shared
     mutable flags where possible.
   - Keep derived/read-only mirrors only during migration, and remove them once
     callers move.

   Plan decision:

   - Treat `displayReady` and `inputReady` as active learner interaction
     readiness in `trialReadiness`, with display-specific payloads kept in
     `trialDisplayState`.
   - Treat `recording`, `recordingLocked`, `ttsRequested`, and
     `waitingForTranscription` as speech/audio runtime state.
   - Do not move all readiness flags into `FlashcardController`; that would hide
     cross-surface behavior used by speech, TTS, resize, and the content runtime
     machine.
   - Remove `CardStore` mirrors as call sites move to domain-owned APIs.

7. `CardRuntimeState` is narrower than `CardStore`; keep it focused.

   Current contents of `mofacts/common/types/card.ts`:

   - `TrialPhase`: `idle`, `display`, `input`, `feedback`, `timeout`,
     `complete`
   - `FeedbackKind`: `correct`, `incorrect`, `timeout`, `info`
   - `CardTimingState`: trial start/end, card start, optional main-card timeout
     start
   - `CardAudioFlags`: TTS/SR warmup, audio warmup, TTS request, audio recorder
     initialization
   - `CardInteractionState`: button trial/list, display/input readiness,
     feedback display, recording flags, enter-key lock
   - `CardScoreState`: optional scoring enabled, current score, correctness
     accumulator
   - `CardRuntimeState`: phase, optional feedback kind, user/current answer,
     hidden items, timing, interaction, audio, and score

   What it does not include:

   - Debug flags
   - Video source
   - Reconstructed learner model state
   - SR sample rate
   - Timeout handles
   - Feedback timeout begin/end values
   - Alternate display index and original question

   Plan decision:

   - Treat this type as a transitional current-active-interaction shape while it
     exists, not as evidence that audio, scoring, display, and timing should
     remain in one final owner.
   - Do not expand it into a full replacement for `CardStore`.
   - Rename or replace it when the owning runtime domain is clearer; avoid
     preserving generic `Card` vocabulary as final architecture.
   - Split by the ownership rule as boundaries are tightened: active
     interaction display/readiness/progression/timing into `trial*`, SR/TTS and
     recording into `audioRuntimeState`, learner aggregates into
     `studentModel`, and flashcard-specific behavior into `flashcard*` only when
     proven.

## First Implementation Change

Start with a narrow, behavior-preserving adapter cleanup that begins dismantling
`CardStore`:

1. Add a `setCurrentAnswer` dependency to the prepared interaction application
   path.
2. Remove the component-facing `setCardValue` dependency.
3. Keep app-internal generic access unchanged only long enough to move current
   layout/global callers to named runtime APIs.
4. Add tests proving prepared interaction state still updates current answer.
5. Run `npm run typecheck` and `npm run lint` from `mofacts/`.

This gives immediate AGENTS compliance improvement at the learning-component
boundary while preserving the larger direction: split, move, and delete
`CardStore`.
