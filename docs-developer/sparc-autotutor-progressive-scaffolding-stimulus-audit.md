# SPARC AutoTutor Progressive Scaffolding Stimulus Audit

## Decision summary

The proposed target-independent progression is coherent:

```text
PUMP -> PROMPT -> HINT -> ASSERTION
```

It can replace most of the current SPARC AutoTutor move-selection rules without changing the central tutoring philosophy. Expectations and misconceptions can share the same progression because target type changes the content and direction of progress, not the scaffold-control policy.

The complete design cannot be implemented safely through stimulus-file reductions and initial facts alone. Four small runtime contracts are missing:

1. A unified current instructional-target fact emitted after target selection.
2. A turn-scoped before/after progress fact derived from the learner response.
3. A focus-episode identity that resets scaffold progression when instructional focus changes.
4. An active `assertion` move definition and utterance policy.

Once those contracts exist, each stimulus package can reduce its generic move policy to four scaffold rules plus a separate completion rule. Static policy thresholds can remain authored as initial working-memory facts.

## Scope

This audit covers the ten current displays whose `unitType` is `sparc-autotutor-dialogue` in `C:\dev\mofacts_config`.

All ten currently contain the same eleven-rule `display.productionRules` array byte-for-byte. The rules are authored independently in each stimulus file even though their policy is identical.

This plan preserves:

- Authored expectations and misconceptions.
- LLM semantic scoring.
- Expectation coverage and misconception confidence as the learner model.
- Runtime target selection.
- Durable SPARC history and replay.
- LLM-generated, evidence-grounded immediate feedback.
- A separate completion/summary decision.

This plan deliberately defers:

- Fuzzy membership functions versus crisp bands.
- A shared runtime policy registry versus expanded rules in every stimulus file.
- Post-assertion failure strategy.
- Production-rule frequency instrumentation and empirical threshold tuning.

## Current ownership

### Stimulus packages own

- Exact production-rule conditions.
- Salience values.
- `controller.selectedAction` effects.
- Production-phase termination.
- Expectations, misconceptions, thresholds, and other authored facts.

### Runtime owns

- Semantic scoring.
- Expectation and misconception target selection.
- Coverage, ability, verbosity, and completion derivations.
- Production-rule evaluation and persistence.
- Move definitions and LLM prompt policies.
- Dialogue history and replay.

The proposed rewrite does not require moving all production policy into runtime. It requires the runtime to expose the minimal facts that authored rules need in order to express a stateful progression correctly.

## Feasibility of a stimulus-only rewrite

| Requirement | Available now? | Audit finding |
| --- | --- | --- |
| Author four mutually exclusive move rules | Partially | `pump`, `prompt`, and `hint` exist; `assertion` is not an active SPARC move. |
| Use the same rules for expectations and misconceptions | No | Runtime emits either `learningTarget.selected` or `diagnostic.misconceptionSelected`; there is no unified target fact. |
| Know whether the learner progressed | No | Current and prior scores are present in forms that are not safely distinguishable by authored rules. No turn-scoped delta fact exists. |
| Remember the last scaffold for a target | Partially | A rule can persist a stable fact with `assert-fact`, `persist`, and `identitySlots`. |
| Replace the prior stage rather than accumulate stages | Yes across turns | Stable fact identity can overwrite a prior target-stage value in replay state. Stage update and move selection should occur in the same terminating rule. |
| Reset on a genuinely new focus episode | No | A durable target-only key would revive an old stage if the target is revisited later. No focus-episode identity exists. |
| Resume progression after reload | Yes, after the missing state contract exists | Stable SPARC working-memory facts replay durably across attempts. |
| Handle target resolution | Partially | Target selection already stops selecting covered expectations and inactive misconceptions, but it does not expose a unified transition/reset fact. |
| Keep completion separate | Yes | `dialogue.completionSelected` and `controller.completionState` already support a separate summary rule. |
| Remove salience as the source of progression | Yes | Mutually exclusive stage conditions can make each stage conflict set contain exactly one move rule. |

## Why existing facts are insufficient

### Target type is exclusive but not unified

The controller currently emits one of:

```text
learningTarget.selected { clusterKC }
diagnostic.misconceptionSelected { id }
```

The production-rule effect must still author different slot names and target types. An authored derived fact cannot solve this cleanly because authored derivations run before the controller appends the current target-selection facts.

The runtime should emit one additional transient fact after selection:

```text
instructionalTarget.active {
  targetKey
  targetType       // expectation | misconception
  targetId         // clusterKC or misconception id
  currentScore
  resolutionThreshold
  focusEpisodeId
}
```

`targetKey` should be canonical and collision-free, for example `expectation:<clusterKC>` or `misconception:<id>`.

### Progress is not a rule-safe fact

