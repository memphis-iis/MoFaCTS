# Meteor 3.5 Upgrade and Capability-Adoption Plan

## Research Basis and Release Identity

This plan was checked against the official Meteor 3.5 documentation and
release material on 2026-07-24. The current stable framework release is named
`METEOR@3.5`; the documentation labels it v3.5.0 and its tool package is
`meteor-tool@3.5.0`. `METEOR@3.5.0` is not the stable Meteor release tag. The
official upgrade command is:

```bash
meteor update --release 3.5
```

The official changelog declares no formal breaking changes and no internal API
changes for 3.5. It does, however, change the bundled Node/npm toolchain and
enables two important behaviors by default: Change Streams are tried first for
Mongo reactivity, and DDP sessions are retained briefly after an ungraceful
disconnect. Those defaults require explicit qualification even though the
release is not labeled breaking.

Meteor's official 2026-07-06 release article describes 3.5.1 as work in
progress; the only newer release ref found during this review was a beta. Check
the changelog again immediately before implementation. Prefer a later stable
3.5 patch only after reviewing its final notes and repeating the compatibility
selection gate; never substitute a beta or an unpinned `latest` release.

## Goal

Move MoFaCTS from `METEOR@3.4.1` to the deliberately selected stable Meteor
3.5 release without changing learner data contracts, TDF/config schemas, or
deployment semantics as a side effect. Capture the automatic runtime gains,
qualify the new default DDP behavior, and deliberately evaluate every relevant
opt-in capability. Enable Change Streams only after the framework upgrade is
stable and MoFaCTS has been transferred to an operationally owned MongoDB
replica-set platform whose workload has been proven compatible.

This is an implementation plan, not authorization to change the framework,
MongoDB topology, data, deployment configuration, dependencies, public API
surface, or query semantics.

## Advantages MoFaCTS Can Realistically Gain

The release-wide benefit is broader than Change Streams. The table separates
what arrives with the framework update from what requires infrastructure,
configuration, or an independently approved product/security change.

| Capability | Adoption mode | Advantage expected for MoFaCTS | Qualification before claiming the benefit |
| --- | --- | --- | --- |
| Node.js 24.15.0 and npm 11.12.1 | Automatic toolchain/runtime change | A current supported runtime baseline and access to the Node 24 platform used and tested by Meteor 3.5. | Rebuild all native modules and bundles; align developer, CI, builder, bundle-install, and runtime pins; run the complete compatibility suite. This is a maintenance benefit, not a guaranteed speedup. |
| EJSON/DDP allocation reductions | Automatic after the relevant core package bumps | Fewer copies and allocations in DDP serialization and EJSON conversion/equality hot paths, which should reduce GC pressure on busy app servers. | Compare heap, allocation/GC, event-loop delay, DDP throughput, and correctness with the same workload. |
| DDP session resumption | Enabled by default | Brief mobile handoffs, sleeping-tab disconnects, and flaky-network interruptions can retain subscriptions, connection identity, and unacknowledged method work instead of forcing a complete re-subscribe; users should see fewer spinners and reconnect storms should cause less server work. | Test same-instance and different-instance reconnects, per-tab auth, method side effects, queue overflow, memory retention, and load-balancer affinity. Defaults are a 15-second grace period and 100 queued messages; `disconnectGracePeriod = 0` is the rollback. |
| MongoDB Change Streams | Default preference, but useful only on an eligible topology/query | Narrow unordered observers can move change matching from every app server to MongoDB, reducing app CPU/heap/GC and increasing subscriptions, methods, and connections handled per instance. It also permits push reactivity on eligible managed MongoDB tiers without oplog access. | Requires MongoDB 6+ replica set or sharded cluster, compatible selectors, and capacity testing. Measure MongoDB cost as well as app savings and retain the tested `polling` or proven `oplog,polling` rollback. |
| DDP `uws` transport | Optional, explicit configuration | Lower raw-WebSocket latency and higher message throughput where SockJS framing/handshake is a measured bottleneck; potentially a smaller client/network path when the SockJS fallback is unnecessary. | Keep `sockjs` for the initial upgrade. Qualify representative public, school/corporate, mobile, proxy, and load-balancer paths because `uws` has no HTTP-polling fallback. Use `DDP_TRANSPORT`, not deprecated `DISABLE_SOCKJS`. |
| Promise-based Accounts APIs | Optional behavior-preserving source adoption | Replace MoFaCTS's manual promisification of password and token login with supported `Meteor.loginWithPasswordAsync` and `Meteor.loginWithTokenAsync`, improving typing and error flow. `logoutAllClientsAsync` also supports a future explicit "sign out everywhere" workflow. | Replace wrappers only after the framework gate; regression-test password, provisioned-token, OAuth/SAML, per-tab storage, and error behavior. Do not add a new user-facing logout workflow without approval. |
| Async `DDPRateLimiter` matchers | Optional security refinement | Existing rate limits can incorporate a database-backed role or account condition where that produces materially better abuse controls. | Existing synchronous rules remain valid. Add async matching only for an approved need; matchers are awaited on a connection's message queue, so bound/index/cache lookups and test rejection/fail-closed behavior and latency. |
| `accounts-express` | Optional new Meteor package | First-party Bearer/cookie authentication and Meteor account context for approved Express/REST endpoints can replace bespoke login-token parsing. | MoFaCTS's current download routes use scoped one-time tokens and are not automatic migration candidates. Any adoption adds a package and changes an authorization boundary, so it requires separate approval and 401/403, token-leakage, cookie, CSRF, and least-privilege tests. Use the documented `createAuthMiddleware` API. |
| MongoDB/Minimongo collation | Optional query-semantics feature | Case-insensitive and locale-aware matching/sorting can agree between client and server, including numeric ordering, without the prior reactive polling penalty for collation queries. | Treat this as a separate localization/query/index change. Choose the authored/interface locale contract, create matching collation-aware indexes, compare client/server results, and approve changed equality/sort semantics before rollout. |
| Core maintenance and correctness fixes | Automatic where the affected path is used | Fixes cover Change Stream snapshot/restart races and ObjectID projections, `skip`/`limit` fallback, Minimongo async iteration parity, DDP URL/latency and `uws` listener handling, an HttpOnly-cookie login race, npm 11 warnings, and maintained proxy/tool dependencies. | Add focused coverage for MoFaCTS paths that use the affected APIs. `accounts-2fa`'s move from `node-2fa` to `OTPAuth` has no direct benefit unless that package is adopted. |

These are expected or conditional advantages, not promises. In particular,
Change Streams do not make every MongoDB query or write faster. They move some
work to MongoDB, do not apply to ordered observers, and can raise database load
for broad selectors or heavily mutated collections. MoFaCTS must measure each
performance claim with a representative workload.

The upstream/community measurements summarized in Meteor's official release
article include roughly 40% more connection capacity in one harness and large
app-CPU/RAM/GC reductions in several scenarios. They are directional,
workload-specific evidence, not a MoFaCTS capacity or cost forecast.

## Current Baseline

