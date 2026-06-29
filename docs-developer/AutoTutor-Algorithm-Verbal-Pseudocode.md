# MoFaCTS AutoTutor Algorithm as Verbal Pseudocode

This document explains the AutoTutor control loop for a technically literate reader. It is grounded in the current implementation surfaces:

- `learning-components/units/autotutor/AutoTutorStateMachine.ts`
- `learning-components/units/autotutor/AutoTutorPlanner.ts`
- `learning-components/units/autotutor/AutoTutorRuntimeConfig.ts`
- `mofacts/client/views/experiment/svelte/services/autoTutorClient.ts`
- `mofacts/common/lib/autoTutorContract.ts`
- `docs-developer/AutoTutor-Algorithm-State-Machine.md`

The short version: the scorer LLM returns semantic scores and classifications; the application computes expectation priority, target selection, move selection, completion, saved state, and history deterministically; the utterance LLM receives the already selected target and move and is allowed to phrase the tutor response, not choose the pedagogical decision.

## Explicit Parameters

The current hard-coded planner defaults are:

- Coverage threshold: `0.8`. An expectation is treated as covered when `coverage >= 0.8`.
- Misconception threshold: `0.65`. A misconception is eligible for correction when `current === true`, `repaired !== true`, and `confidence >= 0.65`. pp overloaded current is opposit of repaired
- Focus budget: `6` turns. A focused expectation can normally be continued while `focusTurnCount < 6`; low-agency learner contributions can keep the tutor on the same focus even after that. pp evaluate the exact function
- Priority weights: `frontierWeight = 0.5`, `coherenceWeight = 0.3`, and `centralityWeight = 0.2`.
- Near-threshold prompt rule: an expectation gets a prompt when `coverage >= 0.8 * 0.75`, meaning `coverage >= 0.6`, and `coverage < 0.8`.
- Cost cap: `$0.20`. A session stops for cost when accumulated `costUsd >= 0.20`.
- Default utterance temperature: `0.45` unless `autotutorsession.utteranceTemperature` supplies another valid value.

## pp near threshold prompt rule (also cycling below)

The authored unit also supplies parameters that vary by lesson:

- `autotutorsession.maxTurns`: the maximum turn count before `endReason: "max_turns"`.
- `autotutorsession.graduation.requiredExpectationCount`: how many required expectations must count as covered for graduation.
- `autotutorsession.graduation.maxActiveMisconceptions`: how many active misconceptions are allowed at graduation.
- `autotutorsession.requireFinalAnswerPrompt`: whether completion first asks for a final answer before summary.
- `autoTutor.dialogPolicy.requiredExpectations`: the expectation IDs that count toward required coverage.

## First Thing Shown

AutoTutor begins from authored content, not from an AI-generated tutor turn. `readAutoTutorConfigWithOptions(...)` reads the current TDF unit's `autotutorsession`, locates the configured stimulus cluster, and takes the first stimulus's `display.text` as `config.prompt`. That prompt is the learner-facing opening question or task.

`createInitialAutoTutorState(script)` then creates state from the authored AutoTutor script. Before the learner has answered, the state has:

- `operationalPhase: "awaiting_learner"` after an initialization transition.
- Pedagogical state with `targetType: "expectation"`, no `targetId`, no selected move, `focusTurnCount: 0`, and `moveCycleIndex: 0`.
- One expectation score per authored expectation, each with `coverage: 0`, `current: false`, and priority fields at zero.
- One misconception score per authored misconception, each with `confidence: 0` and `current: false`.
- Empty dialogue, `answerQuality: "none"`, no learner contribution classification, `turnCount: 0`, `costUsd: 0`, and `endReason: "in_progress"`.

Later tutor utterances are different. They are produced only after a learner answer has been scored and the app has already selected the target and move.

## Model Passed Back And Forth

The authored model comes from the AutoTutor script and session config:

- The opening prompt from the stimulus display text.
- The script ID, topic, learning goal, ideal answer, and summary.
- Expectations, with IDs, labels, propositions, acceptable variants, common partial answers, hints, prompts, and assertions.
- Misconceptions, with IDs, labels, misconception text, detection cues, expectation contrasts, corrections, repair questions, repair criteria, and acceptable repair answers.
- A dialog policy, especially `requiredExpectations`.
- Graduation settings: required expectation count and max active misconceptions.
- Turn limit and final-answer prompt policy.
- An expectation relationship graph, either authored or generated and persisted, with 0..1 relationship scores between expectation IDs.