The application knows the replayed score before scoring and the updated score returned for the current response. Authored rules do not receive a fact that clearly labels those two temporal roles.

The runtime should derive:

```text
learnerResponse.targetProgress {
  targetKey
  targetType
  targetId
  scoreBefore
  scoreAfter
  progress
  madeProgress
  addressedByLatestResponse
  newlyResolved
}
```

Progress has one positive direction:

```text
expectation progress   = coverageAfter - coverageBefore
misconception progress = confidenceBefore - confidenceAfter
```

The scorer must explicitly identify which expectations or misconceptions were addressed by the latest response. A zero delta alone cannot distinguish omission from an addressed but unsuccessful attempt.

This fact is turn-scoped and derived. It is not a second learner-model representation.

### Target identity alone cannot reset progression

A stable fact keyed only by target would retain `HINT` or `ASSERTION` forever. If the learner leaves a target, works elsewhere, and later returns, the system needs an explicit policy decision about whether that is the same scaffold episode.

The runtime should assign a `focusEpisodeId` whenever focus changes from another target to the current target. Durable state is then keyed by that episode:

```text
scaffold.state {
  focusEpisodeId
  targetKey
  stage
  lastMove
  attemptCount
}
```

The stable identity should be `focusEpisodeId`, not the mutable `stage`.

### Assertion is not currently a selectable SPARC move

The active move registry supports `pump`, `positive_pump`, `prompt`, `hint`, `elaborate`, `splice`, and `summary`. It does not support `assertion`.

Add an active target-independent assertion definition whose realization varies by target type:

- Expectation: state the missing content directly, then request restatement or application.
- Misconception: state the corrective contrast directly, then request restatement or application.

The assertion request must receive the selected misconception together with correct expectation content, matching the strengthened utterance context contract.

## Proposed authored policy facts

Packages can author policy values without authoring mutable runtime state:

```json
{
  "factType": "scaffold.policy",
  "slots": {
    "policyId": "progressive-scaffolding-v1",
    "expectationResolutionThreshold": 0.8,
    "misconceptionResolutionThreshold": 0.2,
    "minimumProgress": 0.05
  }
}
```

Do not place an initial `scaffold.state` fact in `workingMemoryFacts`. Authored working-memory facts are rebuilt every turn and would coexist with mutable replayed state. The runtime should derive a new-focus state when no state exists for the current `focusEpisodeId`.

## Proposed move rules

Each move rule both selects the move and persists the resulting stage. This avoids a control rule asserting a new stage and leaving both old and new stage facts visible during the same production cycle.

### Pump

```text
IF
  active target T exists
  AND (
    T is in a new focus episode
    OR latest response made meaningful progress on T
  )
THEN
  select PUMP for T
  persist scaffold.state(T, PUMP)
  terminate move-selection phase
```

### Prompt

```text
IF
  active target T exists
  AND scaffold.state(T).lastMove = PUMP
  AND latest response addressed T
  AND latest response made insufficient progress
THEN
  select PROMPT for T
  persist scaffold.state(T, PROMPT)
  terminate move-selection phase
```

### Hint

```text
IF
  active target T exists
  AND scaffold.state(T).lastMove = PROMPT
  AND latest response addressed T
  AND latest response made insufficient progress
THEN
  select HINT for T
  persist scaffold.state(T, HINT)
  terminate move-selection phase
```

### Assertion

```text
IF
  active target T exists
  AND scaffold.state(T).lastMove = HINT
  AND latest response addressed T
  AND latest response made insufficient progress
THEN
  select ASSERTION for T
  persist scaffold.state(T, ASSERTION)
  terminate move-selection phase
```

### Completion remains separate

```text
IF
  completion is selected
  AND controller completion state is complete
THEN
  select SUMMARY
  terminate move-selection phase
```

The post-assertion/no-progress case is intentionally unspecified. It must be decided before implementation can be considered complete. Options include repeating assertion with a new representation, switching targets, requesting application, or ending the topic after a bound.

## Important policy decisions still required

### What counts as meaningful progress?

Candidate starting point:

```text
madeProgress = progress >= scaffold.policy.minimumProgress
```

This should be authored or centrally defined, not silently hard-coded. It may need different thresholds for expectations and misconceptions.

### What happens when the learner does not address the active target?

Question, off-task, meta, and nonresponsive contributions should not automatically escalate the content scaffold as though the learner attempted and failed the target. The policy must choose among:

- Repeat or reframe the current stage.
- Handle the contribution in a separate conversational branch.
- Count only substantive target-addressing responses toward escalation.

### What happens after assertion?

The four-stage chain has no defined successor after an unsuccessful assertion. This is the largest remaining pedagogical gap.

### Can one response address multiple expectations?

