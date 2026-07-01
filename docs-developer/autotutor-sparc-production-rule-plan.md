# AutoTutor and SPARC Production Rule Integration Plan

## Status

This document is a design and implementation planning note. It records the intended direction for integrating AutoTutor planning with the SPARC production rule system.

The key requirement is that AutoTutor production rules must be realized through the SPARC production rule machinery, not as a separate one-off AutoTutor-only rule system. The goal is to generalize SPARC so it can support AutoTutor-style tutoring and, later, more general pedagogical focusing and target selection.

## Core design conclusion

The immediate conversion target is `selectAutoTutorMove`.

`selectAutoTutorMove` currently contains the AutoTutor move-selection policy in TypeScript. The plan is to break that policy into explicit production rules represented in the SPARC production rule format and evaluated by generalized SPARC rule infrastructure.

This conversion should not initially replace the whole AutoTutor pipeline.

The current near-term division should be:

1. LLM scoring and evaluation call
   - Produces expectation coverage, misconception scores, learner contribution classification, answer quality, and learner-question status.
   - It must not select the tutoring target, select the tutoring move, or write the tutor message.

2. Conversation-management target selection
   - Current implementation: `selectAutoTutorTarget`.
   - Selects the pedagogical target: expectation, misconception, learner question, or completion.
   - This should remain deterministic during the first production-rule conversion.

3. Production-rule move selection
   - Current implementation: `selectAutoTutorMove`.
   - This is the first function to decompose into explicit productions.
   - Given the already selected target plus scored state, productions select the AutoTutor move.

4. LLM utterance generation call
   - Realizes the selected target and move in natural language.
   - It must not change the app-selected target or move.

## Important long-term design goal

The long-term goal is broader than simply replacing one TypeScript function.

SPARC should become capable of doing AutoTutor through correct production rules. That requires SPARC to generalize from page mutation and local interface behavior into a pedagogical production-rule substrate that can also select AutoTutor dialogue moves.

The longer-term goal also includes target selection. Target selection is the mechanism that focuses the system on what it needs to teach the student. It gives SPARC a pedagogical schema to work with.

Therefore the roadmap is:

1. First: use generalized SPARC production rules to select AutoTutor moves.
2. Later: generalize target selection through the same production-rule infrastructure.
3. Eventually: allow SPARC pages to perform AutoTutor-style tutoring by combining target selection, move selection, and page mutation under a shared production-rule model.

## Current relevant code

AutoTutor planning:

- `learning-components/units/autotutor/AutoTutorPlanner.ts`
- `learning-components/units/autotutor/AutoTutorStateMachine.ts`
- `learning-components/units/autotutor/AutoTutorUnitEngine.ts`

Current move-selection function:

- `selectAutoTutorMove(input, target)` in `AutoTutorPlanner.ts`

Current target-selection function:

- `selectAutoTutorTarget(input)` in `AutoTutorPlanner.ts`

Current SPARC production rule engine:

- `learning-components/units/sparcsession/sparcProductionRuleEvaluator.ts`
- `learning-components/units/sparcsession/sparcSessionContracts.ts`

The SPARC engine already supports explicit rule objects with:

- `id`
- optional `module`
- optional `salience`
- `when` fact patterns
- optional `tests`
- `then` effects

The engine already supports working-memory facts, fact-pattern matching, variable binding, negated fact patterns, tests, salience ordering, fact assertion, state writes, messages, classifications, credits, model-practice observations, progressive node operations, and repeated rule execution until no new eligible firing remains.

## Clarifying what `selectAutoTutorMove` becomes

In the first implementation, `selectAutoTutorMove` does not need to disappear immediately.

Possible transition design:

```ts
export function selectAutoTutorMove(input: AutoTutorPlannerInput, target: AutoTutorTarget): AutoTutorMove {
  return selectAutoTutorMoveFromSparcProductions(input, target);
}
```

`selectAutoTutorMoveFromSparcProductions` is a proposed adapter function. It does not currently exist. Its purpose would be to:

1. Convert AutoTutor planner input into SPARC working-memory facts.
2. Run AutoTutor move-selection productions through generalized SPARC rule evaluation.
3. Read the selected candidate move.
4. Return an `AutoTutorMove` compatible with the existing planner contract.

This keeps the public AutoTutor planner contract stable while relocating the policy into production rules.

## Why SPARC must be generalized

The existing SPARC production rule engine is tied to SPARC session concepts. That is fine for page-based behavior, but AutoTutor needs to use the same underlying rule capability without pretending it is a SPARC page.

