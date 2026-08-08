# MoFaCTS Meteor 3.5 Change Streams Final Plan

## Status and decision

This plan is based on a read-only source audit and a runtime snapshot taken on
2026-08-08 while authenticated practice pages were open on localhost and
production.

**Decision:** MoFaCTS will treat Change Streams as the only permitted driver
for reactive Mongo cursors. Polling is not an acceptable alternate runtime
path. Ordinary non-reactive Mongo reads, writes, aggregates, and methods do
not use Change Streams and remain appropriate.

This supersedes the Change Streams portions of
`meteor-3.5-upgrade-plan.md`. It does not replace its broader Meteor upgrade
history.

## Runtime evidence

No credentials, connection strings, learner data, or host addresses were
recorded in this document.

| Surface | Observed state | Conclusion |
| --- | --- | --- |
| Localhost hotfix app | Healthy app and browser bundle; configured `changeStreams,polling`; MongoDB 8.0.28, writable `mofacts-rs`; 5 active Change Stream operations | Change Streams are active now. |
| Production app | Healthy application container; configured `changeStreams,polling`; MongoDB 8.0.23, writable `mofacts-rs`; 8 active Change Stream operations | Change Streams are active now. |
| Production stream namespaces | `tdfs`, `user_dashboard_cache`, `Assets`, users, roles, settings, login configuration, and pre-Assets | The running practice surface has Change-Streams-backed reactive dependencies. The snapshot does not attribute an individual stream to one particular browser session. |
| Local stream namespaces | Roles, settings, pre-Assets, users, and login configuration | The local running practice surface also has Change-Streams-backed reactive dependencies. |

The local status script and production `$currentOp` query count live MongoDB
`$changeStream` cursors. They prove active Change Stream use, but they do not
by themselves identify the driver selected for every publication.

## The remaining policy defect

The currently running systems use Change Streams, but they do not satisfy the
repository's no-fallback invariant:

1. MoFaCTS explicitly configures `changeStreams,polling` for the supported
   local and production processes.
2. Base Compose, staging, examples, and ordinary CI explicitly configure
   `polling`.
3. Meteor 3.5's observer selection code instantiates `PollingObserveDriver`
   when no configured driver can serve a cursor. This also happens when the
   configured order is only `changeStreams`; changing the environment string
   alone is not fail-closed.
4. `filteredUsers` and `pagedTdfsListing` use `skip` and `limit`, which Meteor
   explicitly excludes from its Change Streams driver because they are moving
   result windows.

Therefore, `changeStreams,polling` must not be described as an acceptable
fallback policy. It is evidence of current working Change Stream use, not
evidence that all reactive cursors are Change-Streams-only.

## Required implementation plan

### 1. Establish a fail-closed Meteor driver contract

**Owner:** `mofacts/` and the pinned Meteor distribution.

Change the MoFaCTS contract from the two allowed values (`polling` and
`changeStreams,polling`) to a single normal-process declaration:

```text
METEOR_REACTIVITY_ORDER=changeStreams
```

Update the owning validation and tests:

- `mofacts/server/lib/ddpContainment.ts`
- `mofacts/server/lib/ddpContainment.test.ts`
- `mofacts/server/lib/openCoreSettingsValidation.test.ts`

This declaration is necessary but not sufficient. Before deploying it, add a
version-pinned, upstreamable strict-driver mechanism so that a cursor rejected
by the Change Streams driver fails visibly instead of Meteor silently creating
a polling observer. Do not monkey-patch generated build output. The acceptable
implementation is either an upstream Meteor option or a maintained,
source-controlled patch to the Meteor package with a focused regression test.

**Acceptance:** an unsupported selector, unsupported topology, ordered
observer, or `skip`/`limit` observer produces an owned application/test
failure; it must not create a polling observer.

### 2. Remove the two known incompatible reactive publications

**Owner:** `mofacts/server/publications.ts` and their callers.

`filteredUsers` and `pagedTdfsListing` cannot remain reactive Mongo cursors
under this policy.

- For `filteredUsers`, replace the paged reactive cursor and its manual
  `observeChanges` path with an explicitly non-reactive, bounded page request
  and a user-controlled refresh contract. Preserve authorization, field
  minimization, and page/count semantics. Review the unanchored username/email
  regex query and its index plan as part of the redesign.
- For `pagedTdfsListing`, first identify external DDP consumers. If none
  remain, remove the publication. Otherwise replace it with the same explicit
  non-reactive page contract; do not retain a reactive `skip`/`limit` cursor.

**Acceptance:** repository search and strict-driver qualification show no
reactive cursor using `skip` or `limit`.

