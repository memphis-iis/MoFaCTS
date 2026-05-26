# AutoTutor Dialogue Planner Plan

## Purpose

MoFaCTS currently supports AutoTutor-style expectation and misconception tutoring, but the runtime asks the language model to do four jobs at once:

1. score the learner response,
2. choose the next tutorial target,
3. choose the next dialogue move, and
4. phrase the tutor response.

This plan separates those jobs into a coherent dialogue-planning pipeline inspired by Graesser et al.'s AutoTutor architecture. The goal is not to recreate the original LSA implementation exactly. The goal is to preserve the paper's important control structure: turn dialogue history into explicit scores, use those scores to choose a target, use a policy to choose the dialogue move, and only then generate the tutor utterance.

## Current Behavior

The current runtime sends the authored script, latest learner answer, prior AutoTutor state, and recent dialogue history to OpenRouter. The model returns a JSON envelope containing:

- expectation states,
- misconception states,
- answer quality,
- whether the learner asked a question,
- a selected dialogue move, and
- a tutor message.

The app validates IDs and move names, stores the returned state, computes progress, and completes the session when the graduation rule is satisfied.

This gives us an AutoTutor-like interaction, but the controller is implicit. The model chooses the target, move, and wording in one step. Frontier learning, coherence, centrality, hint-prompt-assertion cycles, and correction overrides are not explicit app-owned control variables.

## Target Architecture

The revised runtime should use a four-stage pipeline:

1. **Scoring:** convert dialogue history and the latest learner answer into explicit expectation and misconception scores.
2. **Target selection:** choose the tutorial target: answer a learner question, correct a misconception, continue a focused expectation, or select a new expectation.
3. **Move selection:** choose a dialogue move from a deterministic policy using the target, scores, and dialogue state.
4. **Utterance generation:** ask the model to realize the selected move without changing the controller's decision.

The model may still provide semantic judgments, but the application should own the planner state and decision rules.

## Dialogue Move Inventory

The planner should distinguish the following move categories:

- `feedback`: brief evaluative response to the learner's latest contribution.
- `pump`: open invitation for more learner-generated content.
- `hint`: content-oriented cue for the focused expectation.
- `prompt`: fill-in or targeted question for a specific missing part of the focused expectation.
- `assertion`: tutor supplies missing expectation content after insufficient learner progress.
- `correction`: brief correction of an active misconception, followed by a repair question.
- `answer_question`: answer a learner question.
- `question_prompt`: ask whether the learner has questions.
- `final_answer_prompt`: ask the learner to restate the answer after coverage work.
- `summary`: recap the ideal answer at completion.

The current contract has `answer_question` but not `question_prompt` or `final_answer_prompt`. It also has `summary`, but summary is currently forced by completion rather than being a normal planner step.

## Scoring Layer

The scoring layer should produce explicit, persisted values. At minimum:

```ts
type AutoTutorExpectationScore = {
  current: boolean;
  coverage: number;
  evidence?: string;
  missing?: string[];
  frontier: number;
  coherence: number;
  centrality: number;
  priority: number;
};

type AutoTutorMisconceptionScore = {
  current: boolean;
  confidence: number;
  evidence?: string;
};
```

### Expectation Coverage

Coverage is the score for how well the learner has expressed an expectation. It replaces a hidden binary judgment with an explicit `0..1` value.

Planned scoring behavior:

- ask the model to score each expectation against the stored dialogue history and latest answer;
- require every authored expectation ID in the score response;
- require a brief evidence string;
- require missing elements when coverage is incomplete.

Possible future scoring backend:

- replace or supplement model scoring with embeddings;
- keep the same planner interface so the controller does not depend on a specific scoring method.

### Misconception Detection

Misconception detection should produce `current` plus `confidence`.

If one or more misconceptions are active above the configured threshold, correction should override normal expectation tutoring. This matches the paper's pattern: correct misconceptions as subdialogues, then return to expectation coverage.

### Frontier Score

Frontier learning asks which uncovered expectation is closest to what the learner is already trying to say.

