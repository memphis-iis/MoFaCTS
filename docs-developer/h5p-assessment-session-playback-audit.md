# H5P Assessment Session Playback Audit

Date: 2026-05-20

Scope: H5P activities as they play inside assessment sessions in MoFaCTS. This audit intentionally does not cover learning-session H5P support, exports, example config generation, or broad import/package architecture except where timing directly affects assessment playback.

No code changes were made as part of this audit. No tests were run.

## Current Assessment Playback Flow

Assessment playback starts in the legacy card route and mounts the Svelte card screen. `Template.card.onRendered` creates the Svelte root in `mofacts/client/views/experiment/card.ts:35` and passes reactive props into `CardScreen.svelte` through `mountSvelteComponent` at `mofacts/client/views/experiment/card.ts:77`.

Assessment sessions are classified as schedule units. `deriveUnitType` returns `schedule` when `unit.assessmentsession` is present in `mofacts/client/views/experiment/svelte/services/svelteInit.ts:198`, and `createUnitEngine` maps that unit type to `createScheduleUnit` in `mofacts/client/views/experiment/engineConstructors.ts:67`.

The assessment schedule is built by `scheduleUnitEngine()` in `mofacts/client/views/experiment/unitEngine.ts:1728`. `createSchedule()` reads assessment settings, shuffles or selects clusters, and creates scheduled question entries. H5P trial markers are normalized in `mofacts/client/views/experiment/unitEngine.ts:1810`; the scheduled quest stores the test type with `type.toLowerCase()` in `mofacts/client/views/experiment/unitEngine.ts:1750`.

When the state machine requests a card, `selectCardService` calls the current unit engine in `mofacts/client/views/experiment/svelte/services/unitEngineService.ts:1050`. For schedule units, `selectNextCard()` prepares and commits the next scheduled card in `mofacts/client/views/experiment/unitEngine.ts:2215`. The schedule engine prepares the current cluster/stimulus with `buildPreparedCardQuestionAndAnswerGlobals()` through `prepareNextScheduledCard()` in `mofacts/client/views/experiment/unitEngine.ts:2157`, then commits it with `applyPreparedCardQuestionAndAnswerGlobals()` in `mofacts/client/views/experiment/unitEngine.ts:2204`.

The legacy preparation path builds `currentDisplay` from standard fields in `mofacts/client/views/experiment/unitEngine.ts:181`. It does not directly copy `stim.display.h5p`. H5P display data is restored in the Svelte service layer: `getPreparedCardDataFromSelection()` resolves H5P config from `preparedDisplay.h5p` or `stim.display?.h5p` in `mofacts/client/views/experiment/svelte/services/unitEngineService.ts:649`.

For self-hosted H5P, the service treats the H5P activity as owning the prompt and answer surface. It blanks normal text and cloze fields in `mofacts/client/views/experiment/svelte/services/unitEngineService.ts:651`, attaches the normalized H5P display at `mofacts/client/views/experiment/svelte/services/unitEngineService.ts:663`, and sets the answer to `__H5P_COMPLETED__` in `mofacts/client/views/experiment/svelte/services/unitEngineService.ts:675`.

The card machine defines H5P as trial type `h` in `mofacts/client/views/experiment/svelte/machine/constants.ts:20`. The assessment path treats H5P as a test-like trial in `isDrillOrTestTrial` at `mofacts/client/views/experiment/svelte/machine/guards.ts:117`. After selection, the machine stores `currentDisplay`, `currentAnswer`, `testType`, and related trial state in `mofacts/client/views/experiment/svelte/machine/cardMachine.ts:421`.

Rendering flows through:

