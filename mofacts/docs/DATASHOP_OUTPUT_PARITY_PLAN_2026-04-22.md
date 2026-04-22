# DataShop Output Parity Plan

Date: 2026-04-22

This document records settled decisions and implementation guidance for bringing MoFaCTS data download into closer DataShop tab-delimited import parity.

## Settled Decision 1: `Time` Must Not Be Trial Start

MoFaCTS data output is intended to follow DataShop tab-delimited import semantics. Deviations from DataShop are bugs unless they are valid DataShop usage, such as MoFaCTS research metadata stored in allowed `CF (...)` columns.

The current export maps:

- `Time` to `history.time`, which Svelte card history currently sets from `trialStartTimeStamp`.
- `CF (Response Time)` to `history.CFResponseTime`, which Svelte history currently sets from `trialEndTimeStamp`.

This is incorrect for DataShop transaction rows. DataShop has a separate `Problem Start Time` column for the time the problem is shown to the student. The DataShop `Time` column is the timestamp for the transaction row.

The required direction is:

- Export the trial/problem/card start timestamp in `Problem Start Time`.
- Define trial start as the semantic UI event that begins the trial-content fade-in.
- Derive the exported `Time` from response start time, not by reusing trial start.
- Preserve MoFaCTS timing and research fields as valid `CF (...)` fields when they are still meaningful and correctly named.

For answer rows, `Time` should represent response start time. This may be stored directly when the response starts or derived from `Problem Start Time + CF (Start Latency)` when those values are authoritative.

For older stored rows that predate `Problem Start Time`, the export mapper should derive `Problem Start Time` from the old stored `time` and infer answer/timeout `Time` from `Problem Start Time + CF (Start Latency)` when that latency is available.

## Settled Decision 2: Study Rows Use `STUDY`

Study rows are not DataShop hints. DataShop `HINT` semantics were designed for specialized hint systems and do not represent MoFaCTS study trials.

The required direction is:

- Export study outcomes as uppercase `STUDY`.
- Preserve the existing study/review research semantics where they are valid DataShop columns or valid `CF (...)` fields.
- DataShop accepts the uppercase `STUDY` value. Whether DataShop uses it in downstream model/calculation layers is not important for MoFaCTS parity.

## Settled Decision 3: Video Rows Are Control Events

Video history rows should map to DataShop event-descriptor columns rather than pretending to be evaluated problem-solving attempts.

The required direction is:

- Populate `Selection` with the video/interface target, for example `video`.
- Populate `Action` with the control event, for example `play`, `pause`, `seek`, `seek_blocked`, `ratechange`, `volumechange`, or `end`.
- Preserve video details in existing valid `CF (...)` fields, such as video timestamp, seek start/end, speed, volume, and playing state.
- Leave `Outcome` blank for video control rows.

## Settled Decision 4: Drop `CF (Response Time)`

`CF (Response Time)` currently stores the absolute response submission timestamp. It is inferable from the DataShop row `Time`, `Problem Start Time`, and timing latency fields, and the custom-field name is easy to misread as a duration.

The required direction is:

- Remove `CF (Response Time)` from the DataShop output.
- Do not replace it unless a later research requirement needs an explicit response submission timestamp custom field with a clearer name.

## Settled Decision 5: Timeout Rows Use Timeout Event Time

Timeout rows have no learner response-start event.

The required direction is:

- Use the timeout firing timestamp as the DataShop `Time` value for timeout rows.
- Keep `Problem Start Time` as first visible paint.
- Treat timeout as the transaction event for row anchoring.
- Keep timeout as incorrect unless a separate research/product decision changes timeout outcome semantics.

## Settled Decision 6: Keep Useful Timing Latencies, Recompute From Correct Start

After first visible paint is captured as the true trial/problem start, existing latency fields should be recomputed from that corrected start where applicable.

The required direction is:

- Keep `CF (Start Latency)` as response-start latency from first visible paint.
- Keep `CF (End Latency)` as response submit/end latency from first visible paint.
- Consider exporting stored `responseDuration` as `CF (Response Duration)` because it is the duration from response start to submit/end.
- Drop only `CF (Response Time)` because it is an absolute timestamp and is redundant after `Time`, `Problem Start Time`, and latency fields are correct.

## Settled Decision 7: Feedback Timing Must Not Block The Visual Handoff

MoFaCTS should keep feedback/study visible while current-trial finalization and incoming-card preparation complete. The export should not require a true fade-out-end feedback duration, because waiting for that value before writing history creates an unacceptable blank/flicker risk between trials.

The required direction is:

- Start feedback duration when feedback first begins to appear, meaning the start of feedback fade-in.
- Include TTS/audio time that occurs during the feedback exposure interval.
- If TTS/audio is longer than the configured feedback/study timeout, the actual feedback duration may exceed the configured timeout.
- Compute `CF (Feedback Latency)` from the known pre-fade finalization cutoff, not from fade-out end.
- Do not put history/model finalization after fade-out just to capture true visual exposure duration.

This means `CF (Feedback Latency)` is a practical research timing field, not an exact visual exposure duration through fade-out.

Implementation note after the handoff correction:

- Incoming-card selection/preparation starts during feedback/study display, preserving the current-item exclusion invariant and hiding that cost inside the visible feedback/study interval when possible.
- Fade-out starts only after both the planned fade-out-start time has arrived and incoming-card preparation is ready.
- History insertion and engine update occur before fade-out, while the completed card is still the live model/session card.
- Prepared-card commit occurs immediately after fade-out end, with no async logging/model work in the visual handoff gap.
- The feedback/study wait resolves before fade-out, then current-trial finalization runs while feedback/study remains visible.