For each uncovered expectation:

```ts
frontier = coverage
```

The best frontier target is the uncovered expectation with the highest partial coverage. A covered expectation is not eligible as a new target.

### Coherence Score

Coherence asks which uncovered expectation best continues the current thread.

The runtime should persist:

```ts
focusedExpectationId?: string;
lastCoveredExpectationId?: string;
```

For each uncovered expectation, compute similarity to the current focus if it remains active, otherwise to the last covered expectation. The scoring call can ask the model for `0..1` coherence scores. A future scoring backend can use embeddings over expectation propositions.

### Centrality Score

Centrality asks which uncovered expectation is most connected to the remaining uncovered expectations.

For each uncovered expectation:

```ts
centrality = averageSimilarity(expectation, otherUncoveredExpectations)
```

Centrality can be computed from authored expectation text before the session starts and updated when expectations become covered. It is most useful when learner input is thin and frontier scores are low.

### Priority Score

The planner should combine the three principles with configurable weights:

```ts
priority =
  frontierWeight * frontier +
  coherenceWeight * coherence +
  centralityWeight * centrality;
```

Default weights:

```ts
frontierWeight = 0.5;
coherenceWeight = 0.3;
centralityWeight = 0.2;
```

These can become authored or runtime-configurable after the planner is observable in real sessions. The planner should start with fixed defaults so existing packages do not need new fields.

## Planner State

Add first-class planner state:

```ts
type AutoTutorPlannerState = {
  focusedExpectationId?: string;
  lastCoveredExpectationId?: string;
  lastSelectedTargetId?: string;
  lastSelectedTargetType?: 'expectation' | 'misconception' | 'learner_question' | 'completion';
  focusTurnCount: number;
  moveCycleIndex: number;
  expectationScores: Record<string, AutoTutorExpectationScore>;
  misconceptionScores: Record<string, AutoTutorMisconceptionScore>;
};
```

Persist this inside the AutoTutor history note so resumed sessions use the same controller state rather than reconstructing it loosely from dialogue text.

## Target Selection Policy

Target selection should happen before move selection.

Recommended order:

1. If the learner asked a substantive question, target `learner_question`.
2. Else if any misconception is active above threshold, target the highest-confidence misconception.
3. Else if all required expectations are covered and no current misconception blocks completion, target `completion`.
4. Else if the current focused expectation is still uncovered and has not exhausted its cycle, continue that expectation.
5. Else select the uncovered required expectation with the highest priority score.

Correction should be a true override. It should not be merely one possible move competing with expectation tutoring.

## Move Selection Policy

Move selection should use the selected target and planner state.

### Learner Question

If target is `learner_question`:

- choose `answer_question`;
- answer briefly;
- return to the prior expectation focus on the next turn unless the answer also covers an expectation.

### Misconception

If target is a misconception:

- choose `correction`;
- use the authored correction and repair question;
- keep the prior expectation focus unless the misconception indicates the current focus should be changed.

### Completion

If target is `completion`:

- choose `final_answer_prompt` if the learner has not yet given a final integrated answer and the policy requires one;
- otherwise choose `summary`.

If the product decision is to continue summarizing immediately at completion, the planner should represent that as an explicit `summary` move rather than as hidden completion behavior.

### Expectation

For an expectation target, use a bounded hint-prompt-assertion cycle:

```text
hint -> prompt -> assertion -> hint -> prompt -> assertion
```

Exit the cycle early whenever the expectation becomes covered.

Recommended rules:

1. If the learner's latest answer has low useful content and this is the first turn, choose `pump`.
2. If coverage is high but below threshold and missing elements are specific, choose `prompt`.
3. If coverage is low or diffuse, choose `hint`.
4. If the learner has already received a hint for this expectation and is missing a narrow element, choose `prompt`.
5. If the learner has failed after hint and prompt, choose `assertion`.
6. After assertion, either give the learner another chance with a second hint-prompt-assertion cycle or move to the next expectation if the policy allows tutor-supplied assertion to count as coverage.