- `CardScreen.svelte`, which renders the active trial content and hidden prepared incoming content in `mofacts/client/views/experiment/svelte/components/CardScreen.svelte:2387`.
- `TrialContent.svelte`, which determines whether H5P owns the interaction surface in `mofacts/client/views/experiment/svelte/components/TrialContent.svelte:145`.
- `StimulusDisplay.svelte`, which forwards H5P results and renders `H5PFrame` in `mofacts/client/views/experiment/svelte/components/StimulusDisplay.svelte:476`.
- `H5PFrame.svelte`, which builds the iframe URL in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:57` and renders the iframe shell at `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:547`.

Self-hosted H5P is served from `/h5p-content/:contentId/play` by `mofacts/server/http/h5pContent.ts:629`. The embedded player posts load, resize, xAPI, and normalized result messages back to the parent from `mofacts/server/http/h5pContent.ts:533` and `mofacts/server/http/h5pContent.ts:583`.

When a self-hosted H5P result reaches `CardScreen`, `handleH5PResult()` checks that the content id matches the current display and deduplicates by `contentId|batchId` in `mofacts/client/views/experiment/svelte/components/CardScreen.svelte:1033`. It then sets `Session.currentH5PResultBatch` and sends a `SUBMIT` event with `__H5P_COMPLETED__` or `__H5P_INCOMPLETE__`.

## Resize and Fit Behavior

The H5P frame size is controlled by multiple layers.

`TrialContent.svelte` gives H5P-owned stimulus content a flexible main area. The H5P-owned over-under layout sets the stimulus container to `flex: 1 1 auto`, `height: auto`, and `min-height: 0` in `mofacts/client/views/experiment/svelte/components/TrialContent.svelte:401`. It also stretches the H5P-owned trial main and stimulus container in `mofacts/client/views/experiment/svelte/components/TrialContent.svelte:418`.

`StimulusDisplay.svelte` then makes the display fill the available area. `.stimulus-display` uses `width: 100%`, `height: 100%`, `overflow: hidden`, and CSS containment in `mofacts/client/views/experiment/svelte/components/StimulusDisplay.svelte:607`. The H5P-specific wrapper is full width and height in `mofacts/client/views/experiment/svelte/components/StimulusDisplay.svelte:872`.

`H5PFrame.svelte` measures the viewport and computes the visible iframe size. The key derived values are `bootstrapFrameWidth`, `bootstrapFrameHeight`, `visibleNaturalWidth`, `visibleNaturalHeight`, `frameScale`, `stageStyle`, `surfaceStyle`, and `frameStyle` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:63`. The visible surface is scaled with CSS transform in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:633`, while the iframe gets explicit width and height in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:638`.

`H5PFrame` observes parent viewport size changes with `ResizeObserver` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:257`. On size change, `updateStageSize()` starts a new fit epoch in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:301`. Fit epochs request iframe measurement through `postMessage` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:231`.

The self-hosted iframe responds to measurement requests from the parent in `mofacts/server/http/h5pContent.ts:367`. Its `currentSizePayload()` reports document, body, and H5P container heights in `mofacts/server/http/h5pContent.ts:336`.

The fit algorithm lives in `mofacts/client/views/experiment/svelte/utils/h5pFitPolicy.ts:142`. It can choose native, width-adjusted, scaled, or focus modes. In the live component, however, only one candidate width is currently measured: `candidateWidths = [firstMeasurementWidth]` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:133`. That means the width-adjusted branch tested in `mofacts/client/views/experiment/svelte/utils/h5pFitPolicy.test.ts:36` is not meaningfully exercised by current assessment playback.

The self-hosted child document also applies its own sizing rules. The generated player CSS sets `html, body`, `#h5p-container`, `.h5p-content`, and child iframes in `mofacts/server/http/h5pContent.ts:319`. Those rules force width and allow visible overflow inside a parent that is itself often clipping overflow.

## Race Condition Risks

Several load and resize events can arrive in different orders:

- Parent iframe `load`, handled by `handleLoad()` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:524`.
- Child `hello` and `prepareResize`, handled by `handleH5PResizerMessage()` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:455`.
- Runtime `mofacts:h5p-loaded`, posted after `H5PStandalone` setup in `mofacts/server/http/h5pContent.ts:583`.
- Resize observer callbacks from the parent viewport in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:257`.
- xAPI and normalized result messages from the child in `mofacts/server/http/h5pContent.ts:533`.

Measurement epochs and request ids reduce some stale resize risk. `recordNaturalSize()` ignores measurements that do not match `activeMeasurementRequestId` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:422`.