### 3. Make observer ownership and failure handling explicit

**Owner:** `mofacts/server/serverComposition.ts` and relevant client services.

- Await and retain the handle for the exact-ID server-verbosity
  `observeChanges` call. Define startup failure, stop, and error behavior.
- Trace and bound route/lesson subscription lifecycles for `currentTdf`,
  assets, dashboard cache, and resume flows. Static review found handles whose
  stop ownership is not evident.
- Add safe driver/observer metrics by collection and lifecycle state. Counts
  must contain no learner identifiers or query values.

**Acceptance:** route/lesson transitions leave no growing subscription or
observer count, and observer startup/termination failures are observable.

### 4. Standardize all process definitions and documentation

**Owners:** `deploy/`, `.github/workflows/`,
`C:\dev\mofacts_config`, and deployment documentation.

After the strict driver mechanism and incompatible publications are complete:

- Replace normal-process `polling` and `changeStreams,polling` declarations
  with `changeStreams` in Compose, hotfix scripts, private production overlay,
  environment examples, CI, and containment validation.
- Convert the standalone Docker smoke/rehearsal workflow into an explicitly
  named topology-rejection test. It must verify that the app refuses to start
  reactively without a MongoDB replica set; it must not run as a polling app.
- Update `deploy/README.md`, `docs/deployment/settings-reference.md`,
  `docs/deployment/settings-inventory.md`, and the historical implementation
  record so they no longer call polling an intended compatibility path.
- Keep the production replica set and current private deployment procedure;
  no database migration is required for this work.

**Acceptance:** no normal process, example, or CI application run contains a
polling reactivity declaration.

### 5. Qualify actual workload and scalability before rollout

**Owners:** qualification suite, deployment workflow, and database operations.

Retain the existing synthetic failure/restart coverage, then add actual
publication coverage for:

- practice TDF and asset subscriptions;
- dashboard cache during a history write;
- broad administrator TDF listing;
- accessible asset listing;
- server verbosity observer lifecycle.

Measure the broad reactive paths rather than assuming Change Streams solve
their cost:

- `allTdfsListing` can be unbounded for administrators;
- `files.assets.all` can publish every accessible asset;
- `userHistory` is unbounded per learner;
- dashboard-cache documents can grow and update after each history write.

For each, capture redacted `explain()` evidence, index inventory, publication
payload size, stream/observer count, and reconnect behavior. Change Streams
avoid polling work; they do not make broad selectors or full-document DDP
updates inexpensive.

**Acceptance:** the qualification suite proves strict rejection rather than
polling fallback, and scale evidence establishes explicit bounds for every
broad reactive publication retained.

## Delivery order and deployment gate

1. Implement and test strict-driver enforcement in an isolated branch of the
   Meteor integration.
2. Convert or remove the two paginated reactive publications.
3. Add lifecycle ownership and actual-publication qualification.
4. Align all configuration and documentation.
5. Run the supported qualification environment with an initialized replica
   set, then verify localhost.
6. Deploy production only after the strict checks pass; verify the effective
   environment, MongoDB topology/version, and aggregate `$changeStream`
   counts after deployment.

Do not use an ordinary local Meteor run or a standalone smoke container as
release confidence. Do not remove the production replica set, and do not
perform a data migration as part of this plan.

## Current operational conclusion

Production and localhost are actively using Change Streams now. The immediate
work is not to enable them; it is to remove the hidden polling behavior that
would violate the product's stated operational contract when a reactive cursor
is incompatible or the topology becomes invalid.

## Execution record (2026-08-08)

Implementation has completed the code and configuration portion of this plan:

- a source-controlled strict Mongo observer wrapper now rejects any reactive
  cursor for which Meteor cannot select the Change Streams driver, before its
  internal polling fallback point;
- normal process definitions require `METEOR_REACTIVITY_ORDER=changeStreams`,
  and the retired `MOFACTS_CHANGE_STREAMS_ENABLED` gate is rejected;
- the two known paginated reactive publications now return explicit,
  authorization-preserving non-reactive snapshots;
- Mongo startup validates a MongoDB 6+ replica-set or sharded topology, and
  readiness exposes aggregate, non-sensitive strict observer metrics;
- the server-verbosity observer now has explicit startup and stop ownership;
- Compose, qualification workflows, private deployment inputs, and active
  deployment documentation use the strict contract.

Release remains gated on the supported replica-set qualification workflow and
clean full-app type checking. The local hotfix app was restarted with the
strict contract and verified healthy. Production has not been deployed from
this working tree.