| Surface | Current state | Upgrade implication |
| --- | --- | --- |
| Framework | `mofacts/.meteor/release` pins `METEOR@3.4.1`; the researched stable target is `METEOR@3.5`. | This is an incremental 3.4.1 -> 3.5 update, not the Meteor 2 -> 3 async conversion. The older v3 migration site is background only, not this upgrade procedure. |
| Node/tooling | `mofacts/package.json`, Docker, CI, and hotfix workflows align on Node 22.22.0 / Meteor 3.4.1. Meteor 3.5 bundles Node 24.15.0 and npm 11.12.1. | Update every pinned runtime and the package `engines` range together, then cleanly rebuild native dependencies. Do not let the Meteor-bundled Node used to build differ from the Node used to install or run the bundle. |
| Build/runtime pins | `Dockerfile` and `deploy/docker-compose.hotfix-local.yml` use `geoffreybooth/meteor-base:3.4.1`; `mofacts/.nvmrc` is `22`; CI and developer docs install 3.4.1/Node 22. | Update all pins atomically; a Docker-only bump is not a complete framework upgrade. Verify the exact builder tag exists and contains the intended toolchain before selecting it. |
| Direct Meteor constraints | `.meteor/packages` directly constrains `mongo@2.2.0`, `accounts-password@3.2.2`, `session@1.2.2`, `ejson@1.1.5`, `ecmascript@0.17.0`, and `email@3.1.2`. The 3.5 release set contains, among others, `mongo@2.4.0`, `accounts-base/accounts-password@3.3.0`, `session@1.2.3`, `ejson@1.2.0`, `ecmascript@0.18.1`, `email@3.2.0`, `ddp-client/ddp-server@3.3.0`, `minimongo@2.2.0`, and `webapp@2.2.0`. | Run the official updater and review both direct constraints and the entire `.meteor/versions` result; do not assume the release pin alone unlocks the EJSON/DDP/Accounts changes. |
| Upgrade command observability | CI and the Docker build currently run `meteor update --npm` with errors redirected and ignored. | Run the 3.5 migration interactively without suppression, retain its non-secret output in the change record, and make the reviewed lockfiles authoritative. Do not accept a green build that hid an update failure. |
| MongoDB version | The repository's Compose files use `mongo:8.0`. | The version satisfies the Change Streams minimum, subject to the deployed topology check. |
| MongoDB topology | Repository Compose starts MongoDB without `--replSet`; the local/default self-hosted path must therefore be treated as standalone until an environment check proves otherwise. | A standalone MongoDB cannot use Change Streams. Meteor will fall back to the next configured driver. |
| Reactivity configuration | No repository-owned `METEOR_REACTIVITY_ORDER` or `MONGO_OPLOG_URL` wiring was found. The checked-in standalone Compose path is therefore expected to poll, but protected environment configuration must be inspected before asserting the production driver. | Capture the actual current driver in every environment. Forcing `oplog,polling` does not prove 3.4-equivalent behavior when oplog is unavailable; force `polling` for an observed polling baseline or explicitly provision/test oplog if that is the intended rollback. |
| Replica-set URI compatibility | `deploy/docker/validate-mongo-url.sh` parses `MONGO_URL` with WHATWG `URL`, and `deploy/hotfix/run-bundle.sh` assumes/parses a single host. Standard multi-host `mongodb://host1,host2/...?...` replica-set seedlists are not safely supported by those guards/readiness checks. | Repair and test all connection-string validation, database-name extraction, and readiness paths before any topology cutover. Cover seedlists, `replicaSet`, `authSource`, encoded credentials, DNS/IPv6 as supported, and fail-closed database-name validation without logging secrets. |
| Deployment database ownership | Canonical Compose depends on and waits for its local `mongodb` service; backup/restore execs into that container. The production MCP sidecar separately hard-codes `mofacts-mongodb-1` and uses `MONGO_URI` through a single-host tunnel. | A multi-member or managed target needs an explicit Compose/operations/sidecar design, not only a new `MONGO_URL`. Update health/readiness, backup/restore, dependencies, `MONGO_URL`/`MONGO_URI`, tunnel/sidecar, and failover behavior as one reviewed boundary. |
| Reactive surfaces | `mofacts/server/publications.ts` contains user, content, learner, dashboard, and settings publications; it and `serverComposition.ts` use `observeChanges`. | Inventory selectors, sorting, and cursor options before enabling Change Streams. Cursors using `skip`/`limit` and ordered observers require special coverage. |
| DDP sessions | No app-owned `disconnectGracePeriod`, `maxMessageQueueLength`, `DDP.onReconnect`, `sessionResumed`, or `Meteor.server.onConnection`/`onClose` handling was found in the inspected source. | Meteor 3.5's default session retention will still change reconnect behavior. Test it explicitly and inspect custom/third-party packages before concluding that connection lifecycle semantics are unused. |
| DDP transport | No repository `DDP_TRANSPORT`/`DISABLE_SOCKJS` configuration was found, so the effective target default remains `sockjs`. MoFaCTS is public/mobile-facing. | Hold `sockjs` during the framework and database work. Treat `uws` as a measured, reversible later experiment, not part of the base migration. |
| Accounts and HTTP | `signIn.ts` manually promisifies password and token login; the server has several `WebApp`/Connect handlers, and `serverStartup.ts` already sets `Accounts.emailTemplates.from`. | Adopt the native async login helpers after compatibility is proven. Audit HTTP handlers for WebApp 2.2 but do not replace scoped download-token or SAML flows with `accounts-express` without a route-specific security design. The new missing-email-sender warning should not fire. |
| Rate limiting | `server/runtime/ddpRateLimits.ts` defines synchronous method rules. | Verify them unchanged first. Async matchers are an available later refinement only where a database-backed condition improves policy. |
| Async migration | MoFaCTS is already Meteor 3-style and contains async raw MongoDB calls and async server code. | Re-audit custom packages, raw MongoDB calls, HTTP middleware, and native modules against the selected release; do not assume the prior migration covers a new toolchain/runtime bump. |
| Client/build integration | The application uses Blaze/Svelte/Rspack, custom `mofacts:*` packages, and per-tab authentication storage that touches Meteor/Accounts compatibility properties. `.meteor/platforms` configures Android, but the tracked mobile script has unresolved portability/tooling/signing problems, so active support is not proven. | Treat Rspack, login/session persistence, and custom packages as named gates. Make an explicit retain/repair/replace/retire decision for Android before claiming it as supported under 3.5. |

## Invariants and Non-Goals

- Keep learner histories, model state, course data, authentication, TDF/config
  fields, and resume identity semantically unchanged.
- Make no data-schema migration solely for this framework upgrade. If one turns
  out to be necessary, stop and create a separate, approved, forward-only and
  restartable migration plan.
- Do not silently switch the production database platform. The parallel target
  transfer is a separately gated infrastructure change with a rehearsed
  backup/restore, authority transition, and cutover procedure.
- Keep the actually observed, capacity-tested reactivity fallback (`polling`,
  or `oplog,polling` only with proven oplog configuration) available through
  private deploy-time settings or `METEOR_REACTIVITY_ORDER`; do not introduce
  a public UI control for it.
- Keep `sockjs` as the deterministic upgrade transport. Do not enable `uws`,
  add `accounts-express`, introduce database-backed rate-limit rules, or change
  collation/query semantics as an incidental part of the release-pin change.
- Do not use a local Meteor workflow as release confidence. The supported
  Docker Compose/staging path remains required for production-shaped checks.
- Treat a later 3.5 patch or `3.x` release as a new selection decision: review
  its official release notes, Node/runtime requirements, package compatibility,
  and regressions before changing the exact pin. Do not use an unpinned
  "latest" upgrade command.

## Delivery Strategy

Separate the work into five deliberately gated capability tracks:

1. **Framework/toolchain and automatic gains:** update to stable `METEOR@3.5`,
   Node 24.15.0/npm 11.12.1, and the 3.5 package set while retaining the
   pre-3.5 reactive driver order and the default-compatible `sockjs` transport.
2. **DDP session resumption:** qualify the new enabled-by-default reconnect
   semantics, tune only from measurements, and retain grace-period `0` as the
   behavior rollback.
3. **Database-platform migration:** build a new, purpose-designed MongoDB 6+
   replica-set target, rehearse a complete data-continuity transfer, and cut
   over during a controlled write freeze. The current standalone must not be
   treated as the permanent production architecture.
4. **Reactivity driver:** enable and measure Change Streams, first in staging
   and then with a guarded production rollout.
5. **Explicit opt-ins:** separately evaluate native async Accounts APIs,
   `uws`, async rate-limit matchers, `accounts-express`, and collation. Adopt
   only those with a demonstrated MoFaCTS benefit and an approved contract.

