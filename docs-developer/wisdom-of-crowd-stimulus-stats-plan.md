# Wisdom of the Crowd Stimulus Stats Plan

## Goal

Make each client able to use summarized cross-user history for stimulus-level difficulty modeling without reading raw cross-user history.

The first requested aggregate is deliberately small:

- Count successes for each practiced stimulus.
- Count failures for each practiced stimulus.
- Make those counts available to the client deck/logit calculation in a scoped, efficient way.

This is the first slice of the wisdom-of-the-crowd / evolutionary model tracing component. Recency-weighted logit fields can be added later on top of the same aggregate.

## Current Design Center

Use a durable Mongo materialized aggregate updated at the history write boundary.

The history write boundary is the server method that accepts a client history payload, validates it, authorizes it, normalizes it, and inserts it into `Histories`. In the current code this is `insertHistory` in `mofacts/server/methods/analyticsMethods.ts`.

The aggregate update should happen only after the history insert succeeds. This ensures the count reflects server-accepted history, not untrusted client intent.

## Core Invariants

- `Histories` remains the append-only source of truth.
- The crowd stats collection is a derived read model.
- No silent fallbacks are allowed.
- Missing aggregate rows mean there is no crowd history for that stimulus yet.
- Clients must not receive unscoped global history or the full crowd stats table.
- Cluster KCs are out of scope for this first slice.
- The primary grain is the practiced stimulus item.

## Stimulus Key

Use a stimulus-level key, not a cluster-level key.

Preferred key:

```ts
stimulusKey = `${stimuliSetId}:${stimulusKC}`
```

If the persisted history field `KCId` is confirmed to be the stimulus KC for model trials, then the implementation can use:

```ts
stimulusKey = `${stimuliSetId}:${KCId}`
```

The key should mean: one aggregate row corresponds to one practiced stimulus item within one stimulus set.

Do not aggregate by cluster KC in this first implementation. Cluster-level summaries can be derived later from item-level rows if needed.

## Proposed Collection

Add a common collection such as `StimulusCrowdStats`.

Proposed document shape:

```ts
{
  stimulusKey: string,
  stimuliSetId: string | number,
  KCId: string | number,
  correctCount: number,
  incorrectCount: number,
  totalCount: number,
  lastOutcomeAt: number,
  updatedAt: Date
}
```

Optional fields if useful for diagnostics or access scoping:

```ts
{
  TDFId?: string,
  rootTDFId?: string
}
```

Avoid storing raw user identifiers in this aggregate.

## Indexes

Add these indexes:

```ts
{ stimulusKey: 1 } unique
{ stimuliSetId: 1, KCId: 1 }
```

If the client read path uses `stimuliSetId` to fetch all stats for a deck, also add:

```ts
{ stimuliSetId: 1 }
```

## Write Path

After `Histories.insertAsync(sanitizedHistoryRecord)` succeeds, call a small helper:

```ts
await recordStimulusCrowdOutcome(sanitizedHistoryRecord);
```

The helper should:

- Accept only countable model-practice rows.
- Require a stimulus-level identity.
- Require `outcome` to be `correct` or `incorrect`.
- Use a single atomic Mongo upsert.
- Return without updating for explicitly non-countable history event types.
- Fail clearly if an expected invariant is broken for a countable row.

Sketch:

```ts
await StimulusCrowdStats.upsertAsync(
  { stimulusKey },
  {
    $setOnInsert: {
      stimulusKey,
      stimuliSetId,
      KCId,
    },
    $inc: {
      correctCount: outcome === 'correct' ? 1 : 0,
      incorrectCount: outcome === 'incorrect' ? 1 : 0,
      totalCount: 1,
    },
    $set: {
      lastOutcomeAt,
      updatedAt: new Date(),
    },
  }
);
```

The helper should live outside `methods.ts`, likely under `mofacts/server/lib/`, to keep server methods from accumulating model-specific logic.