## Settled Decision 7a: Semantic Exposure Anchors Must Be Explicit

The current code is too imprecise about visual timing. Implementation must not infer exposure timing from state-machine entry, history logging, timeout completion, or transition side effects when the UI fade boundaries are the actual semantic boundaries.

The required direction is:

- Track only semantic exposure anchors that are intended to drive exported timing.
- Do not track optional fade diagnostics such as fade-in end or fade-out start. Those timestamps do not define current export semantics and would create misleading cruft.
- Define trial/problem exposure start as trial content fade-in start.
- Define feedback/study exposure start as feedback/study content fade-in start.
- Do not export a true fade-out-end feedback/study duration in the current handoff. That value would require post-fade finalization or deferred row mutation, which creates unacceptable transition risk.
- `CF (Feedback Latency)` is a pre-fade finalization cutoff measure, not a true visual exposure duration.
- Enforce this contract with tests: if a duration claims a particular visual boundary, the test should prove it starts and ends at that boundary.
- Fail clearly if a required timestamp is missing; do not silently fall back to `Date.now()` in export or history calculations.

Open precision item:

- Confirm each exported duration's intended semantic anchors before implementation. Response-start `Time` is settled as response start, and its associated start latency should be measured from trial content fade-in start. `CF (Feedback Latency)` intentionally does not wait for fade-out end.

## Settled Decision 8: Video Rows Use Wall-Clock Action Time

Video rows need a wall-clock DataShop transaction timestamp and separate video media time.

The required direction is:

- Capture a wall-clock action timestamp when `logVideoAction(action)` runs and export that as `Time`.
- Keep video playback position in `CF (Video TimeStamp)`.
- Preserve the video-session start timestamp in `Problem Start Time` when available; keep the wall-clock control-action timestamp in `Time`.

## Settled Decision 9: Repair DataShop Header Schema In Place

The existing export should be corrected to DataShop semantics rather than preserving known-bug headers.

The required direction is:

- Rename `Session ID` to DataShop `Session Id`.
- Add DataShop `Problem Start Time`.
- Remove `CF (Response Time)`.
- Sort export rows by the corrected exported transaction `Time`, then server time/event id tie-breakers.

## Settled Decision 10: Normalize Outcomes

The required direction is:

- Export correct answer rows as `CORRECT`.
- Export incorrect answer rows as `INCORRECT`.
- Export timeout answer rows as `INCORRECT`.
- Export study rows as `STUDY`.
- Leave video control row outcomes blank.
- Leave instruction row outcomes blank.

## Settled Decision 11: Populate DataShop Event Descriptor Columns

`Selection` and `Action` should be populated intentionally rather than relying on `Step Name` to satisfy DataShop's row descriptor requirements.

The required direction is:

- For normal text/SR answer rows, export `Selection` as `answer` and `Action` as `respond`.
- For button trials, export `Selection` as `multiple choice` and `Action` as `respond`.
- For timeout rows, use the same trial-type selection/action as the trial would otherwise use, with timeout represented by the source/outcome/timing fields.
- For video rows, export `Selection` as `video` and `Action` as the video control event.
- For instruction rows, export `Selection` as `instruction` and `Action` as `continue`.

## Settled Decision 12: Populate `KC (Default)`

The current export includes `KC (Default)` in the header but does not map the stored `KCDefault` value into that column.

The required direction is:

- Populate `KC (Default)` from stored `history.KCDefault` when present.
- Leave the field blank only when no default KC exists.

## Settled Decision 13: Map Feedback Type To DataShop Feedback Classification

DataShop uses `Feedback Classification`; MoFaCTS currently exports `Feedback Type`.

The required direction is:

- Export MoFaCTS `deliveryParams.feedbackType` / stored `history.feedbackType` under DataShop `Feedback Classification`.
- Treat this as loose wiring for future richer feedback modes.
- Do not add a parallel `CF (Feedback Type)` column for current values.
- Current expected values are effectively default/simple feedback, and default/simple are likely equivalent in current runtime behavior.
- Do not over-engineer behavior around complex feedback types until those modes are rebuilt into the active runtime.

## Settled Decision 14: Export Response Duration

Stored `responseDuration` is semantically meaningful: it captures the interval from response start to response submission/end.

The required direction is:

- Export stored `responseDuration` as `CF (Response Duration)`.
- Compute it from corrected semantic anchors after trial start and response timestamps are repaired.

## Settled Decision 15: Instruction Rows Are Instruct Events

Instruction rows should be represented as DataShop instruction events, not evaluated answer attempts.

The required direction is:

- Export instruction rows with `Event Type` set to `instruct`.
- Leave instruction row `Outcome` blank.
- Export `Selection` as `instruction`.
- Export `Action` as `continue`.
- Use the instruction continue event as the DataShop transaction `Time`.

## Settled Decision 16: Use Fade-In Start As The Exported Start Anchor

To avoid browser-paint ambiguity, implementation should use the semantic UI event that initiates content exposure.

The required direction is:

- Treat trial/content fade-in start as the DataShop `Problem Start Time` for card rows.
- Measure `CF (Start Latency)` and `CF (End Latency)` from trial/content fade-in start.
- Treat feedback/study fade-in start as the start of `CF (Feedback Latency)`.
- Treat the pre-fade finalization cutoff as the end of `CF (Feedback Latency)`; do not block the visual handoff to capture fade-out end.

## Remaining Open Questions

- None. Remaining work is implementation, characterization tests, export verification, and documentation updates.
