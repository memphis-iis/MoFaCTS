# AutoTutor Concern Matrix Working Copy

This is the active shrinking punch-list. Rows should be removed from this working copy as we address them; the larger original matrix is intentionally not the active list.

Source reviewed: Art's email, Phil's draft reply, the two authored systems in `C:\Users\ppavl\OneDrive\Active projects\mofacts_config`, the current AutoTutor runtime/planner in `mofacts/client/views/experiment/svelte/services/autoTutorClient.ts` and `mofacts/common/lib/autoTutorPlanner.ts`, and read-only production history from `MoFACT-meteor3.history`.

Production snapshot from the remote server: 25 AutoTutor history rows were found. The confidence-interval system had 10 turns from one user, no completion, and progress stayed at 0. The NVC system had 15 turns from one user, no completion, and final progress was about 0.41. The traces are small, so they should guide diagnosis rather than settle it.

The two practice systems are not identical in content difficulty. The confidence interval tutor has 3 required expectations and 3 misconceptions. The Nonviolent Communication tutor has 6 required expectations, 1 optional expectation, and 8 misconceptions. That means some problems are probably software/runtime issues, some are content/setup issues in the stimulus files, and some are interaction effects between content and software policy.

| Concern revealed | Evidence from email/current system/production data | Likelihood caused by practice-system content/setup rather than software | Does it seem true? Consider alternatives | Issue severity if true (1-10) | Proposed correction | Specific code/algorithm changes for severity > 3 | Should this correction be optional/configured for AutoTutor type? |
|---|---|---|---|---:|---|---|---|
| The domain/student/pedagogical model separation exists only within a single AutoTutor unit, not across the domain or long-term learner history. | Phil's draft says "first-pass, per-problem form." Current state is stored per AutoTutor history row for current unit; production rows use local expectation IDs like E1 and M1 inside CFNote. No cross-unit student model is evident. | Low for these two practice systems. This is mostly architecture scope. Content would matter later if multiple lessons reused stable KC IDs, but these two systems use local IDs only. | True, but this is more roadmap than defect for the first pilot. Alternative: Art may have been asking architecture rather than reporting a pain point. | 3 | Document the current scope honestly. Later, add a cross-unit student model only when multiple AutoTutor units share stable KC identifiers. | Not required under severity rule. Future design: persist expectation/KC coverage by stable domain identifiers rather than unit-local E1/E2 labels. | Yes eventually. Configure only after there is a domain-level KC registry. For now, keep it non-configured and document the limitation. |

## Production Trace Takeaways

1. Confidence interval: the production trace exposed a repair-resolution failure at the scorer/planner boundary. That specific issue has now been addressed by tracking repaired misconceptions, setting repaired misconception confidence to 0, excluding them from progress penalties, and preventing the planner from selecting them again unless the learner reintroduces the misconception.
2. NVC: the learner covered E1, E2, and E3 substantially and still had no completion after 15 turns. The content burden is real, but the first prompt problem is better understood as too little conversational invitation: it sounded like the learner needed to know the target answer rather than simply start talking.
3. Both traces show no `autotutor-complete` action. That does not prove the design is broken, but it does strengthen the case for clearer end-of-session synthesis when mastery is not reached.

## Highest Priority Corrections

1. Guarantee an end-of-session synthesis when a learner times out or gives up without mastery.

## Implementation Notes

- The fixes should preserve the current no-silent-fallback rule: if the scorer omits fields, invents IDs, or violates the selected plan, the system should fail clearly.
- Most proposed options belong under `autotutorsession` because they affect AutoTutor runtime policy, not ordinary MoFaCTS card behavior.
- The non-negotiable invariants should not be optional: learner-generated coverage must remain distinct from tutor assertions, and malformed model output must not be silently accepted.