Important invariant: learner-generated coverage and tutor-supplied assertions are different. The paper treats learner articulation as central. If the tutor supplies an assertion, the system should record that the content was tutored, but it should not automatically treat the learner as having generated that expectation unless the next learner response demonstrates it.

## Utterance Generation Contract

After the planner chooses the target and move, the model should generate only the tutor utterance and any final score evidence requested by the app.

The prompt should include:

- the selected target type and ID;
- the selected dialogue move;
- the relevant authored expectation or misconception content;
- allowed hint, prompt, assertion, correction, or repair-question text;
- stored dialogue history needed to interpret the learner's latest answer;
- strict instruction not to change the selected move or target.

The model response should not be allowed to overwrite planner decisions. If the app asks for `selectedMove: "prompt"` on expectation `E3`, a response with a different move or target should fail validation.

## Contract Changes

The response contract should split scoring from generation.

One possible two-call design:

1. **Score call:** model returns expectation and misconception scores.
2. **Utterance call:** model receives the app-selected plan and returns tutor text only.

One possible one-call design:

1. model returns scores and an utterance;
2. app ignores any model-selected move;
3. app validates that the utterance is compatible with the app-selected move.

Prefer the two-call design for clarity. Prefer the one-call design only if latency or cost becomes the blocking constraint.

## Completion And Progress

Current progress is:

```ts
(currentExpectations - currentMisconceptions) / expectationCount
```

The planner should preserve a simple progress value for the UI, but completion should be based on required expectations and active misconceptions:

```ts
coveredExpectations = required expectations with coverage >= threshold;
activeMisconceptions = unrepaired misconceptions current above threshold;
completed =
  coveredExpectations >= graduation.requiredExpectationCount &&
  activeMisconceptions <= graduation.maxActiveMisconceptions;
```

The turn limit is separate from graduation and is read from `autotutorsession.maxTurns`. Initial scoring thresholds:

```ts
coverageThreshold = 0.8;
misconceptionThreshold = 0.65;
```

## Incremental Implementation Plan

An agent executing this plan should continue through the full implementation, verification, and documentation update unless it reaches a genuinely blocking question. A blocking question is one whose answer cannot be inferred from the existing code, authored AutoTutor contract, this plan, or local test behavior, and where making a conservative choice would risk changing the tutoring model in a way the author did not intend.

Do not stop after drafting a partial design, adding only types, or implementing only the scoring call. Work through the coherent planner path end to end: scoring, target selection, move selection, utterance generation, persistence/resume behavior, tests, and local verification.

### Step 1: Extend Types And Contract

- Add planner-state types.
- Add score types.
- Add move names `question_prompt` and `final_answer_prompt`, or explicitly defer them and document why.
- Preserve existing package compatibility.

### Step 2: Add Scoring Call

- Build a scoring prompt from the authored script, stored dialogue history, and the latest learner answer.
- Require coverage/confidence scores for every expectation and misconception.
- Validate all IDs and numeric ranges.
- Store scores in runtime state and history notes.

### Step 3: Implement Target Selection

- Add deterministic target selection with the override order:
  learner question, misconception, completion, current focus, weighted priority.
- Persist focus and last-covered expectation.
- Unit test target selection independently from model calls.

### Step 4: Implement Move Selection

- Add deterministic move selection for learner questions, misconceptions, completion, and expectation tutoring.
- Implement hint-prompt-assertion cycle state.
- Unit test move selection with hand-authored score fixtures.

### Step 5: Add Utterance Generation

- Generate tutor text from the selected plan.
- Validate that the returned response does not alter selected target or move.
- Keep messages concise and student-facing.

### Step 6: Migrate Existing AutoTutor Packages

- Ensure existing packages still run.
- Use authored `hints`, `prompts`, `assertion`, `correction`, `repairQuestion`, and `summary`.
- Derive any new planner state from existing authored content and saved history.

### Step 7: Verify With NVC And Confidence Interval Packages