An in-place standalone-to-replica-set conversion remains a documented
contingency only. It may be useful for an emergency or constrained deployment,
but it is not the intended long-term destination. This separation prevents a
framework, Node, DDP lifecycle, DDP transport, database-platform, query
semantics, and reactive-driver change from being debugged as one opaque event.

## Database Topology and Data-Continuity Migration (Draft for Iteration)

### Recommended direction and what "database migration" means here

The required replica-set work is primarily a **topology migration**, not an
automatic rewrite of MoFaCTS data. The planned physical change is one
standalone `mongod` source to a newly built replica-set target with members,
replication, elections, network/DNS, authentication, connection URIs, volumes,
backups, and monitoring. The existing logical application database, collection
names, document shapes, `_id` values, and references must remain in place.

MoFaCTS's recommended long-term path is a **parallel transfer** to a newly
designed replica set. The target becomes the new physical database platform,
but it preserves the existing logical database, collection names, document
shapes, `_id` values, references, and external asset relationships. This gives
the project a clean, testable foundation for member placement, networking,
internal authentication, backups, monitoring, disaster recovery, and future
capacity work.

The price of that safer architectural boundary is an explicit data-continuity
transfer and a planned final write freeze: a standalone source has no oplog
that can continuously synchronize its last writes into a new target. The
existing standalone remains a read-only recovery reference after the cutover;
it must never run concurrently as a second production writer.

### Decisions this section must settle

| Decision | Candidate choices | Required recorded outcome |
| --- | --- | --- |
| Migration path | **Recommended:** restore/copy into a newly built replica set. **Contingency:** convert the current standalone in place. | Chosen path, technical owner, change approver, and documented reason if the contingency replaces the recommended path. |
| Target architecture | One-member replica set for local/staging. Production multi-member set by default; a one-member production target is an explicit no-HA exception. | Member count, voting/election design, host/DNS names, volume placement, TLS/internal-auth design, monitoring, and on-call owner. |
| Availability target | Planned maintenance/write freeze for the final standalone-source transfer. | RPO, RTO, downtime window, learner communication owner, and success/abort thresholds. |
| Data-transfer mechanism | **Recommended:** verified physical/logical source-to-target transfer. **Contingency:** in-place data retention. | Tool, source/target versions and FCV, handling of indexes/validators/users, and restore evidence. |
| Change Streams policy | Remain on fallback initially; enable in staging; enable after a canary. | Driver order, required metrics, promotion authority, and tested rollback configuration. |

Do not select the production topology from this document by default. A
single-member replica set is enough to exercise Change Streams in development
and staging but does not provide high availability. A multi-member production
set requires explicit operational capacity and security ownership. The
production target must be designed and approved before any production data is
copied; it is not a side effect of the Meteor update.

### Old-to-target continuity map

This is the mapping to complete and sign off before a topology change. "Same"
means preserve the exact logical contract; it does not mean assume the target
will recreate the item automatically.

| Current source / contract | Target state | Transformation rule | Acceptance evidence |
| --- | --- | --- | --- |
| `MoFACT-meteor3` application database (or the protected, environment-specific configured database name) | Same logical database on the replica-set primary. | Keep the namespace and document data unchanged unless a separately approved migration says otherwise. | Exact inventory of collection names and source/target document-count snapshots; targeted semantic checks. |
| Collection documents and `_id`-based relationships: learner histories, model/experiment state, users, roles, TDFs, courses/assignments, content, settings, caches, and audit/backup records | Same document shapes, `_id` values, references, and lifecycle meaning. | No renaming, transformation, re-keying, or re-interpretation in this project; preserve historic collection names, including `dynaminc_settings`. | Referential/semantic spot checks: sign-in, course access, launch, response/history write, resume, content edit, and administrator workflows. |
| Collection metadata: indexes, collection options, validation rules, TTL behavior, and any MongoDB-managed metadata | Equivalent metadata on the target. | Inventory and restore/recreate deliberately; do not infer metadata coverage from a document-only export. | Source/target index and collection-option comparison, startup index checks, query-plan checks for critical paths. |
| MongoDB root/app identities and roles | Intentionally bootstrapped/verified identities with the same least-privilege application capability. | Do not put secrets in the migration record. The existing shell backup archives the application database, while the Compose bootstrap creates the app user only for a fresh data directory; verify/provision admin and app users separately. | Authenticated app connection, role/privilege review, and a staging Change Streams authorization check. |
| `MONGO_URL`/`MONGO_URI` consumers: app containers, hotfix/native paths, CI/staging inputs, Compose health/dependency gates, backup/restore tools, operators, and MCP/sidecar/tunnel tooling | Private URI with replica-set seed hosts, the chosen `replicaSet` name, application database, and required `authSource`, or an explicitly designed managed-service/tunnel contract. | Update every consumer in one controlled cutover; remove single-container/single-host assumptions, use resolvable hostnames, and keep credentials private. | Protected configuration inventory; connection and primary-failover tests from every supported runtime path; backup/restore and sidecar proof against the selected target. |
| Dynamic assets, H5P content/libraries, object-storage data, settings, environment files, and key material | Same associated external state as the selected database snapshot. | Back up/snapshot independently; MongoDB data alone is not sufficient. | Manifest/checksum or storage-snapshot evidence plus asset/H5P smoke tests. |
| Redis coordination state | Reconstructable runtime state, not a data-migration source of truth. | Do not attempt to make it part of MongoDB continuity. | Normal application readiness after restart. |
| Reactivity implementation | Initially the known fallback; later, validated Change Streams. | Do not couple a topology cutover to a driver change. | Driver/log/metric evidence that the expected fallback or Change Streams path is active. |

The current in-app backup serializes application documents and intentionally
preserves some control-plane collections during app-level restore. It does not
constitute a topology-grade snapshot of MongoDB metadata. The shell backup uses
`mongodump` for the application database and copies selected external state;
it does not currently request database users and roles. Before selecting either
as a topology-transfer mechanism, perform a restoration rehearsal that proves
the required metadata, users, and asset state are covered; do not assume either
format includes everything needed for a new MongoDB deployment.

No row in the continuity map authorizes a document transformation. An
unexpected source/target mismatch is an abort condition, not permission for an
ad hoc data migration. Store completed inventory and validation evidence in a
protected change record, never in the repository or handoff text.

### Data-authority transition

| Cutover point | Authoritative database / allowed writers | Required action if the step fails |
| --- | --- | --- |
| Before the maintenance window | Source standalone only; normal production writers may use it. | Continue operating the source and repair/rehearse the target. |
| During final snapshot/export and target restore | Neither database; all production writers are stopped. | Abort before target writes, retain the source as authority, and investigate from preserved evidence. |
| After continuity validation and URI cutover, before normal traffic | Target replica set only; start only target-connected application instances. | If the target has not accepted application writes, stop it and return the URI/configuration to the source under the runbook. |
| After the target accepts any production write | Target replica set only; old source is locked read-only. | Do not automatically return traffic to the source. Use a separately approved recovery/reconciliation plan if the target must be abandoned. |

### Recommended path — Parallel target replica set and true data transfer

This is the required planning baseline for MoFaCTS's long-term production
architecture. Build an isolated, purpose-designed target replica set and move
the current logical application database into it without changing its data
contract. The target can be rehearsed, secured, monitored, and restored before
it becomes authoritative, rather than making the existing single-host
deployment permanent by conversion.

1. Design and build the target in a non-production environment first: selected
   member topology, resolvable hostnames, dedicated member volumes, network
   policy, TLS/internal member authentication, application/root-user bootstrap,
   backup/restore, monitoring, and alerting. Prove an empty-target deployment
   before moving any production data.
2. Perform at least one end-to-end rehearsal using a protected
   representative/sanitized restore: transfer database contents and required
   metadata, provision identities, restore/snapshot external assets, then
   execute every acceptance item in the continuity map.
