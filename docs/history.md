# Assessment and practice history

Assessment answers and adaptive-practice answers are each saved once. The existing
`levelUnitType` and `modelEvidenceSource` fields retain their provenance. Assessment
delivery remains schedule-driven; its answers can inform subsequent model hydration
without making the assessment itself adaptive.

## One operational record per answer

The permanent historical exclusion is the **combination**
`levelUnitType: "model"` and `modelEvidenceSource: "assessment"`. Those records were
redundant copies of original `schedule` records. They remain in the database and raw
backups but contribute nothing to model hydration, operational analytics, crowd
statistics, publications, or ordinary TSV exports. An orphaned copy is not used as
a substitute for an original.

`learning-components/runtime/historyStimulusIdentity.ts` owns the predicate and
matching database selectors. Compose these with the caller's existing authorization,
course, lesson, knowledge-component and unit scopes. Model history accepts original
`schedule` and `model` records, including SPARC model observations. Instruction and
playback events are not added to model history. Activity-specific reads, such as an
assessment's resume count, retain their explicit activity filter. Existing identity,
timing, outcome and event validation still applies.

New assessment writes use the existing wire format; no TDF/config changes or history
migration are needed. `insertHistory` rejects the obsolete copy combination with
`obsolete-assessment-history-write` before inserting it or updating aggregates. The
original answer has already been saved when an older client attempts its second
write; use normal reload/resume rather than manually resubmitting it.

## Required audit before rollout

Run the read-only audit against the intended database during an authorized quiet
window before enabling the new code. Never infer production approval from local
fixture tests. Use the approved environment mechanism for `MONGO_URL`; do not put
connection strings in commands, logs or saved output.

From `mofacts/`, set `HISTORY_AUDIT_MAX_RECORDS` to a positive integer sufficient for
the complete history collection, then run:

```text
node scripts/auditAssessmentHistory.cjs
```

The audit scans a fixed upper `_id` in ascending pages of 100. It initially reads
only origin fields and IDs, fetches full payloads only for copies and matching
originals, and performs one batched original lookup per relevant page. It uses the
existing `_id_` and `perf_userId_TDFId_type_time` indexes and bounded query timeouts.
Missing indexes fail; it does not provision indexes or write any data.

Matching uses learner, lesson, attempt, unit and authored timestamps, followed by
exact authored-payload comparison. Only `_id`, `eventId`, `recordedServerTime` and
the changed `levelUnitType` are excluded from comparison. Original records must
also satisfy the current canonical identity and model reconstruction contracts.

Output contains counts only. A successful exit requires `complete: true`,
`passed: true`, and one validated original per copy. Missing, conflicting,
ambiguous or invalid originals, excessive candidates, interrupted scans, and scan
limits block rollout. Keep writes paused for the audit and cutover: `_id` bounds
are not a substitute for a consistent database while new writes continue. Any
repair requires its own reviewed and authorized plan; this tool cannot repair data.

## Release and derived totals

Release the logger, selectors and server rejection together. The pinned application
includes Meteor `autoupdate`, `hot-code-push` and `reload`; no application reload
migration hook was found during this change. In the supported release rehearsal,
verify that an already-open client receives the update, and exercise the server
rejection with an obsolete copy payload. The server guard prevents new copies even
when a stale client misses an automatic update. Do not approve release solely from
the presence of those packages.

Existing crowd totals already counted assessment copies. Leave those totals in
place at cutover and count each subsequent original once. Do not backfill original
assessments into existing totals. Dashboard cache version 7 uses the existing
version-refresh mechanism to recompute affected item counts.

The model-history selectors retain the indexed learner/lesson or learner/course
prefixes and include both accepted unit types. Validate query plans on the target
database for `perf_userId_TDFId_type_time`, the `history_course_*` indexes,
`dash_user_type_tdf_recorded_time`, and `learner_analytics_user_tdf_history_cursor`
before rollout; local source inspection is not a production query-plan measurement.

The maintenance rebuild tool is now `scripts/rebuildStimulusCrowdStats.cjs`, replacing
the independent mongosh implementation so it imports the application's shared
selection and validation rules. It is **not required for this cutover**. For a
separately authorized rebuild, first obtain a clean audit and database backup,
keep the database quiescent, set a positive `HISTORY_REBUILD_MAX_RECORDS`, and run
`node scripts/rebuildStimulusCrowdStats.cjs` for a dry run. An explicitly authorized
`--apply` replaces only the derived crowd-stat collection in batches. Validation or
scan-limit failures precede writes. After an interrupted apply, keep writes paused
and rerun from unchanged history or restore the derived collection backup.

## Verification

```text
node --test scripts/assessmentHistory.test.cjs
npm run typecheck
npm run lint
```

The pure suite covers the shared contract, reconstruction, analytics pagination,
crowd-total continuity, streamed TSV export and the audit. Meteor coverage also
exercises a single client write, obsolete-client rejection, and mixed histories
through actual collection queries. Run that coverage using the supported Meteor
test environment; each `npm run test:ci` invocation requires fresh authorization.
Production audit, query-plan checks and open-client release rehearsal are separate
release gates. Raw backups and existing learner records are never rewritten by
this implementation.
