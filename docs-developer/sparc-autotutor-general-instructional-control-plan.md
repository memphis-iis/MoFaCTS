# SPARC AutoTutor Adapter and General Instructional-Control Plan

## Architectural decision

AutoTutor stimulus files should define **AutoTutor-specific instructional content and configuration**. An explicit AutoTutor adapter should instantiate those constructs as **general SPARC instructional-control facts**. The shared SPARC runtime should operate only on those general facts when it manages focus, progress, scaffold state, policy execution, persistence, replay, and move requests.

```text
AutoTutor stimulus constructs
        |
        v
SPARC AutoTutor adapter
        |
        v
General SPARC instructional facts
        |
        v
Authored scaffold productions
        |
        v
General move request + durable state
        |
        v
AutoTutor utterance realization
```

This is an adapter boundary, not a compatibility fallback. A display that selects the AutoTutor adapter must satisfy its authored contract. A missing or unknown adapter or policy ID must fail validation at the owning boundary.

## Goals

1. Keep expectations, misconceptions, ideal-answer content, and AutoTutor scoring configuration in the stimulus package.
2. Prevent the general SPARC controller from containing branches for `expectation` and `misconception`.
3. Define one canonical target-independent scaffold progression and instantiate it as four authored productions in each AutoTutor example:

   ```text
   PUMP -> PROMPT -> HINT -> ASSERTION
   ```

4. Make the same controller usable by other SPARC sheet types through other adapters.
5. Make focus and scaffold progression durable and replayable across session continuation.
6. Replace the eleven-rule AutoTutor move-selection arrays currently copied across stimulus packages with the same audited four-rule scaffold set plus one completion rule.
7. Preserve immediate, response-appropriate feedback as a separate realization concern rather than a scaffold stage.

## Non-goals

- Defining one educational ontology for every possible learning system.
- Replacing SPARC nodes and production-rule execution with a graph abstraction.
- Deciding fuzzy versus crisp policy boundaries in this change.
- Silently preserving old behavior through parallel controller paths.
- Settling the post-assertion strategy without an explicit pedagogical decision.

## Ownership boundary

### AutoTutor stimulus packages author

- The opening question and other authored dialogue content.
- Expectations representing the ideal answer.
- Misconceptions and their corrective/domain relationships.
- AutoTutor-specific scoring criteria and thresholds.
- Content needed to realize prompts, hints, assertions, and summaries.
- An explicit adapter ID and instructional-policy ID.
- Policy parameters that are legitimately lesson-specific.

The migration should reuse the current canonical expectation, misconception, and threshold fields. It must not introduce second names for concepts that already exist.

### The AutoTutor adapter owns

- Validation of the AutoTutor-specific authored contract.
- Translation of expectations and misconceptions into general instructional targets.
- Translation of semantic scoring into a turn-scoped learning observation.
- The meaning and direction of progress for each AutoTutor target type.
- Supplying target-specific realization context to the utterance layer.
- AutoTutor labels for general scaffold actions.

### The general SPARC runtime owns

- Adapter registration and the production-rule execution contract.
- Active instructional focus and focus-episode identity.
- Durable scaffold state and replay.
- Evaluation of target-independent authored productions against general facts.
- Conflict-set determinism and termination.
- General action requests.
- Persistence of selected actions and state transitions.
- Lifecycle integration across fresh starts and continuation entry paths.

### The utterance realizer owns

- Response-appropriate immediate feedback.
- Realizing a general scaffold action using adapter-provided target content.
- Producing the appropriate AutoTutor surface form for an expectation or misconception.
- Honoring the strengthened misconception-repair context contract.

The realizer does not decide which scaffold stage should fire.

## General SPARC contracts

The exact TypeScript names should be checked against nearby contracts before implementation. The conceptual contract is:

```text
InstructionalTarget
  targetKey             stable, adapter-defined canonical key
  targetKind            open string owned by the adapter
  status                active | resolved | unavailable
  currentProgress       normalized progress toward resolution
  resolutionThreshold
  realizationRef        opaque adapter-owned content reference

LearningObservation
  targetKey
  addressed             did the latest response substantively address this target?
  progressBefore
  progressAfter
  progressDelta         positive always means improvement
  madeProgress
  newlyResolved
  evidenceRef           opaque adapter-owned scoring evidence reference

InstructionalFocus
  focusEpisodeId
  targetKey
  startedAtTurn
  status                active | completed | abandoned

ScaffoldState
  focusEpisodeId
  stage                 pump | prompt | hint | assertion
  lastAction
  unsuccessfulAttempts
  policyId
  policyVersion
```

The general runtime must not inspect AutoTutor score slots. It consumes normalized progress. Raw semantic results remain adapter-owned evidence and should not be duplicated as a second learner model.

## AutoTutor instantiation

### Target mapping

```text
expectation(clusterKC)
  -> InstructionalTarget(
       targetKey = "expectation:" + clusterKC,
       targetKind = "expectation"
     )

misconception(id)
  -> InstructionalTarget(
       targetKey = "misconception:" + id,
       targetKind = "misconception"
     )
```

### Progress mapping

```text
expectation progressDelta
  = coverageAfter - coverageBefore

misconception progressDelta
  = confidenceBefore - confidenceAfter
```

The normalized direction is therefore identical: positive means the learner moved toward resolving the selected target.

`addressed` must come from the current semantic-scoring evidence. A zero delta cannot by itself distinguish an unsuccessful attempt from a response that did not address the target.

### Action mapping

The general policy should request functions, while the adapter supplies the AutoTutor terminology and realization context:

| General function | AutoTutor move | Philosophy |
| --- | --- | --- |
| `ELICIT` | Pump | Invite learner generation without supplying target content. |
| `FOCUS` | Prompt | Direct attention to the missing or problematic area. |
| `CUE` | Hint | Supply partial content or a stronger conceptual cue. |
| `SUPPLY` | Assertion | State the needed content or corrective contrast directly. |

Positive feedback plus `ELICIT` realizes the former positive-pump behavior. It does not require a fifth scaffold stage.

Summary remains a separate completion action. Immediate feedback remains an accompaniment to any scaffold action.

## General progressive-scaffolding policy

The canonical authored policy should be target-independent. It is instantiated in each of the ten AutoTutor stimulus examples and evaluated by the general SPARC production runtime:

### New focus

```text
IF an active focus episode has no scaffold state
THEN request ELICIT
AND persist stage = pump
```

### Escalate after an addressed response without sufficient progress

```text
IF last stage = pump
AND latest observation addressed the focused target
AND latest observation made insufficient progress
THEN request FOCUS
AND persist stage = prompt
```

```text
IF last stage = prompt
AND latest observation addressed the focused target
AND latest observation made insufficient progress
THEN request CUE
AND persist stage = hint
```

```text
IF last stage = hint
AND latest observation addressed the focused target
AND latest observation made insufficient progress
THEN request SUPPLY
AND persist stage = assertion
```

### Progress, resolution, and non-addressing responses

- Meaningful progress follows an explicit de-escalate-or-hold policy parameter; the first pilot must not leave this to salience.
- Resolution completes the focus episode and lets target selection create the next episode.
- A response that did not address the target must not be treated as an unsuccessful content attempt. It needs an explicitly selected repeat, reframe, or conversational-handling action.
- Behavior after an unsuccessful assertion remains a decision gate. No implementation should invent an implicit cycle.

The policy must make move conditions mutually exclusive. Salience may resolve genuinely independent activity, but it must not encode scaffold order.

## Exact production-rule migration contract

The four scaffold productions remain visible, inspectable configuration in every AutoTutor example. The runtime does not secretly replace them with a hard-coded AutoTutor controller. All four consume only general SPARC facts emitted by the adapter and runtime.

Current-config audit evidence: discovery by `unitType = sparc-autotutor-dialogue` finds ten displays. Each contains eleven production rules, and the normalized eleven-rule arrays are identical across all ten. The migration therefore has a clear measurable destination: ten validated instances of the same four scaffold rules plus completion, with lesson-specific target content left untouched.