3. Publish an approved cutover runbook that names the write-freeze owner,
   maintenance communication, source/target snapshot identities, exact
   validation queries, app connection switch, abort conditions, and recovery
   decision owner.
4. At the final cutover, stop all application and job writers. Do not rely on
   a standalone `mongodump` to pick up writes that occur during the copy.
5. Take and verify the final source backup/snapshot, restore it into the
   already rehearsed target, then validate document/metadata/asset continuity
   before permitting normal traffic.
6. Change every private application and operational URI to the target's seed
   list plus `replicaSet` name. Bring traffic back only after the target is the
   single authoritative writer and the fallback reactive driver is confirmed.
7. Lock the old source against writers and retain its volume/configuration and
   verified backup through the agreed recovery deadline. It is evidence and a
   recovery input, not a live rollback database after target writes begin.

### Contingency path — In-place standalone-to-replica-set conversion

Use this only when the architecture owner documents why a parallel target
cannot yet be delivered. It is a topology conversion, not a copy into a new
application database: MongoDB can start the existing data-bearing node as the
initial primary once a replica-set name is configured and initialized. It
enables Change Streams but retains the existing data host/volume as part of the
long-term platform and therefore does not satisfy the recommended target by
itself.

1. Rehearse the complete procedure on a non-production copy with the same
   MongoDB major version, feature-compatibility version, authentication mode,
   storage engine, and representative data volume.
2. Inventory every application/job/admin connection and stop or place all
   writers in a planned maintenance state. MoFaCTS does not currently provide
   a complete maintenance gate for backup/restore, so the write-freeze owner
   and evidence must be explicit.
3. Take a final verified MongoDB backup plus matching asset/object-storage,
   settings, environment, and key-material backups. Prove a restore before
   proceeding.
4. Stop the standalone, add the approved replica-set configuration (including
   the chosen immutable replica-set name and required member authentication),
   then start it and initialize the replica set. Verify primary election,
   member health, application authentication, and the oplog window.
5. If the selected target has secondaries, add and allow them to finish initial
   sync before calling the topology healthy. Verify replication state, lag,
   backups, and monitoring/alerting for every member.
6. Update the protected connection configuration to use the approved seed list
   and `replicaSet` setting, then restart the app in a controlled order with
   the Phase 3 tested fallback (`polling`, or `oplog,polling` only when oplog is
   provisioned and proven) still forced.
7. Run the mapping-table acceptance evidence and retain the old standalone
   configuration/backup as recovery material until the migration is accepted.

### Cutover validation and rollback boundary

Before allowing normal writes, record source and target evidence without
retaining learner data in source control or handoff notes:

- MongoDB version/FCV, replica-set name, member health, election state,
  replication lag, oplog window, connection/auth status, and backup success;
- collection/index/collection-option inventories and document-count snapshots;
- authentication/role checks and representative learner history, model-state,
  course, content, asset/H5P, audit, and backup-control checks;
- `/admin/tests`, administrator sign-in, learner launch/response/resume, and
  application logs with no unexpected migration/startup errors.

The **Data-authority transition** table governs whether a cutover can be
aborted. Once the target accepts a production write, the data move is not
reversible by changing a URI: the target remains authoritative and any
database reversal requires a separately approved recovery/reconciliation plan.

Framework and reactive-behavior rollback are separate and remain possible
against the target database. For a Change Streams problem, first force the
tested Phase 3 fallback through `METEOR_REACTIVITY_ORDER`; roll back the
application image/configuration only if the framework problem remains. Neither
action authorizes copying data back to the old source.

### Change Streams readiness after topology acceptance

Only after the topology/data-continuity gate passes:

1. Confirm MongoDB 6+, WiredTiger, replica-set/sharded status, compatible
   replica-set protocol, required app-user privileges (`find` and
   `changeStream`), and sufficient connection-pool/monitoring capacity.
2. Test a controlled Change Stream in staging and validate resume/restart
   behavior against the retained oplog window. Change streams consume server
   connections and resume depends on the relevant oplog history remaining
   available.
3. Remove the temporary fallback only in staging, execute Phase 4's workload,
   and promote only when data correctness and operational thresholds pass.

**Topology/data-continuity exit gate:** the chosen path is approved, all rows
of the continuity map have evidence, the replica set is operationally owned,
and the old/new rollback boundary is understood before Change Streams are
enabled.

## Phase 0 — Select the Exact Target and Capture Evidence

1. Start from the current stable candidate, `METEOR@3.5` (`meteor-tool@3.5.0`).
   Immediately before implementation, re-check the stable release tag,
   changelog, and open 3.5.1 milestone. Select a later release only if it is
   stable and its final notes and fixes have been reviewed; do not use the
   current 3.5.1 beta or an unreleased branch.
2. Read the selected release's official changelog and enumerate changes to the
   core Meteor packages, bundled Node/npm, Mongo driver, Accounts, EJSON/DDP,
   and WebApp. Record that Rspack is an existing 3.4/3.4.1 capability, not a new
   3.5 benefit. If 3.5.0 remains the target, explicitly cover the Change Stream
   projection, write-fence/login, history-loss/restart, and multi-connection
   fixes still queued for the unreleased patch wherever they apply to MoFaCTS.
3. Record a reproducible baseline before any edit:

   - source commit/tag, `.meteor/release`, `.meteor/packages`,
     `.meteor/versions`, `package-lock.json`, and image tags;
   - `node`, `npm`, Meteor, MongoDB server, and MongoDB feature-compatibility
     versions for each environment;
   - actual `MONGO_URL` topology only in a protected deployment record (never
     commit or paste credentials);
   - current reactivity order and observed driver evidence, DDP transport,
     session/reconnect behavior, load-balancer routing/affinity, WebSocket idle
     timeouts, database indexes, backup age, and a successful restore rehearsal;
   - baseline health, learner-flow, admin/content, reconnect, app/Mongo resource,
     event-loop, heap/GC, and DDP performance evidence.
4. Build or designate a repeatable concurrency harness, synthetic/approved
   dataset, workload mix, ramp/soak duration, environment manifest, and result
   capture protocol. The existing production smoke/load document is explicitly
   human-scale and approximately one concurrent user; it can validate flows but
   cannot validate Meteor's capacity claims or a Change Streams/`uws` decision.
5. Define go/no-go thresholds before benchmarking: correctness must be equal;
   no unexplained error-rate or reconnect regression; MongoDB CPU, memory,
   replication lag, and slow-query metrics must remain within agreed capacity;
   app-server resource use and representative latency must not regress. Define
   separate thresholds for session resumption, Change Streams, and any later
   `uws` experiment so one feature cannot hide another's regression.

## Phase 1 — Compatibility Inventory and Preflight

1. Review every direct Meteor/Atmosphere package in `.meteor/packages`, the
   custom `mofacts:*` packages, and npm/native dependencies (including Rspack,
   Svelte, minification, and build tooling) for selected-release and
   Node 24 support. Confirm an exact, published builder-image tag and its
   bundled Meteor/Node versions before editing Dockerfiles; if the current
   third-party image has no suitable tag, stop for an explicit image-strategy
   decision rather than silently substituting another image. Reconcile the
   Atmosphere `rspack` package, npm `@meteorjs/rspack`, Rspack core/CLI, the
   custom Svelte integration, and the old `@types/meteor@2.9.11` constraint with
   the 3.5 package-provided types; prove the result with vendor typechecking.
2. Review all `rawCollection()` / `rawDatabase()` use for Promise-based MongoDB
   driver APIs and all HTTP middleware for the current Express-based WebApp
   behavior. Audit server Mongo APIs, method calls, publications, cron jobs,
   migrations, and external integrations for correct `async`/`await` flow.
   Also audit custom packages for reliance on client Accounts callback timing
   or EJSON conversion results as deep clones: 3.5's copy-on-write
   `toJSONValue`/`fromJSONValue` can return the original object or share
   unchanged subtrees. App-owned source currently uses EJSON stringify/parse,
   but not those conversion helpers. Give targeted contracts to the private
   framework surfaces: per-tab `authStorage.ts`, private `OAuth._*` calls in the
   Microsoft package, SAML's login-style/Accounts registration APIs, and the
   mixed `WebApp.handlers`/`connectHandlers`/`rawConnectHandlers` routes.
