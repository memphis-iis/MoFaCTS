# Feedback/Study Timing And Handoff Design

Date: 2026-04-22

This document records the intended timing and handoff semantics for MoFaCTS feedback and study phases. It supersedes designs that place history/model finalization after feedback fade-out, because there is no acceptable visual gap between trials.

## Correct Sequence

1. Trial/problem content begins fade-in.

2. `Problem Start Time` is stamped at trial/problem fade-in start.

3. Learner responds, times out, or enters a study/review path.

4. For answer rows, response start is stamped as DataShop `Time`.

5. For timeout rows, timeout firing time is stamped as DataShop `Time`.

6. Feedback/study content begins fade-in.

7. `feedbackStart` is stamped at feedback/study fade-in start.

8. As soon as feedback/study begins, incoming-card work may start in parallel:
   - select the next card while excluding the current in-progress item
   - prepare the incoming card and its blocking assets

9. Feedback/study remains on screen while incoming-card preparation runs.

10. When the feedback/study wait has completed and incoming-card preparation is ready, stamp the export feedback cutoff and finalize the current trial while the current feedback/study display is still fully visible.

11. Current-trial finalization includes history insertion, experiment/session state update, and engine/performance update. It runs before the prepared next card is committed, so model updates still apply to the completed current card.

12. After finalization completes, feedback/study fade-out begins.

13. Feedback/study fade-out ends.

14. At fade-out end, the prepared next card is committed synchronously and the next trial begins its fade-in. No history/model/network work may be placed between fade-out end and the prepared-card commit.

15. The next row's `Problem Start Time` is stamped at that new fade-in start.

## Key Semantics

- The visual transition has no permissible blank interval after fade-out.
- The system should use feedback/study display time to hide incoming-card preparation and current-trial finalization.
- If incoming-card preparation or current-trial finalization takes too long, the current feedback/study display should remain up longer rather than producing a blank screen or committing an unprepared next card.
- The current in-progress item is excluded from incoming-card selection, so next-card preparation does not need the history row currently being completed.
- `CF (Feedback Latency)` is no longer a true fade-out-end exposure measure. It is computed from known timing before fade-out so current-trial finalization can complete before the visual handoff.
- A true fade-out-end latency would require post-fade finalization or deferred row mutation, and that tradeoff is not acceptable for the card transition.

## Implementation Implication

The prepared-advance handoff must preserve two constraints at the same time:

- Finalization must happen before commit, while the completed trial is still the live model/session card.
- Commit must happen immediately after fade-out, before any async service can create a blank interval.

The machine sequence should therefore be:

```text
feedback/study visible
-> incoming card ready
-> history/state/model finalization
-> fade out current feedback/study
-> immediately commit prepared next card
-> next trial fade-in
```