The correct abstraction is not:

```text
AutoTutor imports SPARC page behavior.
```

The correct abstraction is:

```text
SPARC production-rule infrastructure becomes a reusable pedagogical rule substrate.
```

AutoTutor should be able to supply facts and rules, run the generalized rule evaluator, and interpret the resulting firings as AutoTutor planning decisions.

This probably requires extracting or generalizing the reusable rule components from the `sparcsession` package into a shared location, while preserving SPARC session compatibility.

Possible future location:

- `learning-components/rules/`
- or `learning-components/runtime/productionRules/`

The exact location can be decided later, but the functional requirement is clear: AutoTutor productions must use the SPARC production-rule model and evaluator rather than a separate AutoTutor-only mini-engine.

## Proposed AutoTutor move-selection rule flow

The first production-rule conversion should preserve current behavior as much as possible.

Flow:

```text
AutoTutorPlannerInput + AutoTutorTarget
  -> AutoTutor rule facts
  -> SPARC/generalized production rule evaluator
  -> candidate move fact or selected move fact
  -> AutoTutorMove
```

Example input facts:

```ts
[
  { factType: 'autotutor.target', slots: { type: 'expectation', id: 'e1' } },
  { factType: 'autotutor.learnerContribution', slots: { type: 'idk', confidence: 0.9, streakCount: 1 } },
  { factType: 'autotutor.answerQuality', slots: { value: 'low' } },
  { factType: 'autotutor.expectationScore', slots: { id: 'e1', coverage: 0.45 } },
  { factType: 'autotutor.focus', slots: { expectationId: 'e1', firstFocusTurn: true, focusTurnCount: 0, moveCycleIndex: 0 } },
  { factType: 'autotutor.threshold', slots: { name: 'coverage', value: 0.8 } }
]
```

Example candidate-move fact:

```ts
{
  factType: 'autotutor.candidateMove',
  slots: {
    move: 'hint',
    targetType: 'expectation',
    targetId: 'e1',
    reason: 'first idk or help request'
  }
}
```

The adapter then selects the appropriate candidate according to rule salience or another explicit conflict-resolution policy.

## Candidate rules for mirroring current `selectAutoTutorMove`

The first implementation should mirror current behavior for regression safety.

Initial rule set:

1. Learner question target
   - If target type is learner question, select `answer_question`.

2. Misconception target
   - If target type is misconception, select `correction`.
   - Correction stage may remain handled by existing misconception cycle at first, or be represented as productions in the same pass if simple.

3. Completion target
   - If target type is completion, select `summary`.

4. First repeated `idk` or `help_request`
   - If target is expectation and contribution type is `idk` or `help_request` and same-type streak is 1, select `hint`.

5. Second repeated `idk` or `help_request`
   - If target is expectation and contribution type is `idk` or `help_request` and same-type streak is 2, select `prompt`.

6. Third or later repeated `idk` or `help_request`
   - If target is expectation and contribution type is `idk` or `help_request` and same-type streak is 3 or more, select `assertion`.

7. Other low-agency contribution
   - If target is expectation and contribution type is `uncertainty`, `affect`, `meta`, or `off_task`, select `hint`.
   - This mirrors current behavior but should be reconsidered later because these types are pedagogically different.

8. Low answer quality on first focus turn
   - If target is expectation, answer quality is low, and this is the first focus turn, select `pump`.

9. Near-threshold coverage
   - If target is expectation and target expectation coverage is at least 75% of the coverage threshold but below the threshold, select `prompt`.

10. Expectation move cycle fallback
   - If no earlier expectation move rule selects a move, select from `hint`, `prompt`, `assertion` using the current move cycle index.
   - This should be mirrored first, then redesigned later.

## Conflict resolution in the production-rule version

The original AutoTutor fuzzy production rules were probably not mutually exclusive. SPARC rules also should not assume mutual exclusivity.

For the first conversion, use salience to preserve current priority order. Higher-salience rules should correspond to earlier cases in the current `selectAutoTutorMove` function.

Example salience order:

- 1000: non-expectation targets such as learner question, misconception, completion
- 900: repeated `idk` / `help_request`
- 800: other low-agency contribution
- 700: low answer quality on first focus turn
- 600: near-threshold coverage
- 100: fallback expectation cycle

The adapter should return exactly one move for the current AutoTutor planner contract.

Later versions can allow more sophisticated selection, including candidate utility, multiple rule contributions to a decision, or separating immediate evaluative feedback from collaborative move realization. But the first version should preserve the one-selected-move contract.