The runtime-owned state-management behavior is:

```text
ON active target selected
  IF no active focus exists for that target
  THEN create instructionalFocus.episode
       initialize scaffold.state.stage = ELICIT

ON scored learner response
  derive learningObservation.targetProgress
  preserve whether the response addressed the focused target
  preserve whether progress was meaningful
  preserve whether the target became resolved

ON target resolved
  close the focus episode
  permit target selection to choose another target

ON selected target changes
  close the prior focus episode
  create a new focus episode at stage ELICIT
```

Those are lifecycle/state derivations, not competing dialogue-move productions. The five authored move-selection productions are as follows.

### 1. Pump production

```text
RULE dialogue.scaffold.pump
MODULE dialogue.move-selection

IF
  instructionalTarget.active(targetKey = T, focusEpisodeId = E)
  AND scaffold.state(focusEpisodeId = E, stage = ELICIT)
THEN
  assert controller.selectedAction(
    targetKey = T,
    focusEpisodeId = E,
    action = pump,
    sourceRuleId = dialogue.scaffold.pump
  )
  persist scaffold.state(
    focusEpisodeId = E,
    targetKey = T,
    stage = PUMP,
    lastAction = pump
  )
  terminate move-selection phase
```

This rule does not require progress evidence because it is the entry move for a new focus episode. The adapter-provided target kind changes the realized Pump content, not eligibility.

### 2. Prompt production

```text
RULE dialogue.scaffold.prompt
MODULE dialogue.move-selection

IF
  instructionalTarget.active(targetKey = T, focusEpisodeId = E)
  AND scaffold.state(focusEpisodeId = E, stage = PUMP)
  AND learningObservation.targetProgress(
        targetKey = T,
        addressed = true,
        madeProgress = false,
        newlyResolved = false
      )
THEN
  assert controller.selectedAction(
    targetKey = T,
    focusEpisodeId = E,
    action = prompt,
    sourceRuleId = dialogue.scaffold.prompt
  )
  persist scaffold.state(
    focusEpisodeId = E,
    targetKey = T,
    stage = PROMPT,
    lastAction = prompt
  )
  terminate move-selection phase
```

### 3. Hint production

```text
RULE dialogue.scaffold.hint
MODULE dialogue.move-selection

IF
  instructionalTarget.active(targetKey = T, focusEpisodeId = E)
  AND scaffold.state(focusEpisodeId = E, stage = PROMPT)
  AND learningObservation.targetProgress(
        targetKey = T,
        addressed = true,
        madeProgress = false,
        newlyResolved = false
      )
THEN
  assert controller.selectedAction(
    targetKey = T,
    focusEpisodeId = E,
    action = hint,
    sourceRuleId = dialogue.scaffold.hint
  )
  persist scaffold.state(
    focusEpisodeId = E,
    targetKey = T,
    stage = HINT,
    lastAction = hint
  )
  terminate move-selection phase
```

### 4. Assertion production

```text
RULE dialogue.scaffold.assertion
MODULE dialogue.move-selection

IF
  instructionalTarget.active(targetKey = T, focusEpisodeId = E)
  AND scaffold.state(focusEpisodeId = E, stage = HINT)
  AND learningObservation.targetProgress(
        targetKey = T,
        addressed = true,
        madeProgress = false,
        newlyResolved = false
      )
THEN
  assert controller.selectedAction(
    targetKey = T,
    focusEpisodeId = E,
    action = assertion,
    sourceRuleId = dialogue.scaffold.assertion
  )
  persist scaffold.state(
    focusEpisodeId = E,
    targetKey = T,
    stage = ASSERTION,
    lastAction = assertion
  )
  terminate move-selection phase
```

For an expectation, Assertion supplies missing ideal-answer content. For a misconception, it supplies a direct corrective contrast. The production is identical.

### 5. Completion production

```text
RULE dialogue.completion.summary
MODULE dialogue.move-selection

IF
  dialogue.completionSelected
  AND controller.completionState(completed = true)
THEN
  assert controller.selectedAction(
    action = summary,
    targetType = completion,
    sourceRuleId = dialogue.completion.summary
  )
  terminate move-selection phase
```