The larger risk is that not all message types are scoped to the current iframe. `handleMessage()` checks same-origin for H5P messages in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:477`. For `context: 'h5p'` resize messages, it also checks `data.contentId !== config?.contentId` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:484`. But for non-context same-origin messages such as `mofacts:h5p-result`, `mofacts:h5p-loaded`, `mofacts:h5p-failed`, and `mofacts:h5p-xapi`, there is no equivalent content id or `event.source` check before mutating local state in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:490`.

That matters during assessment transitions because `CardScreen` can mount hidden prepared incoming content before it becomes active. The incoming slot is created in `mofacts/client/views/experiment/svelte/components/CardScreen.svelte:2387` and rendered with `parentVisible={false}` at `mofacts/client/views/experiment/svelte/components/CardScreen.svelte:2392`. Its CSS sets `visibility: hidden` and `pointer-events: none` in `mofacts/client/views/experiment/svelte/components/CardScreen.svelte:2531`, but hidden H5P iframes can still load and post messages.

The incoming slot does not attach an `on:h5presult` handler, so it does not directly submit an answer. However, each mounted `H5PFrame` owns a global `window.message` listener added in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:505`. Without filtering by content id and message source for all message types, a message from the hidden incoming iframe can affect another mounted H5P frame's `pendingResult`, fit phase, or measurement flow.

The result logging path also relies on global session state. `historyLogging` filters `currentH5PResultBatch` by current display content id in `mofacts/client/views/experiment/svelte/services/historyLogging.ts:650` and clears it after history insertion in `mofacts/client/views/experiment/svelte/services/historyLogging.ts:811`. That protects against many wrong-content cases, but same-content repeated items or failed logging before clear remain fragile.

## Redundant or Competing Rules

There are multiple independent sizing rules applied at once:

- Flex sizing in `TrialContent.svelte`.
- Full-area display sizing in `StimulusDisplay.svelte`.
- Viewport measurement, iframe dimensions, and transform scaling in `H5PFrame.svelte`.
- Forced width and overflow rules in the self-hosted iframe document generated by `h5pContent.ts`.
- Fit policy branches for candidate widths and focus modes that are mostly not wired into the component.

Some pieces look redundant or partially abandoned:

- `buildH5PCandidateWidths()` is implemented in `mofacts/client/views/experiment/svelte/utils/h5pFitPolicy.ts:109`, but `H5PFrame` currently does not use it.
- `activeCandidateIndex` is declared in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:43`, but does not appear to drive behavior.
- `focusAvailable` is always passed as `false` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:355`, making the focus fit branch inactive.
- `reservedControlHeight` is included in the fit input at `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:354`, but the current policy does not materially subtract it from available height.
- There are two load signals: iframe `on:load` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:562` and runtime `mofacts:h5p-loaded` from `mofacts/server/http/h5pContent.ts:583`.

The system is therefore doing a lot of correct-looking work, but not all of that work is part of one coherent fit contract.

## Visual Settling and Theme Background Findings

H5P is not currently treated as a blocking visual asset for assessment reveal. `StimulusDisplay` reports blocking asset state for images in `mofacts/client/views/experiment/svelte/components/StimulusDisplay.svelte:313`, but there is no analogous H5P-ready signal. `CardScreen` sends `INCOMING_READY` when incoming content is mounted and image blockers are ready in `mofacts/client/views/experiment/svelte/components/CardScreen.svelte:797`; H5P load and first fit do not participate in that readiness check.

This explains several visible symptoms:

- The assessment trial can fade in while the H5P iframe is still loading.
- The self-hosted initial fit mask can still be covering the activity after the trial appears.
- The iframe can settle to bootstrap dimensions and then resize after measurement arrives.
- A hidden prepared H5P frame may not actually preload predictably, especially with `loading="lazy"` on the iframe in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:562`.

The parent-side H5P cover mostly matches the themed stimulus area. `.h5p-frame-shell` uses `--stimuli-box-color` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:599`; `.h5p-initial-fit-mask` also uses `--stimuli-box-color` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:647`; the continue bar uses the same color in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:655`.

There are still background mismatches. The iframe element itself uses `--background-color` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:638`, while the self-hosted H5P document hard-codes `background: #fff` for `html, body` in `mofacts/server/http/h5pContent.ts:319`. That can flash or sit visibly wrong in dark or tinted themes, where the assessment container and stimuli box are not white.

