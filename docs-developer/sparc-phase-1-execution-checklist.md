# SPARC Phase 1 Execution Checklist

This checklist is the implementation playbook for the two example-first contracts in
[SPARC Runtime Usage Checklist](/c:/dev/mofacts_config/SPARC_Runtime_Usage_Checklist.md).

## 1) Foundation (parser and layout contracts)

- [ ] Parse and validate `display.type === "sparc"` and `display.schema === "tutorscript-sparc/1.0"` for both SPARC packages.
- [ ] Resolve linked `*_stims.json` from both `_TDF.json` packages.
- [ ] Reject missing required fields with explicit diagnostics:
  - `display.type`, `display.schema`, `display.layout.zones`, `nodes`, `response.scoredNodes`, `response.intentByNode`.
- [ ] Build `nodeIndex` and fail on:
  - duplicate node IDs,
  - required `group`/`atomic` IDs missing,
  - required `placement.region` not in declared zones.

## 2) Semantic model and action interpretation

- [ ] Add `SparcParsedStimulus` and `SparcSemanticAction` contracts.
- [ ] Implement `toSemanticAction(rawEvent, context)` with deterministic mapping for:
  - value/selection/text input components in both examples.
- [ ] Guarantee every interpreted action includes:
  - `actionType`, `componentId`, `activityId`, `timestamp`.

## 3) Grading and scoring behavior

- [ ] Implement grading gate driven only by:
  - `response.gradingMode`,
  - `response.evaluation`,
  - `response.scoredNodes`,
  - `response.intentByNode`.
- [ ] Validate every `scoredNode` has an `intentByNode` entry and fail fast when mismatch exists.
- [ ] Preserve `readOnly` state semantics exactly as provided in example payload.

## 4) Rule bridge and actions

- [ ] Build normalized rule input facts from runtime state and latest semantic action.
- [ ] Keep `json-rules-engine` as fixed evaluator.
- [ ] Ensure rule outputs are only `runtimeAction` contracts.
- [ ] Require action metadata:
  - `meta.ruleId`,
  - `meta.firedAt`,
  - `meta.sequence`.

## 5) State and history

- [ ] Add deterministic state-updater path for `domainState` changes.
- [ ] Keep XState for flow only (`mode`, activity transitions, completion states).
- [ ] Emit history entry on every learner or interface action:
  - raw event, semantic action, rule result, state delta, KT delta.
- [ ] Record explicit sequence ordering for all entries (`sequence`).

## 6) KT and stimulus evidence

- [ ] Keep existing flash-card KT integration path.
- [ ] Ensure graded outcomes are tagged with `stimulusid` evidence for learner-model updates.
- [ ] Do not introduce new KT strategy in phase 1.

## 7) End-to-end verification

- [ ] Execute full run for Fractions contract:
  - fraction conversion inputs,
  - sum numerators/denominator behavior,
  - expected UI regions.
- [ ] Execute full run for Stoichiometry contract:
  - panel layout and width constraints,
  - fixed givens preserved,
  - reason/result checks from scored intent nodes.
- [ ] Produce a final diagnostics report:
  - hard failure count,
  - unknown region/type list,
  - missing references,
  - warning list.