The runtime model is the evolving AutoTutor state:

- Operational phase, transition log, and pedagogical state.
- Planner state: focused expectation, focused misconception, last covered expectation, last selected target, focus-turn count, move-cycle index, misconception-cycle index, contribution streak, expectation scores, and misconception scores. pp student state and planner state seperation pp key to generalize
- Expectation scores: current, coverage, evidence, missing pieces, post-assertion flags, frontier, coherence, centrality, and priority.
- Misconception scores: current, confidence, evidence, repaired flag, and repair evidence.
- Learner contribution classification, learner-question classification, answer quality, selected move, turn count, accumulated cost, progress, completion flags, and end reason.
- Dialogue history as student/tutor turns.

pp need to genralize to firetutor

History is canonical state, not loose transcript reconstruction. Each turn writes a compressed history record whose note includes the AutoTutor script ID, the resumable state summary, progress, completion flags, end reason, cost-stop flag, and tutor message. On resume, `applySavedAutoTutorHistory(...)` rebuilds the visible dialogue from the saved rows, reads the latest AutoTutor note, verifies the saved `scriptId`, validates the end-state flags, validates the saved operational and pedagogical state, and restores the exact planner scores and counters. Missing or contradictory saved state fails clearly instead of being inferred from text.

pp needs to treat expectations as clusters 

## AI Decisions Versus App Decisions

AutoTutor uses two LLM calls per normal learner turn.

The scoring call is semantic interpretation. The LLM receives the authored script, scoreable expectation IDs, misconception rubric, current planner state, and dialogue context. It returns strict JSON with expectation coverage, misconception state, answer quality, learner contribution type, and learner-question metadata. It is explicitly told not to choose the dialogue target, choose the dialogue move, or write the tutor response.

The application then validates the score envelope, validates IDs, applies explicit state-update rules to expectation and misconception scores, pp and what are these? recomputes priority values, selects a target, selects a move, updates turn counters and end state, and records the selected pedagogical state.

The utterance call is realization. The LLM receives the selected plan, selected pedagogical state, relevant target content, scored planner state, learner contribution metadata, and dialogue history. It must return strict JSON containing `targetType`, `targetId`, `selectedMove`, and `tutorMessage`. Validation rejects the response if the utterance model changes the target type, target ID, or selected move. The utterance model also may not expose internal expectation or misconception IDs in the tutor message.

So quantitative values are not passed whole cloth to the AI for it to make the next pedagogical decision. The scorer supplies semantic scores and classifications. The hard-coded harness validates and interprets those values first, computes planner priority, chooses the target and move, and only then asks the utterance model to phrase the already selected response.

## Planner Criterion

Each turn starts with input validation. Blank input and input after a completed session are rejected before scoring.

The app then determines which expectations are scoreable. Expectations already covered at `coverage >= 0.8` are frozen out of the scoring prompt. The scorer must include exactly the currently scoreable expectation IDs; frozen expectations are omitted from the score response and carried forward by the app unchanged.

For scoreable expectations, the app does not perform a mathematical merge operation. It applies this replacement-or-preserve rule per expectation ID:

1. If the expectation is frozen because its prior `coverage >= 0.8`, keep the previous score object exactly.
2. If the scorer omitted a scoreable expectation ID, fail validation.
3. If the new `coverage` is greater than or equal to the previous `coverage`, replace the previous score with the new score.
4. If the new `coverage` is lower than the previous `coverage`, keep the previous score and only preserve non-regressive metadata: `current` becomes `previous.current || new.current`, and `evidence` or `missing` is kept from the previous score when present, otherwise from the new score.

That rule is what the code calls `mergeScoreableExpectationScores(...)`. It is really a durable coverage update: learner-demonstrated coverage cannot regress across later turns.

Misconceptions are also updated through explicit deterministic rules:

1. If the scorer says `repaired: true`, store `current: false`, `confidence: 0`, and `repaired: true`.
2. If the scorer says `current: true` but `confidence < 0.65`, also clear it as repaired: `current: false`, `confidence: 0`, `repaired: true`.
3. If the scorer says `current: true` and `confidence >= 0.65`, store it as active and unrepaired: `repaired: false`.
4. If the scorer does not mark it current and the previous score was already repaired, preserve the repaired state with `current: false` and `confidence: 0`.
5. Otherwise, keep the new scorer result.

After these expectation and misconception score updates, the planner recomputes expectation priority from the current relationship anchor. The anchor is `focusedExpectationId` if one exists, otherwise `lastCoveredExpectationId`. In this section, "uncovered" means `coverage < 0.8`. The planner then selects a target in this order:

1. If the learner contribution is a substantive question and `learnerQuestion.current` is true, target `learner_question`.
2. Else, if there is an active unrepaired misconception with `confidence >= 0.65`, target the highest-confidence misconception, unless the learner contribution is low-agency.
3. Else, if all required expectations have `coverage >= 0.8`, target `completion`.
pp huh 4. Else, if the current focused expectation is still required, still has `coverage < 0.8`, and `focusTurnCount < 6`, continue that expectation. Low-agency contributions can keep the tutor on the current focus even after the usual focus budget.
5. Else, choose the uncovered required expectation with the highest priority. If possible, do not immediately reselect the just-abandoned focus.

Move selection then follows the selected target. For expectation targets, the current code does not choose hint, prompt, or assertion from a general score band table for the targeted expectation. The target expectation's score matters for three narrower decisions: whether the expectation is already covered (`coverage >= 0.8`), whether it is near enough to coverage to force a prompt (`0.6 <= coverage < 0.8`), and how it contributes to priority before the target is selected.

- Learner question: `answer_question`.
- Misconception: `correction`, with correction stage cycling `hint -> prompt -> assertion`.
- Completion: `summary`, or `final_answer_prompt` first and `summary` next when `requireFinalAnswerPrompt` is enabled.
- Expectation: `pump`, `hint`, `prompt`, or `assertion` according to contribution type, contribution streak, answer quality on the first focus turn, the near-threshold prompt exception, and the move-cycle counter.

For expectation moves, repeated `idk` or help requests escalate from hint to prompt to assertion: first same-type low-agency contribution gets `hint`, second gets `prompt`, third and later get `assertion`. `uncertainty`, `affect`, `meta`, or `off_task` contributions get `hint`. A low-quality answer on the first turn of a new focus gets `pump`. Near-threshold coverage means `coverage >= 0.6` and `coverage < 0.8`; that gets `prompt`. Otherwise, expectation tutoring cycles through `hint`, `prompt`, and `assertion` using `moveCycleIndex`, with the first focus turn starting at cycle index `0` and therefore `hint`. Assertions are marked in planner state, but tutor assertions themselves do not count as learner coverage; the learner must later restate or apply the idea.

The expectation move branch is short-circuiting. The first matching row wins:

| Order | Condition | Move |
| --- | --- | --- |
| 1 | `learnerContribution.type` is `idk` or `help_request`, and the same-type streak is `1` | `hint` |
| 2 | `learnerContribution.type` is `idk` or `help_request`, and the same-type streak is `2` | `prompt` |
| 3 | `learnerContribution.type` is `idk` or `help_request`, and the same-type streak is `>= 3` | `assertion` |
| 4 | `learnerContribution.type` is `uncertainty`, `affect`, `meta`, or `off_task` | `hint` |
| 5 | `answerQuality === "low"` and this is the first turn on this expectation focus | `pump` |
| 6 | Target expectation has `coverage >= 0.6` and `coverage < 0.8` | `prompt` |
| 7 | None of the above matched | `EXPECTATION_CYCLE[moveCycleIndex % 3]`, where the cycle is `hint`, `prompt`, `assertion` |

This means a low-agency contribution overrides the target expectation score for move choice. For example, if the target expectation has `coverage: 0.7` but the learner says "I don't know" for the first time, the move is `hint`, not the near-threshold `prompt`. The near-threshold prompt only applies after the contribution-type and first-focus low-quality checks do not match.

## Priority Score

Coverage is the scorer's `0..1` estimate of how much learner-generated evidence supports an authored expectation. Tutor text can provide context for interpreting a short learner answer, but tutor hints, prompts, assertions, summaries, and corrections are not themselves learner knowledge. `coverage >= 0.8` means the expectation is covered and will be frozen out of future scoring prompts.

The current implementation computes these values in `recomputeExpectationPriorities(...)`:

- `relationshipAnchorId = focusedExpectationId || lastCoveredExpectationId`.
- `coherence = relationship(anchor, candidate)` when there is an anchor, otherwise `0`.
- `frontier = (1 - coverage) * coherence` when there is an anchor, otherwise `0`.
- `centrality = average relationship(candidate, every other authored expectation)`.
- `priority = 0.5 * frontier + 0.3 * coherence + 0.2 * centrality` by default.

