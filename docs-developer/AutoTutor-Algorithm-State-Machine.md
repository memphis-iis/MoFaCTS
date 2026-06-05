# MoFaCTS AutoTutor Algorithm State Machine

This document describes the AutoTutor implementation in the MoFaCTS app repo. AutoTutor has two explicit state machines:

- Operational state machine: runtime orchestration phases for a learner turn.
- Pedagogical state machine: the app-selected dialogue target and move.

The LLM scores learner text and verbalizes the selected tutor response. The app owns target selection, target ID selection, move selection, end-state decisions, saved state, and history writes.

## Code Map

| Concern | Code |
| --- | --- |
| Operational phase, pedagogical state, transition records, turn context/result types | `learning-components/units/autotutor/AutoTutorStateMachine.ts` |
| Deterministic target and move planning | `learning-components/units/autotutor/AutoTutorPlanner.ts` |
| Runtime config and authored script interpretation | `learning-components/units/autotutor/AutoTutorRuntimeConfig.ts` |
| Completion flags and history action mapping | `learning-components/units/autotutor/AutoTutorEndState.ts` |
| Saved note parsing and saved state validation | `learning-components/units/autotutor/AutoTutorSavedHistory.ts`, `AutoTutorSavedState.ts` |
| Runtime capability boundary | `learning-components/units/autotutor/AutoTutorRuntimeCapabilities.ts` |
| Unit-engine registration and reusable state-machine entry points | `learning-components/units/autotutor/AutoTutorUnitEngine.ts` |
| Meteor/Svelte wiring, OpenRouter prompts, and canonical history envelope construction | `mofacts/client/views/experiment/svelte/services/autoTutorClient.ts` |
| JSON envelope parsing and validation | `mofacts/common/lib/autoTutorContract.ts` |

## Operational State Table

| Phase | Meaning | Entered by |
| --- | --- | --- |
| `initializing` | Runtime state is being created from authored script defaults. | `createInitialAutoTutorState` before first transition. |
| `awaiting_learner` | Runtime is ready for learner input. | Initialization, or publishing an in-progress turn. |
| `scoring_learner` | The app has accepted nonblank learner input and is calling the scoring LLM. | `transitionAutoTutorOperationalPhase` before scoring. |
| `planning_next_move` | Strict score envelope has been accepted; deterministic state update and planning are running. | `scoreAndPlanAutoTutorTurn`. |
| `generating_tutor_response` | The app-selected plan is fixed; the utterance LLM may only verbalize it. | `scoreAndPlanAutoTutorTurn`. |
| `writing_history` | Tutor message has been generated and the canonical history record is being written. | `addAutoTutorUtteranceToTurn`. |
| `publishing_state` | History write has completed and the app is publishing state to the UI. | `markAutoTutorHistoryWritten`. |
| `completed_mastery` | Session completed by mastery. | `markAutoTutorStatePublished` after `endReason: "mastery"`. |
| `completed_max_turns` | Session completed by the authored max-turn limit. | `markAutoTutorStatePublished` after `endReason: "max_turns"`. |
| `completed_cost_cap` | Session completed by cost cap. | `applyAutoTutorCostCap` when used. |
| `errored` | Accepted learner turn failed during scoring, planning, utterance generation, or history writing. | `submitStudentAnswer` publishes this phase before rethrowing the error to the Svelte shell. |

Every phase change is recorded as an `AutoTutorTransition` with `from`, `to`, `reason`, and `at`.

## Pedagogical State Table

| State | Fields | Meaning |
| --- | --- | --- |
| `expectation` | `targetId`, `selectedMove`, `focusTurnCount`, `moveCycleIndex` | The tutor is working on an authored expectation. Moves are `pump`, `hint`, `prompt`, or `assertion`. |
| `misconception` | `targetId`, `selectedMove: "correction"`, `correctionStage` | The tutor is repairing an active misconception. Stages cycle `hint -> prompt -> assertion`. |
| `learner_question` | `selectedMove: "answer_question"`, `questionScope`, `answerableFromAuthoredContent` | The learner asked a substantive question. `questionScope` is `in_scope` or `out_of_scope` based on scorer metadata. |
| `completion` | `selectedMove`, `completionStage` | Required expectations are covered. Stages distinguish `ready_for_final_answer`, `requesting_final_answer`, `summarizing`, and `mastered`. |

The pedagogical state is derived from the deterministic `AutoTutorPlan`; the utterance LLM must echo the selected `targetType`, `targetId`, and `selectedMove` exactly and must not change them.

## Transition Rules

| Condition | Transition |
| --- | --- |
| Blank learner input | Rejected before `scoring_learner`. |
| Completed session receives input | Rejected before `scoring_learner`. |
| Learner asks a substantive question | Pedagogical state becomes `learner_question`; move is `answer_question`. |
| Learner question is outside authored content | `questionScope: "out_of_scope"` is stored; utterance prompt still enforces the authored-content boundary. |
| Active unrepaired misconception above threshold and learner contribution is not low-agency | Pedagogical state becomes `misconception`; move is `correction`; correction stage advances. |
| Latest score repairs a misconception | Repaired state is preserved with `current: false` and `confidence: 0` unless the learner reintroduces it. |
| Required expectations are not covered | Planner selects or continues an `expectation` target. |
| First low-quality answer on a new expectation focus | Move is `pump`. |
| Repeated `idk` or help request | Moves escalate `hint -> prompt -> assertion`. |
| Near-threshold expectation coverage | Move is `prompt`. |
| Normal expectation tutoring | Moves cycle `hint -> prompt -> assertion`; tutor assertions do not count as learner coverage. |
| Required expectations are covered and final-answer prompt is not required | Pedagogical state becomes `completion`; move is `summary`; mastery can be applied. |
| Required expectations are covered and final-answer prompt is required | First completion move is `final_answer_prompt`; the next completion move is `summary`; mastery waits for summary. |
| Graduation met after final-answer gate | End reason becomes `mastery`. |
| Turn count reaches authored `maxTurns` before mastery | End reason becomes `max_turns`. |
| Runtime cost cap is reached | End reason becomes `cost_cap`; the current cap is `AUTO_TUTOR_COST_CAP_USD`. |

## Safety Invariants

- The app-selected target, target ID, move, and correction stage are deterministic application state.
- The utterance LLM may not change `targetType`, `targetId`, or `selectedMove`; strict envelope validation rejects changes.
- JSON envelope parsing remains strict for scoring and utterance responses.
- Internal expectation and misconception IDs must not appear in tutor messages.
- Tutor turns do not count as learner knowledge for expectation coverage.
- Misconception repair and post-assertion learner restatement remain scorer decisions, then the app applies deterministic preservation rules.
- Covered expectations are frozen out of later score scopes and carried forward by the app.
- History writing and saved-state resume validate script ID, end-state flags, score IDs, operational state, pedagogical state, and transition shape.
- Saved-state resume does not infer missing operational or pedagogical fields; missing explicit state fails clearly.

## Test Coverage

State-machine coverage lives in `mofacts/common/autoTutorStateMachine.test.ts`. Planner-specific deterministic coverage remains in `mofacts/common/lib/autoTutorPlanner.test.ts`. Saved history and saved state validation coverage remains in `mofacts/common/autoTutorSavedHistory.test.ts` and `mofacts/common/autoTutorSavedState.test.ts`.