## Redis Position

Do not use Redis as the primary storage for this first slice.

This is a durable aggregate, not primarily a cache. Mongo atomic `$inc` is the simplest coherent tool for the first implementation.

Redis may become useful later for:

- Cross-process locks.
- High-throughput event buffering.
- Short-lived rolling windows.
- Coordinating background rebuilds.

If Redis is used later, it should be a required, explicit subsystem for that path, not a fallback that masks broken persistence.

## Watcher Position

Do not start with a collection watcher or 5-second polling loop.

The on-write atomic update is simpler and likely cheaper than a background watcher. A watcher would introduce resume, duplicate-processing, backfill, startup, and multi-server coordination concerns before there is evidence they are needed.

Batching can be revisited if production measurements show the per-history upsert is a bottleneck.

## Client Read Path

Expose stats only for the current learning context.

Preferred approach:

- Add a method or publication that accepts the current `stimuliSetId` or an explicit list of stimulus keys.
- Verify the user has access to the relevant TDF/session.
- Return only `{ stimulusKey, KCId, correctCount, incorrectCount, totalCount }`.
- Batch the lookup for all current deck stimuli.

Avoid one method call per stimulus.

Avoid publishing all crowd stats globally.

## Efficiency Inspection Plan

Before implementation, inspect these areas:

1. Confirm whether `KCId` in countable history rows is the stimulus KC.
2. Confirm whether `stimuliSetId` is already available in the history record, current TDF, or trial context.
3. Avoid adding a TDF lookup per history insert if a validated stimulus set identity can be carried through the existing history payload or server context.
4. Inspect existing history insert timing logs and indexes.
5. Inspect current aggregation methods that already compute correct/incorrect counts from `Histories`.
6. Check whether the deck/logit calculation already has a batched stimulus list suitable for one scoped crowd-stats request.
7. Verify that any publication or method can reuse existing TDF access checks.

If a per-insert TDF lookup is unavoidable at first, keep it explicit and measure it. Do not hide it behind a fallback path.

## Backfill Plan

Add a deliberate rebuild path for existing data.

The rebuild should:

- Clear or replace `StimulusCrowdStats` intentionally.
- Aggregate from `Histories`.
- Group by the chosen stimulus key.
- Count `correct` and `incorrect` outcomes.
- Ignore unsupported outcomes.
- Be run manually or through an explicit admin/maintenance command.

Do not automatically scan all history on normal server startup.

## Verification Plan

Unit tests:

- Correct outcome increments `correctCount` and `totalCount`.
- Incorrect outcome increments `incorrectCount` and `totalCount`.
- Unsupported outcomes do not update the aggregate.
- Non-model or non-practice history rows do not update the aggregate.
- Missing stimulus identity fails clearly when the row is expected to be countable.
- Repeated updates for the same stimulus key accumulate correctly.

Integration/server tests:

- `insertHistory` persists history and updates crowd stats.
- Duplicate H5P idempotency paths do not double-count.
- Access checks remain enforced before aggregate updates.

Verification commands after TypeScript-bearing changes:

```bash
npm run typecheck
npm run lint
```

Run these from `mofacts/`.

## Open Questions

- Is `KCId` always the stimulus KC for countable model trials?
- Is `stimuliSetId` already available at the history write boundary?
- Should crowd stats be shared across TDF conditions that use the same stimulus set?
- Should admin deletion of TDF/history also delete or rebuild affected crowd stats?
- Should future recency-weighted difficulty fields be updated online or by scheduled maintenance?

## Recommended First Implementation

1. Inspect the current history logging path and confirm the stimulus identity fields.
2. Add `StimulusCrowdStats`.
3. Add indexes.
4. Add `recordStimulusCrowdOutcome`.
5. Call it after successful history insertion.
6. Add a scoped batched read method for current deck stimuli.
7. Add focused tests.
8. Run full app typecheck and lint.