3. Inventory reactive cursors and classify each as:

   - Change-Streams candidate: unordered, Minimongo-compatible selector,
     narrow selector, and no cursor behavior that forces fallback.
   - Expected fallback: ordered observer (`addedBefore`/`movedBefore`),
     unsupported selector, or a cursor using `skip`/`limit`.
   - Needs redesign/measurement: broad selector, high-write collection, or
     expensive publication.

   Include at least `filteredUsers` (sorted and paged), Dynamic Settings,
   learner state/history, content listings/editing, dashboard caches, and the
   publications used during a lesson session.
4. Verify the MongoDB application principal has the privileges required by the
   selected reactivity mode and that monitoring can distinguish Change Streams,
   oplog, and polling behavior without exposing secrets or learner records.
5. Identify explicit test ownership for password, Google, Microsoft, and SAML
   authentication; per-tab session persistence; Android/mobile builds (or an
   approved retain/repair/replace/retire decision for that configured but
   currently unproven target); and the custom package API surfaces.
6. Audit DDP connection lifecycle and auth hooks in app, custom-package, and
   relevant third-party code. Record uses of `onConnection`, connection IDs,
   close/presence events, `onLogin`/`onLoginFailure`/`onLogout`, outstanding
   method assumptions, and non-idempotent learner/admin methods that need replay
   coverage. The app-owned source inspection found no connection-lifecycle
   handlers, but that does not prove dependency code has none.
7. Inventory the optional capability candidates without changing them:

   - the manual password/token login promisification in `signIn.ts`;
   - existing synchronous DDP rate-limit rules and whether any policy genuinely
     needs a bounded database-backed matcher;
   - every `WebApp`/Connect route and its current authentication/one-time-token
     contract;
   - case-folding, regular-expression, lowercase-shadow-field, and sort paths
     that might be candidates for an explicitly localized collation.

8. Resolve package, API, or Node-native-module incompatibilities before the
   release-pin change. Keep fixes narrowly scoped and covered by targeted
   tests.

**Exit gate:** the candidate builds from a clean checkout, package ownership is
known, reactive cursors are classified, and all compatibility findings have an
owner and disposition.

## Phase 2 — Framework Upgrade With Controlled Reactivity and Transport

### 2A — Release, toolchain, and automatic runtime changes

1. On a dedicated implementation change, run the official command exactly:

   ```bash
   meteor update --release 3.5
   ```

   Run it without suppressed output or ignored exit status. Review every change
   to `.meteor/release`, `.meteor/packages`, `.meteor/versions`, and the npm
   lockfile. Confirm the resulting release name is `METEOR@3.5` and reconcile
   all direct package constraints with the selected release set.
2. Update the release-consistency set together:

   - `mofacts/.meteor/release`;
   - `mofacts/.meteor/packages`, `.meteor/versions`, and
     `mofacts/package-lock.json`;
   - `mofacts/package.json` `engines` and `mofacts/.nvmrc` (Node 24,
     bounded below the next major where applicable)
     and affected npm package constraints;
   - `Dockerfile` builder image and Node 24.15.0 build/runtime images;
   - `deploy/docker-compose.hotfix-local.yml` builder and Node 24.15.0 runtime
     images;
   - `.github/workflows/ci.yml` Meteor 3.5 install and Node 24.15.0 pin;
   - Docker bundle dependency overrides for `@mapbox/node-pre-gyp`, `node-gyp`,
     and `underscore`, verifying whether every override is still necessary;
   - deploy-time reactivity/transport setting examples and
     `docs/deployment/settings-reference.md`;
   - `deploy/README.md`, `docs/development.md`, and any release/version docs.

3. Rebuild dependencies rather than carrying forward binaries built for the
   old Node/Meteor toolchain. Recheck Node 24 ABI support, Docker bundle
   dependency installation, native packages/prebuilt binaries, npm 11 lockfile
   behavior, and the Windows hotfix tool lookup. Audit and normally remove the
   build-time `--allow-incompatible-update` flags from `Dockerfile` and
   `deploy/hotfix/build-bundle.sh`; an image build must consume the reviewed
   package solution rather than silently finding a different one. If a flag is
   still required, document the exact package conflict and verify the produced
   `.meteor/versions` equivalent is unchanged.
4. During this phase explicitly isolate Mongo and transport changes with:

   ```text
   METEOR_REACTIVITY_ORDER=polling         # when Phase 0 proves polling today
   # or: METEOR_REACTIVITY_ORDER=oplog,polling
   #     when oplog is actually configured, observed, and the intended baseline
   DDP_TRANSPORT=sockjs
   ```

   or the equivalent private `settings.json` configuration. Record which
   reactivity mechanism and transport are actually active in each environment.
   The reactivity value must preserve the driver actually observed in Phase 0,
   not merely list a preferred fallback. On a standalone without
   `MONGO_OPLOG_URL`, `oplog,polling` still resolves to polling. This isolates
   Change Streams and `uws`; it does **not** recreate all 3.4 behavior because
   DDP session resumption and the Accounts/EJSON/core changes are still present.
   Wire the selected variables through canonical and hotfix Compose environment
   blocks and safe tracked examples; do not rely on an operator-only setting
   that the supported deploy path drops. Add an operational diagnostic that
   reports the declared order/transport and enough supported log/APM/database
   evidence to distinguish Change Streams, oplog, and polling without exposing
   the URI, credentials, selectors containing learner data, or private Meteor
   observer fields.
5. Run the normal static checks and the CI-supported Meteor integration suite.
   Exercise all affected authentication providers and retained sessions,
   routes, HTTP download and asset handlers, background jobs, admin/content
   flows, a representative learner session, and the Android/mobile build if it
   remains supported.
6. Verify the automatic 3.5 paths that apply: EJSON/backup round trips and large
   DDP payloads; Minimongo `forEachAsync`/`mapAsync`; URL/proxy-based local dev;
   email startup without the missing-`Accounts.emailTemplates.from` warning;
   and HttpOnly-cookie login only if MoFaCTS enables that earlier feature.

### 2B — DDP session-resumption qualification

1. Keep the 3.5 defaults for the first qualification run:
   `disconnectGracePeriod = 15000` ms and `maxMessageQueueLength = 100`. Record
   them explicitly; do not tune by intuition.
2. Test interruptions shorter and longer than the grace period, both when the
   client returns to the same physical app instance and when it reaches another
   instance. Cover queue overflow, explicit logout/server kick, Hot Code Push,
   sleeping/background tabs, mobile handoff, per-tab login storage, OAuth/SAML,
   and reconnect callbacks with both `sessionResumed` values.
3. During a short resumption, prove that the connection ID is retained,
   subscriptions do not re-publish, and client state remains correct. Prove the
   fresh-session path after expiry/overflow as well. Do not use private DDP
   internals as the acceptance contract.
4. Exercise in-flight writes and externally visible side effects during a
   disconnect, including learner response/history/model-state writes, content
   saves, account actions, uploads, and administrative jobs. Verify that replay
   does not create duplicates, omit writes, or repeat notifications/external
   calls.
5. Load-test a mass short disconnect and reconnect. Measure retained sessions,
   live cursors, queued messages, RSS/heap/GC, event-loop delay, resubscription
   counts, latency, and fallback-to-fresh-session rate. Confirm proxy/LB routing
   can return reconnecting clients to the same physical process; session state
   is not shared across processes.
6. If correctness, memory, or routing cannot be made acceptable, temporarily
   set `Meteor.server.options.disconnectGracePeriod = 0` and repeat the failing
   flow. Any permanent value other than the defaults requires an owned private
   configuration contract, measured justification, and rollback test.