## Relationship to original AutoTutor production rules

The original AutoTutor papers describe fuzzy production rules for dialog move selection. Those rules use values such as good-answer match, bad-answer match, topic coverage, student ability, and verbosity. They should inform the redesigned FireTutor production policy.

However, the first implementation should not try to perfectly reconstruct original AutoTutor. It should first move the current policy into explicit productions using the SPARC production-rule infrastructure.

After that, the rule set can be improved toward a better AutoTutor-like policy.

Likely future improvements:

- Separate uncertainty, affect, meta, and off-task handling rather than mapping all to `hint`.
- Reconsider whether a low-quality first turn should select `pump` or whether some cases should select `hint`, `splice`, correction, or assertion.
- Represent verbosity or learner initiative explicitly if it becomes available from scoring.
- Represent misconception or bad-answer match more directly.
- Replace the mechanical fallback move cycle with state-contingent productions.
- Make prompt selection depend on the existence of a promptable missing component.
- Make assertion selection depend on prior scaffolding failure or low expected value of elicitation.

## Target selection as the next major generalization

Target selection should remain outside the first move-selection conversion, but it is a major long-term goal.

The reason is conceptual: target selection focuses the system on what it needs to teach. It supplies the pedagogical schema that lets SPARC decide what part of the learner model, content model, misconception model, or page state should be acted upon.

Long-term target-selection rules should be able to choose among:

- current expectation focus
- next uncovered expectation
- central expectation
- coherent frontier expectation related to the last covered expectation
- active misconception repair
- learner question handling
- completion / summary / final answer phase
- SPARC page region or node that needs mutation
- authored model target or knowledge component

This would let SPARC perform AutoTutor-like focusing over a structured page or lesson, not only over a dialogue script.

Possible target-selection fact types:

```ts
{ factType: 'pedagogy.expectation', slots: { id, coverage, priority, frontier, coherence, centrality } }
{ factType: 'pedagogy.misconception', slots: { id, current, confidence, repaired } }
{ factType: 'pedagogy.focus', slots: { targetType, targetId, turnCount } }
{ factType: 'pedagogy.learnerQuestion', slots: { current, answerableFromAuthoredContent } }
{ factType: 'sparc.nodeTarget', slots: { documentId, nodeId, role, visible, completed } }
```

The long-term structure becomes:

```text
Scoring/evaluation facts
  -> target-selection productions
  -> move-selection productions
  -> utterance or page-mutation realization
```

This is the route by which SPARC can eventually do AutoTutor.

## Implementation plan

### Step 1: Preserve and document the current behavior

- Add unit tests around current `selectAutoTutorMove` behavior.
- Cover all current branches.
- These tests become the equivalence suite for the production-rule conversion.

Required cases:

- learner question target selects `answer_question`
- misconception target selects `correction`
- completion target selects `summary`
- first `idk` selects `hint`
- second `idk` selects `prompt`
- third `idk` selects `assertion`
- first `help_request` selects `hint`
- second `help_request` selects `prompt`
- third `help_request` selects `assertion`
- `uncertainty` selects `hint`
- `affect` selects `hint`
- `meta` selects `hint`
- `off_task` selects `hint`
- low answer quality on first focus turn selects `pump`
- near-threshold coverage selects `prompt`
- fallback cycle selects `hint`, `prompt`, then `assertion` according to cycle index

### Step 2: Extract generalized production rule infrastructure from SPARC session code

Goal: make the production rule evaluator reusable by AutoTutor without making AutoTutor depend on SPARC session UI concepts.

Possible new module:

- `learning-components/runtime/productionRules/`

Candidate extracted pieces:

- working-memory fact type
- rule expression type
- fact pattern type
- production rule condition type
- production rule test type
- production rule evaluator
- salience compiler
- rule execution result

SPARC-specific effects such as progressive node operations can remain as SPARC extensions or adapters.

### Step 3: Add AutoTutor rule fact adapter

Create a module such as:

- `learning-components/units/autotutor/AutoTutorRuleFacts.ts`

Responsibilities:

- Convert `AutoTutorPlannerInput` and `AutoTutorTarget` into rule facts.
- Include target type and target id.
- Include learner contribution type, confidence, and streak count.
- Include answer quality.
- Include expectation coverage and missing elements for the selected target.
- Include focus state, first-focus-turn status, focus turn count, and move cycle index.
- Include thresholds.
- Include completion state and final-answer-prompt requirement.

### Step 4: Add AutoTutor move-selection production rules