The intuition is that the planner prefers an uncovered required expectation that is related to the current or recently covered thread, still has room to learn, and is central to the authored expectation graph. `frontier` rewards nearby material with remaining learning potential. `coherence` rewards staying conceptually connected to the current thread. `centrality` gives a small boost to expectations that connect broadly to the rest of the lesson.

If there is no anchor yet, `frontier` and `coherence` are zero, so early priority comes mainly from centrality. Once the learner has a focus or a covered expectation, the graph starts shaping the next target more strongly.

## End-To-End Loop

```text
initialize runtime:
  read authored AutoTutor config from current TDF unit and stimulus cluster
  ensure expectation relationship graph exists
  validate graduation settings against the script
  create initial state from authored script
  apply saved AutoTutor history, if present, by validating and restoring saved state
  publish awaiting_learner state and show authored opening prompt

on learner submit:
  cleanedAnswer = validate nonblank input and not-completed state
  transition to scoring_learner

  scoreableExpectationIds = uncovered expectations only
  scoringEnvelope = scoring LLM strict JSON:
    expectationScores for scoreable IDs
    misconceptionScores
    answerQuality
    learnerContribution
    learnerQuestion

  parse and validate scoringEnvelope:
    require valid JSON object
    require IDs match scoreable expectations and authored misconceptions
    require score ranges 0..1
    reject unknown or missing IDs

  transition to planning_next_move
  update expectation scores by ID:
    if previous coverage >= 0.8:
      carry previous score forward unchanged
    else if scorer omitted this scoreable ID:
      fail validation
    else if new coverage >= previous coverage:
      replace previous score with new score
    else:
      keep previous coverage and preserve only non-regressive metadata

  update misconception scores by ID:
    if repaired is true:
      current = false, confidence = 0, repaired = true
    else if current is true and confidence < 0.65:
      current = false, confidence = 0, repaired = true
    else if current is true and confidence >= 0.65:
      repaired = false
    else if previous repaired is true:
      keep current = false, confidence = 0, repaired = true
    else:
      use new scorer result

  relationshipAnchorId = focusedExpectationId or lastCoveredExpectationId
  recompute frontier, coherence, centrality, priority

  target = choose:
    learner question
    else active misconception with confidence >= 0.65 unless low-agency contribution suppresses override
    else completion if required expectations have coverage >= 0.8
    else current focused expectation if coverage < 0.8 and focusTurnCount < 6
    else highest-priority uncovered required expectation

  move = choose from target:
    learner_question -> answer_question
    misconception -> correction
    completion -> final_answer_prompt or summary
    expectation:
      if learnerContribution.type is idk or help_request:
        same-type streak 1 -> hint
        same-type streak 2 -> prompt
        same-type streak >= 3 -> assertion
      else if learnerContribution.type is uncertainty, affect, meta, or off_task:
        hint
      else if answerQuality is low and this is the first focus turn:
        pump
      else if target coverage >= 0.6 and target coverage < 0.8:
        prompt
      else:
        EXPECTATION_CYCLE[moveCycleIndex % 3], where EXPECTATION_CYCLE = hint, prompt, assertion

  update planner state, pedagogical state, turn count, cost, and student dialogue
  apply mastery or max-turn end state if appropriate
  transition to generating_tutor_response

  utteranceEnvelope = utterance LLM strict JSON:
    targetType, targetId, selectedMove, tutorMessage

  validate utteranceEnvelope:
    targetType must equal selected target type
    targetId must equal selected target ID
    selectedMove must equal selected move
    tutorMessage must be nonblank and must not expose internal IDs

  add tutor message to dialogue
  apply cost-cap end state if needed
  transition to writing_history
  write canonical history with resumable AutoTutor state
  transition to publishing_state
  publish state:
    awaiting_learner, completed_mastery, completed_max_turns, or completed_cost_cap

repeat until:
  mastery
  max turns
  cost cap
  or error
```

If an error occurs during scoring, planning, utterance generation, or history writing, the runtime marks the state `errored`, publishes that state, and rethrows the error to the Svelte shell.

## Control Boundary

The algorithm is deliberately split so the LLM is useful where natural language understanding and phrasing are needed, while the application keeps ownership of pedagogical control:

- AI scores learner semantics.
- The app validates the score shape and IDs.
- The app freezes covered expectations and prevents coverage regression.
- The app computes priority.
- The app chooses the target and selected move.
- AI phrases the chosen move.
- The app validates that phrasing did not mutate the plan.
- The app writes resumable canonical history and publishes the new state.

That boundary is the main invariant: semantic scoring and natural-language realization are model-assisted, but the pedagogical state machine is application-owned.
