# AutoTutor and SPARC Production-Rule Instructional Control Plan

## Status

This document records the agreed design for moving SPARC AutoTutor instructional control into the production-rule system. It is an implementation plan, not a description of the current behavior.

The design is intended to be general enough for dialogue and non-dialogue instruction. AutoTutor supplies the first concrete rule set and realization adapter, but the rule engine and instructional-cycle contracts must not contain AutoTutor-only target-selection exceptions.

## Objective

The production rules must determine both:

1. which expectation or misconception is instructionally active; and
2. which instructional move is appropriate for that target.

The runtime may derive assessment, candidate, comparison, and progress facts. It must not choose a target before the productions run or lock the productions onto a target chosen elsewhere.

The intended turn is:

```text
learner response
  -> assessment snapshot
  -> candidate, comparison, active-cycle, and gain facts
  -> production-rule evaluation
  -> exactly one instructional decision
  -> dialogue or non-dialogue realization
  -> committed cycle state and decision history
```

## Final design decisions

1. The separate TypeScript target selector will no longer own instructional focus.
2. Candidate derivation remains deterministic runtime work and is exposed completely as working-memory facts.
3. Expectations and misconceptions receive directionally consistent, kind-specific instructional-need values; they are not compared across target kinds.
4. Continuing an active cycle and starting a new cycle are different production families.
5. An expectation does not switch to another expectation merely because the other expectation now ranks higher.
6. A qualifying misconception may interrupt an active expectation through an initial targeted-prompt production.
7. Any misconception at or above the misconception threshold has categorical priority over expectations; if several qualify, the maximum eligible misconception is selected.
8. Meaningful gain after a pump keeps `pump` eligible. Insufficient gain permits a more supportive `prompt`.
9. Learned expectations and repaired misconceptions cease to qualify through their own production conditions.
10. Exactly one cycle-changing instructional decision may be produced for one assessment snapshot.
11. The shared engine remains modality-neutral. Adapters realize the selected instructional action as dialogue, page behavior, or another instructional form.
12. The old selector and its target-locking path will be removed in the cutover. There will not be two competing target-selection authorities.

## Current implementation and required correction

The current implementation is workable but divides responsibility incorrectly.

### `sparcTargetSelection.ts`

`selectSparcLearningTargetFromFacts(...)` currently:

- calculates expectation candidates;
- calculates misconception candidates;
- applies thresholds;
- computes frontier, coherence, centrality, and expectation priority;
- preserves an unfinished active expectation;
- preserves an active misconception;
- gives active misconceptions precedence when no expectation is locked;
- chooses the winning target; and
- emits selected-target facts and move-cycle counters.

The calculation and validation responsibilities are useful. Target persistence and winner selection must move into productions.

### Current duplicated target state

Instructional focus is represented through overlapping facts, including:

- `learningTarget.selected`;
- `instructionalTarget.active`;
- `diagnostic.misconceptionSelected`; and
- `moveCycleIndex` and related focus counters.

These representations can disagree and make replay depend on which latest fact a caller happens to read. They must be replaced by one canonical current-cycle contract plus immutable history events.

### Current threshold coupling

The current selector derives misconception repair eligibility as `1 - coverageThreshold`. Expectation coverage and misconception repair are different constructs. Their goals must be independently authored or independently defined by the controller policy.

### Current progression state

The current selector increments a mechanical `moveCycleIndex`. That counter does not express whether the learner benefited from the preceding move. Progression productions must instead inspect target-specific gain between the prior and current assessment snapshots.

### Current production execution

The production evaluator can continue firing eligible rules as working memory changes. Instructional decision rules therefore need an explicit one-decision guard. Mutually exclusive pedagogical conditions are the primary protection; a decision fact asserted by the first firing is the runtime invariant that prevents a second cycle-changing firing in the same turn.

## Architectural boundaries

The system is divided into five responsibilities.

### 1. Response assessment

Assessment produces current expectation coverage and misconception support values. It does not select a target or move.

For an active target, assessment must provide a finite current value. Missing active-target assessment is an invariant failure rather than silent zero gain.

### 2. Instructional fact projection

A deterministic projector converts the assessment snapshot, content graph, authored policy, and prior cycle into facts. It computes values and comparisons but does not produce an instructional decision.

### 3. Production-rule instructional control