- Run scripted manual tests against the confidence interval package.
- Run scripted manual tests against the NVC package.
- Confirm corrections override normal expectation tutoring.
- Confirm thin learner answers produce pumps or central expectations.
- Confirm partial learner answers produce frontier-aligned prompts.
- Confirm adjacent concepts produce coherent next expectation selection.
- Use the available MCP/dev test server whenever it helps observe the running AutoTutor behavior. The planner can be tested incrementally at any point; do not wait until every source edit is complete before checking whether the dialogue state, selected target, selected move, and visible tutor response are behaving coherently.
- For UI/runtime verification, prefer the repository hotfix dev loop and MCP inspection path documented in `AGENTS.md`. This is a behavior check, not a release-confidence substitute.

## Decisions

### Tutor Assertions Do Not Count As Learner Coverage

Tutor-supplied assertions should not automatically count toward completion. They should be tracked separately as tutored content.

Rationale: AutoTutor's learning theory depends on the learner generating explanatory content. If the tutor supplies an assertion and the app marks the expectation covered immediately, the planner can finish a session by telling rather than tutoring.

Implementation rule:

```ts
type AutoTutorExpectationScore = {
  current: boolean;
  coverage: number;
  evidence?: string;
  missing?: string[];
  tutoredByAssertion?: boolean;
  learnerRestatedAfterAssertion?: boolean;
  frontier: number;
  coherence: number;
  centrality: number;
  priority: number;
};
```

An expectation may be marked complete only when learner-generated text demonstrates coverage above threshold. If the tutor has asserted the content, the next learner response should be scored for whether the learner restated, applied, or acknowledged the asserted content in a substantively correct way.

### AutoTutor Operates From Authored Content

AutoTutor requires authored content. The planner cannot score, select targets, select moves, or decide completion without an authored script containing the prompt, ideal answer, expectations, misconceptions, tutoring resources, and summary.

Question answering should stay inside the authored AutoTutor script and dialogue context. The paper's AutoTutor had glossary and corpus modules, but MoFaCTS AutoTutor packages do not currently define authored glossary or corpus resources. Allowing broad model knowledge would blur the boundary between package-authored pedagogy and open-ended chat.

Implementation rule:

- If the learner asks a question answerable from the prompt, ideal answer, expectations, misconceptions, hints, prompts, assertions, corrections, repair questions, summary, or stored dialogue history, use `answer_question`.
- If the question is outside authored content, say the current tutor can only answer from the lesson content, then return to the active target.
- Do not add a silent external-knowledge path.

### Scoring Uses Stored Dialogue History With Role Boundaries

Scoring should use the stored dialogue history for the current AutoTutor unit. The scorer must distinguish learner-authored turns from tutor-authored turns.

Rationale: the paper's coverage logic considers everything the learner has expressed across the conversation, not only the latest turn. The stored history also contains tutor turns, which can be necessary to interpret short learner answers. For example, if the tutor asks, "What makes it a request rather than a demand?" and the learner says, "They can say no," the tutor turn supplies context. However, tutor turns must not be counted as learner knowledge.

Implementation rule:

- Include the stored dialogue history with speaker roles.
- Include the latest learner answer explicitly even if it is also appended to history later in the turn.
- Instruct the scorer that only learner-generated text may count as expectation coverage.
- Tutor turns may inform interpretation of learner answers but must not be treated as learner coverage.

If history grows too large, introduce an explicit role-preserving history summary that separates learner claims from tutor-provided content. This should be a deliberate summarization stage, not an implicit truncation.

### Use Two Model Calls

The planner should use two model calls:

1. scoring call,
2. utterance generation call.

Rationale: separating scoring from generation makes the planner inspectable, testable, and closer to the paper's architecture. It also prevents the utterance model from silently choosing a different target or move.

Implementation rule:

- The scoring call returns expectation scores, misconception scores, and learner-question classification.
- The app computes target selection and move selection.
- The utterance call receives the app-selected plan and returns tutor text only.
- If the utterance response attempts to change the move or target, validation fails.

