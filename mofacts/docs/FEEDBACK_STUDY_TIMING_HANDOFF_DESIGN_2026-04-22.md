# Feedback/Study Timing And Handoff Design

Date: 2026-04-22

This document records the intended timing and handoff semantics for MoFaCTS feedback and study phases. It supersedes any implementation idea that waits until after feedback fade-out to start next-card preparation.

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

10. The configured feedback/study duration is the target total interval from `feedbackStart` to feedback/study fully gone.

11. Fade-out should begin at:

```text
feedbackStart + configuredFeedbackDuration - fadeOutDuration
```

assuming the background work is ready by then.

12. If incoming-card preparation is not ready by the planned fade-out start, feedback/study remains visible longer.

13. Once incoming-card preparation is ready and the planned fade-out start time has passed, feedback/study fade-out begins.

14. Feedback/study is still active during fade-out.

15. Feedback/study fade-out ends.

16. `feedbackEnd` is stamped at fade-out end.

17. `CF (Feedback Latency)` is computed as:

```text
feedbackEnd - feedbackStart
```

18. The final history row is written after fade-out end, because `CF (Feedback Latency)` depends on the fade-out-end timestamp. The write is blocking and must fail clearly if it cannot be persisted.

19. Experiment/session state and engine/performance state are updated after the final history write.

20. The prepared next card can be committed after final logging and state updates complete.

21. Next trial/problem content begins fade-in.

22. The next row's `Problem Start Time` is stamped at that new fade-in start.

## Key Semantics

- Feedback/study completion means fade-out has ended.
- Fade-out is part of the feedback/study duration.
- The system should use feedback/study display time to hide the cost of selecting and preparing the incoming card.
- If incoming-card preparation takes too long, the current feedback/study display should remain up longer rather than producing a blank screen or committing an unprepared next card.
- History writing must wait until fade-out end because the final feedback/study duration is not known before then.
- The current in-progress item is excluded from incoming-card selection, so next-card preparation does not need the history row currently being completed.
- `feedbackEnd` must not mean "the configured timer expired before fade-out." It means the feedback/study display is fully gone.
- `CF (Feedback Latency)` should measure the actual elapsed interval from feedback/study fade-in start through feedback/study fade-out end.

## Implementation Implication

The existing prepared-advance handoff is conceptually close because it already prepares the next card before committing it. The bugs are that incoming-card preparation must begin during feedback/study display, and feedback/study wait completion must be aligned so visual fade-out finishes at the configured duration when preparation is ready in time.

Implementation should preserve the prepared-card contract while moving the feedback/study completion boundary to fade-out end. Do not solve this by delaying card preparation until after fade-out. That loses the intended overlap and can cause blank-card behavior.