Completion is intentionally outside the scaffold progression.

### Progress and non-addressing branches

The four productions above deliberately cover the no-progress escalation chain. Before migration, the chosen policy must also be represented without overlapping move eligibility:

```text
IF addressed = true AND madeProgress = true AND newlyResolved = false
THEN update scaffold stage according to the selected hold/de-escalate policy
     and make exactly one subsequent move eligible

IF addressed = false
THEN handle repeat/reframe/meta dialogue through an explicit branch
     without advancing the scaffold stage

IF newlyResolved = true
THEN close the episode before another scaffold move can be selected

IF stage = ASSERTION AND another addressed no-progress response arrives
THEN execute the explicitly selected post-assertion policy
```

These cannot remain unspecified at implementation time because otherwise the new rule set would contain conflict-set gaps. Phase 0 must decide their actions and Phase 4 must add the minimum additional control or move productions required. They must not be covered through salience or a default move.

### Salience contract

The four scaffold productions should use equal salience, or omit salience if the schema permits it. Their stage conditions are mutually exclusive. Completion may have a higher salience only because session closure preempts target scaffolding; a test must prove that completion and an ordinary active-target move cannot both remain semantically valid after lifecycle derivation.

## Authored configuration contract

Each AutoTutor display should explicitly select its adapter and identify the canonical authored controller policy, using final field names chosen after the existing schema audit:

```json
{
  "instructionalController": {
    "adapterId": "sparc-autotutor-v1",
    "policyId": "progressive-scaffolding-v1",
    "policyVersion": 1,
    "parameters": {
      "minimumProgress": 0.05,
      "progressResponse": "deescalate"
    }
  }
}
```

This example is a shape proposal, not authorization to add redundant fields. Before adding it, audit the current `dialogue.thresholds`, display metadata, field registry, generated schemas, and config packages. Reuse or consolidate existing concepts.

The policy ID versions the four authored productions and their required facts; it does not hide a second runtime copy of those productions. The rules are:

1. A selected adapter must resolve through its registry, and the authored policy ID/version must be recognized by validation.
2. The adapter validates all required AutoTutor constructs.
3. Each AutoTutor package must contain exactly one conforming instance of the four scaffold productions and completion production.
4. Other non-controller production rules may remain if their effects do not compete for the controller action.
5. Invalid mixed ownership fails validation; the runtime does not choose one path silently.

## Runtime placement

Keep the general contracts within the SPARC unit architecture, initially under a focused area such as:

```text
learning-components/units/sparcsession/instructional-control/
  sparcInstructionalContracts.ts
  sparcInstructionalAdapterRegistry.ts
  sparcInstructionalFocus.ts
  sparcScaffoldState.ts
  sparcAuthoredPolicyValidation.ts
  adapters/sparcAutoTutorInstructionalAdapter.ts
```

The final paths should follow the existing module structure found during implementation. The adapter must not reach into deep Meteor client or server paths. Meteor integration should remain behind the existing SPARC unit-engine facade and runtime dependencies.

## Implementation phases

### Phase 0: Resolve design gates

Implemented decisions:

1. Meaningful progress de-escalates to Pump while the target remains active.
2. Non-addressing, off-task, meta, and clarification responses hold and repeat the current scaffold stage without advancing it.
3. An addressed no-progress response after Assertion cycles to Pump rather than repeating Assertion indefinitely.
4. One response may update multiple learner-model targets, but only the target in the active focus episode advances scaffold state.
5. Existing `dialogue.thresholds.coverageThreshold` remains the canonical expectation threshold; misconception resolution uses its complementary confidence threshold. `instructionalController.parameters.minimumProgress` defines meaningful turn progress.

These choices are encoded in the canonical authored productions and verified as mutually exclusive without salience.

### Phase 1: Introduce general contracts and registries