Productions inspect projected facts and assert exactly one instructional decision. The selected production jointly identifies the target, cycle transition, and move.

### 4. Decision validation and commit

The controller validates that exactly one legal decision was asserted, commits the resulting canonical cycle state, and writes an immutable decision-history event.

### 5. Realization adapter

The registered adapter realizes the decision. AutoTutor generates a dialogue utterance. Other SPARC instruction may select a question, show feedback, reveal a worked example, or perform an authored page operation.

The adapter cannot replace the selected target, cycle transition, or instructional action.

## Canonical facts

Names may be adjusted to existing naming conventions during implementation, but these semantic contracts are required.

### Assessment snapshot

```ts
{
  factType: 'instructional.assessmentSnapshot',
  slots: {
    snapshotId: '...',
    turnNumber: 4
  }
}
```

All candidate and progress facts in one decision pass carry the same `snapshotId`. Facts from different snapshots must never be compared in one decision.

### Candidate fact

```ts
{
  factType: 'instructional.candidate',
  slots: {
    snapshotId: '...',
    targetKind: 'expectation' | 'misconception',
    targetId: '...',
    currentValue: 0.45,
    goalValue: 0.8,
    instructionalNeed: 0.35,
    eligible: true,
    rankWithinKind: 1,
    isMaximumWithinKind: true,
    frontierScore: 0.7,
    coherenceScore: 0.8,
    centralityScore: 0.6
  }
}
```

The graph fields apply to expectations. They remain visible even when the final ranking is projected so ranking decisions are inspectable.

### Canonical active cycle

```ts
{
  factType: 'instructional.activeCycle',
  slots: {
    cycleId: '...',
    targetKind: 'expectation' | 'misconception',
    targetId: '...',
    stage: 'pump' | 'prompt' | 'hint' | 'assertion' | 'correction',
    priorValue: 0.45,
    startedAtTurn: 3,
    cycleTurnCount: 1,
    status: 'active'
  }
}
```

There is at most one active cycle. Interruption ends the current cycle with an `interrupted` history event and starts a new cycle. It does not leave two active facts or an implicit suspended stack.

### Progress fact

```ts
{
  factType: 'instructional.progress',
  slots: {
    snapshotId: '...',
    cycleId: '...',
    targetKind: 'expectation',
    targetId: '...',
    priorValue: 0.45,
    currentValue: 0.57,
    gain: 0.12,
    meaningfulGain: true,
    goalReached: false
  }
}
```

Gain is direction-normalized:

- expectation gain is increased coverage;
- misconception repair gain is decreased misconception support.

The authored policy defines the minimum meaningful gain. Zero, negative, and meaningful positive gain remain distinguishable.

### Instructional decision

```ts
{
  factType: 'instructional.decision',
  slots: {
    snapshotId: '...',
    targetKind: 'expectation',
    targetId: '...',
    action: 'pump',
    transition: 'start' | 'continue' | 'advance' | 'interrupt' | 'complete',
    sourceRuleId: '...',
    reason: '...'
  }
}
```

Every cycle-changing production requires the absence of an `instructional.decision` for the current snapshot. Its `then` clause asserts that decision. The controller rejects zero or multiple decisions unless the single decision is an explicitly defined terminal outcome.

## Candidate and maximum calculation

### Eligibility

An expectation is eligible while its coverage is below its authored coverage goal. A misconception becomes eligible when its support is at or above its independently authored misconception threshold. An active misconception remains active until it satisfies its authored repair criterion.

### Kind-specific instructional need

Both target types use the same direction: larger `instructionalNeed` means farther from the desired instructional state. The values support ranking within each target kind; they are not used to decide whether an eligible misconception outranks an expectation.

At minimum:

```text
expectation need   = normalized deficit below expectation coverage goal
misconception need = normalized excess above misconception repair goal
```

Normalization must be stable and inspectable within each target kind. Raw expectation coverage is never compared with raw misconception support because misconception priority is established by threshold eligibility.

### Expectation ranking

Frontier, coherence, and centrality remain explicit inputs for choosing among expectations. The policy must expose all weights and intermediate scores. Graph ranking determines which expectation best represents current instructional need and the content structure when no misconception is eligible.

The initial implementation should preserve the existing authored frontier, coherence, and centrality weights unless a separate pedagogical change is approved. It must add the normalized need component explicitly rather than allowing structural centrality alone to stand in for unfinished learning.

