# SPARC AutoTutor Runtime Cleanup Plan

## Summary

This plan runs after the ten SPARC AutoTutor TDFs have been converted to remove duplicated authored AutoTutor facts.

This is not a redesign of how SPARC represents the AutoTutor dialogue. Runtime continues to use SPARC nodes for the dialogue UI. Runtime should no longer require authored `learningTarget.source`, `diagnostic.misconceptionSource`, or `dialogue.moveContent` as the source of SPARC AutoTutor target content. Converted SPARC AutoTutor content provides expectation target text through cluster cases and misconception target text through a dedicated non-rendered misconception table. Existing `clusterTargets` remain available for legacy SPARC compatibility in this phase, but AutoTutor target identity is `clusterKC`.

## Runtime Invariants

- Expectations are addressed by `clusterKC`.
- Misconceptions are addressed by `id`.
- Authored expectation text comes from cluster cases.
- Authored misconception text comes from the non-rendered misconception table.
- Runtime continues to use SPARC nodes for the AutoTutor dialogue UI; target text is read from cluster cases and the misconception table.
- Registered move definitions remain in runtime code.
- Authored production rules may assert `controller.selectedAction`.
- `controller.selectedAction` is runtime/controller state, not target content.
- `dialogue.moveContent` is not read, generated, reconstructed, or tolerated.
- KC graph facts are generated from clean expectations, not authored source facts.
- Score facts remain runtime state and are keyed by clean ids.
- `clusterTargets` and numeric `clusterIndex` / `clusterIndices` remain legacy SPARC compatibility fields for now.
- In the SPARC AutoTutor path, `stimulusKC`, `KCId`, `KCDefault`, and `KCCluster` are not authored target identities. Runtime code should use `clusterKC`; any still-required legacy history/model identity slots must use the same `clusterKC` value at the boundary that requires them.

## Replace Target Sources

Replace runtime reads of old expectation structures:

```text
learningTarget.source
```

with reads of the clean expectation view derived from cluster cases.

Runtime consumers must use `clusterKC` and `text` directly from the clean expectation entries.

Replace runtime reads of old misconception structures:

```text
diagnostic.misconceptionSource
```

with reads of the dedicated non-rendered misconception table.

Runtime consumers must use `id` and `text` directly from the clean misconception entries.

## Runtime Consumers To Update

Update every runtime consumer discovered to depend on redundant source structures:

- `sparcTargetSelection`: enumerate required expectations from cluster cases, not `learningTarget.source`; enumerate misconceptions from the misconception table, not `diagnostic.misconceptionSource`.
- `sparcControllerTurnPlanning`: use clean expectations for completion target selection and clean misconceptions for repair-active checks.
- `sparcControllerDerivedFacts`: derive controller facts from clean expectations instead of `learningTarget.source`.
- `sparcSelectorSignals`: derive expectation and misconception selector signals from cluster cases and the misconception table.
- `sparcUtteranceRequest`: build selected target content from clean expectation/misconception entries and remove `dialogue.moveContent` matching.
- `sparcLearnerResponseScoring`: preserve runtime score facts, but stop treating `learningTarget.source` as a required authored source.
- `sparcControllerDialogueOpenRouter`: build scoring prompt summaries from clean expectations/misconceptions; remove repair fields and `dialogue.moveContent` reads.
- `sparcAutoTutorProgress`: show progress from clean expectations/misconceptions plus score facts, not source facts.
- `packageUploadPostProcess` and `clusterKcRelationshipEngine`: generate KC graph facts from clean expectations and remove `sourceId`.
- `SparcSessionUnitEngine` and `sparcTrialDisplayRuntimeBridge`: keep `clusterTargets` and numeric reference handling, but support SPARC AutoTutor `clusterTargets` whose identity is only `clusterKC`.
- `sparcAuthoredModelTargets`, `sparcDocumentAddressing`, and `sparcDocumentValidation`: keep numeric target-reference support in this phase, while allowing the AutoTutor target path to use `clusterKC` for any generic model-practice identity slot still required internally.
- replay/history helpers and tests: keep existing model-practice identity behavior where needed for non-AutoTutor SPARC, but do not reintroduce `stimulusKC`, `KCId`, `KCDefault`, or `KCCluster` as authored AutoTutor target schema.
- all SPARC AutoTutor tests that currently seed `learningTarget.source`, `diagnostic.misconceptionSource`, or `dialogue.moveContent`: update fixtures to use cluster cases and the misconception table. Keep `clusterTargets` and numeric references unless the test is specifically about deleted duplicated facts.

## Remove Move Content Dependency

Delete the runtime requirement for authored `dialogue.moveContent`.

Current behavior matches `controller.selectedAction` to authored `dialogue.moveContent` by target type, move action, and target id. Replace that with:

```text
controller.selectedAction
+ registered runtime move definition
+ clean target text
```

Expected changes:

- keep `controller.selectedAction`
- keep `sparcMoveDefinitions`
- keep authored production rules that select moves
- remove `dialogue.moveContent` from registered move `requiredFacts`
- remove `dialogue.moveContent` from required move facts
- stop throwing when `dialogue.moveContent` is absent
- build utterance request content from the selected clean expectation or misconception
- keep move prompt policy from the registered runtime move definition
- update tests that currently seed `dialogue.moveContent` so they assert this runtime-owned move path instead

## Prompt Content

Update both LLM prompt paths to use cluster cases and the misconception table directly.

Scoring prompt inputs:

```text
cluster case clusterKC
cluster case text
misconception table id
misconception table text
```

The scoring prompt should compare learner responses against expectation text and misconception text. Remove old prompt/schema names that imply separate authored target meanings, including `assertion`, `proposition`, and `description`.

Utterance prompt inputs:

```text
controller.selectedAction
registered runtime move definition
selected expectation text from cluster cases or misconception text from the misconception table
planner state
dialogue history
```

The utterance prompt must not read or recreate `dialogue.moveContent`.

## KC Graph Generation

Update KC graph generation so it derives graph nodes from the clean expectation view over cluster cases.

The graph source for each node should be:

```text
clusterKC
text
```

Generated graph facts may remain runtime/upload artifacts if target selection still needs them, but they must not be treated as authored target schema.

Remove obsolete graph/source identity fields such as:

```text
sourceId
```

## Legacy Target References

Keep existing `clusterTargets`, `clusterIndex`, and `clusterIndices` runtime support in this phase. These are legacy SPARC compatibility structures and are not part of the duplicated AutoTutor prose cleanup.

For SPARC AutoTutor content, `clusterTargets` should be interpreted as an index-to-`clusterKC` bridge. They should not require or preserve authored `stimulusKC`, `KCId`, `KCDefault`, or `KCCluster`. If generic SPARC history/model-practice code still needs those legacy names internally, use the same `clusterKC` value for those slots after load and keep that boundary mapping out of the authored stimulus file.

## Score Facts

Keep runtime score facts, but key them by clean ids:

```text
learningTarget.score.clusterKC
diagnostic.misconceptionScore.id
```

Do not introduce a parallel `misconceptionId` score field unless a separate intentional rename is approved.

Known score/progress cleanup:

- OpenRouter scoring currently asks for `diagnosticMisconceptionScores[i].id`; keep that identity aligned with the misconception table.
- Progress code currently looks up misconception scores by `id`; keep it aligned with the clean misconception `id`.
- Replay/history assertions should verify that score facts remain runtime state and are not confused with authored target/source definitions.

## Runtime Rejection Rules

After the converted TDFs are available, SPARC AutoTutor runtime should reject content that still contains:

- `dialogue.moveContent`
- `diagnostic.misconceptionSource`
- `learningTarget.source` as authored target source
- `sourceId` in generated or authored target/reference structures
- `sourceAutoTutor`
- `stimulusKC` as an authored AutoTutor target identity
- `KCId`
- `KCDefault`
- `KCCluster`
- duplicate expectation ids such as `E1`, `E2`, `E3`
- duplicated authored target text outside cluster cases and the misconception table
- misconception repair prompts or criteria in stimulus content

Generic SPARC compatibility keeps `clusterTargets` and numeric target references in this phase. `stimulusKC`, `KCId`, `KCDefault`, and `KCCluster` are removed from converted SPARC AutoTutor authored target content.

## Runtime Test Plan

- Repeatable cleanup gate:

```bash
cd mofacts
npm run check:sparc-autotutor-runtime-cleanup
```

This command verifies the canonical config repo at `C:\dev\mofacts_config`, audits all ten converted `AutoTutor *` packages for deleted source fields, and instantiates the SPARC session unit engine for each package to build the AutoTutor dialogue display from clean cluster-case expectations and misconception-table text.

- Runtime load test: each of the ten converted SPARC AutoTutor TDFs loads through `sparcsession`.
- Utterance request test: selected action plus clean target text produces a tutor utterance request without `dialogue.moveContent`.
- Move registry test: registered move policy is still included in the LLM prompt.
- Target selection test: expectations are enumerated from cluster cases.
- Misconception selection test: misconceptions are enumerated from the misconception table.
- KC graph generation test: graph nodes and relationships are generated from clean expectations.
- Progress UI test: SPARC AutoTutor progress renders from clean expectations/misconceptions and score facts.
- OpenRouter scoring prompt test: prompt summaries use clean expectation/misconception text and do not include `assertion`, `proposition`, repair fields, or `dialogue.moveContent`.
- Runtime identity test: converted SPARC AutoTutor `clusterTargets` with only `clusterIndex` and `clusterKC` load, and any generic history/model identity needed internally uses `clusterKC` for the legacy identity slots.
- Replay/history test: converted SPARC AutoTutor replay uses clean ids and does not resurrect old source structures.
- Fixture cleanup test: SPARC AutoTutor tests no longer seed `learningTarget.source`, `diagnostic.misconceptionSource`, or `dialogue.moveContent` except in explicit rejection tests.
- Forbidden-runtime-field test: converted SPARC AutoTutor content with deleted legacy fields is rejected.
- Target-source test: the SPARC AutoTutor dialogue still runs through SPARC nodes, while expectation target text is read from cluster cases and misconception target text is read from the misconception table.
- End-to-end smoke test: submit one Confidence Interval response and verify scoring, progress, target selection, move selection, tutor response, and replay.
- Regression test: existing non-AutoTutor SPARC sessions still load unchanged.
- Boundary test: legacy `autotutorsession` remains unchanged.

## Sequencing

1. Land the converter and convert the ten `AutoTutor *` directories in `C:\dev\mofacts_config`.
2. Review the dry-run and written conversion reports.
3. Hand-edit target wording where needed.
4. Update runtime consumers to require cluster-case expectations and the clean misconception table.
5. Remove runtime compatibility reads for deleted structures.
6. Run TypeScript, focused runtime tests, and UI smoke testing through the hotfix dev loop.