1. Add general target, observation, focus, scaffold-state, action-request, adapter, and policy interfaces.
2. Add the explicit adapter registry and authored-policy contract validation.
3. Reject unknown IDs and incompatible contracts.
4. Add unit tests with a synthetic non-AutoTutor adapter to prove the contracts contain no expectation/misconception assumptions.
5. Do not change production behavior in this phase.

### Phase 2: Implement the AutoTutor adapter with behavior parity

1. Adapt existing expectation selection into general targets.
2. Adapt existing misconception selection into general targets.
3. Convert current semantic scoring to normalized observations.
4. Carry addressed-target metadata and scoring evidence references.
5. Supply realization context for both target kinds.
6. Compare adapter outputs against representative current controller cases before changing move selection.

This phase should expose redundant representations if they exist. Stop before building on duplicate target, threshold, or identity concepts; consolidate them at their owning boundary.

### Phase 3: Add durable instructional focus and scaffold state

1. Create a new focus episode when the active target changes after another focus.
2. Key scaffold state by `focusEpisodeId`, not only by target key.
3. Persist the policy ID and version with the state.
4. Rehydrate focus and scaffold state through the single SPARC runtime-state owner.
5. Test fresh start, next attempt, reload, route re-entry, and continuation.
6. Treat histories created by the old SPARC runtime as unsupported input. Do not add a compatibility reader, state converter, or automatic reset path.

### Phase 4: Add the general rule facts, actions, and missing realization

1. Make the general facts and persistence effects needed by the four authored productions executable.
2. Add the general `SUPPLY` action and AutoTutor Assertion realization.
3. Decompose positive pump into response feedback plus `ELICIT`.
4. Keep summary outside the scaffold chain.
5. Add schema-valid canonical JSON for the four productions and prove selection is determined by facts and prior stage, not by salience.
6. Preserve the current stronger misconception-repair prompt context.

### Phase 5: Pilot Compound Interest

1. Add the explicit AutoTutor adapter and policy selection to the Compound Interest package.
2. Replace its eleven current move-selection productions with the canonical four scaffold productions plus completion.
3. Preserve its expectations, misconceptions, question, and scoring configuration.
4. Exercise expectation and misconception sequences independently.
5. Reproduce the reported misconception loop and prove that repeated no-progress turns advance through distinct stages.
6. Stop and continue the session at every stage to verify hydration.

Expected trace:

```text
new focus       -> Pump
no progress     -> Prompt
no progress     -> Hint
no progress     -> Assertion
resolved target -> close episode and select a new target
```

### Phase 6: Migrate the remaining AutoTutor packages

1. Audit all current `sparc-autotutor-dialogue` displays.
2. Add the explicit adapter and policy selection.
3. Replace each old eleven-rule array with the canonical four scaffold productions plus completion.
4. Validate all target IDs, realization references, and thresholds.
5. Confirm that no package references removed move IDs.
6. Keep lesson-specific content in each package; do not move domain content into runtime code.

The ten migration targets are:

1. `AutoTutor Compound Interest/AutoTutor_Compound_Interest_stims.json`
2. `AutoTutor Confidence Interval/AutoTutor_Confidence_Interval_stims.json`
3. `AutoTutor Correlation Causation/AutoTutor_Correlation_Causation_stims.json`
4. `AutoTutor Natural Selection/AutoTutor_Natural_Selection_stims.json`
5. `AutoTutor Nonviolent Communication/AutoTutor_Nonviolent_Communication_stims.json`
6. `AutoTutor Reinforcement Punishment/AutoTutor_Reinforcement_Punishment_stims.json`
7. `AutoTutor Special Relativity/AutoTutor_Special_Relativity_stims.json`
8. `AutoTutor Statistical Power/AutoTutor_Statistical_Power_stims.json`
9. `AutoTutor Stock Shorting/AutoTutor_Stock_Shorting_stims.json`
10. `AutoTutor Working Memory Long Term Memory/AutoTutor_Working_Memory_Long_Term_Memory_stims.json`

All paths are relative to `C:\dev\mofacts_config`. Migration verification must discover these by `unitType`, not rely only on this fixed list, so a newly added or renamed AutoTutor display cannot escape validation.