### Maxima and ties

The fact projector marks the maximum eligible expectation and maximum eligible misconception. Each maximum is calculated only within its own target kind. This is a deterministic comparison over declared candidate values, not a hidden target-selection decision.

Ties are resolved visibly:

1. larger instructional need;
2. applicable within-kind structural or authored priority;
3. authored target order; and
4. stable target identifier.

There is no cross-kind tie. If at least one misconception is threshold-eligible, misconceptions have priority. Ties among eligible misconceptions and ties among eligible expectations use the deterministic within-kind policy above.

## Production families

The rule set should use generic variable binding over candidate facts. Runtime content supplies expectation and misconception facts; the runtime does not generate separate TypeScript logic for every target.

### A. Continue an active expectation at pump

```text
IF an expectation cycle is active at pump
AND the expectation remains unfinished
AND the latest response produced meaningful gain for that expectation
AND no misconception is threshold-eligible
AND no decision exists for this snapshot
THEN continue the same expectation at pump.
```

This preserves productive learner elaboration.

### B. Advance an active expectation from pump to prompt

```text
IF an expectation cycle is active at pump
AND the expectation remains unfinished
AND the latest response did not produce meaningful gain
AND no misconception is threshold-eligible
AND no decision exists for this snapshot
THEN continue the same expectation with prompt.
```

Later hint, assertion, and other stage transitions remain explicit productions. They must depend on assessed response and prior stage, not on a mechanical cycling counter.

### C. Interrupt an expectation with a misconception

```text
IF an expectation cycle is active
AND at least one misconception is threshold-eligible
AND no decision exists for this snapshot
THEN end the expectation cycle as interrupted
AND start the maximum misconception with a targeted prompt.
```

This is the misconception initial-prompt production. It is a policy rule, not special target-selection code in the engine. The prompt must be authored or realized for the identified misconception; it must not blindly reuse an expectation prompt that assumes merely missing knowledge.

### D. Continue an active misconception

An active misconception remains the cycle target while it is unresolved. Its stage-specific productions use direction-normalized repair gain to retain productive elicitation or provide stronger support. Another expectation does not interrupt an active misconception. A different misconception does not interrupt it in the first implementation; after repair, all candidates compete again.

### E. Start a new misconception cycle

```text
IF no continuable active cycle exists
AND an eligible misconception exists
AND no decision exists for this snapshot
THEN start the maximum misconception with a targeted prompt.
```

Expectation values do not participate in this decision. Once any misconception is threshold-eligible, the maximum eligible misconception qualifies.

### F. Start a new expectation cycle

```text
IF no continuable active cycle exists
AND an eligible expectation exists
AND no misconception is threshold-eligible
AND no decision exists for this snapshot
THEN start the maximum eligible expectation at pump.
```

The maximum condition belongs here, not on every continuation rule. This prevents expectation-to-expectation thrashing during a coherent active cycle.

### G. Release a learned or repaired target

Goal attainment makes that target's continuation productions ineligible. The same decision pass may start the newly selected maximum target. The history records the old cycle as completed and the new cycle as started.

### H. Completion

```text
IF no continuable active cycle exists
AND no eligible expectation exists
AND no eligible misconception exists
AND no decision exists for this snapshot
THEN assert the completion instructional decision.
```

This replaces the current selector error when no uncovered expectation remains.

### I. Learner questions and other event targets

Learner-question handling must also be expressed as an explicit production family rather than restored as a hard-coded selector exception. Its precedence and return-to-cycle behavior must be visible in conditions and history. It may produce a temporary answer action without changing the active instructional cycle, or an explicit cycle transition when authored policy requires one.

## Why only one instructional direction qualifies

The rule conditions are designed to be mutually exclusive:

- expectation continuation requires that no misconception be threshold-eligible;
- misconception interruption requires that at least one misconception be threshold-eligible;
- new-cycle rules require no continuable active cycle;
- completion requires no eligible targets;
- every decision rule requires no existing decision for the snapshot.

The first firing asserts the decision fact. Re-evaluation makes all other cycle-changing productions ineligible. Rule salience may order terminal or event rule families, but it must not conceal a separate target-ranking policy.

## State, replay, and history

