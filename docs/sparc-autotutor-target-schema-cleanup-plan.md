# Clean SPARC AutoTutor Target Schema Conversion Plan

## Summary

This plan applies only to the ten identified **SPARC-backed AutoTutor TDFs** that run through ordinary `sparcsession`. It does not change legacy/original `autotutorsession`, and it does not change non-AutoTutor SPARC content.

This is the first phase of the cleanup. It converts the authored content shape before runtime code is changed to require the clean shape.

This is not a redesign of how SPARC represents the AutoTutor dialogue. The dialogue experience already remains in SPARC `nodes`; this plan only cleans the authored target-source data that the AutoTutor runtime reads.

The cleanup has these goals:

- Expectations use one identity: `clusterKC`.
- Misconceptions keep a separate misconception identity: `id`.
- SPARC AutoTutor expectation target text comes from the existing cluster cases.
- SPARC AutoTutor misconception target text lives in one explicit non-rendered misconception table.
- Leave the SPARC AutoTutor dialogue nodes alone; do not create additional target-text nodes that duplicate cluster cases or the misconception table.
- Authored target English appears once.
- Authored working-memory facts do not contain `dialogue.moveContent`.
- Misconception repair prompts and criteria are removed from authored stimulus content.
- KC graph facts are not authored target/source schema; they are generated from clean expectations.
- Existing `clusterTargets` and numeric `clusterIndex` / `clusterIndices` references are preserved for legacy SPARC runtime compatibility in this cleanup, but AutoTutor `clusterTargets` use `clusterKC` as the only target identity.
- Production rules stay authored in the SPARC display and may continue to assert `controller.selectedAction`.
- Target wording cleanup is done by hand after conversion, not by the converter.

## Clean Target Sources

Expectations are the existing cluster cases. The clean expectation view is:

```ts
type AutoTutorExpectation = {
  clusterKC: string;
  text: string;
};
```

`clusterKC` comes from the cluster case. `text` comes from the authored cluster/stimulus text for that cluster. Do not add a parallel expectation target list when the cluster cases already provide the expectation targets.

Misconceptions:

```ts
type AutoTutorMisconception = {
  id: string;
  text: string;
};
```

Misconceptions live in a dedicated non-rendered misconception table:

```ts
type SparcAutoTutorMisconceptionTable = {
  misconceptions: AutoTutorMisconception[];
};
```

SPARC AutoTutor itself is already authored as SPARC nodes for the dialogue/screen experience, including messages, inputs, buttons, progress, and layout groups. This cleanup does not change that representation. It only removes duplicated target-source data and makes runtime target reads come from cluster cases and the misconception table. Do not add parallel expectation target blocks or alternate target names for the same content.

## Authored Content Boundaries

The converted SPARC AutoTutor stimulus content must contain targets and target references, not duplicated runtime dialogue content.

The converter is responsible for removing every redundant authored target/source representation discovered in the current SPARC AutoTutor shape:

- `learningTarget.source` as duplicated expectation source text
- `diagnostic.misconceptionSource` as duplicated misconception source text
- `dialogue.moveContent` as move-scoped duplicated target text
- `diagnostic.misconceptionSource.repair`
- `diagnostic.misconceptionSource.repairQuestion`
- `diagnostic.misconceptionSource.repairCriteria`
- `sourceId` as an obsolete source-layer identity
- `stimulusKC`, `KCId`, `KCDefault`, and `KCCluster` as obsolete AutoTutor authored-target identities

Retain these legacy SPARC compatibility structures in the converted files for now:

- `clusterTargets`, rewritten to use `clusterIndex`, `clusterKC`, and optional display metadata only
- numeric `clusterIndex` / `clusterIndices`

For SPARC AutoTutor content, `clusterKC` is the authored expectation identity. Do not preserve `stimulusKC`, `KCId`, `KCDefault`, or `KCCluster` as separate authored target identities. If a generic history/model boundary still requires those legacy slots during runtime, use the same `clusterKC` value for them at that boundary instead of storing them in the converted stimulus content.

Remove the entire authored working-memory construct:

```text
dialogue.moveContent
```

Do not preserve move-scoped copies of expectation text, misconception text, summary text, repair questions, or splice text. The move registry and move prompt policies live in runtime code, not in the stimulus file.

Remove misconception repair-authoring fields from stimulus content:

```text
diagnostic.misconceptionSource.repair
diagnostic.misconceptionSource.repairQuestion
diagnostic.misconceptionSource.repairCriteria
```

Production rules are not removed by this conversion. Authored SPARC production rules may continue to select registered runtime moves by asserting `controller.selectedAction`.

## KC Graph Boundary

The KC graph is derived from expectations. It should not be treated as authored target/source schema in the converted stimulus file.

After conversion, graph generation should use the clean expectation view derived from cluster cases as the source for embedding text and `clusterKC` identity. Existing authored or generated graph facts should not be used as the canonical target list.

Generated graph facts must not carry obsolete source-layer fields such as:

```text
sourceId
```

## Ten-TDF Conversion Scope

The converter must run against the ten `AutoTutor *` directories in `C:\dev\mofacts_config`.

The converter must:

- fail if it does not find exactly ten `AutoTutor *` directories
- fail if any directory does not contain a TDF/stimulus pair
- fail if any discovered TDF/stimulus pair is not SPARC-backed AutoTutor content
- report each converted TDF by stable file name or TDF id
- report every removed legacy field per TDF
- report every rewritten target and reference count per TDF
- leave non-AutoTutor directories untouched
- leave non-AutoTutor SPARC packages unchanged
- produce a dry-run report before writing changes

The ten-file conversion set must be explicit in the dry-run report and reviewable before writes.

## Converter Work

Add a converter/normalizer for SPARC-backed AutoTutor config packages.

For each of the ten TDFs, the converter must:

- rewrite expectation definitions to `{ clusterKC, text }`, preserving the current expectation text
- rewrite misconception definitions to `{ id, text }`, preserving the current misconception text
- remove duplicate expectation ids such as `E1`, `E2`, `E3`
- keep expectation targets in the cluster cases rather than writing a second expectation list
- write the single canonical misconception inventory to the dedicated non-rendered misconception table
- remove duplicated English definitions from parallel structures after moving the existing expectation/misconception text to the canonical `text` fields
- derive the clean canonical expectation view from existing cluster cases and authored cluster/stimulus text, without relying on `sourceAutoTutor`
- derive the clean canonical misconception inventory from existing misconception ids and text without preserving repair prompts or criteria
- remove `learningTarget.source` after its expectation text has been preserved in the cluster cases
- remove `diagnostic.misconceptionSource` after its misconception text has been preserved in the misconception table
- remove the entire authored `dialogue.moveContent` construct
- remove misconception repair fields from authored stimulus content
- remove `sourceAutoTutor` as conversion provenance/cruft
- remove generated KC graph source-layer fields that duplicate target identity, including `sourceId`
- preserve existing `clusterTargets` and numeric `clusterIndex` / `clusterIndices` references for this cleanup
- rewrite AutoTutor `clusterTargets` so their target identity is `clusterKC`; remove `stimulusKC`, `KCId`, `KCDefault`, and `KCCluster` from those entries
- preserve authored production rules, including rules that assert `controller.selectedAction`
- preserve existing non-AutoTutor SPARC packages unchanged

The converter must not rewrite, generalize, or improve target text. Any wording cleanup, including Confidence Interval wording, is a separate hand edit after conversion.

## Validation After Conversion

Converted SPARC AutoTutor stimulus content must fail validation if the cleaned target/reference layer still contains:

- `learningTarget.source`
- `diagnostic.misconceptionSource`
- duplicate expectation ids
- duplicated authored target text in parallel source structures
- `dialogue.moveContent`
- `diagnostic.misconceptionSource.repair`
- `diagnostic.misconceptionSource.repairQuestion`
- `diagnostic.misconceptionSource.repairCriteria`
- `sourceId`
- `sourceAutoTutor`
- `stimulusKC` as an authored AutoTutor target identity
- `KCId`
- `KCDefault`
- `KCCluster`

Production-rule move selection through `controller.selectedAction` is allowed and is not part of the forbidden authored target/reference layer.

`clusterTargets` and numeric `clusterIndex` / `clusterIndices` remain tolerated legacy SPARC compatibility fields in this phase. In converted SPARC AutoTutor content, `clusterTargets` must not retain `stimulusKC`, `KCId`, `KCDefault`, or `KCCluster`; `clusterKC` is the single authored target identity.

Runtime and replay score facts are not authored target definitions. The converter should not treat `learningTarget.score` or `diagnostic.misconceptionScore` as stimulus target text sources.

## Test Plan

- Schema tests for the clean expectation view derived from cluster cases.
- Schema tests for the dedicated non-rendered misconception table.
- Converter dry-run test over the ten `AutoTutor *` directories.
- Per-TDF conversion report test showing preserved text, rewritten identities, removed fields, and unchanged non-target content.
- Confidence Interval conversion test preserving existing text while changing only shape.
- Forbidden-field test for the cleaned SPARC AutoTutor target/reference layer, including `stimulusKC`, `KCId`, `KCDefault`, and `KCCluster`.
- Report test that itemizes removals of `learningTarget.source`, `diagnostic.misconceptionSource`, `dialogue.moveContent`, repair fields, and `sourceId`.
- Report test that itemizes removal of `sourceAutoTutor`.
- Cluster-target rewrite test proving AutoTutor `clusterTargets` keep `clusterIndex` / `clusterKC` and drop legacy identity aliases.
- Regression test proving non-AutoTutor SPARC sessions are not rewritten.
- Boundary test proving legacy `autotutorsession` remains unchanged.

## Assumptions

- `clusterKC` is the canonical expectation identity.
- Cluster cases are the canonical authored location for expectation target text.
- Misconceptions are not KCs.
- Misconceptions need a separate non-rendered table because they are not cluster cases.
- `id` remains the canonical misconception identity unless a separate intentional rename is approved.
- Numeric cluster indices and `clusterTargets` are retained for legacy SPARC compatibility in this phase, but AutoTutor `clusterTargets` carry only `clusterKC` for target identity.
- For SPARC AutoTutor authored target content, `stimulusKC`, `KCId`, `KCDefault`, and `KCCluster` are redundant aliases of `clusterKC` and are removed.
- The ten TDFs are the ten `AutoTutor *` directories in `C:\dev\mofacts_config`.
- Converter runs before runtime testing.
- Target wording improvements are hand edits after conversion, not converter behavior.
- Runtime move definitions are code-owned.
- Authored production rules remain in SPARC content and may select registered runtime moves.