### Phase 7: Convert every non-AutoTutor SPARC package

1. Update the OLI converter and verifier to emit and require the new base SPARC contract.
2. Regenerate the 43 Intro Stats displays from the full OLI source into an isolated review directory.
3. Reconcile module IDs, page IDs, nodes, rules, and diagnostics against the checked-in package.
4. Replace `SPARC Intro Stats All Modules Bulk Upload` only after the regenerated output passes verification.
5. Convert Fractions, American History, and Stoichiometry directly to the new base contract.
6. Run unit-specific config/runtime tests for all four non-AutoTutor unit types.
7. Run repository-wide discovery and prove all 56 current SPARC displays satisfy the new contract.

### Phase 8: Delete obsolete paths

Deletion is allowed only after:

- Every AutoTutor package uses the registered adapter and contains the canonical authored policy productions.
- No package selects `positive_pump`, `elaborate`, or `splice` as scaffold primitives.
- No runtime path independently selects AutoTutor-specific scaffold moves.
- Replay tests cover histories created by the new runtime.
- Editor/catalog/schema surfaces support the new contract.
- The deployment cutover does not expose old SPARC sessions to the new runtime as resumable sessions.

Delete obsolete definitions rather than retaining a hidden compatibility controller.

## Persistence and clean-cutover plan

The new runtime supports only histories written under the new instructional-control contract. There is no runtime migration from old SPARC facts and no requirement to resume old SPARC sessions after deployment.

The cutover invariants are:

1. The ten updated AutoTutor configurations and the new runtime deploy together.
2. New sessions write and replay the new general focus and scaffold facts.
3. Old SPARC histories are not translated, reinterpreted, or loaded as new-runtime controller state.
4. The server does not run a startup migration, lazy migration, compatibility reader, or automatic session reset.
5. A history that lacks the new contract is outside the supported runtime domain. It must not be converted into an apparent fresh Pump episode.
6. Any operational archival, removal, or filtering of old session records is a deployment concern outside this runtime implementation and requires its own explicit data-handling decision if needed.

This simplifies persistence testing: continuation must work perfectly for sessions created by the new runtime, while old-runtime compatibility is intentionally untested and unsupported.

## Pre-deploy conversion of all authored SPARC content

The absence of a runtime migration does not mean old SPARC configuration remains valid. This is a clean runtime-contract replacement, so every SPARC display shipped in the config repository must be converted before deployment.

Current inventory, discovered from `C:\dev\mofacts_config` by `setspec.sparcPages[].display.unitType`:

| Unit type | Displays | Conversion owner |
| --- | ---: | --- |
| `sparc-autotutor-dialogue` | 10 | Update authored AutoTutor packages with the adapter contract and canonical four scaffold productions plus completion. |
| `sparc-intro-stats-variables` | 43 | Update the OLI converter, regenerate all modules from source, and verify generated output. |
| `sparc-fractions-addition` | 1 | Convert the hand-authored config directly. |
| `sparc-progressive-chapter` | 1 | Convert the hand-authored config directly. |
| `sparc-stoichiometry-dimensional-analysis` | 1 | Convert the hand-authored config directly. |
| **Total** | **56** | All must satisfy the new base SPARC contract before deployment. |

### What every SPARC display receives

Every display receives whatever new schema marker, base facts, lifecycle contract, state identity, and production-rule representation the new SPARC runtime requires. Validation must reject an old-contract display during build/config verification, before it reaches the server.

Unit-specific behavior remains separate:

- Only AutoTutor displays receive the AutoTutor adapter selection and Pump/Prompt/Hint/Assertion productions.
- Intro Stats retains its generated variable-learning behavior and receives the new base contract through its converter.
- Fractions, American History, and Stoichiometry retain their respective unit semantics while being rewritten to the new base contract.
- The general runtime must not infer a unit adapter or silently reinterpret old facts.

### OLI converter decision

The OLI converter is necessary for this cutover because it is the source owner for the 43 Intro Stats SPARC displays:

```text
C:\dev\mofacts_config\scripts\convert_oli_flat_module_to_sparc.ts
```

Its verification owner is:

```text
C:\dev\mofacts_config\scripts\verify_oli_sparc_conversion_output.ts
```

Required converter work:

1. Change the converter to emit only the new base SPARC contract.
2. Update converter fixtures/tests and output verification for the new schema and rule shape.
3. Regenerate all 43 Intro Stats modules from the original OLI source.
4. Compare the regenerated module/page inventory with the current inventory so content is neither lost nor duplicated.
5. Replace the checked-in generated packages with the verified output.
6. Prove that rerunning the converter produces no obsolete-contract fields.

The currently available full source is:

```text
C:\Users\ppavl\OneDrive\Active projects\mofacts-private-config\extracted_intro_to_stats_full_l71p6
```

The checked-in destination is:

```text
C:\dev\mofacts_config\SPARC Intro Stats All Modules Bulk Upload
```

Use an isolated review output first; do not point the first conversion run at the checked-in destination. The converter invocation shape is:

```powershell
node --experimental-strip-types scripts/convert_oli_flat_module_to_sparc.ts `
  --source-root '<full-OLI-source>' `
  --all-modules `
  --output-root '<isolated-review-output>' `
  --no-zip

node --experimental-strip-types scripts/verify_oli_sparc_conversion_output.ts `
  --package-root '<isolated-review-output>'
