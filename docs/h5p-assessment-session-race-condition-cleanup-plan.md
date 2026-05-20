# H5P Assessment Session Race Condition Cleanup Plan

Date: 2026-05-20

Source audit: `docs/h5p-assessment-session-playback-audit.md`

Scope: H5P activities as they play inside assessment sessions.

This plan is strictly for race condition fixes. It does not plan visual polish, broad sizing cleanup, theme cleanup, H5P fit-policy redesign, learning-session behavior, exports, config work, or import architecture.

## Cleanup Sequencing Principle

Do not assume that the broader H5P assessment playback system needs visual, sizing, theme, or fit-policy cleanup until the race conditions are isolated well enough to see the system's behavior without stale and cross-frame events interfering.

The first job is to contain the races:

- Prevent old, hidden, duplicate, or wrong-frame events from mutating the active assessment item.
- Make event ownership and ordering explicit enough to diagnose what remains.
- Preserve the currently working assessment flow while narrowing the sources of nondeterminism.

Only after that should the team decide whether additional cleanup is required. Apparent sizing or visual problems may disappear once stale events and out-of-order callbacks stop affecting the active item. Problems that remain should become follow-up findings from a cleaner baseline, not assumptions baked into this plan.

## Definition Of Race Condition In This Plan

For this plan, a race condition is one of:

- An async callback from an old H5P item mutates the current item.
- A message from a hidden prepared H5P frame mutates the active item.
- Duplicate iframe/runtime/result events cause duplicate state changes.
- A measurement reply applies to the wrong fit request, epoch, frame, or trial.
- A callback runs after the frame has changed content, unmounted, or been destroyed.
- A result batch is submitted or logged for the wrong assessment trial.

Anything outside those categories is out of scope for this plan, even if it was found by the audit.

## Race Invariants

1. One H5P iframe may affect only the `H5PFrame` instance that owns it.
2. One H5P result may affect only the assessment trial that owns it.
3. Hidden prepared H5P frames may not mutate active trial state.
4. Duplicate H5P events must be idempotent.
5. Late callbacks must be ignored when their frame, content id, trial id, epoch, or request id is no longer current.
6. Race fixes must not change valid assessment selection, scoring, or result logging semantics.

## Fix 1: Scope Every Inbound H5P Message To Its Owning Frame

Current risk:

`H5PFrame` installs a `window.message` listener for each mounted frame in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:505`. It checks `contentId` for `context: 'h5p'` resize messages in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:484`, but same-origin `mofacts:h5p-result`, `mofacts:h5p-loaded`, `mofacts:h5p-failed`, and `mofacts:h5p-xapi` messages can mutate local state without equivalent ownership checks in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:490`.

Plan:

1. Add one inbound ownership guard in `H5PFrame`.
2. For self-hosted H5P messages, require `event.origin === window.location.origin`.
3. Require `event.source === frameElement.contentWindow` before accepting iframe-originated load, result, fail, xAPI, hello, or resize messages.
4. Require `data.contentId === config.contentId` for every self-hosted message that can mutate state.
5. Treat missing `contentId` on self-hosted `mofacts:h5p-*` messages as invalid.

This is a pure race fix. It only rejects events that do not belong to the current frame.

Tests:

- Active frame ignores `mofacts:h5p-result` from another iframe source.
- Active frame ignores `mofacts:h5p-loaded` with mismatched `contentId`.
- Active frame accepts valid messages from its own iframe.

## Fix 2: Scope H5P Results To The Current Assessment Trial

Current risk:

`CardScreen` filters result events by current `contentId` and deduplicates by `contentId|batchId` in `mofacts/client/views/experiment/svelte/components/CardScreen.svelte:1033`. `historyLogging` reads `Session.currentH5PResultBatch`, filters by content id in `mofacts/client/views/experiment/svelte/services/historyLogging.ts:650`, and clears it after insertion in `mofacts/client/views/experiment/svelte/services/historyLogging.ts:811`.

That can still race when the same H5P content appears in more than one assessment item. A late result from item N can look valid for item N+1 if both share the same content id.

Plan:

1. Define a stable H5P assessment trial identity.
2. Store that trial identity with `currentH5PResultBatch`.
3. Require that same trial identity when `historyLogging` reads the batch.
4. Clear prior H5P result state when a new H5P assessment item becomes current.
5. Include trial identity in the submit dedupe key, not only `contentId|batchId`.

Recommended identity fields:

- Current question index or schedule index.
- Current trial start timestamp.
- H5P content id.
- Trial type `h`.

This is a pure race fix. It prevents a valid result from the wrong time from being accepted for the current trial.

Tests:

- Two consecutive H5P assessment items with the same content id do not share result batches.
- A stale session result with the wrong trial identity is ignored.
- A valid current-trial result still submits and logs.

## Fix 3: Make H5P Load And Result Events Idempotent

Current risk:

The parent iframe `load` handler runs in `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:524`. The self-hosted runtime posts `mofacts:h5p-loaded` after `H5PStandalone` setup in `mofacts/server/http/h5pContent.ts:583`. Result and xAPI messages are posted from `mofacts/server/http/h5pContent.ts:533`. These events can arrive more than once or in different orders.

Plan:

1. Track whether the current frame/content has already accepted iframe load.
2. Track whether the current frame/content has already accepted runtime load.
3. Track accepted result batches for the current trial.
4. Ignore duplicate load/result events for the same frame, content id, and trial identity.
5. Reset idempotency state only when the owning frame content or trial identity changes.

This is a pure race fix. It does not decide whether visual reveal should wait for load; it only prevents duplicate async events from causing duplicate state changes.

Tests:

- Duplicate iframe load does not duplicate measurement scheduling beyond the intended current request.
- Duplicate runtime loaded does not change state twice.
- Duplicate result batch does not submit twice.
- A new trial resets the idempotency state.

## Fix 4: Reject Stale Fit Measurement Replies

Current risk:

`H5PFrame` already uses request ids in `recordNaturalSize()` at `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:422`, but fit work can be triggered by embed URL changes, resize observer callbacks, iframe load, child hello/resize messages, result phase changes, and timeouts:

- `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:83`
- `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:88`
- `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:126`
- `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:152`
- `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:195`
- `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:257`
- `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:455`
- `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:524`

Plan:

1. Ensure every measurement request carries the current frame identity, content id, fit epoch, phase, and request id.
2. Accept measurement replies only when all of those values still match the current frame state.
3. Ignore replies after content changes, trial changes, timeout finalization, or destroy.
4. Keep this fix to stale-reply rejection. Do not redesign the fit policy in this race pass.

This is a pure race fix. It prevents old measurements from changing the current frame.

Tests:

- Old request id measurement does not change fit.
- Old epoch measurement does not change fit.
- Measurement after content id change does not change fit.
- Measurement after destroy does not change fit.

## Fix 5: Cancel Or Ignore Async Work After Frame Change Or Destroy

Current risk:

`H5PFrame` schedules work through `tick`, `requestAnimationFrame`, `setTimeout`, `ResizeObserver`, and `window.message`. Some cleanup exists in `onDestroy` at `mofacts/client/views/experiment/svelte/components/H5PFrame.svelte:509`, but every async callback should also prove it still belongs to the live frame before mutating state.

Plan:

1. Add a monotonically increasing local instance token or generation id.
2. Increment it when the embed URL/content changes and when the component is destroyed.
3. Capture that token in delayed callbacks.
4. Before any delayed callback mutates state, require that the token still matches.
5. Keep existing timer/listener cleanup.

This is a pure race fix. It prevents delayed callbacks from old component generations from mutating the current generation.

Tests:

- Scheduled measurement after embed URL change is ignored.
- Measurement timeout after destroy is ignored.
- Resize observer callback after destroy is ignored.
- Message handler after destroy is not active.

## Fix 6: Isolate Hidden Prepared H5P Frames From Active Trial State

Current risk:

`CardScreen` can mount hidden prepared incoming content in `mofacts/client/views/experiment/svelte/components/CardScreen.svelte:2387`. Its CSS hides the slot in `mofacts/client/views/experiment/svelte/components/CardScreen.svelte:2531`, but hidden iframes can still load and post messages.

Plan:

1. Rely first on Fix 1 so hidden-frame messages cannot mutate active `H5PFrame` state.
2. Ensure hidden prepared slots do not write `Session.currentH5PResultBatch`.
3. Ensure hidden prepared slots do not dispatch assessment `SUBMIT`.
4. Add H5P identity to prepared-slot ownership only if needed to prevent stale hidden-frame reuse across different H5P items.

This is a race fix only when it prevents hidden async events from affecting the active trial. It is not a plan to change preloading behavior.

Tests:

- Hidden prepared H5P cannot submit the active trial.
- Hidden prepared H5P cannot set active pending result state.
- Hidden prepared H5P cannot write the active trial's H5P result batch.

## Fix 7: Add Race Diagnostics Without Changing Behavior

Current risk:

Some intermittent failures may not be reproducible from code inspection alone. Before changing sizing, reveal, theme, or preload behavior, the system should expose enough race diagnostics to prove which async event arrived late or from the wrong owner.

Plan:

1. Add bounded diagnostic logging through the existing client logging path, not raw `console.*`.
2. Log ignored stale H5P messages with reason codes in development/debug verbosity only.
3. Include frame identity, content id, trial identity, fit epoch, request id, and message type.
4. Keep diagnostics disabled or quiet under normal admin-controlled verbosity.

This is a race investigation aid. It should not change assessment behavior.

Tests:

- Debug logging records ignored wrong-frame messages when verbosity allows.
- Normal verbosity does not add routine client console output.

## Explicitly Out Of Scope For This Race Plan

These audit findings are not race-condition fixes and should not be implemented under this plan:

- Theme/background color cleanup.
- General visual polish.
- Broad H5P sizing redesign.
- Candidate-width or focus-mode fit-policy redesign.
- Removing dormant fit code solely for cleanliness.
- Changing whether hidden prepared H5P frames preload.
- Disabling iframe lazy loading.
- Adding child-side size observers for general layout quality.
- Learning-session H5P behavior.
- Data exports.
- Config example creation.
- Package import architecture.

If any of these later prove necessary to fix a specific race, that should be documented with evidence first and handled as a separate scoped follow-up.

## Recommended Order

1. Scope all inbound H5P messages to the owning frame.
2. Scope H5P result batches to the owning assessment trial.
3. Make load/result events idempotent.
4. Reject stale fit measurement replies by frame, content, epoch, phase, and request id.
5. Cancel or ignore async callbacks after frame change or destroy.
6. Isolate hidden prepared H5P frames from active trial state.
7. Add race diagnostics for ignored stale events.

## Verification Plan

Run the full TypeScript check after TypeScript-bearing changes:

```bash
cd mofacts
npm run typecheck
```

Add focused tests for:

- Message source and content id filtering.
- Same-content repeated H5P assessment items.
- Duplicate load/result events.
- Stale fit measurement replies.
- Async callbacks after embed URL change or destroy.
- Hidden prepared H5P frame isolation.

Do not use `meteor run` or Docker build/deploy commands for this verification unless explicitly requested.