Create a module such as:

- `learning-components/units/autotutor/AutoTutorMoveSelectionRules.ts`

This module should export the initial rule set that mirrors current `selectAutoTutorMove` behavior.

Rules should assert `autotutor.candidateMove` facts or another small generic candidate-decision form.

### Step 5: Add AutoTutor rule-result adapter

Create a module such as:

- `learning-components/units/autotutor/AutoTutorRuleMoveSelector.ts`

Responsibilities:

- Run the generalized production rule evaluator.
- Collect candidate move facts.
- Select one candidate according to salience and deterministic tie-breaking.
- Validate that the selected move is legal for the target type.
- Return an `AutoTutorMove`.

### Step 6: Route `selectAutoTutorMove` through production rules

Change `selectAutoTutorMove` so it delegates to the production-rule move selector.

The old implementation can temporarily remain as:

- a fallback,
- a test oracle,
- or a deprecated helper used only in equivalence tests.

### Step 7: Extend tests

Add tests to prove:

- the production-rule selector matches legacy `selectAutoTutorMove` for current cases,
- rules are salience ordered,
- overlapping candidate rules resolve deterministically,
- invalid candidate moves fail clearly,
- missing required facts fail clearly,
- AutoTutor can use the generalized SPARC production-rule infrastructure without importing SPARC session UI behavior.

### Step 8: Redesign the move policy toward better AutoTutor rules

After equivalence is established, improve the rule set.

Possible improvements:

- Replace the fallback move cycle with explicit state-contingent rules.
- Add separate rules for uncertainty, affect, meta, and off-task contributions.
- Use missing expectation elements to decide when prompting is viable.
- Use prior hint/prompt/assertion history rather than only a cycle index.
- Add support for original AutoTutor-like variables such as verbosity, good-answer match, bad-answer match, and topic coverage when available.

### Step 9: Generalize target selection

Once move selection works through generalized SPARC productions, begin target-selection conversion.

Initial target-selection conversion should preserve `selectAutoTutorTarget` behavior. Later target-selection rules should become the general pedagogical focusing mechanism for SPARC.

This is the important long-term point: target selection is what lets SPARC know what it is trying to teach next.

## Functional requirements

1. AutoTutor move selection must be expressible as production rules.
2. Those productions must be evaluated by generalized SPARC production-rule infrastructure.
3. AutoTutor must not grow a separate incompatible production-rule engine.
4. The first conversion must preserve current `selectAutoTutorMove` behavior unless a deliberate redesign is separately approved.
5. The system must support deterministic conflict resolution for overlapping productions.
6. The production-rule system must support AutoTutor facts that are not tied to visible SPARC page nodes.
7. The generalized rule infrastructure must continue to support existing SPARC page/session behavior.
8. The design must keep scoring/evaluation, target selection, move selection, and utterance generation conceptually separable.
9. Target selection should be generalized after move selection and treated as the mechanism for pedagogical focus.
10. The long-term system should allow SPARC to do AutoTutor-like tutoring through target-selection and move-selection productions, with realization either as dialogue, page mutation, or both.

## Non-goals for the first implementation

- Do not replace the LLM scoring call.
- Do not replace utterance generation.
- Do not rewrite SPARC page mutation.
- Do not fully reconstruct original AutoTutor fuzzy rule conflict resolution yet.
- Do not redesign target selection in the same first pass unless it is necessary for integration.
- Do not require SPARC documents to be present for AutoTutor move-selection rules.

## Open design questions

1. Should the generalized production rule types live under `learning-components/runtime/productionRules/` or another shared location?
2. Should AutoTutor move rules assert `autotutor.candidateMove` facts, or should there be a generic `candidateDecision` fact type?
3. Should salience be the only first-pass conflict-resolution mechanism, or should candidate moves carry explicit utility/priority fields?
4. Should correction stage selection be converted with move selection, or should it remain as the existing misconception cycle for the first pass?
5. How should rule firings be logged into AutoTutor history for debugging and research analysis?
6. When target selection is generalized, should it use the same fact vocabulary as move selection or a broader pedagogical fact vocabulary?

## Working summary

The immediate engineering move is:

```text
Break selectAutoTutorMove into SPARC-style production rules.
```

The key architectural move is:

```text
Generalize the SPARC production rule engine so AutoTutor can use it without building a separate rule system.
```

The long-term pedagogical move is:

```text
Generalize target selection so SPARC can focus on what to teach next, then select AutoTutor-style moves or page mutations from that focus.
```