```

Do not write a general old-SPARC-to-new-SPARC server converter. The OLI tool remains a source-to-current-SPARC build tool. If a small one-time source-rewrite script is useful for the ten structurally identical AutoTutor packages, it may be used during development, but it is not shipped as runtime migration machinery.

### Pre-deploy conversion gate

Deployment is blocked until a repository-wide verifier proves:

1. All 56 discovered SPARC displays declare and validate against the new runtime contract.
2. No old-contract SPARC field or rule representation remains in config output.
3. The ten AutoTutor displays contain the canonical four scaffold productions plus completion.
4. The 43 Intro Stats displays match regenerated OLI converter output.
5. Fractions, American History, and Stoichiometry pass unit-specific behavior tests after direct conversion.
6. No config package depends on a runtime compatibility path.
7. The count of SPARC displays before and after conversion is reconciled, with additions or removals explicitly reviewed.

## Verification plan

### Contract tests

- AutoTutor constructs instantiate valid general targets and observations.
- Expectation progress increases with coverage.
- Misconception progress increases as misconception confidence decreases.
- One response can report multiple addressed targets without advancing multiple focus episodes.
- The general policy contains no target-kind branches.
- A synthetic second adapter can use the same policy.

### Policy tests

- Exactly one scaffold action is eligible for every defined state, ignoring salience.
- Pump, Prompt, Hint, and Assertion occur in order after addressed no-progress responses.
- Meaningful progress follows the selected hold/de-escalation policy.
- Non-addressing responses follow their explicit policy without accidental escalation.
- Resolution ends the current focus episode.
- Post-assertion behavior is bounded and explicit.
- The canonical rule set passes a table-driven conflict-set test for every defined combination of stage, addressed, progress, resolution, and completion state.
- With salience ignored, every valid move-selection state has exactly one eligible move and every terminal/lifecycle state has zero ordinary scaffold moves.

### Replay tests

- Fresh start creates one focus episode.
- Reload restores target, episode, policy version, and stage.
- Continuation across attempt IDs does not reset or duplicate state.
- Moving to another target creates a new episode.
- Returning to an earlier target follows the explicit new-episode policy.
- A malformed new-runtime history fails observably rather than being treated as a fresh session.
- No test or runtime code attempts to load, translate, or resume an old-runtime SPARC history.

### Realization tests

- Feedback is grounded in the latest learner response and scoring evidence.
- An expectation Assertion supplies missing ideal-answer content.
- A misconception Assertion supplies a correct contrast and does not reinforce the misconception.
- Positive feedback plus Pump replaces positive pump coherently.
- Summary is selected only through completion.

### Repository verification

- Run `npm run generate:schemas` if authoring fields or schemas change, and inspect generated diffs.
- Run `npm run typecheck` and `npm run lint` from `mofacts/`.
- Parse and validate every changed config package in `C:\dev\mofacts_config`.
- Use the native hotfix app and MoFaCTS Playwright sidecar for the Compound Interest pilot.
- Inspect browser-visible move traces and console/network errors.
- Repeat continuation tests on at least one expectation-focused and one misconception-focused session.
- Assert that discovery finds exactly the expected ten current AutoTutor displays, while reporting any additional display as a migration failure requiring review.
- Parse each migrated file and compare normalized scaffold-rule IDs, modules, conditions, effects, and policy version against the canonical template.
- Assert that the migrated packages contain none of the retired move-selection IDs or actions: `paper-rule-*`, `misconception-repair-splice`, `positive_pump`, `elaborate`, or `splice`.
- Discover and validate every SPARC display in the config repository, not only AutoTutor displays; the current baseline is 56.
- Run the updated OLI converter and its output verifier, then confirm all 43 generated Intro Stats displays use the new contract.
- Run focused configuration/runtime tests for Fractions, American History, and Stoichiometry after their direct conversion.

### End-to-end verification goal

For each of the ten migrated examples, run a data-driven controller suite with adapter-specific authored content and shared state sequences:

```text
Case A: expectation, new focus       -> Pump
Case B: expectation, no progress     -> Prompt -> Hint -> Assertion
Case C: misconception, new focus     -> Pump
Case D: misconception, no progress   -> Prompt -> Hint -> Assertion
Case E: meaningful progress          -> selected hold/de-escalate behavior
Case F: target resolved              -> episode closes; next target starts at Pump
Case G: response does not address T  -> no accidental escalation
Case H: completion                   -> Summary only
Case I: reload at every stage        -> same episode and next correct move
Case J: malformed new-runtime state  -> explicit failure, never fresh-state substitution
```

At least Compound Interest must additionally receive browser-visible local smoke testing because it reproduces the original repeated-Splice failure. The remaining nine require the complete controller/config integration suite; representative browser smoke tests should cover both target kinds and at least one resumed session. The migration is complete only when all ten parse, validate, load, select legal moves, realize an utterance, persist state, and continue without a rule gap or duplicate eligible scaffold move.

## Acceptance criteria

1. Stimulus files contain AutoTutor domain and scoring constructs plus exactly four canonical scaffold productions and one completion production, replacing the old eleven-rule arrays.
2. The AutoTutor adapter is the only component that interprets expectation coverage and misconception confidence.
3. The general SPARC policy operates on normalized target, observation, focus, and scaffold facts.
4. The four-stage progression is deterministic without salience encoding its order.
5. Immediate feedback remains appropriate to the latest learner response at every stage.
6. Expectation and misconception targets use the same policy implementation.
7. A non-AutoTutor adapter can instantiate the same general contracts without adding branches to the controller.
8. Sessions created by the new runtime resume with the exact focus episode and scaffold stage or fail explicitly.
9. Missing adapters, policies, required constructs, or malformed new-runtime state never trigger a silent substitute path.
10. Obsolete AutoTutor move-selection primitives and old duplicated rule variants are removed after the migration gate.
11. The runtime contains no old-SPARC compatibility reader, history conversion, startup migration, or lazy migration.
12. All SPARC config content is converted before deployment: currently 56 displays across five unit types.
13. The OLI converter emits the new contract, so regeneration cannot reintroduce obsolete SPARC structures.

## Recommended first implementation slice

The narrowest coherent slice is:

1. General interfaces and explicit registries.
2. AutoTutor adapter output in observation-only/parity tests.
3. Durable focus/scaffold state with continuation coverage.
4. The general facts/effects required by the authored progressive rules and the Assertion realization.
5. Compound Interest as the single stimulus migration pilot.

That slice proves the architectural boundary and the reported behavioral fix before changing the remaining packages. Once it passes, the rest of the stimulus migration should be primarily validation and deletion rather than new controller design.