The canonical cycle is durable controller state. Each turn projects that state into working memory and appends an immutable event after a decision is committed.

Required event information:

- assessment snapshot id and turn;
- previous active cycle;
- all candidate current values, goals, needs, and eligibility;
- expectation and misconception maxima;
- prior value, current value, and gain for the active target;
- production id and bound variables;
- selected decision and reason;
- resulting active cycle; and
- completion or interruption reason when a cycle ends.

Replay must reconstruct exactly one active cycle from events and produce the same decision from the same assessment snapshot and policy facts.

The current selected-target facts may be read during a bounded data transition if durable history requires it, but they must not remain parallel authorities after the cutover. Any transition reader must have an explicit removal point; new writes use only the canonical contract.

## Generalization and maintainability

### Generic runtime responsibilities

The shared runtime owns:

- fact matching and variable binding;
- numeric and relational tests;
- negated conditions;
- deterministic rule conflict handling;
- one-decision validation;
- decision history; and
- adapter dispatch.

It does not own AutoTutor target priorities or dialogue-stage policy.

### AutoTutor rule-pack responsibilities

The AutoTutor rule pack owns:

- expectation and misconception cycle rules;
- pump, prompt, hint, assertion, and correction policy;
- learner-question policy;
- meaningful-gain thresholds; and
- AutoTutor-specific terminal behavior.

### Adapter responsibilities

The adapter maps an already selected semantic instructional action into its modality. Dialogue realization may use `pump` and `prompt` directly. A non-dialogue adapter may map the same instructional intent to a question, feedback panel, worked example, or page operation.

The core contract should represent the semantic action clearly enough that an adapter does not need to redo target selection.

### Content responsibilities

AutoTutor content continues to configure expectations, misconceptions, goals, graph relationships, and relevant policy values. It should not duplicate the generic production set once per authored target. Generic productions bind against authored target facts.

No new TDF field should be introduced until both the runtime field registry and `C:\dev\mofacts_config` are checked for an existing equivalent.

## Expected code changes

### `learning-components/units/sparcsession/sparcTargetSelection.ts`

- Split candidate projection from target selection.
- Retain validation, graph calculations, eligibility, and transparent ranking inputs.
- Remove active-target locking, selected-target emission, and winner return values.
- Rename the module if its remaining responsibility is candidate projection rather than selection.

### `learning-components/units/sparcsession/sparcInstructionalControl.ts`

- Stop requiring a preselected target before production evaluation.
- Supply the assessment snapshot, projected candidates, canonical cycle, and progress facts.
- Validate and commit the single production decision.

### `learning-components/units/sparcsession/sparcControllerTurnPlanning.ts`

- Make the assessment, fact-projection, decision, commit, and realization phases explicit.
- Ensure one immutable snapshot is used throughout a turn.
- Remove any orchestration branch that reintroduces target selection outside productions.

### `learning-components/units/sparcsession/sparcProgressiveScaffoldingRules.ts`

- Add target-start, target-continuation, misconception-interruption, release, and completion conditions.
- Replace mechanical cycle progression with target-specific gain conditions.
- Ensure all cycle-changing rules assert the common decision fact.

### `learning-components/units/sparcsession/sparcInstructionalAdapterRegistry.ts`

- Accept the validated instructional decision.
- Keep realization separate from target and progression policy.
- Validate that adapters cannot replace the target or action.

### Production-rule contracts and evaluator

- Add or consolidate candidate, active-cycle, progress, and decision contracts.
- Support the required comparisons and decision guard through existing generic rule constructs where possible.
- Do not add AutoTutor-specific branches to the evaluator.
- Add a clear invariant failure for zero or multiple instructional decisions.

### Existing tests

Tests that currently assert an unfinished expectation cannot be interrupted by a newly active misconception encode the behavior being replaced. They must be rewritten to assert the new comparison-based interruption policy.

## Implementation sequence

### Phase 1: Lock the behavioral decision table

- Express every production family above as a truth table.
- Include active-cycle kind, stage, goal status, gain status, maximum expectation, maximum misconception, and cross-kind comparison.
- Confirm that each valid row yields exactly one decision.

### Phase 2: Introduce canonical facts and candidate projection

- Add the assessment snapshot, candidate, active-cycle, progress, and decision contracts.
- Convert current target-selection calculations into pure fact projection.
- Add independent expectation and misconception goals.
- Add deterministic within-kind maximum and tie facts.