**Exit gate:** the selected Meteor release has passed functional and
deployment-shaped checks with forced fallback reactivity and `sockjs`; session
resumption and fresh-session behavior both pass; and no data migration or
unapproved product behavior was introduced.

## Phase 3 — Target Replica-Set Build and Transfer Rehearsal

1. Determine the real source topology using safe administrative checks
   such as `db.hello()` and `rs.status()`; do not infer it from a connection
   string alone. Record version/FCV, storage engine, authentication, database
   inventory, backups, external assets, all URI consumers, and the source
   write paths that must be stopped for cutover.
2. Before using a replica-set seedlist, make the repository's URI ownership
   coherent. Update and test `deploy/docker/validate-mongo-url.sh`,
   `deploy/hotfix/run-bundle.sh`, and every other validator/readiness/backup
   consumer that assumes one Mongo host or WHATWG URL syntax. Preserve strict
   database-name validation and secret redaction while supporting the approved
   MongoDB seedlist, `replicaSet`, `authSource`, and credential/network forms.
   Verify each supported runtime can reach every required member and that a
   primary-election change does not strand a single-host readiness check.
3. Select and implement an explicit deployment ownership model for the target.
   Canonical Compose currently creates, waits on, and backs up its local
   `mongodb` container; the production MCP sidecar uses a separate single-host
   tunnel and `MONGO_URI`. Define how `depends_on`/`WAIT_HOSTS`, readiness,
   backup/restore, sidecar startup, tunnels, and operator commands work for the
   chosen multi-member or managed target. Do not leave the app pointed at the
   target while operational tools silently act on the old local container.
4. Decide what fallback reactivity means on the target. If actual oplog
   tailing is required, provision and protect `MONGO_OPLOG_URL`, least-privilege
   access, and monitoring, then prove `oplog` is active. Otherwise document that
   `oplog,polling` falls through to polling and capacity-test that rollback.
5. Build the intended target replica set. For the repository's standalone
   Compose path, a single-member set may be used for local/staging validation;
   the separately approved production member topology must preserve
   authentication, health checks, member-volume ownership, backup/recovery,
   readiness, monitoring, and alerting.
6. Rehearse the **recommended parallel target replica set and true data
   transfer** path from the **Database Topology and Data-Continuity
   Migration** section. The rehearsal must use a fresh target volume and
   prove the complete continuity map; do not treat a logical restore as
   sufficient until metadata, users, indexes, assets, and application behavior
   have been verified.
7. Write and approve the final transfer/cutover runbook before touching
   production. It must
   include: maintenance/write strategy, exact backup and verification points,
   restore validation, database users/indexes/TTL verification, connection
   string changes, rollback owner and deadline, and learner-facing status
   communications if downtime is required.
8. Do not combine topology cutover with a TDF, history, or model-state schema
   change. Mixed application versions during a rolling deployment must be able
   to read and write the same persisted data.

**Exit gate:** the selected framework release runs against the target replica
set in staging; the parallel transfer has been rehearsed and proven; and the
operations owner has approved the production transfer, recovery boundary, and
maintenance runbook.

## Phase 4 — Change Streams Qualification

1. Remove the temporary fallback override in a replica-set staging environment
   so Meteor's default order (`changeStreams,oplog,polling`) is exercised.
   Verify from application/database evidence which cursors use Change Streams
   and which correctly fall back. Meteor documents no stable public
   per-observer driver-introspection API: use declared configuration, supported
   logs/APM, MongoDB stream/operation evidence, and behavior tests rather than
   production code that reaches into private observer-driver fields.
2. Run a repeatable workload against the same data shape and concurrency used
   for the Phase 0 baseline. Cover at minimum:

   - learner launch, response/history writes, resume, and multi-tab/session
     behavior;
   - teacher/admin content listing, editing, upload, and draft updates;
   - paged/filtering user administration;
   - settings updates, dashboard refreshes, asset serving, and reconnection
     after brief network loss or a rolling app restart;
   - narrow high-value publications, broad/high-write publications, ordered
     observers, selectors rejected by `Minimongo.Matcher`, and `skip`/`limit`
     cursors;
   - ObjectID and nested/dotted projections, initial-snapshot plus concurrent
     writes, stream close/restart/history-loss conditions, primary election,
     login-style writes/write fences, and—if MoFaCTS uses more than one Mongo
     connection—cross-connection write coordination. These are mandatory
     regressions if the selected stable patch does not yet contain the related
     3.5.1 fixes.

3. Compare the fallback and Change Streams runs using:

   - method latency, publication readiness/propagation time, DDP reconnect
     behavior, error rate, and correct client-visible updates;
   - app CPU, RSS/heap/GC, event-loop pressure, subscription count, and
     process restarts;
   - MongoDB CPU/memory, connections, operation rates, open streams, query
     plans/index use, slow operations, replication lag, and disk I/O;
   - integrity checks on learner histories, model state, assignments, content,
     and authentication/audit records.

4. Keep the default only if correctness is unchanged and the agreed metrics
   meet the Phase 0 thresholds. Narrow broad selectors or add/verify indexes
   where evidence identifies a query problem. The 3.5 driver order is global;
   do not invent an unsupported per-cursor force-driver setting. Record the
   defaults—100 ms restart delays after error/close and a 1000 ms
   `waitUntilCaughtUpTimeoutMs`—and do not tune them until restart behavior and
   read-your-writes have been explicitly tested. The catch-up timeout does not
   lose the later stream event, but it can temporarily let a subscription
   become ready before the client's own write appears.

**Exit gate:** results identify the actual wins and costs for MoFaCTS, and the
release owner approves a driver choice based on those results rather than the
upstream benchmark.

## Phase 5 — Production Parallel Transfer and Change Streams Rollout

### 5A — Production parallel-transfer cutover with fallback reactivity

1. Take and verify the required backup of MongoDB, private settings,
   environment files, dynamic assets, H5P content/libraries, and key material.
   Record source/image/settings identities as required by
   `docs/deployment/upgrade-guide.md`.
2. Begin the approved maintenance window and stop every writer to the source:
   all application instances, cron/background jobs, admin imports, and any
   external integration that can mutate MoFaCTS data. Verify the write freeze
   before taking the final source snapshot.
3. Transfer the final verified snapshot and associated external state into the
   rehearsed target. Complete every continuity-map and data-authority
   validation item while the target remains isolated from learner traffic.
4. Switch every private URI consumer to the target replica set, then start the
   exact staging-approved application configuration with the Phase 3 fallback:
   `METEOR_REACTIVITY_ORDER=polling` if polling is the accepted rollback, or
   `METEOR_REACTIVITY_ORDER=oplog,polling` only if oplog was provisioned and
   proven active. The target becomes the only authoritative writer before
   normal traffic returns; lock the old source against writers.
5. Run the operator smoke checks: `/admin/tests`, administrator sign-in,
   content listing, learner launch/response/resume, dynamic assets, and
   backup/readiness checks. Observe application and MongoDB dashboards through
   a defined fallback-mode soak period.
6. Only after every active application instance uses the target may the app
   rollout be staged. Do not run a canary against the new database while other
   production instances still write to the old database; that is a dual-write
   split, not a safe canary.

### 5B — Production Change Streams rollout

1. Phase 4's staging results and the fallback-mode production soak are both
   prerequisites. Staging qualification does not authorize Change Streams in
   production before the production data-continuity transfer is accepted.
2. Remove the fallback override only through the approved production
   configuration change, then confirm the expected reactivity driver and
   monitor the agreed application, MongoDB, correctness, and reconnect
   metrics through a defined soak period.
