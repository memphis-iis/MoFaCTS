# History Stimulus Identity Cleanup Plan

## Goal

Make stimulus identity in MoFaCTS explicit, durable, and maintainable across:

- imported stimulus records,
- learning-session model state,
- client history rows,
- server history persistence,
- analytics/export code,
- future crowd-level stimulus aggregates.

The current field set is too implicit and too easy to misuse. Before adding more derived models on top of history, define the contract and then migrate call sites toward it.

## Problem Statement

Current standard model history rows carry several related identity fields:

```ts
itemId
KCId
KCDefault
KCCluster
KCCategoryDefault
KCCategoryCluster
TDFId
```

The current learning-session history writer sets:

```ts
itemId = stim._id
KCId = stimulusKC
KCDefault = stimulusKC
KCCluster = clusterKC
```

However, the canonical stimulus conversion path creates stimulus item objects with:

```ts
stimuliSetId
stimulusKC
clusterKC
responseKC
```

and does not clearly assign an `_id` to each stimulus item in that path.

That means:

- `stimulusKC` is currently the meaningful item-level model identity.
- `KCId` is the persisted history alias for `stimulusKC`.
- `KCDefault` duplicates `KCId`.
- `KCCluster` is cluster-level identity, not item-level identity.
- `itemId` may be optional or path-dependent and should not be treated as canonical until proven stable.
- `stimuliSetId` is present on TDF/stimulus records but is not part of the standard client history row.

This is unsafe because future logic can accidentally aggregate by cluster, by optional record id, or by a legacy alias while believing it is aggregating by practiced stimulus item.

## Core Invariants

- A practiced stimulus item must have exactly one canonical item-level identity in runtime model state.
- A persisted history row must make the practiced stimulus identity unambiguous.
- Cluster identity must be visibly separate from stimulus item identity.
- Response identity must be visibly separate from stimulus item identity.
- Optional database record ids must not be silently promoted to canonical model identities.
- No silent fallbacks are allowed.
- Missing identity for a countable model-practice row is an invariant breach, not a recoverable condition.
- Existing working history reconstruction and adaptive logic must remain regression-sensitive while the cleanup is staged.

## Target Identity Contract

Introduce named, domain-specific fields for new code:

```ts
type StimulusSetIdentity = {
  stimuliSetId: string | number;
};

type StimulusItemIdentity = StimulusSetIdentity & {
  stimulusKC: string | number;
};

type StimulusClusterIdentity = StimulusSetIdentity & {
  clusterKC: string | number;
};

type ResponseIdentity = {
  responseKC: string | number;
  responseKey: string;
};

type StimulusRecordIdentity = StimulusItemIdentity & StimulusClusterIdentity & {
  response?: ResponseIdentity;
  stimulusRecordId?: string;
};
```

Meaning:

- `stimuliSetId`: scope for the stimulus set.
- `stimulusKC`: canonical practiced stimulus item key within the stimulus set.
- `clusterKC`: cluster/group key.
- `responseKC`: response/answer key.
- `responseKey`: normalized answer text used to allocate `responseKC`.
- `stimulusRecordId`: optional persistence record id, only if the source guarantees one.

Derived aggregate key:

```ts
stimulusKey = `${stimuliSetId}:${stimulusKC}`
```

Do not represent these identities as naked numbers or unscoped strings in new code. Use a structured object at subsystem boundaries, then derive string keys only at map/database-index boundaries.

Legacy history aliases:

```ts
KCId === stimulusKC
KCDefault === stimulusKC
KCCluster === clusterKC
```

These aliases can remain for backward compatibility, but new internal logic should prefer the explicit names once they exist on history records.

## Proposed History Shape

New standard model-practice history rows should persist explicit fields alongside legacy aliases:

```ts
type ModelPracticeHistoryIdentity = {
  stimuliSetId: string | number;
  stimulusKC: string | number;
  clusterKC: string | number;
  responseKC?: string | number;
  responseKey?: string;
  stimulusRecordId?: string;

  // Legacy aliases retained for export/backward compatibility.
  KCId: string | number;
  KCDefault: string | number;
  KCCluster: string | number;
};
```

Validation invariant:

```ts
KCId === stimulusKC
KCDefault === stimulusKC
KCCluster === clusterKC
```

`itemId` should either be renamed to `stimulusRecordId` once proven stable, or left as a legacy/export-only field. It should not be the primary model or aggregate key until every stimulus creation path assigns it deliberately.

## Proposed Runtime Shape

Prepared card/stimulus objects should carry a single structured identity field rather than spreading identity across ad hoc top-level properties:

```ts
type PreparedStimulus = {
  identity: StimulusRecordIdentity;
  model: {
    params: unknown[];
    optimalProb?: unknown;
  };
  response: {
    correctResponse: unknown;
    incorrectResponses?: unknown[];
  };
  display: Record<string, unknown>;
};
```

Existing top-level `stimulusKC`, `clusterKC`, and `responseKC` can remain during migration, but the structured identity should become the source used by history writing, model initialization, and aggregate updates.

## Proposed Aggregate Shape

The first crowd aggregate should be item-level and set-scoped:

```ts
type StimulusCrowdStats = {
  stimulusKey: string; // `${stimuliSetId}:${stimulusKC}`
  stimuliSetId: string | number;
  stimulusKC: string | number;
  clusterKC?: string | number;
  responseKC?: string | number;
  correctCount: number;
  incorrectCount: number;
  totalCount: number;
  lastOutcomeAt: number;
  updatedAt: Date;
};
```

`clusterKC`, `responseKC`, and `stimulusRecordId` are secondary metadata. They must not replace `stimuliSetId + stimulusKC` as the aggregate identity.

## Nearby Similar Issues

- `historyReconstruction.ts` keys cluster state by `KCCluster`, stimulus state by `KCId`, and response state by `CFCorrectAnswer`. This works for legacy rows, but it mixes KC identity and answer-text identity without a named contract.
- `adaptiveRuleEvaluation.ts` converts `KCId % KC_MULTIPLE` into a cluster-style key, while current-stimulus defaults are built from `clusterKC % KC_MULTIPLE`. That makes adaptive rules depend on numeric KC encoding rather than explicit cluster/stimulus identity.
- `analyticsMethods.ts` has aggregation pipelines grouped by `$KCId`, plus older adaptive helpers that use `KCId % 1000`. These should be migrated to explicit identity helpers before adding new analytics behavior.
- `orm.ts` exports `itemid`, `kcid`, `KC (Default)`, and `KC (Cluster)` as separate columns without documenting which one is canonical. Exports should eventually add explicit `Stimuli Set Id`, `Stimulus KC`, `Cluster KC`, `Response KC`, and `Stimulus Record Id` columns while preserving legacy columns.
- `cardPayloadBuilder.ts` includes `itemId`, `stimulusKC`, `clusterKC`, and a scoped stimuli-set lookup, but does not package them as a single validated identity object.
- `autoTutorClient.ts` fills `itemId`, `KCId`, and `KCDefault` from either stimulus fields or script ids. That is reasonable for AutoTutor as a distinct unit type, but it should not be allowed to blur the identity contract for standard model-practice rows.
- `svelteInit.ts` explicitly treats missing per-stim `stimuliSetId` as an unknown scope for legacy/inline datasets. That should remain an explicit legacy condition and not become a silent source for countable model history.

## Cleanup Phases

### Phase 1: Audit and Contract

1. Audit all writers of history rows.
2. Audit all consumers of `KCId`, `KCDefault`, `KCCluster`, `itemId`, `stimulusKC`, `clusterKC`, and `responseKC`.
3. Confirm whether any stimulus creation/import path assigns stable per-stimulus `_id`.
4. Document the canonical identity contract in code near the history envelope and stimulus conversion boundary.
5. Add tests that prove standard model history uses stimulus-level identity, not cluster identity.

### Phase 2: Carry Explicit Identity Through Runtime

1. Ensure prepared card/stimulus runtime objects carry:

```ts
stimuliSetId
stimulusKC
clusterKC
responseKC
stimulusRecordId?
```

2. Update the standard history writer to persist explicit fields alongside legacy aliases:

```ts
stimuliSetId
stimulusKC
clusterKC
responseKC
stimulusRecordId?
KCId
KCDefault
KCCluster
```

3. Fail clearly if a model-practice history row lacks `stimuliSetId`, `stimulusKC`, or `clusterKC`.
4. Keep `TDFId` as lesson/content context, not stimulus identity.

### Phase 3: Server Validation

1. Extend server-side history validation for model-practice rows.
2. Require explicit stimulus identity for countable model outcomes.
3. Validate legacy aliases while they still exist:

```ts
KCId === stimulusKC
KCDefault === stimulusKC
KCCluster === clusterKC
```

4. Reject mismatches clearly.
5. Avoid adding TDF lookups as hidden recovery behavior for missing client identity. A deliberate compatibility migration may use a lookup, but it must be named as such.

### Phase 4: Consumer Migration

Move consumers from legacy KC aliases to explicit fields where possible:

- history reconstruction,
- adaptive rule evaluation,
- hidden/removed stimulus logic,
- model resume,
- data export,
- crowd stimulus aggregates.

Legacy fields should remain available for old persisted history until a separate migration/backfill decision is made.

### Phase 5: Crowd Stats Revisit

After the identity contract is explicit:

1. Add `StimulusCrowdStats`.
2. Update it from server-accepted model-practice history rows.
3. Key rows by `stimuliSetId:stimulusKC`.
4. Store `clusterKC` and `responseKC` only as diagnostic or secondary query fields.
5. Do not use `itemId` as the aggregate key unless the audit proves it is stable and required.

## Verification

- Unit tests for identity extraction from prepared stimuli.
- Unit tests for history writer field mapping.
- Server tests rejecting missing or mismatched model-practice identity.
- Regression tests for history reconstruction using legacy rows.
- Regression tests for adaptive rule evaluation.
- Full app checks after TypeScript-bearing changes:

```bash
npm run typecheck
npm run lint
```

Run from `mofacts/`.

## Open Questions

- Is any per-stimulus `_id` assigned outside `getNewItemFormat`?
- Should `stimuliSetId` become a canonical history-envelope field for all event types or only model-practice rows?
- Do old history rows need a backfill for `stimuliSetId`, `stimulusKC`, and `clusterKC`?
- Should exports preserve old KC column names, add new explicit columns, or both?
- Can `KCDefault` eventually be deprecated, or is it required by external analytics tooling?