Latency and cost can be optimized later after the controller is correct.

### Default Thresholds Are Global, With Authored Overrides Later

Use global defaults:

```ts
coverageThreshold = 0.8;
misconceptionThreshold = 0.65;
frontierWeight = 0.5;
coherenceWeight = 0.3;
centralityWeight = 0.2;
```

Rationale: defaults let existing packages run without schema changes. Authored thresholds and weights may be valuable, but they should be added only after the planner behavior is observable in real packages.

Implementation rule:

- Keep defaults in client AutoTutor planner code.
- Do not add new required TDF fields.
- When package-level overrides are added later, validate them strictly and fail clearly on invalid values.

## Deferred Questions

These are deliberately deferred until after the planner is testable:

1. Should package authors be able to specify per-expectation coverage thresholds?
2. Should package authors be able to define prerequisite links between expectations?
3. Should AutoTutor packages support authored glossary/corpus resources for question answering?
4. Should embedding-based scoring replace or audit model-based scoring?

## Non-Goals

- Recreating LSA exactly.
- Building a full symbolic dialogue planner.
- Adding corpus or glossary question-answering before those resources are explicitly authored in the package format.
- Making server methods for pure compute.
- Changing existing non-AutoTutor unit behavior.

## Core Invariants

### Execution Persistence

When this plan is used as an implementation brief, the agent should keep working until the entire coherent planner path is implemented and verified, or until it hits a blocking question as defined in the implementation plan. Non-blocking uncertainty should be resolved by reading the code, inspecting authored packages, running targeted tests, and observing behavior through the MCP/dev server.

### Planner Ownership

The app owns target selection and move selection. The model may score semantic coverage and phrase tutor text, but it must not silently override the selected target or selected move.

Validation rule: generated tutor responses must be tied to the app-selected `targetType`, `targetId`, and `selectedMove`. A mismatch is a hard error.

### No Silent Fallbacks

Planner failures must fail clearly. The runtime must not silently drop into the old all-in-one model controller, skip scoring, ignore invalid planner state, or continue with a guessed target.

Validation rule: missing scores, unknown IDs, invalid numeric ranges, impossible cycle state, or incompatible target/move pairs stop the turn with a clear configuration or service error.

### Correction Override

Active misconceptions override normal expectation tutoring.

Validation rule: when a misconception score exceeds the misconception threshold, the selected target is the highest-priority active misconception unless the learner asked a direct procedural question that must be answered first.

### Learner Coverage Is Distinct From Tutor Content

Only learner-generated text can establish expectation coverage for completion. Tutor assertions, hints, prompts, summaries, and corrections can be stored as tutoring events but cannot by themselves satisfy learner coverage.

Validation rule: the scorer prompt and score schema must distinguish learner evidence from tutor-provided content.

### Existing Package Compatibility

Existing AutoTutor packages remain valid unless a deliberate migration is planned.

Validation rule: new planner fields must be derived from existing content or saved planner state. Existing `expectations`, `misconceptions`, `dialogPolicy.requiredExpectations`, `hints`, `prompts`, `assertion`, `correction`, `repairQuestion`, and `summary` remain the primary authored contract.

### Deterministic Target And Move Decisions

Given the same prior state and validated score payload, target selection and move selection should produce the same plan.

Validation rule: model randomness may affect scoring and wording, but not the deterministic planner decision after scores are accepted.

### Bounded Expectation Cycles

Expectation tutoring must use bounded cycles. The planner may not loop indefinitely on the same expectation.

Validation rule: each focused expectation has a finite hint-prompt-assertion cycle count. After the configured cycle budget, the planner either requires learner restatement after assertion, selects a different expectation, or reaches max turns.

### Authored Content Boundary

AutoTutor must stay inside authored AutoTutor content for question answering and tutoring claims.

Validation rule: the utterance prompt must instruct the model to use only provided lesson content and stored dialogue context. Out-of-scope learner questions receive a clear limitation message and the planner returns to the selected tutorial path.