The scorer should permit multiple addressed targets. Immediate feedback may acknowledge all newly covered material, but scaffold progression should be updated only for the focus episode that was active when the response was solicited.

### Does progress reset or merely hold the stage?

The proposed Pump rule de-escalates to learner generation after meaningful progress. An alternative is to hold the current stage until target resolution. This should be tested explicitly rather than left to salience.

## Reduction of the existing move repertoire

| Current move | Proposed treatment |
| --- | --- |
| `pump` | Keep as scaffold stage 1. |
| `positive_pump` | Remove as a primitive; realize as positive immediate feedback plus `pump`. |
| `prompt` | Keep as scaffold stage 2. |
| `hint` | Keep as scaffold stage 3. |
| `elaborate` | Remove as a selection primitive; use hint or assertion depending on how much content is supplied. |
| `splice` | Remove as a selection primitive; use corrective assertion for misconceptions. |
| `assertion` | Add as scaffold stage 4. |
| Feedback moves | Keep out of the scaffold chain; generate evidence-grounded immediate feedback with every move. |
| `summary` | Keep as a separate completion move. |

## Minimal implementation sequence

### Phase 1: Runtime facts and tests

1. Extend the scoring envelope with explicit addressed-target metadata.
2. Derive `learnerResponse.targetProgress` from replayed and current scores.
3. Emit `instructionalTarget.active` after target selection.
4. Assign and replay `focusEpisodeId` and `scaffold.state`.
5. Add the active `assertion` move definition and utterance policy.

Do not change package rules until these facts are observable in controller-planning tests.

### Phase 2: One-package stimulus pilot

Rewrite Compound Interest to:

- Add `scaffold.policy` to `workingMemoryFacts`.
- Replace the eleven generic move rules with the four scaffold rules and completion summary.
- Remove obsolete salience-driven move alternatives.
- Preserve lesson-specific expectations, misconceptions, nodes, and thresholds.

Verify a synthetic sequence for both an expectation and a misconception:

```text
no progress: PUMP -> PROMPT -> HINT -> ASSERTION
progress:    de-escalate or hold according to the chosen policy
resolved:    select the next target and start a new focus episode
reload:      resume the same focus episode and scaffold stage
```

### Phase 3: Package migration

After the pilot passes, mechanically migrate the remaining nine packages. Validate that all ten packages contain the same reduced policy and no removed move IDs.

### Phase 4: Deletion gate

Delete obsolete move definitions and authoring catalog entries only after:

- No package references `positive_pump`, `elaborate`, or `splice`.
- Runtime and replay tests use the new scaffold facts.
- The visual authoring editor validates the reduced action set.
- Schema generation shows only intentional changes.
- Local continuation testing proves scaffold-stage replay.

## Acceptance criteria

1. Ignoring salience, exactly one scaffold move is eligible for an active focus episode and response state.
2. Expectations and misconceptions execute the same four rule IDs.
3. Expectation progress is increasing coverage; misconception progress is decreasing confidence.
4. A newly focused target starts at Pump unless an explicitly authored policy chooses another entry stage.
5. Insufficient target-addressing responses advance Pump -> Prompt -> Hint -> Assertion.
6. Meaningful progress follows the explicitly selected de-escalation/hold policy.
7. Target resolution selects a new target and creates a new focus episode.
8. Resume restores the active target episode and scaffold stage across attempt IDs.
9. Immediate feedback is grounded in the latest scoring evidence and never praises an active misconception as progress.
10. Completion summary remains independent of scaffold escalation.
11. No runtime compatibility fallback silently supplies missing policy facts or rules.

## Verification requirements

- Unit tests for target normalization, progress derivation, stage persistence, stage reset, and assertion realization.
- Conflict-set tests proving exactly one eligible scaffold rule without relying on salience.
- Replay tests covering stop, reload, and continuation at every scaffold stage.
- Scoring tests for one response addressing multiple expectations.
- Prompt-contract tests for expectation and misconception assertion content.
- `npm run generate:schemas` if the authored field registry or schema changes.
- `npm run typecheck` and `npm run lint` from `mofacts/`.
- Native hotfix and MoFaCTS Playwright sidecar smoke tests for Compound Interest before migrating the other packages.
- Config-repository JSON parsing and a cross-package policy-identity audit after migration.

## Final audit conclusion

Stimulus reductions and authored policy facts are the correct destination, but they are not the complete implementation mechanism. A stimulus-only rewrite would either duplicate expectation/misconception rules, infer progress unreliably, fail to reset stage episodes, or select an unsupported assertion move.

The narrowest coherent solution is to add the four missing runtime facts/capabilities, then express the actual scaffold progression in reduced authored production rules. This preserves SPARC's authored-rule architecture while making the generic policy simple, stateful, replayable, and independent of target type.