3. If a reactive-behavior problem appears, restore:

   ```text
   METEOR_REACTIVITY_ORDER=<the tested Phase 3 fallback>
   ```

   Use `polling` or `oplog,polling` exactly as approved; do not deploy the
   placeholder. Confirm the active fallback and re-run the affected flow. Roll
   back the app image/configuration only if the framework issue remains. Do not
   roll back database data or topology merely to reverse Change Streams.
4. Promote documentation changes, release notes, measured outcomes, selected
   driver configuration, topology ownership, and any operational warnings only
   after the Change Streams soak succeeds.

## Phase 6 — Deliberate Adoption of Optional 3.5 Capabilities

Run these as independently reviewable follow-ups after the base 3.5 runtime is
stable. "Take full advantage" means every capability receives an evidence-based
adopt/defer/reject decision; it does not mean enabling every switch regardless
of MoFaCTS's workload, public-network reach, or security boundaries.

### 6A — Native async Accounts APIs

1. Replace the three manual `MeteorAny.promisify` password/token login paths in
   `client/views/login/signIn.ts` with `Meteor.loginWithPasswordAsync` and
   `Meteor.loginWithTokenAsync`. Preserve resolved values, error codes/reasons,
   UI loading state, participant provisioning, and per-tab token behavior.
2. Test password and provisioned-token success/failure, all OAuth/SAML providers,
   slow/rejected login hooks, logout, reconnect during login, and callback/hook
   ordering. Re-audit `client/lib/authStorage.ts` because it touches private
   Accounts/Meteor storage properties whose compatibility is not guaranteed by
   the changelog's public-API statement.
3. Record `logoutAllClientsAsync` as a product/security opportunity only. It
   logs out the calling client as well as other devices; do not expose a new
   "sign out everywhere" control without user-approved UX and copy.

### 6B — `uws` DDP transport experiment

1. Start only if the Phase 0/2 measurements identify material SockJS framing,
   handshake, latency, or throughput cost. Keep the application code unchanged
   and select the experiment through `DDP_TRANSPORT=uws`; do not introduce the
   deprecated `DISABLE_SOCKJS` alias.
2. Verify end-to-end WebSocket upgrades, a proxy/load-balancer idle timeout at
   least as long as Meteor's default 35-second DDP heartbeat, and representative
   school/corporate proxies, captive/public Wi-Fi, mobile transitions, and
   accessibility/assistive-technology environments. A client whose network
   blocks raw WebSocket will not receive a polling fallback under `uws`.
3. Re-run the same DDP and reconnect workload used for `sockjs`. Measure
   handshake/reconnect time, message latency/throughput, client bundle/network
   bytes, app CPU/heap/GC, error/disconnect rate, and session-resumption success.
4. The `uws` implementation opens an internal listener at
   `127.0.0.1:5001` by default. Give each Meteor process sharing a Linux network
   namespace its own approved internal host/port; ordinary isolated container
   namespaces may retain the default. Never expose the internal listener.
5. Adopt only if the measured gain outweighs lost polling compatibility. Roll
   back with `DDP_TRANSPORT=sockjs`, re-run the affected networks, and document
   the selected transport in deployment settings and support guidance.

### 6C — HTTP authentication and data-aware rate limits

1. Keep existing synchronous `DDPRateLimiter` rules unless a named abuse-control
   requirement needs database context. For any async matcher, use a bounded,
   indexed or safely cached lookup; measure its contribution to the connection's
   sequential incoming-message latency; and verify that lookup rejection fails
   closed without disclosing account state.
2. Evaluate `accounts-express` route by route. Adding it requires explicit
   dependency approval. Use `createAuthMiddleware({ required: true })` for a
   protected route; the default `required: false` is not an authorization gate.
   Verify Bearer-token precedence, `meteor_login_token` cookie behavior,
   expiration/revocation, CORS, CSRF where cookies are used, 401 versus 403,
   audit identity, and least privilege.
3. Keep `Meteor.fetch` and `meteor/fetch` unauthenticated by default unless a
   call explicitly uses `{ auth: true }`. Imports from
   `meteor/accounts-express` attach authentication by default, so prove tokens
   are never forwarded to third-party origins. Preserve the current one-time
   download-token and SAML contracts unless a separately approved design proves
   replacement is safer and behavior-equivalent.
4. `accounts-2fa` is not a current direct package. If adopted later, test
   existing enrolled secrets/codes across the OTPAuth change and add any direct
   `node-2fa` use as an explicit dependency or deliberately replace it; do not
   assume an indirect import remains available.

### 6D — MongoDB/Minimongo collation

1. Select a concrete search/sort defect or simplification opportunity first;
   likely candidates include administrative user lookup and authored-content
   listing. Name whether the contract follows interface locale, authored
   content language, or another explicit locale—never infer one from the other.
2. Choose only client/server-common options (`locale`, strengths 1–3,
   `caseLevel`, `numericOrdering`, and `caseFirst`) when optimistic Minimongo
   parity is required. Server-only options such as `alternate`, `maxVariable`,
   `backwards`, and strengths 4–5 are ignored by Minimongo and need explicit
   divergence tests.
3. Create and verify matching collation-aware MongoDB indexes before rollout;
   compare query plans, Change Streams/oplog behavior, client/server equality,
   ordering of case/accents/numbers, pagination stability, and representative
   supported locales. Treat changed results as a user-visible behavior and
   update the wiki/public docs if the approved contract changes.

**Capability-adoption exit gate:** the native async login cleanup is verified,
and `uws`, async rate-limit matching, `accounts-express`, and collation each have
an owner, measured evidence, an adopt/defer/reject decision, and a tested
rollback or a documented reason that no runtime change was warranted.

## Required Verification Matrix

| Change / decision | Evidence required |
| --- | --- |
| Meteor/package/toolchain update | Unsuppressed successful updater output; reviewed release/package/lockfile diffs; exact Meteor/Node/npm version evidence; clean install/build; `npm run typecheck`, `npm run typecheck:vendor`, `npm run lint`, and CI `npm run test:ci`; native-module, dynamic-import/vendor-chunk, Rspack/Svelte, and bundle-dependency-override coverage. |
| DDP session resumption | Short/long and same/different-instance reconnect matrix; overflow/HCP/logout coverage; per-tab/auth continuity; replay and duplicate-side-effect checks; memory/reconnect-storm metrics; affinity proof; grace-period-zero rollback. |
| Docker/hotfix path | Compose configuration validation; explicit reactivity/transport setting propagation; deterministic package solution without unexplained update escape hatches; production-shaped bundle/image validation when explicitly authorized; supported staging smoke test. |
| Replica-set URI and operational consumers | Unit/integration coverage for seedlist and supported SRV/credential/query forms; fail-closed database-name validation; primary-failover readiness; app/backup/restore/hotfix/sidecar/tunnel tests; no secrets in output. |
| Target replica-set transfer | Fresh target deployment, frozen-source snapshot identity, target restore evidence, complete continuity-map evidence, index/user/metadata verification, every `MONGO_URL`/`MONGO_URI` consumer cutover proof, and an authority-boundary rehearsal. |
| Change Streams enablement | Supported driver evidence, ordered/unsupported/pagination fallback coverage, projection/snapshot/restart/history-loss/write-fence regressions, representative concurrency comparison, correctness/integrity checks, and performance thresholds across app and MongoDB. |
| Native async Accounts adoption | Password/token/OAuth/SAML success and error parity, auth hook ordering, per-tab storage, login-time reconnect, types, and focused UI tests. |
| `uws` decision | Same-workload A/B against SockJS; proxy/LB/heartbeat/network matrix; session-affinity and internal-port checks; error/performance thresholds; `DDP_TRANSPORT=sockjs` rollback. |
| `accounts-express` or async rate-limit adoption | Explicit dependency/policy approval; authorization-boundary, token/cookie/CORS/CSRF, fail-closed, audit, third-party fetch, lookup-bound/latency, and abuse tests. |
| Collation adoption | Approved locale/semantics contract, matching index and query-plan evidence, client/server parity, pagination/reactivity, representative locale data, and documentation review. |
| Production transfer and release | Preflight backup evidence, approved maintenance/write-freeze runbook, target-only writer proof, fallback-mode soak, post-release operator and learner smoke tests, and post-write recovery/reconciliation readiness. |