External embeds have less parent control. The initial fit mask is only shown for self-hosted H5P because `showInitialFitMask` requires `isSelfHosted` in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:81`. External H5P content can therefore flash, resize, or expose its native background directly.

## Fragile or Crufty Code

The most fragile part is the global postMessage handling in `H5PFrame`. Resize messages have content id protection, but result/load/fail/xAPI messages do not. Multiple mounted frames, including hidden prepared frames, make that fragility relevant to assessment playback.

The H5P fit flow has several entry points that can restart or change the fit phase: embed URL reset in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:83`, pending result phase changes in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:88`, iframe load in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:524`, child hello/resize in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:455`, runtime loaded/result messages in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:490`, and parent resize observer callbacks in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:257`.

The measurement timeout path removes the initial fit mask after `H5P_MEASUREMENT_TIMEOUT_MS` even if no fit was completed. The timeout is declared in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:19` and applied in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:152`. If the iframe responds later, the user may see bootstrap dimensions first and a late size correction after the cover is gone.

The self-hosted child does not appear to observe its own DOM for size changes. It reports size when the parent requests it and around initial H5P setup in `mofacts/server/http/h5pContent.ts:378`, but late content expansion inside H5P may not trigger a parent fit unless some other event causes a request.

The prepared incoming trial key does not include H5P display identity. `trialSubsetKey` is built without `h5p` in `mofacts/client/views/experiment/svelte/components/CardScreen.svelte:561`, and `incomingSlotKey` also omits H5P in `mofacts/client/views/experiment/svelte/components/CardScreen.svelte:761`. `StimulusDisplay` itself keys the H5P frame by `JSON.stringify(safeDisplay.h5p || {})` in `mofacts/client/views/experiment/svelte/components/StimulusDisplay.svelte:404`, which helps at the inner component level, but the outer trial/incoming keys are still incomplete for H5P-only changes.

## Low-Risk Improvement Ideas

Filter all `mofacts:h5p-*` messages by `contentId` before mutating `H5PFrame` state. Also check `event.source === frameElement.contentWindow` so a hidden incoming iframe cannot change the active frame even when content ids match or are missing.

Clear or scope `currentH5PResultBatch` at the start of each H5P question. A stronger version would include a trial key or schedule index alongside content id so same-content repeated assessment items cannot inherit stale result state.

Make H5P readiness a first-class visual readiness signal for assessment playback. `H5PFrame` could report ready after iframe load plus first successful fit, or after the existing measurement timeout. `CardScreen` could then treat H5P like images when deciding reveal and incoming readiness.

Include H5P identity in `trialSubsetKey` and `incomingSlotKey`, at least `contentId`, `sourceType`, and `embedUrl` where applicable.

Align H5P blank and cover backgrounds with the assessment stimulus area. The parent iframe background and the generated self-hosted player document should avoid hard-coded white when the assessment theme uses a different `--stimuli-box-color`.

Decide whether the multi-candidate fit policy is part of the intended behavior. If yes, wire `buildH5PCandidateWidths()` into `H5PFrame`. If no, simplify the unused candidate/focus paths so future sizing fixes do not chase dormant logic.

Consider disabling iframe lazy loading for active assessment H5P frames. Prepared hidden frames may still need careful handling, but active trial playback should prefer deterministic load timing.

Add a guarded child-side `ResizeObserver` in the self-hosted H5P player so content size changes after initial load can request a new parent measurement without relying on unrelated parent resize events.

## Suggested Tests

Add unit or component coverage that `H5PFrame` ignores `mofacts:h5p-result`, `mofacts:h5p-loaded`, `mofacts:h5p-failed`, and `mofacts:h5p-xapi` when `contentId` does not match the frame config.

Add coverage that `H5PFrame` ignores same-origin H5P messages when `event.source` is not the current iframe's `contentWindow`.

Add a component test with an active H5P frame and a hidden prepared incoming H5P frame. Verify that messages from the hidden frame cannot set the active frame's `pendingResult`, continue bar, or fit phase.

If H5P becomes a blocking visual asset, test that assessment reveal waits for iframe load plus first fit or timeout. This should be scoped to H5P and should not change existing image blocker behavior.

Add a keying test proving that `trialSubsetKey` and `incomingSlotKey` change when only H5P content identity changes.

Add browser coverage for two self-hosted H5P assessment items back-to-back. Force a late xAPI/result-style message from the first item after transition and verify the next item is not affected.

Add dark-theme visual coverage for H5P first paint. The expected result is no white flash from the parent mask, iframe blank state, or generated self-hosted document body.

Add viewport resize or orientation-change coverage while H5P is loading. The expected result is one stable final fit without repeated visible jumps.

Add fallback coverage for an external H5P embed that does not participate in the same-origin resize protocol. The preferred-height fallback should remain stable and should not leave a permanent cover.
