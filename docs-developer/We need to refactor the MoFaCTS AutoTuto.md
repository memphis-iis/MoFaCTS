We need to refactor the MoFaCTS AutoTutor implementation so that the AutoTutor state machine earns an “A” for planner clarity, runtime orchestration, maintainability, augmentability, and conceptual clarity.

Repository: `memphis-iis/MoFaCTS`

Relevant current files include, but are not limited to:

* `learning-components/units/autotutor/AutoTutorPlanner.ts`
* `learning-components/units/autotutor/AutoTutorUnitEngine.ts`
* `learning-components/units/autotutor/AutoTutorRuntimeConfig.ts`
* `learning-components/units/autotutor/AutoTutorEndState.ts`
* `learning-components/units/autotutor/AutoTutorSavedState.ts`
* `learning-components/units/autotutor/AutoTutorSavedHistory.ts`
* `learning-components/units/autotutor/AutoTutorRuntimeCapabilities.ts`
* `mofacts/common/lib/autoTutorContract.ts`
* `mofacts/client/views/experiment/svelte/services/autoTutorClient.ts`
* `docs-developer/AutoTutor-Algorithm-State-Machine.md`

Current diagnosis:

The planner already has good structure: typed targets, typed moves, expectation and misconception scores, expectation cycling, misconception correction cycling, learner-question routing, and completion routing. However, the full runtime state machine is still too procedural. The main orchestration is embedded in `submitStudentAnswer` in `autoTutorClient.ts`. The system has an implicit operational state machine, but not a first-class explicit one. The AutoTutor unit engine file is also mostly a stub, while much of the real behavior remains in app-owned client code.

Goal:

Make the AutoTutor architecture explicitly state-machine-based, maintainable, testable, and easy to augment without changing behavior unless the existing behavior is clearly buggy.

Refactor objectives:

1. Separate two state machines explicitly:

   A. Operational state machine:

   * `initializing`
   * `awaiting_learner`
   * `scoring_learner`
   * `planning_next_move`
   * `generating_tutor_response`
   * `writing_history`
   * `publishing_state`
   * `completed_mastery`
   * `completed_max_turns`
   * `completed_cost_cap`
   * `errored` if appropriate

   B. Pedagogical/dialogue state machine:

   * expectation target with moves such as `pump`, `hint`, `prompt`, `assertion`
   * misconception target with correction stages `hint`, `prompt`, `assertion`
   * learner question target, preferably distinguishing in-scope vs out-of-scope if already supported by scorer metadata
   * completion target with `summary`

2. Introduce explicit types for the operational phase and pedagogical state. Suggested names:

   * `AutoTutorOperationalPhase`
   * `AutoTutorPedagogicalState`
   * `AutoTutorTransition`
   * `AutoTutorTurnContext`
   * `AutoTutorTurnResult`

3. Preserve the existing deterministic planner behavior where possible:

   * learner question takes priority over misconception
   * active misconception above threshold routes to correction unless the learner contribution is low-agency
   * completion target occurs when required expectations are covered
   * expectation focus continues while uncovered and within focus-turn rules
   * expectation cycle remains `hint -> prompt -> assertion`
   * misconception correction cycle remains `hint -> prompt -> assertion`
   * repeated `idk` / help request escalation remains `hint -> prompt -> assertion`
   * completion selects `summary` directly

4. Make learner-question handling clearer:

   * The scorer already returns `learnerQuestion.answerableFromAuthoredContent`.
   * Do not leave this only as prompt-level behavior if it can be represented cleanly in the pedagogical state.
   * Add explicit state or metadata for in-scope vs out-of-scope learner questions.
   * Ensure the utterance prompt still enforces the authored-content boundary.

5. Make completion handling clearer:

   * Consolidate or clarify the relationship among planner completion target, graduation rules, and end-state flags.
   * Make it easy to understand when the system is summarizing and when it is completed/mastered.

6. Move reusable AutoTutor runtime/state-machine logic toward `learning-components/units/autotutor/`.

   * `AutoTutorUnitEngine.ts` is currently too stub-like.
   * Do not break Meteor/Svelte app wiring, but separate app-specific capabilities from reusable AutoTutor state-machine logic.
   * Keep Meteor Session, OpenRouter, and history persistence behind capabilities where possible.

7. Reduce the size and responsibility of `autoTutorClient.ts`.

   * It should wire capabilities, call the reusable runtime/state-machine functions, publish state, and integrate with the Svelte/Meteor shell.
   * It should not be the main home of the conceptual state machine.

8. Add tests that prove the state machine behavior:

   * initialization creates expected operational and pedagogical defaults
   * blank input is rejected
   * completed sessions reject new input
   * learner question routes to learner-question state and answer-question move
   * out-of-scope learner question is represented explicitly if supported
   * active misconception routes to correction
   * misconception correction advances hint -> prompt -> assertion
   * repaired misconception stays repaired unless reintroduced
   * expectation tutoring advances hint -> prompt -> assertion
   * repeated `idk` / help request escalates hint -> prompt -> assertion
   * low answer quality on first focus turn gives pump
   * near-threshold coverage gives prompt
   * completion routes to summary
   * mastery, max-turns, and cost-cap termination are distinct and testable
   * saved history resume restores operational and pedagogical state correctly

9. Update documentation:

   * Revise `docs-developer/AutoTutor-Algorithm-State-Machine.md`
   * Include a concise state table for operational phases.
   * Include a concise state table for pedagogical states.
   * Include transition rules.
   * Include where each state is represented in code.
   * Include a note explaining that the LLM scores and verbalizes, but the app owns target/move planning.

10. Preserve safety and reliability constraints:

* The utterance LLM must not be allowed to change the app-selected target, target ID, or move.
* JSON envelope parsing and validation must remain strict.
* Internal expectation/misconception IDs must not leak in tutor messages.
* Tutor turns must not count as learner knowledge for expectation coverage.
* Misconception repair and post-assertion learner restatement must remain first-class scoring decisions.
* Cost tracking and history writing must remain intact.

Definition of done:

* The operational state machine is explicit in code, not just implied by procedural flow.
* The pedagogical/dialogue state machine is explicit in code, not just implied by target and move strings.
* `AutoTutorPlanner.ts` remains deterministic and testable.
* Runtime orchestration is easier to follow than the current `submitStudentAnswer` flow.
* `AutoTutorUnitEngine.ts` or adjacent reusable files contain meaningful AutoTutor runtime/state-machine logic.
* App-specific code is clearly separated from reusable AutoTutor logic.
* Tests cover the major state transitions.
* Documentation matches the implementation.
* Existing behavior is preserved except where explicitly improved and tested.
* The result should be worthy of these grades:

  * Planner state machine: A
  * Runtime orchestration state machine: A
  * Overall maintainability: A
  * Augmentability: A
  * Conceptual clarity: A

Before editing, inspect the relevant files and produce a brief implementation plan. Then implement incrementally, run the relevant tests/typecheck/lint, and summarize exactly what changed and why.