`npm run test:ci` remains CI-only unless a maintainer gives fresh, explicit
authorization for a local invocation.

## Risks and Controls

| Risk | Control |
| --- | --- |
| A partial image bump leaves the CLI, CI, docs, `.nvmrc`, hotfix builder, or runtime on incompatible releases. | Treat the release-consistency set in Phase 2 as one reviewable change and assert exact versions in each build/runtime. |
| The wrong stable tag is used or an unreleased 3.5.1 branch is selected for desired fixes. | Use stable `METEOR@3.5` today; re-check official stable tags/changelog immediately before implementation; never select beta/unreleased code as a silent substitute. |
| Suppressed `meteor update --npm` failures or `--allow-incompatible-update` produce an unreviewed package graph. | Run update unsuppressed, commit/review the resolved files, then make builds consume that solution; remove or explicitly justify escape hatches. |
| EJSON copy-on-write aliases input that code expected to be cloned. | Audit `toJSONValue`/`fromJSONValue` in app/custom packages and mutation-after-conversion behavior; add payload and custom-type regression tests. |
| Session resumption changes presence/connection semantics, replays side effects, or retains too much memory. | Audit connection/auth hooks, test replay/idempotency and mass disconnects, validate same-instance routing, keep grace-period `0` as rollback. |
| Change Streams silently fall back, so expected gains never materialize. | Instrument/record active driver and test a replica-set staging environment before making a performance claim. |
| Broad/high-write publications shift excessive load to MongoDB. | Classify publications, load test with production-like data, inspect indexes/query plans, retain the fallback override. |
| A replica-set URI passes the app but fails startup guards, hotfix readiness, backup/restore, or the MCP sidecar. | Fix and test seedlist parsing and every `MONGO_URL`/`MONGO_URI` consumer before cutover; exercise election/failover and prevent old-local-container operations. |
| A standalone-to-target transfer misses writes made during the copy. | Treat the final move as a planned maintenance/write freeze; verify all writers are stopped before the final snapshot and never claim live synchronization from a standalone source. |
| Existing data or metadata is lost during transfer. | Use a fresh target, verified backup/restore rehearsal, the continuity map, and explicit comparisons of documents, indexes, users, metadata, and external assets before traffic returns. |
| Old and new databases receive writes at the same time. | Make the target the single authoritative writer before normal traffic returns; lock the old source against writers and do not use cross-database canaries. |
| Node/runtime change breaks native modules or build tooling. | Clean rebuild and test each build path under the selected Meteor-bundled Node version. |
| `uws` improves a benchmark but blocks real learners behind proxies/mobile networks or collides on an internal port. | Keep SockJS as base, test representative networks and shared-network namespaces, enable only from measured benefit, retain one-variable rollback. |
| `accounts-express` or an async rate-limit matcher weakens an authorization/availability boundary. | Separate approval; require `required: true` where protected; bound/index lookups; test token leakage, cookies/CSRF, errors, and fail-closed behavior. |
| Collation changes search/sort meaning or uses an incompatible index/locale. | Separate localization decision, matching collation indexes, client/server parity tests, stable pagination, and user-facing documentation review. |
| Rolling release mixes incompatible stored data. | Do not include schema changes; if later required, use a separately approved backward-compatible migration plan. |

## Decisions Needed Before Implementation

1. Will implementation use today's stable `METEOR@3.5`, or a newer stable 3.5
   patch if one has been released and reviewed by then? A beta/unreleased branch
   is not a candidate.
2. What is the approved current reactivity baseline in each environment, and
   will the replica-set rollback be proven oplog tailing (with
   `MONGO_OPLOG_URL`) or explicitly capacity-tested polling?
3. Do the default DDP session values (15-second grace, 100 messages) meet the
   memory, affinity, learner reconnect, and presence/metrics contracts, or is a
   different owned value required?
4. What is the purpose-built production target: self-hosted replica set or a
   managed service; how many members; who owns networking, member
   authentication, backups, monitoring, and 24/7 operational response?
5. Which Compose/readiness/backup/restore and MCP-sidecar/tunnel model owns that
   target, and what prevents the obsolete local standalone from starting or
   receiving operator actions after cutover?
6. What write-freeze/RPO/RTO/downtime window is acceptable for the final
   source-to-target transfer, and who owns learner-facing communication and
   the go/no-go decision?
7. Is Change Streams a required outcome after the data-platform migration, or
   an opt-in performance experiment? Who owns the driver-choice decision and
   ongoing database capacity monitoring?
8. What production-like data volume/concurrency represents learner sessions,
   administrative work, and write-heavy history/model activity for a credible
   benchmark, and who owns the repeatable harness and sanitized dataset?
9. What error, latency, MongoDB resource, and availability thresholds are
   acceptable for promotion and for rollback?
10. Which deployment environments can host a replica-set rehearsal and a
   canary/soak period without using learner data outside approved controls?
11. Is Android retained and repaired/replaced as a supported release target, or
   explicitly retired/deferred before this upgrade?
12. After evidence is gathered, which optional capabilities are adopted:
   native async Accounts, `uws`, async rate-limit matching,
   `accounts-express`, and collation? Record a reason and owner for every defer
   or rejection.
13. What exceptional condition would justify the contingency in-place
   conversion, and who must approve that deviation from the target-transfer
   strategy?

## References

- [Meteor 3.5 changelog and migration steps](https://docs.meteor.com/history)
- [Official Meteor 3.5 release article and benchmark context](https://dev.to/meteor/meteor-35-is-out-j13)
- [Stable Meteor 3.5 release tag](https://github.com/meteor/meteor/releases/tag/release%2FMETEOR%403.5)
- [Meteor installation and Node-version matrix](https://docs.meteor.com/about/install)
- [Change Streams driver requirements, fallbacks, and performance caveats](https://docs.meteor.com/performance/change-streams-observer-driver)
- [DDP transport selection, session resumption, and rollback](https://docs.meteor.com/performance/ddp-transport)
- [DDP reconnection/session-resumption API](https://docs.meteor.com/api/meteor#reconnection)
- [Accounts APIs, including 3.5 async login/logout methods](https://docs.meteor.com/api/accounts)
- [`accounts-express` authentication and fetch contracts](https://docs.meteor.com/packages/accounts-express)
- [Async `DDPRateLimiter` matchers](https://docs.meteor.com/api/ddpratelimiter)
- [Mongo/Minimongo collation options](https://docs.meteor.com/api/collections)
- [Meteor 3.5.1 milestone (unreleased patch status; re-check only)](https://github.com/meteor/meteor/milestone/132)
- Unreleased 3.5.1 fixes to re-check if 3.5.0 remains the selected stable
  release: [nested projection fallback](https://github.com/meteor/meteor/pull/14518),
  [login/write-fence deadlock](https://github.com/meteor/meteor/pull/14564),
  [cross-connection fence scoping](https://github.com/meteor/meteor/pull/14602),
  and [ChangeStreamHistoryLost restart handling](https://github.com/meteor/meteor/pull/14607)
- [Meteor deployment, staging, and rolling-data-version guidance](https://docs.meteor.com/tutorials/deployment/deployment.html)
- [MongoDB: Convert a standalone to a replica set](https://www.mongodb.com/docs/manual/tutorial/convert-standalone-to-replica-set/)
- [MongoDB: Replica-set deployment and architecture](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set/)
- [MongoDB: Change Streams](https://www.mongodb.com/docs/manual/changestreams/)
- [MongoDB: Backup and restore with database tools](https://www.mongodb.com/docs/manual/tutorial/backup-and-restore-tools/)
- `docs/deployment/upgrade-guide.md` — MoFaCTS operator upgrade contract