### Phase 3: Consolidate cycle state

- Make one active-cycle representation authoritative.
- Project prior stored state into that representation.
- Stop producing overlapping current-target facts on new turns.
- Preserve immutable events for replay and research analysis.

### Phase 4: Implement the production families

- Implement expectation pump continuation and prompt advancement.
- Implement misconception initial-prompt interruption.
- Implement active misconception continuation.
- Implement new expectation and misconception starts.
- Implement release, completion, and learner-question rules.
- Add the one-decision guard to every cycle-changing rule.

### Phase 5: Cut controller planning over to production decisions

- Remove the call that selects the target before productions run.
- Pass all candidates and cycle facts into evaluation.
- Validate exactly one decision and commit it.
- Route realization through the adapter registry.

### Phase 6: Remove the old authority

- Delete old target-lock and winner-selection branches.
- Delete mechanical move-cycle policy that has been replaced by gain rules.
- Remove or migrate redundant selected-target state.
- Remove tests that preserve the old lock behavior.
- Do not retain a second selector path.

### Phase 7: Add observability and replay proof

- Record the compact decision trace.
- Prove deterministic replay from the same snapshot and policy facts.
- Make target assessment, comparison, rule selection, and realization distinguishable in logs.

## Verification plan

### Candidate projection tests

- expectation eligibility below and at its goal;
- misconception eligibility above and at its repair goal;
- independently authored goals;
- stable kind-specific need calculations;
- frontier, coherence, centrality, and need components;
- deterministic maxima and tie resolution; and
- rejection of mixed assessment snapshot ids.

### Production eligibility tests

- productive expectation pump stays at pump;
- insufficient-gain pump permits prompt;
- another expectation does not interrupt an active expectation;
- misconception below its threshold does not interrupt;
- any misconception at or above its threshold interrupts an expectation with a targeted prompt;
- expectation priority does not suppress a threshold-eligible misconception;
- only the maximum misconception can start;
- repaired misconception releases its cycle;
- learned expectation releases its cycle;
- new focus considers all eligible targets;
- no eligible targets produces completion; and
- learner-question rules have explicit, tested precedence.

### Decision invariants

- every valid assessment snapshot produces exactly one decision;
- the decision references a candidate or declared terminal/event target;
- no second cycle-changing rule fires after the decision fact exists;
- the adapter cannot alter target or action; and
- replay produces the same decision and cycle state.

### Natural Selection regression scenario

Replay the motivating interaction turn by turn and retain all expectation and misconception values. Verify that:

- a correct response about genes changes the intended expectation assessment;
- a newly strong misconception becomes eligible for its initial targeted prompt when it crosses the misconception threshold;
- expectation productions are ineligible during that interruption;
- productive pump gain retains pump; and
- insufficient pump gain permits prompt.

### Required repository verification after implementation

From `mofacts/`:

```text
npm run typecheck
npm run lint
```

If contracts introduce or change TDF fields, also run schema generation and inspect config-repository compatibility. Meteor integration tests require their separately authorized supported environment.

## Non-goals

- Do not change the learner-response scoring model as part of this control refactor.
- Do not let the utterance model choose or rewrite the instructional target or move.
- Do not create a second AutoTutor-only rule evaluator.
- Do not duplicate generic productions for every authored expectation or misconception.
- Do not preserve the old target selector as an alternate runtime authority.
- Do not redesign every later dialogue-stage production before the target and initial-move rules are coherent.
- Do not add configuration fields when existing contracts can express the required facts.

## Completion criteria

The implementation is complete when:

1. no separate selector chooses or locks the instructional target before production evaluation;
2. all eligible expectations and misconceptions are represented as inspectable facts;
3. current-cycle continuation, misconception interruption, new-cycle selection, and completion are production outcomes;
4. productive pump gain remains at pump and insufficient gain can advance to prompt;
5. exactly one instructional decision is committed per assessment snapshot;
6. one canonical active-cycle representation drives current behavior and replay;
7. realization adapters cannot change the production-selected target or action;
8. the old locking tests are replaced with the agreed rule-policy tests;
9. the Natural Selection interaction demonstrates the intended interruption and progression behavior; and
10. required typecheck, lint, applicable schema, and supported integration verification pass.
