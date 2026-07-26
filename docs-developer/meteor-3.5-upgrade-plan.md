# Meteor 3.5 Upgrade and Capability-Adoption Plan

## Research Basis and Release Identity

This plan was checked against official Meteor, MongoDB, Node.js, npm, and
repository evidence on 2026-07-24. The current stable framework release is
named `METEOR@3.5`; the documentation labels it v3.5.0 and its tool package is
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

The newest upstream ref found during this review is
`release/METEOR@3.5.1-beta.0`; there is no stable 3.5.1 release. Several fixes
that matter to MoFaCTS are therefore **not present in stable 3.5.0**. Check the
stable tags and changelog again immediately before implementation. Prefer a
later stable 3.5 patch only after reviewing its final notes and repeating the
selection and compatibility gates; never substitute a beta, release branch, PR
build, or unpinned `latest` release.

Meteor's generic deployment page currently contains older Node examples. For
the selected release, the stable changelog plus `meteor node -v`,
`meteor npm -v`, and the built bundle's `.node_version.txt` are authoritative;
builder, `programs/server` dependency install and runtime must use the same ABI
and target architecture. Never copy native `node_modules` across operating
systems or architectures.

### Evidence labels used by this plan

| Label | Meaning and planning rule |
| --- | --- |
| `VERIFIED-UPSTREAM` | Confirmed in an official release tag, changelog, API/reference page, or MongoDB/Node/npm documentation. Cite the source and re-check mutable release state at implementation time. |
| `VERIFIED-REPO` | Confirmed in the named source/config/wiki path in the 2026-07-24 working trees. Re-capture the source commit and working-tree state before implementation. |
| `INFERENCE` | A conclusion derived from verified evidence but not directly observed, such as expected polling from a standalone tracked configuration. State its evidence and never promote it to a runtime fact without measurement. |
| `ASSUMPTION-TO-CONFIRM` | A provisional planning input whose real value is unknown. It may shape an experiment but cannot satisfy an entry, promotion, capacity, security, or rollback gate. |
| `PROTECTED-RUNTIME-FACT` | Must be read from the real environment without recording a secret, URI, learner record, or credential. Until supplied, it is unknown and cannot be replaced by a repo inference. |
| `RECOMMENDATION` | A proposed design, threshold, owner, or sequence. It becomes binding only when the named approver accepts it. |
| `EXPERIMENT` | A claim that must be proved with the defined MoFaCTS workload; upstream benchmark results are not acceptance evidence. |

### Readiness after repository audit

Repository entry state was re-audited on 2026-07-25. This readiness verdict is
about what is present in source control, not merely what this plan intends.

- **Decision readiness: `READY`.** The contained base track is bounded by the
  defaults in [Resolved planning defaults and hard
  blockers](#resolved-planning-defaults-and-hard-blockers). No additional
  product behavior or optional capability decision is needed to prepare the
  baseline.
- **Repository implementation entry: `NOT READY`.** The repository still pins
  Meteor 3.4.1 and Node 22, preserves URI parsing and Meteor 2 authentication
  compatibility paths, omits the containment settings, and suppresses updater
  failures. These are entry-gate failures, not work that may be silently
  deferred while application migration proceeds. Only E0a gate remediation may
  begin from this state; contained-base application work remains blocked.
- **Production release readiness: `NOT READY`.** Production topology, release
  patch, rollback, capacity, and protected runtime facts are not yet accepted;
  no code has been built or exercised under Meteor 3.5.
- **Change Streams readiness on stable 3.5.0: `NOT READY`.** Keep
  `METEOR_REACTIVITY_ORDER` on the proven fallback. Do not enable Change
  Streams until a reviewed stable release contains the required fixes in the
  following disposition register and passes MoFaCTS-specific qualification.

### Resolved planning defaults and hard blockers

The following choices are fixed for this plan. They remove choices that were
previously described as approvals while preserving the boundaries that cannot
be decided from repository or upstream evidence.

| Topic | Binding decision | Consequence |
| --- | --- | --- |
| Meteor release | Use exactly `METEOR@3.5` / v3.5.0. Do not use 3.5.1-beta.0 or any other prerelease. | `meteor update --release 3.5` is the only upgrade command in scope. A later patch is a new plan amendment, not an automatic substitution. |
| Toolchain ownership | Meteor 3.5.0's bundled Node 24.15.0 and npm 11.12.1 are the canonical bundle-build and bundle-runtime versions. | Retain the established builder as `geoffreybooth/meteor-base:3.5@sha256:58b203caa2c3dc963774117cbf45534d4533ddd77b220e075107da3f3600a083`. Use official `node:24.15.0-alpine` for the bundle-dependency and runtime stages, pinned by the manifest digest for every approved target architecture in the implementation change. The first build must assert the bundled Meteor, Node, and npm versions before the source change is accepted. |
| Base reactivity | Set `METEOR_REACTIVITY_ORDER=polling` in every base-track environment. | Oplog and Change Streams are out of scope for the base release. This is also the tested rollback state. |
| Base DDP transport and resumption | Use SockJS and set `Meteor.server.options.disconnectGracePeriod = 0`. | `uws` and DDP session resumption are not enabled or evaluated in the base release. |
| Database authority | Preserve the existing production database, URI, topology, and backup authority. | No replica-set, managed-platform, URI, or backup change is part of this upgrade. Change Streams remains deferred and does not create a database-platform project. |
| Connection-string handling | Treat MongoDB URIs as opaque credentials. The driver or `mongosh` validates a live connection; plan code must not parse or print a URI. | A bespoke parser is prohibited unless a later, separately approved exception names the unavoidable offline check and its redaction contract. |
| Optional capabilities | `Change Streams`, DDP resumption, `uws`, async rate matching, `accounts-express`, collation, and native async Accounts refactoring are deferred. | “Deferred” means no source, dependency, configuration, schema, topology, or deployment change is made for that capability in this release. It does not imply future adoption. |
| Android | Android remains a supported MoFaCTS client. | Include Android build and smoke coverage in the base-upgrade compatibility work; this is implementation verification, not a decision about whether Android is supported. |

The following are hard blockers, not choices for the implementer to infer:

| Blocker | Required evidence | Decision owner |
| --- | --- | --- |
| Production topology and effective reactivity driver | Sanitized `hello`/topology result and effective environment configuration, with no URI or credential recorded. | Database operations |
| Production rollout | Explicit deployment authority, last-known-good artifact, rollback owner, and required protected operational evidence. | Change authority |

For any optional experiment, “adopt” requires three comparable candidate runs
against two baseline runs of the approved workload, no correctness, security,
or availability regression, and at least a 15% improvement in its single
named primary metric. A missing workload, metric, or owner yields **defer**.
A blocked item cannot be implemented, tested against production, or treated as
release evidence.

### Entry gate and exact first implementation slice

There are no additional product-feature decisions before the contained base
track, but repository prerequisites are incomplete. **E0a is the exact first
implementation slice.** No application migration, compatibility repair, or
optional experiment begins until E0a is reviewed as one baseline-pin package.
Within E0a, `mofacts/.meteor/release` is the first source-of-truth edit.

| Entry gate | Audited repository state | Required E0a or prerequisite exit evidence |
| --- | --- | --- |
| Meteor release owner | `mofacts/.meteor/release` is `METEOR@3.4.1`. | Change first to exactly `METEOR@3.5`; later run the selected updater unsuppressed in A2 and review the complete resolved Meteor graph. |
| Builder identity | Root `Dockerfile` and hotfix Compose use `geoffreybooth/meteor-base:3.4.1`. | Pin `geoffreybooth/meteor-base:3.5@sha256:58b203caa2c3dc963774117cbf45534d4533ddd77b220e075107da3f3600a083` everywhere the Meteor builder is selected; assert `Meteor 3.5`, Node 24.15.0 and npm 11.12.1 from that immutable image. |
| Bundle dependency/runtime Node | Docker and hotfix dependency/runtime paths use Node 22.22.0 tags. | Pin `node:24.15.0-alpine` by the approved target-architecture digest in builder-dependency, runtime and hotfix paths; never mix native modules built for another OS, ABI or architecture. |
| Developer/CI Node owner | `.nvmrc` says `22`; package engines permit Node 22; CI installs Node 22 and Meteor 3.4.1. | Make one exact Node 24.15.0 owner and align `.nvmrc`, package engine/package-manager policy, CI Meteor/Node installation and explicit version assertions. |
| Updater observability | CI and the Docker build redirect `meteor update --npm` errors and continue successfully. | Remove redirection and `|| true`; a migration/update failure is blocking and its non-secret output is retained in the change record. |
| Opaque Mongo URI contract | Shell, hotfix and server readiness/settings paths locally parse the URI. | Before A2, complete the base-relevant part of D1: pass the URI opaquely to the supported driver or `mongosh`, assert a live authenticated connection and selected database/capabilities, redact failures, and add no parser or compatibility fallback. |
| Per-tab authentication contract | `authStorage.ts` falls from `Accounts.storageLocation` through Meteor 2 private storage/token APIs. | Before A2, complete A1: retain only the supported Meteor 3 storage contract, preserve per-tab UX, and make its absence an explicit compatibility blocker. |
| Framework containment | Base/staging Compose does not track polling, SockJS or reconnect-grace settings. | Before candidate acceptance, complete A4: `METEOR_REACTIVITY_ORDER=polling`, `DDP_TRANSPORT=sockjs`, and app-owned `Meteor.server.options.disconnectGracePeriod = 0` across every base environment. |
| Baseline evidence | No Meteor 3.4.1 baseline or immutable 3.5 candidate evidence is recorded. | After E0a and before application-source migration, complete E0d with the approved functional workload and two repeatable baseline runs. This is compatibility evidence, not an optional-capability performance experiment. |

E0a must also record the source commit/dirty-tree disposition so updater output
cannot absorb unrelated package, Zstd, upload, OpenRouter, SPARC or other user
work. The release pin, image pins, exact local/CI Node policy, and updater
observability changes form one review stack; do not promote an intermediate
state whose release file and resolved package graph disagree.

After E0a and E0d pass, execute the base prerequisites in this order: the
base-relevant D1 opaque-URI/readiness correction, A1 authentication storage,
A2 exact Meteor package solution, A3 Node/build ownership reconciliation, A4
containment settings, then conditional compatibility fixes and A6 acceptance.
Android build/smoke coverage remains part of A6. Change Streams, DDP resumption,
`uws`, database-platform changes, and other optional capabilities remain out of
scope.

### Upstream issue and fix disposition register

Status is relative to stable `METEOR@3.5` (`meteor-tool@3.5.0`) on the review
date. A merged PR on an unreleased branch is not a shipped fix.

| Behavior | 3.5.0 disposition | Required gate |
| --- | --- | --- |
| Standalone MongoDB Change Streams capability detection | Included in 3.5.0. | Still prove that standalone uses the declared fallback; do not infer production topology from this fix. |
| Initial-snapshot/restart races, `skip`/`limit` fallback, and ObjectID projection handling listed in the 3.5 changelog | Included in 3.5.0. | Run the focused observer regression matrix against MoFaCTS publications. |
| Nested-object projection crash fallback ([PR 14518](https://github.com/meteor/meteor/pull/14518)) | Merged only toward the unreleased 3.5.1 line. | Required in the selected stable patch before Change Streams; dotted and nested projection tests remain mandatory. |
| Change Stream write-fence/multiplexer deadlock affecting login-style writes ([PR 14564](https://github.com/meteor/meteor/pull/14564)) | Merged only toward the unreleased 3.5.1 line. | Required in the selected stable patch before Change Streams; no risk bypass is recommended for authentication/learner writes. |
| Cross-connection write-fence timestamps ([PR 14602](https://github.com/meteor/meteor/pull/14602)) | Merged only toward the unreleased 3.5.1 line. | Inventory Mongo connections; require the fix before Change Streams if more than one connection participates in a write fence. |
| `ChangeStreamHistoryLost` restart loop ([PR 14607](https://github.com/meteor/meteor/pull/14607)) | Merged only toward the unreleased 3.5.1 line. | Required before Change Streams; rehearse an oplog-history-loss condition and alert on restart storms. |
| Change Stream operation-time comparison crash ([PR 14609](https://github.com/meteor/meteor/pull/14609)) and related observer fixes listed in the beta changelog | Present only in the 3.5.1 beta line. | Reconcile every related fix against the final stable changelog; require the selected stable patch and run the snapshot/restart/fence matrix before Change Streams. |
| Quiet `uws` connection closed by the legacy heartbeat watchdog ([PR 14546](https://github.com/meteor/meteor/pull/14546)) | Merged only toward the unreleased 3.5.1 line. | `uws` remains deferred until a stable fix and the network experiment pass. |
| DDP resumption dropped messages, spurious reconnects, closed-connection leaks, subscription stop/double-stop and batching edge cases (3.5.1 beta PRs 14526, 14528, 14530, 14532, 14534, 14536, 14538, 14542, 14544) | Present only in the 3.5.1 beta line. | Stable 3.5.0 baseline uses grace period zero. Enable resumption only on a stable patch whose final notes contain the applicable fixes and after the isolated Phase 2B experiment. |
| Non-retrying client method can remain unresolved when force-disconnected between `result` and `updated` ([PR 14193](https://github.com/meteor/meteor/pull/14193)) | Open upstream; not proven fixed in 3.5.0 or the beta. Grace period zero does not fix this client abort semantic. | No app-owned `DDP.connect`/`retry:false` path was found; inventory packages/custom connections and, where applicable, test the precise force-disconnect window. Record not-applicable only with that evidence. |
| Rspack Docker-build hang ([issue 14445](https://github.com/meteor/meteor/issues/14445)) and orphan processes on shutdown ([issue 14384](https://github.com/meteor/meteor/issues/14384)) | Open upstream on the review date. | Exercise bounded build shutdown/retry behavior in supported Docker/CI paths; a hang or leaked process aborts promotion. |

The release owner must update this register from the final stable changelog and
linked issue/PR state. “In a beta,” “merged,” and “milestoned” never satisfy a
stable-release gate.

## Goal

Move MoFaCTS from `METEOR@3.4.1` to the deliberately selected stable Meteor
3.5 release without changing learner data contracts, TDF/config schemas, or
deployment semantics as a side effect. Capture the automatic runtime gains,
qualify the new default DDP behavior, and deliberately evaluate every relevant
opt-in capability. Enable Change Streams only after the framework upgrade is
stable and MoFaCTS runs against a qualified, operationally owned MongoDB
replica-set or managed platform whose workload has been proven compatible.

This is an implementation plan, not authorization to change the framework,
MongoDB topology, data, deployment configuration, dependencies, public API
surface, or query semantics.

## Advantages MoFaCTS Can Realistically Gain

The release-wide benefit is broader than Change Streams. This is the capability
decision register; a capability is not adopted merely because its code ships.

| Capability | Classification | MoFaCTS advantage | Prerequisites and principal risks | Proof required | Rollback / non-adoption path | Owner | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Selected-release Node/npm (3.5.0: Node 24.15.0/npm 11.12.1) | **Automatic/unavoidable** | Supported runtime used by the selected Meteor release. | Exact release selection; Node 24/Alpine support for Argon2, SWC/Rspack and all native modules; npm lockfile review. Maintenance benefit only—no speed claim. | Rebuild builder, bundle dependencies, runtime and CI from clean inputs; static/integration/build evidence and exact-version assertions. | Roll back the complete Meteor image/package set before any incompatible data write; no mixed Node bundle. | Release engineering | 2A |
| EJSON/DDP allocation reductions and shipped correctness fixes | **Automatic/unavoidable** | Potentially fewer copies/allocations and less GC pressure; maintained core behavior. | Copy-on-write aliasing may break code that expected a deep clone; exact shipped-fix set varies by patch. | Payload/custom-type mutation tests and same-workload heap/GC/DDP correctness comparison. | Roll back the complete framework release; no feature switch. | Application | 2A |
| DDP session resumption | **Enabled by default but configurable; initially disable** | Can reduce full re-subscribe work on brief same-process reconnects. | Open reconnect defects; the tracked deploy is one process/no cross-instance resume, but Phase 0 must confirm live topology. MoFaCTS also persists private/overloaded identity values. Replay, memory, auth and identity risks are high. | Preserve base identity semantics; then require a separate identity contract plus short/long and same-/different-process, idempotency, auth, queue, memory and storm gates. | `disconnectGracePeriod = 0`; fresh session/re-subscribe. | Application + release engineering | 1, 2B |
| MongoDB Change Streams | **Infrastructure-dependent; default-preferred by Meteor but initially disable** | Eligible unordered observers may move matching work from app processes to MongoDB. | MongoDB 6+ replica set/sharded cluster, privileges, connection capacity, selectors/indexes, and a stable Meteor patch containing the required fixes. May increase database load or fall back per observer. | Driver evidence; publication compatibility matrix; failure injection; correctness/integrity; matched fallback A/B workload. | Tested `polling`, or proven `oplog,polling`; never an untested placeholder. | Database operations + application | 3–5 |
| DDP `uws` transport | **Optional/deferred** | Possible raw-WebSocket latency/throughput improvement if SockJS is a measured bottleneck. | No HTTP-polling fallback; representative public/school/corporate/mobile networks; unique internal listener and stable heartbeat fix. The tracked path has no load balancer; Phase 0 must confirm live proxy/LB behavior. | Same-workload/network A/B with a pre-approved material-benefit threshold and zero required-network loss. | `DDP_TRANSPORT=sockjs`. | Release engineering + support | 6B |
| Promise-based Accounts APIs | **Optional/recommended after base stabilization** | Remove manual promisification and improve typing/error flow without adding UI. | Private per-tab auth surfaces, Microsoft OAuth, Memphis SAML, callbacks and error parity. | Password/token/OAuth/SAML/per-tab/reconnect regression matrix. | Keep the existing wrappers while supported; revert this independent source change. | Application/authentication | 6A |
| Async `DDPRateLimiter` matchers | **Optional/deferred until a named policy needs data** | Can enforce a database-backed abuse condition. | Matchers run sequentially on a connection queue; lookup latency/failure can affect availability. | Bounded/indexed lookup, latency budget, fail-closed and abuse tests. | Keep existing synchronous rules. | Security + application | 6C |
| `accounts-express` | **Optional/deferred** | First-party account context for a future approved Express/REST route. | New package and authorization boundary; current one-time download and SAML contracts are not migration candidates. | Route-specific Bearer/cookie, 401/403, CORS/CSRF, revocation, audit and token-leak tests. | Do not add the package; retain scoped existing contracts. | Security + route owner | 6D |
| MongoDB/Minimongo collation | **Optional/deferred** | Can align explicitly locale-aware client/server search/sort and numeric ordering. | User-visible equality/order semantics; locale ownership; matching indexes; some server options lack Minimongo parity. | Approved locale contract, query plan, client/server parity, pagination/reactivity and representative-language tests. | Keep current query/index semantics. | Product/localization + application | 6E |
| `accounts-2fa`/OTPAuth change | **Rejected as out of scope** | None for the current app; package is not directly used. | Adopting it would add a product/security surface and dependency. | New separately approved feature plan only. | Do not adopt. | Security/product | Outside this plan |

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
| Node/tooling | Exact Node ownership is currently split: Docker, CI, and hotfix paths pin Node 22.22.0; `mofacts/.nvmrc` says only `22`; `package.json` permits `>=22.13.0 <23`; and Meteor 3.4.1 itself bundles Node 22.22.1. The audit shell was Node 22.20.0/npm 10.9.3. Meteor 3.5 bundles Node 24.15.0/npm 11.12.1. | Establish one exact Node owner and make every other surface assert or derive it. Rebuild native dependencies; do not let the Meteor-bundled build Node differ from the bundle-install/runtime Node. |
| Build/runtime pins | `Dockerfile` and `deploy/docker-compose.hotfix-local.yml` use third-party `geoffreybooth/meteor-base:3.4.1`; CI and developer docs install Meteor 3.4.1/Node 22. Meteor now documents an official `meteor/meteor-base` image. | The publisher decision is fixed: retain `geoffreybooth/meteor-base`, move every builder consumer to the approved 3.5 digest, and pin official Node 24.15.0 Alpine by each supported target architecture. Assert contents and update all selected pins atomically in E0a; do not silently swap publishers. |
| Meteor packages | `.meteor/packages` directly constrains `mongo@2.2.0`, `accounts-password@3.2.2`, `session@1.2.2`, `ejson@1.1.5`, `ecmascript@0.17`, `email@3.1.2`, and `rspack@1.0.0`. Resolved `.meteor/versions` includes `accounts-base@3.2.1`, `accounts-password@3.2.3`, `ddp-client/ddp-server@3.2.0`, `minimongo@2.1.0`, `mongo@2.3.0`, `npm-mongo@6.16.1`, `alanning:roles@4.0.0`, `ostrio:files@3.0.1`, `rspack@1.1.0`, and `webapp@2.1.2`. The 3.5 set moves relevant packages again. | Distinguish direct constraints from the resolved graph. Run the official updater and review `.meteor/packages`, all of `.meteor/versions`, npm lockfile, and user-owned dependency work; do not assume the release pin alone selects the intended packages. |
| npm build stack | The dirty working-tree lock currently resolves `@meteorjs/rspack@2.0.1`, Rspack core/CLI 1.7.6, SWC 1.15.33, Svelte 5.55.7, `svelte-loader` 3.2.4 and `svelte-preprocess` 6.0.3; app Meteor types remain `@types/meteor@2.9.11`. | Re-capture after user dependency work is dispositioned. Reconcile Atmosphere/npm Rspack and Meteor-provided/community types; prove Node 24 and target-platform binary closure rather than inferring it from permissive engine ranges. |
| Upgrade command observability | CI and the Docker build currently run `meteor update --npm` with errors redirected and ignored. | Run the 3.5 migration interactively without suppression, retain its non-secret output in the change record, and make the reviewed lockfiles authoritative. Do not accept a green build that hid an update failure. |
| MongoDB version | Repository Compose uses the mutable line tag `mongo:8.0`; exact patch, image digest and FCV are not repository facts. | The declared line satisfies the Change Streams minimum, but Phase 0 must capture/pin the exact deployed patch/digest/FCV and verify topology. |
| MongoDB topology | Repository Compose starts MongoDB without `--replSet`; the local/default self-hosted path must therefore be treated as standalone until an environment check proves otherwise. | A standalone MongoDB cannot use Change Streams. Meteor will fall back to the next configured driver. |
| Reactivity configuration | No repository-owned `METEOR_REACTIVITY_ORDER` or `MONGO_OPLOG_URL` wiring was found. The checked-in standalone Compose path is therefore expected to poll, but protected environment configuration must be inspected before asserting the production driver. | Capture the actual current driver in every environment. Forcing `oplog,polling` does not prove 3.4-equivalent behavior when oplog is unavailable; force `polling` for an observed polling baseline or explicitly provision/test oplog if that is the intended rollback. |
| Replica-set URI compatibility | WHATWG/single-host parsing exists in `deploy/docker/validate-mongo-url.sh`, `deploy/hotfix/run-bundle.sh`, `deploy/hotfix-dev.ps1`, `mofacts/server/lib/openCoreSettingsValidation.ts`, and `mofacts/server/methods/deploymentReadinessMethods.ts`. Standard multi-host seedlists are not safely supported, and one hotfix error path can echo the full URI. | Remove local parsing and establish one opaque-URI/connected-validation contract across shell, PowerShell and app code. Pass approved seedlist, `replicaSet`, `authSource`, encoded-credential, DNS/IPv6 and SRV forms to the supported driver or `mongosh`; assert the connected database/authentication/capabilities and redact every error path. A direct parser requires the separately approved exception. |
| Deployment database ownership | Canonical Compose depends on/waits for its local `mongodb` and backup/restore execs into that container. There are two inconsistent production MCP paths: `mofacts-mcp-sidecar/scripts/start-production.ps1` plus `mofacts-mcp-sidecar/docker-compose.production.yml` tunnels to hard-coded `mofacts-mongodb-1`, while `C:\dev\mofacts_config\deploy and build.txt` launches `mofacts-mcp-sidecar/docker-compose.remote-server.yml` directly on a remote Docker network. The base sidecar default database name is also inconsistent. | Select one authoritative production sidecar/DB contract and retire or redirect the other through a separately approved config-repo change. A replica-set target requires coherent health/readiness, backup/restore, dependencies, URI, network/tunnel, sidecar and failover behavior. |
| Deployment shape | Tracked Compose has one fixed-name app container and one Caddy upstream; replacement restarts that sole instance. `/health` is liveness only, although Compose uses it as a healthcheck. | Do not claim current rolling, canary, cross-instance resumption or load-balancer affinity support. Either keep a one-instance maintenance deployment and expect fresh sessions after process loss, or separately approve a multi-instance/LB design. Add DB-aware readiness distinct from liveness before database failover/cutover. |
| Reactive surfaces | `mofacts/server/publications.ts` contains learner, content, dashboard, settings and sorted/paged user publications and manual `observeChanges`; `serverComposition.ts` observes Dynamic Settings. The roles path uses `(Meteor as any).roleAssignment` across publications, shared collections, startup, and client utilities because the package export is undefined in the Rspack bundle. | Classify every selector/projection/sort/skip/limit/observer and verify roles publication/global/autopublish/allow-rule behavior as a named Rspack/package gate. |
| DDP sessions and durable identity | The app has no public resumption configuration, but private `_lastSessionId` is polled, persisted to the user and written to history. The overloaded history `sessionID` also receives app attempt IDs, timestamp-plus-TDF values from video/AutoTutor, and learning-component/SPARC session values. Readers include model/history exchanges, dashboards/analytics and exports. | Recommended base disposition: preserve every current value/meaning, keep grace zero, inventory all writers/readers, and do not collapse or reinterpret the field in this upgrade. A unified app-owned identity is a separate durable-data design/migration; resumption stays deferred until its contract is approved. |
| DDP transport | No repository `DDP_TRANSPORT`/`DISABLE_SOCKJS` configuration was found, so the effective target default remains `sockjs`. MoFaCTS is public/mobile-facing. | Hold `sockjs` during the framework and database work. Treat `uws` as a measured, reversible later experiment, not part of the base migration. |
| Accounts and HTTP | `signIn.ts` manually promisifies password/token login; `authStorage.ts` monkeypatches per-tab token storage and retains a labeled “Meteor 2 fallback” through private Accounts/Meteor storage APIs; `client/index.ts` also reads private stored-token/local-storage surfaces. The Microsoft package uses private `OAuth._*` helpers; Memphis SAML uses `globalThis.Package.oauth` and private credential/login-response helpers. The server has multiple `WebApp`/Connect handler tiers. | Treat password/token, per-tab storage, Microsoft OAuth, Memphis SAML, handler ordering and scoped download routes as separate contracts. A1 removes the labeled Meteor 2 fallback and proves the supported `Accounts.storageLocation` path; inability to preserve parity on that supported contract blocks the upgrade and does not authorize time-bounded fallback preservation. |
| Rate limiting | `server/runtime/ddpRateLimits.ts` defines synchronous method rules. | Verify them unchanged first. Async matchers are an available later refinement only where a database-backed condition improves policy. |
| Async migration | MoFaCTS is already Meteor 3-style and contains async raw MongoDB calls and async server code. | Re-audit custom packages, raw MongoDB calls, HTTP middleware, and native modules against the selected release; do not assume the prior migration covers a new toolchain/runtime bump. |
| Client/build integration | The application uses Blaze/Svelte/Rspack and custom `mofacts:*` packages. Its Svelte loader wrapper globally suppresses one warning while loading, which could hide a changed diagnostic. Argon2 is enabled in CI/local settings and relies on a prebuilt native binary in Alpine; Docker also prunes platform-specific SWC binaries. `.meteor/platforms` configures Android, but the tracked mobile script is destructive/non-reproducible and has portability/tooling/signing problems. | Treat bounded Rspack build/shutdown, suppressed-warning scope, Svelte integration, roles workaround, Argon2 password/rehash, SWC/OXC/native closure, custom packages and Android disposition as named Node 24 gates. Do not run the current mobile script as an acceptance check. |
| Learning components | `learning-components/` has no independent Meteor runtime/package pin. Its active boundary is the canonical history envelope's `sessionID` and pedagogical trial/history/model-state consumers reached through the app facade. | Preserve envelope meaning and test new/resumed trials, replay/retry, feedback/model-state, restore and resume. Do not invent a parallel history identity. |
| Sidecar runtime | The Mongo MCP sidecar separately pins Node 22.22 and is not part of the Meteor bundle ABI. | Do not bump it incidentally. Decide separately whether it stays on its owned runtime; it must still support the approved Mongo URI/topology/readiness contract. |

The main and config working trees were already dirty during this audit. In
particular, `mofacts/package.json`, `mofacts/package-lock.json`, upload/zstd
source/assets, and one config stimulus file had unrelated user changes. These
were not edited or interpreted as upgrade work. Phase 0 must capture a clean
source identity plus the explicit disposition of any dependency changes before
an updater-generated diff is reviewed.

### Repository and documentation ownership boundary

| Contract | Authoritative owner for implementation | Required compatibility action |
| --- | --- | --- |
| Meteor release, app packages, app behavior, URI/readiness validation | `C:\dev\MoFaCTS\mofacts` | Implement and verify the selected release and app contracts here. |
| Canonical Compose/build/hotfix/backup/restore/sidecar mechanics | `C:\dev\MoFaCTS\deploy` and root deployment files | Make these the only executable deployment source of truth; add exact-version assertions and one database target contract. |
| TDF/config content | `C:\dev\mofacts_config` | No TDF/schema/config-name change is expected. Replace the duplicate `deploy and build.txt` operational recipe with a pointer or explicitly owned private overlay in a separate approved change before topology cutover. Preserve its unrelated dirty stimulus edit. |
| Published operator/developer guidance | `C:\dev\MoFaCTS.wiki` plus concise public repo docs | Update after behavior is implemented. The wiki's current old-host/EIP fast rollback must be removed or bounded before a new target accepts writes. Wiki instructions do not own executable deployment behavior. |
| Production MongoDB topology, credentials, backup service and on-call response | Named database/platform operations owner | Supply protected runtime facts and approve topology, RPO/RTO, monitoring, failover and authority transition. No secret enters this plan or an implementation log. |

### Release-consistency ownership

`mofacts/.meteor/release` owns the Meteor release; one exact reviewed Node
version (recommended: an exact `mofacts/.nvmrc` value) owns the application Node
version; `.meteor/versions` and `package-lock.json` own resolved package graphs.
Docker builder/runtime, CI, hotfix, and docs must consume or assert those values
rather than independently drifting. The release owner records the stable tag,
tool package, Node/npm versions, builder image digest, application commit,
resolved package hashes and settings/config fingerprint for every promoted
artifact.

## Invariants and Non-Goals

- Keep learner histories, model state, course data, authentication, TDF/config
  fields, and resume identity semantically unchanged.
- Make no data-schema migration solely for this framework upgrade. If one turns
  out to be necessary, stop and create a separate, approved, forward-only and
  restartable migration plan.
- Do not silently switch the production database platform. Phase 0 first
  qualifies an acceptable existing replica/managed platform without transfer;
  only a confirmed standalone/replacement branch uses the separately gated
  parallel transfer, backup/restore, authority and cutover procedure.
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

1. **Framework/toolchain and automatic gains:** update to the Phase 0 selected
   stable 3.5 release and its exact Node/npm/package set while retaining the
   observed reactive driver, `sockjs`, and grace period zero. For today's
   3.5.0, the tuple is Node 24.15.0/npm 11.12.1. Promote this contained base
   against the unchanged authoritative database in Phase 2C; it does not wait
   for a topology migration.
2. **DDP session resumption:** after a stable patch contains the applicable
   fixes, qualify the enabled-by-default reconnect semantics as an isolated
   experiment and retain grace period zero as the behavior rollback.
3. **Database-platform qualification/migration:** first verify the protected
   production topology. If it is an acceptable MongoDB 6+ replica set/managed
   cluster, qualify it without moving data. If it is standalone, build a new,
   purpose-designed replica-set target, rehearse continuity, and cut over during
   a controlled write freeze. The tracked standalone Compose path is not proof
   of the live production topology.
4. **Reactivity driver:** experiment with Change Streams on a fixed stable patch
   in staging; adopt in production only if all gates and a target-only fallback
   soak pass. Deferral is a valid result.
5. **Explicit opt-ins:** separately evaluate native async Accounts APIs,
   `uws`, async rate-limit matchers, `accounts-express`, and collation. Adopt
   only those with a demonstrated MoFaCTS benefit and an approved contract.

An in-place standalone-to-replica-set conversion remains a documented
contingency only. It may be useful for an emergency or constrained deployment,
but it is not the intended long-term destination. This separation prevents a
framework, Node, DDP lifecycle, DDP transport, database-platform, query
semantics, and reactive-driver change from being debugged as one opaque event.

### Phase control cards

The named owner executes the phase; the named approver alone promotes it. A
failed gate stops the dependent track but need not stop unrelated work
packages. “Rollback” always means the tested action in this table plus the
phase-specific detail below, never an improvised data rewind.

| Phase | Objective | Owner / approver | Entry gate | Promotion evidence | Abort trigger | Tested rollback or containment |
| --- | --- | --- | --- | --- | --- | --- |
| 0 — release and evidence | Lock an exact stable release, facts, workload and thresholds. | Release engineering / technical lead | Named sponsor/change authority and authorized protected-environment access. | Full owner roster; immutable release/package/image identity; runtime/topology facts; a minimal baseline dataset and two repeatable runs at the approved current-capacity target; approved thresholds. | Stable patch lacks a mandatory fix with no safe feature containment; source/dependency intent is ambiguous; secrets appear in evidence. | Revert only E0b/E0c instrumentation/tooling if unsafe; redact/discard unsafe evidence and recapture. |
| 1 — compatibility | Give every package, private API, publication, identity and deployment consumer a disposition. | Application lead / technical lead | Phase 0 release candidate and source identity. | Inventory signed off; focused test owners; no unresolved compatibility blocker; overloaded identity is explicitly preserved for the contained base. | Unsupported native/package/private surface or duplicate identity/deploy owner has no accepted disposition. | Do not change the release; split a separately approved remediation package. |
| 2A — framework/toolchain | Produce a deterministic Meteor 3.5 artifact with old reactivity, SockJS and session resumption disabled initially. | Release engineering / technical lead | Phases 0–1 pass; E0a immutable pins and release architecture are accepted. | Reviewed package graphs; exact versions; static, integration, auth/build and production-shaped checks; threshold-compliant workload. | Hidden update, mismatched Node, build hang/leak, auth/data error, or threshold failure. | Redeploy the complete last-good 3.4.1 artifact/config before any database contract changes. |
| 2B — DDP resumption | Decide whether retained sessions are safe and useful. | Application lead / technical lead + security for auth behavior | Phase 2A stable with grace period zero; separate identity contract approved. | Replay/idempotency, auth, memory, reconnect and same-process tests pass; tracked-versus-live process topology documented. | Duplicate/missing side effect, durable identity drift, auth leakage, memory/queue breach, or unresolved upstream defect. | Set `disconnectGracePeriod = 0` and prove fresh-session recovery. |
| 2C — contained base production | Promote the exact 2A artifact against the unchanged authoritative database with all new optionals disabled. | Release engineering / change authority | Phase 2A passes; 2B may be deferred; protected current DB/driver facts and last-good 3.4.1 artifact/backup are verified. | Maintenance deployment, critical flows and at least 24-hour threshold-compliant soak on the unchanged data contract. | Any data/auth/build/runtime/metric gate breach or deployed config differs from candidate. | Redeploy exact 3.4.1 artifact/config against the unchanged authoritative database; no data rewind. |
| 3 — database qualification/target | Accept an existing production replica-set platform, or build/rehearse a target only if topology requires migration. | Database operations / change authority | Phase 2A accepted; live topology, RPO/RTO, backup, security and owner decisions approved. | Existing-platform proof or at least one timed representative fresh-target restore/transfer; metadata/users/assets/URI parity, production-shaped election/failover, alerts and authority rehearsal. Repeat after a failure, material runbook/platform/data-volume change, or inadequate RTO margin. | Any unverified writer, secret leak, data mismatch, failed restore/failover, missing monitoring/on-call, or RTO/RPO breach. | No-transfer branch leaves authority unchanged; transfer branch follows pre-/post-write authority rules. |
| 4 — Change Streams staging | Prove compatible observers, correctness, recovery and economic benefit on a fixed stable patch. | Application + database operations / technical lead | Phase 3 passes; selected stable patch contains mandatory fixes. | Driver evidence, failure matrix and three matched A/B runs meet all gates. | Silent fallback, correctness/write-fence/restart defect, database capacity breach, or no accepted benefit. | Restore the exact tested fallback order; keep replica-set topology. |
| 5A — production database acceptance | With fallback reactivity, accept the already-qualified platform without transfer or execute the approved standalone-to-target authority move. | Database operations + release engineering / change authority | Phase 2C and Phase 3 branch pass; backup/runbook/communications current. | No-transfer branch proves unchanged authority; transfer branch proves RPO-zero freeze/target-only writer; both pass smoke and 24-hour soak. | Any branch-specific continuity, readiness, alert or threshold failure. | No-transfer branch changes nothing; transfer branch uses pre-/post-write authority rules. |
| 5B — production Change Streams | Enable only the qualified reactivity configuration. | Release engineering + database operations / change authority | Phase 4 records **adopt** and 5A/fallback production soak pass. | Active-driver evidence and at least 24-hour threshold-compliant soak including peak period. | Any integrity, auth, observer, restart-storm or resource threshold breach. | Restore exact fallback order; do not roll back data/topology. |
| 6 — optional capabilities | Adopt/defer/reject each opt-in independently. | Capability owner / technical lead plus security/product where named | Base production 3.5 stable; capability-specific problem and benefit defined. | Focused functional/security/accessibility/localization tests and matched experiment; recorded disposition. | No material benefit, compatibility loss, security/UX regression or threshold breach. | One-variable revert to the documented base contract. |

### Default quantitative promotion guardrails

These are `RECOMMENDATION` defaults so implementation can begin without vague
“looks good” gates. The technical lead, database operations, security owner and
product owner must approve them or record explicit, justified replacements
(including any looser value and its risk acceptance) before Phase 0 closes.
Averages never mask a failed flow, host, browser, or database member.

| Dimension | Default go/no-go threshold |
| --- | --- |
| Data and behavior correctness | Zero missing, duplicate, reordered, cross-user, or semantically changed learner-history/model-state/assignment/content/auth writes; zero source/target inventory mismatch; 100% pass for named critical flows. |
| Authentication/authorization | Zero unexpected login/logout/token/session changes across password, provisioned token, Google, Microsoft, Memphis SAML and per-tab storage; zero authorization-boundary regression. |
| Errors | Default severity 1 means security/privacy/data-integrity loss, cross-user exposure or total critical-service outage; severity 2 means a critical auth/learner/admin flow is unavailable or its error SLO is breached. The same normalized exception/operation occurring at least 3 times in 5 minutes outside an injected fault is “repeated.” Allow none new. If a flow's matched baseline is zero, it remains zero; otherwise failed request/method/publication rate increases by no more than 0.10 percentage points **and** 10% relative. The incident owner may replace this taxonomy only in Phase 0. |
| Latency/reactive propagation | Per critical flow, p95 no more than 10% and p99 no more than 15% slower than matched baseline. Publication-ready and client-visible update latency use the same gates. An intentional improvement in one flow cannot offset a regression in another. |
| Application capacity | During steady state, no crash/OOM/unplanned restart; CPU, RSS/container memory, heap and event-loop-delay p99 remain within 70% of the approved limit and do not regress more than 10% at equal throughput. |
| MongoDB capacity | CPU, memory, storage I/O and connection/pool use stay within 70% of approved limits; no pool exhaustion, election storm or new sustained slow-query class. Change Streams open-stream count is understood and budgeted. |
| Replication/recovery | Healthy majority and no unexpected rollback; p95 replication lag <2 seconds and maximum lag below the approved RPO/alert limit. A forced primary election restores successful application operations within the approved RTO and without duplicate/missing writes. |
| DDP resumption | 100% expected same-process resumptions preserve the approved identity/auth/subscription contract; 100% different-process/expired/overflow cases recover as a correct fresh session; zero duplicate external side effect. |
| Data transfer | With all writers verifiably frozen, RPO is zero accepted writes. The latest representative successful rehearsal completes within the approved maintenance RTO with at least 25% time headroom, or database/change authority explicitly accepts a tighter measured margin and its contingency. |
| Optional performance feature | Adopt only if it passes every correctness/network gate and improves its named bottleneck by at least 15% at equal throughput, or increases sustainable throughput by at least 15% without a latency/resource regression. Otherwise defer. |

### Repeatable production-like workload and evidence protocol

1. Derive a sanitized environment manifest from protected telemetry: p50/p95
   active users, concurrent DDP connections/subscriptions, data/collection
   sizes, write and publication rates, browser/network mix, app/Mongo resources,
   and peak-period duration. Never export identifiers, free text, tokens, raw
   histories, or credentials.
2. Use synthetic or approved minimized records that preserve p95 collection,
   history and content shapes. Include representative config-repo TDF upload,
   validation, launch, response, resume and content-edit paths without changing
   a TDF schema. If production facts cannot be supplied, the harness is valid
   for functional qualification only—not a capacity or cost claim.
3. Define four independently reportable profiles: learner launch/practice/
   history/resume; author/admin list/search/edit/upload; settings/dashboard/
   background jobs; and disconnect/reconnect/election/stream-restart faults.
   Weight them from protected telemetry rather than an invented ratio.
4. For base-upgrade qualification, use the same target snapshot and resource
   limits and run twice at the approved current-capacity/SLO target, reporting
   both results and their spread. Reuse existing load tooling and telemetry; do
   not build a general benchmark platform for this upgrade. The 1.0x/1.5x/2.0x
   ladder, three alternating A/B runs, and extended warm-up/steady-state protocol
   are required only for an optional capability that makes a performance or
   capacity claim (Phases 4 or 6), or when the technical lead explicitly makes
   headroom a release requirement. Unless 2.0x is adopted as the target, it is
   headroom characterization rather than a base-release gate.
5. Add a four-hour staging soak at the selected peak profile, a simultaneous
   short-disconnect storm, queue-overflow/fresh-session cases, primary election,
   Change Stream close/restart/history loss, process termination, and proxy idle
   timeout. Production gates require at least a 24-hour soak spanning a real
   peak period; they do not use production learner data as load-generator input.
6. Version the harness, seed, sanitized dataset manifest, artifact/config
   fingerprint and query-index inventory. Store non-sensitive summaries in the
   change record; store detailed protected evidence only in the approved
   operational system. No new benchmark dependency may be added without the
   normal explicit dependency approval.

### Observability and alert contract

Phase 0 must identify the current telemetry mechanism or approve one before
claiming a measurable benefit. Instrumentation must be bounded, aggregate by
safe operation name, omit selectors/payloads/identifiers/tokens/URIs, and have
an approved destination, access list and retention period.

| Surface | Required signals and dashboard | Default alert / owner |
| --- | --- | --- |
| Artifact/config | App commit/image digest, Meteor/Node/npm/package graph, declared reactivity/transport/session settings and redacted DB-target fingerprint. | Mismatch blocks startup or promotion; release engineering. |
| App process | Availability/readiness, restarts, CPU, RSS/heap, GC pause/rate, event-loop delay, request/method/publication latency/error, outstanding work and background-job failure. | Any quantitative gate breach or repeated exception pages release engineering + application on-call. |
| DDP | Connected clients, subscriptions, disconnect reasons, retained sessions, queue depth/overflow, same-process `sessionResumed`, fresh-session recovery, reconnect storm and replay/deduplication counters. | Identity/auth/correctness breach pages application/security; capacity breach pages release engineering. |
| MongoDB | Topology/primary/elections, replication lag/oplog window, CPU/memory/disk, connections/pool, open change streams, operation rates, slow queries, index use, stream close/restart/history loss and backup age. | Majority/primary, lag/RPO, pool, resource, restart-loop or backup-age breach pages database operations. |
| Data continuity | Collection/index/options/user-role inventory hashes/counts, external-asset manifest, last verified backup and timed restore rehearsal. | Any mismatch or overdue rehearsal blocks cutover; database operations + data owner. |
| User journey | Synthetic password/token-provider checks where safe, learner launch/response/resume and admin read/write canaries with synthetic identities. | Any critical-flow failure blocks/pulls promotion; application on-call. |

`/health` remains a process-liveness endpoint. Database/readiness checks must be
separate and must not expose topology or credentials. Define alert destinations,
24/7 versus change-window coverage, acknowledgement/escalation times, dashboard
links and metric/log retention in the protected runbook before Phases 3–5.

### Security, privacy, accessibility, and localization gate

- Enforce authentication and authorization at every Meteor method,
  publication, HTTP route and database boundary. Preserve least-privilege app
  roles, add only the MongoDB permissions proven necessary for the selected
  reactivity driver, and separately approve TLS, replica-set internal
  authentication/key material, certificate rotation and network exposure.
- Exercise password, provisioned token, Google, Microsoft and Memphis SAML,
  per-tab identity, logout/revocation, reconnection, one-time downloads and
  administrative authorization. Private OAuth/Accounts APIs and the Rspack
  roles workaround are explicit compatibility risks, not implied approvals.
- Never log a MongoDB URI, bearer/login token, key, cookie, selector with
  learner data, DDP payload or raw database record. Redact errors at the owning
  connection boundary; use synthetic/minimized data and approved access/retention for traces,
  backups, benchmark artifacts and restore evidence. Define encryption at rest
  and in transit for backup archives before topology migration.
- Reconnect, readiness, maintenance and failure behavior must preserve keyboard
  operation, visible focus, semantic status, screen-reader announcements,
  readable contrast and reduced-motion behavior. An infrastructure upgrade
  must not add a modal or expose internal retry detail. Test supported browsers
  and retained mobile target, if any, with assistive technology on reconnect and
  auth failure paths.
- Keep interface locale, authored-content language, learner response language,
  speech-recognition language and text-to-speech language distinct. Collation
  requires a separately approved locale/search/sort contract and matching
  indexes; neither the framework nor database migration may infer one language
  from another.

## Database Topology, Qualification, and Conditional Migration Contract

### Recommended direction and what "database migration" means here

Live production topology is a `PROTECTED-RUNTIME-FACT`. The tracked Compose
path is standalone, but this plan does not promote that repository observation
to a production claim. Phase 0 selects exactly one branch:

1. **Existing acceptable MongoDB 6+ replica set/managed cluster:** qualify its
   members/service tier, FCV, security, URI consumers, backups/restores,
   monitoring, connection budget and failover. Preserve the existing data
   authority and skip the transfer/write-freeze steps. Any architecture deficit
   discovered is a separate approved platform change.
2. **Confirmed production standalone (or an explicitly rejected existing
   platform):** the recommended long-term path is a **parallel transfer** to a
   newly designed replica set. The physical platform changes while the logical
   database, collection names, document shapes, `_id` values, references and
   external-asset relationships remain unchanged.
3. **Unknown or contradictory topology:** stop the database/Change Streams
   tracks and obtain sanitized `db.hello()`/service evidence. Do not infer a
   migration or eligibility from a URI or tracked Compose file.

Only branch 2 incurs the conditional data-continuity transfer below. A confirmed
standalone has no oplog that can synchronize its last writes into a new target,
so it requires a final write freeze. After cutover, the old standalone is a
read-only recovery reference and never a concurrent writer.

### Decisions this section must settle

| Decision | Candidate choices | Required recorded outcome |
| --- | --- | --- |
| Live topology branch | Existing acceptable replica/managed platform; confirmed standalone/replacement; or unknown/stop. | Sanitized evidence, branch, acceptance deficits, database owner and approver. |
| Migration path (branch 2 only) | **Recommended:** restore/copy into a newly built replica set. **Contingency:** convert the confirmed standalone in place. | Chosen path, technical owner, change approver, and documented reason if contingency replaces the recommendation. |
| Target architecture | One member for local functional smoke only; production-shaped staging matches the approved production member/service/failover design. A one-member production target is an explicit no-HA exception. | Member count/service tier, voting/election or managed failover, host/DNS, volumes, TLS/internal auth, monitoring and on-call owner. |
| Availability target | Existing-platform qualification without authority move, or planned maintenance/write freeze for a standalone-source transfer. | Branch-specific RPO, RTO, downtime, communication owner and success/abort thresholds. |
| Data-transfer mechanism (branch 2 only) | **Recommended:** verified physical/logical source-to-target transfer. **Contingency:** in-place data retention. | Tool, source/target versions/FCV, indexes/validators/users/assets and restore evidence. |
| Change Streams policy | Remain on fallback initially; experiment in staging; optionally enable only after a target-only production fallback soak. | Driver order, required metrics, promotion authority, and tested rollback configuration. |

Do not select production topology from this document. A one-member replica set
can exercise functional Change Streams locally but cannot prove production
elections, member failure, connection discovery, capacity or high availability.
Production-shaped staging must match the approved production failure model.
Any new target is designed and approved before data is copied; it is never a
side effect of the Meteor update.

### Old-to-target continuity map

For branch 1, use this as an in-place inventory/qualification checklist with no
source-to-target transformation. For branch 2, it is the mapping to complete
and sign off before the topology change. "Same"
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

Neither current backup path is topology-grade:

- the in-app path loads collections and archives into app memory, has no
  cross-collection point-in-time boundary, restores collection-by-collection
  with destructive non-transactional replacement, replaces assets
  non-atomically, and uses only a process-local exclusivity flag; its configured
  retention count is not an implemented cleanup/scheduler/offsite contract;
- the shell path targets only the local `mongodb` container, dumps the
  application database without explicitly covering database users/roles, and
  archives sensitive settings/data/key material without a repository-owned
  encryption, restrictive-permissions, checksum, retention or writer-freeze
  contract.

Phase 3 must select a target-appropriate mechanism: a MongoDB database-tools
dump/restore with explicitly proven metadata/user coverage, a crash-consistent
storage/managed snapshot, or another operations-owned equivalent. A standalone
source cannot use `mongodump --oplog` for a live consistent transfer, so the
final transfer requires a verified write freeze. Pin compatible database-tools
versions, record MongoDB major version and FCV, checksum and encrypt the backup,
restore to a fresh isolated target, time the run, and verify it before use. The
rehearsal—not the backup command's exit code—is the acceptance evidence.

No row in the continuity map authorizes a document transformation. An
unexpected source/target mismatch is an abort condition, not permission for an
ad hoc data migration. Store completed inventory and validation evidence in a
protected change record, never in the repository or handoff text.

### Data-authority transition

This table applies only to branch 2. Branch 1 never changes data authority and
must not perform a copy/cutover merely to enable Change Streams.

| Cutover point | Authoritative database / allowed writers | Required action if the step fails |
| --- | --- | --- |
| Before the maintenance window | Source standalone only; normal production writers may use it. | Continue operating the source and repair/rehearse the target. |
| During final snapshot/export and target restore | Neither database; all production writers are stopped. | Abort before target writes, retain the source as authority, and investigate from preserved evidence. |
| After continuity validation and URI cutover, before normal traffic | Target replica set only; start only target-connected application instances. | If the target has not accepted application writes, stop it and return the URI/configuration to the source under the runbook. |
| After the target accepts any production write | Target replica set only; old source is locked read-only. | Do not automatically return traffic to the source. Use a separately approved recovery/reconciliation plan if the target must be abandoned. |

### Branch 2 recommended path — Parallel target replica set and true data transfer

Use this only after Phase 0 confirms a standalone/replacement branch. Build an
isolated, purpose-designed target replica set and move the current logical
application database into it without changing its data contract. The target can
be rehearsed, secured, monitored and restored before it becomes authoritative.

1. Design and build the target in a non-production environment first: selected
   member topology, resolvable hostnames, dedicated member volumes, network
   policy, TLS/internal member authentication, application/root-user bootstrap,
   backup/restore, monitoring, and alerting. Prove an empty-target deployment
   before moving any production data.
2. Perform at least one timed end-to-end rehearsal using a protected,
   representative full-volume restore: transfer database contents and required
   metadata, provision identities, restore/snapshot external assets, then
   execute every acceptance item in the continuity map. Repeat it after a
   failure, a material platform/runbook/data-volume change, or when the result
   lacks the approved RTO margin.
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

### Branch 2 contingency — In-place standalone-to-replica-set conversion

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

**Topology/data-continuity exit gate:** the live branch is proven and approved,
all applicable continuity-map rows have evidence, the replica-set/managed
platform is operationally owned, and—only for branch 2—the old/new authority
boundary is rehearsed before Change Streams are enabled.

## Phase 0 — Select the Exact Target and Capture Evidence

1. Apply this release-selection algorithm immediately before implementation:

   1. enumerate official stable Meteor 3.5 tags and ignore betas, RCs, branches,
      PR builds and `latest`;
   2. choose the newest stable 3.5 patch whose final changelog/package set,
      Node/npm tuple and open-regression review pass the compatibility gate;
   3. require every mandatory Change Streams/`uws` fix in the issue-disposition
      register before that capability can be enabled;
   4. if stable `METEOR@3.5`/tool 3.5.0 remains the only acceptable release,
      proceed with the base framework only with fallback reactivity, SockJS and
      `disconnectGracePeriod = 0`; and
   5. record the release tag/commit, tool/package graph, Node/npm versions,
      builder/runtime image tags and digests, application source and settings
      fingerprint as the immutable candidate identity.
2. Read the selected release's official changelog and enumerate changes to the
   core Meteor packages, bundled Node/npm, Mongo driver, Accounts, EJSON/DDP,
   and WebApp. Record that Rspack is an existing 3.4/3.4.1 capability, not a new
   3.5 benefit. Update the issue-disposition register from shipped code. Do not
   replace a mandatory missing fix with tests alone; keep that capability
   disabled until the fix ships in the selected stable release.
3. Record a reproducible baseline before any edit:

   - source commit/tag, `.meteor/release`, `.meteor/packages`,
     `.meteor/versions`, `package-lock.json`, and image tags;
   - `node`, `npm`, Meteor, MongoDB server, and MongoDB feature-compatibility
     versions for each environment;
   - sanitized `db.hello()` topology, MongoDB exact patch/FCV, replica-set or
     standalone status and URI-consumer inventory only in a protected
     deployment record (never commit or paste a URI or credential);
   - current reactivity order and observed driver evidence, DDP transport,
     effective session settings/reconnect behavior, app-instance count,
     proxy/load-balancer routing or its absence, WebSocket idle timeouts,
     database indexes, backup age, monitoring/on-call, and restore evidence;
   - baseline health, learner-flow, admin/content, reconnect, app/Mongo resource,
     event-loop, heap/GC, and DDP performance evidence.
4. Build or designate a repeatable concurrency harness, synthetic/approved
   dataset, workload mix, ramp/soak duration, environment manifest, and result
   capture protocol. The existing production smoke/load document is explicitly
   human-scale and approximately one concurrent user; it can validate flows but
   cannot validate Meteor's capacity claims or a Change Streams/`uws` decision.
5. Approve or replace the quantitative guardrails, alert destinations,
   protected-evidence location and responsibility roster. Name release,
   application/auth, database operations, security/privacy, performance,
   product/accessibility/localization, documentation, change-authority and
   on-call owners. An unassigned responsibility is a failed Phase 0 gate.

Tracked and structurally inspected protected deploy inputs each describe one
Compose `mongodb` endpoint and define none of `MONGO_OPLOG_URL`,
`METEOR_REACTIVITY_ORDER`, or `DDP_TRANSPORT`; this supports a
`VERIFIED-REPO` source observation and an `INFERENCE` of
standalone/polling/SockJS. It does **not** prove
the live production process or database. The sanitized runtime facts above are
still required before any production recommendation.

**Phase 0 exit gate:** the exact stable candidate and containment settings are
locked; source/dependency intent is unambiguous; protected facts, owners,
workload, evidence retention and numeric thresholds are approved; and all
mandatory upstream issues have a shipped-fix, disabled-capability, or explicit
non-production disposition.

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
   Explicitly qualify Argon2's Node 24/Alpine prebuilt/native path, SWC binary
   pruning/OXC closure, and the Docker build/shutdown regressions in the
   upstream register. Bound the Svelte loader's global warning suppression and
   prove new Meteor/Rspack diagnostics are not hidden.
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
   Decide whether to retain, replace, or remove the explicitly labeled Meteor 2
   per-tab auth fallback and other private token-storage reads; document what
   refresh, two-tab, logout, redirect, expired-token and resume behavior depends
   on it. Cover health, backup/own-history token downloads, H5P, PWA, social
   preview, security headers, dynamic assets and SAML GET/POST handler ordering,
   status/HEAD behavior, streaming/backpressure and promise rejection.
   Also regression-test the process-wide Mongo driver unhandled-error policy
   installed by `server/main.ts`: it classifies driver-specific names, messages
   and labels as recoverable or process-fatal. Exercise pool clear, network
   timeout, election/interruption and truly fatal cases against the selected
   bundled driver so taxonomy drift neither causes a restart storm nor masks a
   fatal error.
3. Inventory reactive cursors and classify each as:

   - Change-Streams candidate: unordered, Minimongo-compatible selector,
     narrow selector, and no cursor behavior that forces fallback.
   - Expected fallback: ordered observer (`addedBefore`/`movedBefore`),
     unsupported selector, or a cursor using `skip`/`limit`.
   - Needs redesign/measurement: broad selector, high-write collection, or
     expensive publication.

   Include at least `filteredUsers` (sorted and paged), Dynamic Settings,
   learner state/history, content listings/editing, dashboard caches, and the
   publications used during a lesson session. Record projection syntax and
   initial-snapshot/update behavior. Separately verify the
   `(Meteor as any).roleAssignment` Rspack workaround, its publication/global,
   startup, client role utility, autopublish and allow-rule behavior.

   The 2026-07-24 `VERIFIED-REPO` starting classification is:

   | Class | Named surfaces and mandatory proof |
   | --- | --- |
   | Expected fallback/non-stream | `filteredUsers` uses sort/skip/limit and manual `observeChanges`; verify initial/page-boundary changes, cleanup and its broad roles cursor. `pagedTdfsListing` also uses sort/skip/limit. `filteredUsersCount` is a deliberate one-shot manual publication, not a reactive candidate. |
   | Narrow candidates | Current-user role/doc, exact theme/runtime settings, per-user dashboard and experiment state, stimuli-set assets, exact runtime/edit/upload TDF, owned TDF, course assignments, current-user audio, and exact Dynamic Settings verbosity observer. Eligibility is not adoption evidence. |
   | Measure/redesign | Potentially unbounded/hot `userHistory`; accessible-set `files.assets.all`; admin `allTdfsListing` with `{}`; full-collection `settings`; multi-full-document experiment-target TDFs; and uncapped ID arrays for `tdfByIds`/user experiment state. Bound/index/redesign only from measured evidence, not as incidental upgrade scope. |
   | Subscription side effects | `theme` may upsert/rewrite the active theme and `userAudioSettings` initializes user data during subscribe. Verify fresh, resumed and re-subscribed write amplification. |
   | Projection/security | Runtime TDF cursors exclude nested speech/TTS/OpenRouter secrets; other listings use nested inclusion projections. Prove both initial snapshot and updates never expose excluded fields, including the upstream nested-projection regression. |

   Existing performance migrations cover many history/TDF/asset/assignment/
   dashboard paths, but filtered user email regex search has no corresponding
   explicit email index and unanchored regex remains scan-prone. Treat query
   redesign/indexing as a separately measured scalability change.
4. Verify the MongoDB application principal has the privileges required by the
   selected reactivity mode and that monitoring can distinguish Change Streams,
   oplog, and polling behavior without exposing secrets or learner records.
5. Identify explicit test ownership for password, Google, Microsoft, and SAML
   authentication; per-tab session persistence; Android/mobile builds (or an
   approved retain/repair/replace/retire decision for that configured but
   currently unproven target); and the custom package API surfaces.
6. Inventory the pre-existing overloaded identity contract before building on
   it: private `_lastSessionId` user/history writes; Svelte learning-attempt IDs;
   timestamp-plus-TDF IDs in `VideoSessionMode.svelte` and
   `autoTutorClient.ts`; SPARC/learning-component producers; and every analytics,
   dashboard, export, replay/model and resume reader. For the base upgrade,
   explicitly preserve all current values and meanings and keep grace zero.
   Recommended semantic cleanup is a separate durable-data design with forward
   transformation/reader-writer/migration analysis; do not reinterpret records
   or add another representation in this upgrade.
7. Audit DDP connection lifecycle and auth hooks in app, custom-package, and
   relevant third-party code. Record uses of `onConnection`, connection IDs,
   close/presence events, `onLogin`/`onLoginFailure`/`onLogout`, outstanding
   method assumptions, presence/metrics meaning, and non-idempotent
   learner/admin/external-side-effect methods that need replay coverage.
   Distinguish the tracked single-process behavior from Phase 0's protected
   live topology and any separately approved future multi-instance/LB design.
8. Inventory the optional capability candidates without changing them:

   - the manual password/token login promisification in `signIn.ts`;
   - existing synchronous DDP rate-limit rules and whether any policy genuinely
     needs a bounded database-backed matcher; also verify current auth rules
     keyed by connection ID across resumed versus fresh sessions;
   - every `WebApp`/Connect route and its current authentication/one-time-token
     contract;
   - case-folding, regular-expression, lowercase-shadow-field, and sort paths
     that might be candidates for an explicitly localized collation.

9. Inventory every Mongo URI, liveness/readiness, backup/restore, wait-host,
   sidecar/tunnel, operator and documentation consumer named in the baseline.
   Select the canonical deployment/sidecar contract and a single opaque-URI and
   connected-validation specification. Treat any error path capable of printing
   credentials as a security blocker.
10. Prove no TDF field/config/schema change is required by running a
   representative config-repo TDF upload/validation/launch/response/resume
   matrix. `npm run generate:schemas` is required only if an implementation
   actually changes the registry or schema; an unchanged upgrade must produce
   no generated schema diff.
11. Trace the `learning-components` history envelope and pedagogical consumers
   through the app facade. Verify new/freshly reconnected trials, ordinary versus
   H5P replay, feedback/model-state, restore and resume preserve each existing
   producer-specific `sessionID` meaning. Do not enable DDP resumption until a
   separately approved identity contract defines its effect.
12. Inventory cron/background jobs, cache/dashboard rebuilds, backups,
   migrations, administrative refresh/import, uploads and external adapters for
   full scans, N+1 round trips, unbounded arrays/concurrency/memory and missing
   indexes/progress/cancellation. Preserve behavior during the framework update;
   make any scalability remediation a measured, separately reviewable package.
13. Give each package, API, identity, deployment, backup or native-module
   incompatibility a narrowly scoped conditional work package and focused test.
   The exact release/package update in Phase 2 creates the candidate needed to
   expose some incompatibilities; none may remain unresolved at Phase 2A exit.

**Phase 1 exit gate:** source/dependency intent and package/deployment ownership
are known; reactive cursors, private APIs and every identity producer/reader are
classified; preserving current overloaded identity and private-auth behavior for
the contained base is approved; every finding has an owner, conditional work
package and test; and no secret-bearing or single-host-only path remains hidden
from the database track. Candidate build success belongs to Phase 2A.

## Phase 2 — Framework Upgrade With Controlled Reactivity and Transport

### 2A — Release, toolchain, and automatic runtime changes

1. If current stable `METEOR@3.5` remains selected, run the official command
   exactly on a clean, intentionally scoped working tree:

   ```bash
   meteor update --release 3.5
   ```

   If Phase 0 selects a later stable patch, use that patch's official exact
   release identifier instead. Run without suppressed output or ignored exit
   status. Review every change to `.meteor/release`, `.meteor/packages`,
   `.meteor/versions`, and the npm lockfile. Confirm the resulting release/tool
   identity and reconcile all direct constraints with the selected release set.
2. Update the release-consistency set together:

   - `mofacts/.meteor/release`;
   - `mofacts/.meteor/packages`, `.meteor/versions`, and
     `mofacts/package-lock.json`;
   - `mofacts/package.json` `engines`, npm ownership, and an exact
     `mofacts/.nvmrc` matching the selected release's bundled Node
     and affected npm package constraints;
   - the explicitly approved official or third-party `Dockerfile` builder image
     by exact tag/digest and matching build/runtime Node images;
   - `deploy/docker-compose.hotfix-local.yml` builder and runtime images;
   - `.github/workflows/ci.yml` exact Meteor and Node/npm setup;
   - Docker bundle dependency overrides for `@mapbox/node-pre-gyp`, `node-gyp`,
     and `underscore`, verifying whether every override is still necessary;
   - deploy-time reactivity/transport setting examples and
     `docs/deployment/settings-reference.md`;
   - `deploy/README.md`, `docs/development.md`, and any release/version docs;
   - a build/startup assertion that prints only safe exact release/tool/runtime
     identities and fails on drift.

3. Rebuild dependencies rather than carrying forward binaries built for the
   old Node/Meteor toolchain. Recheck Node 24 ABI support, Docker bundle
   dependency installation, native packages/prebuilt binaries, selected npm lockfile
   behavior, and the Windows hotfix tool lookup. Audit and normally remove the
   build-time `--allow-incompatible-update` flags from `Dockerfile` and
   `deploy/hotfix/build-bundle.sh`; an image build must consume the reviewed
   package solution rather than silently finding a different one. If a flag is
   still required, document the exact package conflict and verify the produced
   `.meteor/versions` equivalent is unchanged.
4. During this phase explicitly isolate Mongo, transport and session changes
   with:

   ```text
   METEOR_REACTIVITY_ORDER=polling         # when Phase 0 proves polling today
   # or: METEOR_REACTIVITY_ORDER=oplog,polling
   #     when oplog is actually configured, observed, and the intended baseline
   DDP_TRANSPORT=sockjs
   ```

   Use the equivalent private settings only where officially supported, and set
   `Meteor.server.options.disconnectGracePeriod = 0` from an owned, validated
   server-startup contract. Record which
   reactivity mechanism and transport are actually active in each environment.
   The reactivity value must preserve the driver actually observed in Phase 0,
   not merely list a preferred fallback. On a standalone without
   `MONGO_OPLOG_URL`, `oplog,polling` still resolves to polling. This isolates
   Change Streams and `uws` and disables session retention; it does **not**
   recreate all 3.4 behavior because the Node, Accounts, EJSON/DDP and other
   core changes are still present.
   Wire the selected variables through canonical and hotfix Compose environment
   blocks and safe tracked examples; do not rely on an operator-only setting
   that the supported deploy path drops. Add an operational diagnostic that
   reports the declared order/transport and enough supported log/APM/database
   evidence to distinguish Change Streams, oplog, and polling without exposing
   the URI, credentials, selectors containing learner data, or private Meteor
   observer fields. Do not expose a new public setting/control. Confirm through
   a supported startup/runtime contract that the grace period is actually zero;
   the exact app-owned wiring is selected in Phase 1.
5. Run the normal static checks and the CI-supported Meteor integration suite.
   Exercise all affected authentication providers and ordinary auth-session
   continuity/fresh reconnects,
   routes, HTTP download and asset handlers, background jobs, admin/content
   flows, a representative learner session, and the Android/mobile build if it
   remains supported. A local `npm run test:ci` invocation still requires fresh,
   single-use maintainer authorization; otherwise use CI or another supported
   Meteor test environment.
6. Verify the automatic 3.5 paths that apply: EJSON/backup round trips and large
   DDP payloads; Minimongo `forEachAsync`/`mapAsync` only if inventory finds an
   app/dependency use (otherwise record N/A); URL/proxy-based local dev;
   email startup without the missing-`Accounts.emailTemplates.from` warning;
   and HttpOnly-cookie login only if MoFaCTS enables that earlier feature.

**Phase 2A exit gate:** the selected Meteor release has passed functional and
deployment-shaped checks with forced fallback reactivity, `sockjs`, and grace
period zero; the exact artifact is reproducible; required static/CI checks and
the matched workload meet thresholds; and no database migration or unapproved
product behavior was introduced.

### 2B — DDP session-resumption qualification

This is an isolated optional adoption gate, not a prerequisite for deploying
the contained Phase 2A runtime. Begin only after the selected **stable** patch
contains the applicable reconnect fixes listed in the upstream register, the
open non-retrying-method issue has an applicability/test disposition, and a separately
approved data contract defines every overloaded `sessionID` producer/reader and
the effect of a retained Meteor connection.

1. Prove the grace-period-zero baseline first. Then run the experiment with the
   Meteor defaults: `disconnectGracePeriod = 15000` ms and
   `maxMessageQueueLength = 100`. Record them explicitly; do not tune by
   intuition.
2. Test interruptions shorter and longer than the grace period. The tracked
   deployment has one app process, but use Phase 0's live topology. A brief
   ungraceful reconnect to the same process may resume; a process replacement/
   restart, Hot Code Push, graceful
   close, expiry or overflow must establish a correct fresh session. Test a
   different-process path only if a separately approved multi-instance/LB
   design exists. Cover explicit logout/server kick, sleeping/background tabs,
   mobile handoff, per-tab storage, every auth provider, and reconnect callbacks
   with both public `sessionResumed` outcomes. If package/custom audit finds a
   `retry:false` DDP connection, force disconnect between method `result` and
   `updated` and prove the client promise settles correctly; grace zero is not
   evidence for that separate open issue.
3. During a true resumption, prove that the Meteor connection ID is retained,
   `onConnection` is not re-run, subscriptions are not re-published, queued
   messages arrive, and the approved app attempt/session identity remains
   correct. Prove the fresh-session path after every non-resumable condition.
   Test private `_lastSessionId` only as a named compatibility surface if Phase
   1 explicitly chose to retain it; never make a new private-internal contract.
4. Exercise in-flight writes and external side effects during disconnect:
   learner response/history/model state, content saves, account actions,
   uploads, notifications and administrative jobs. Prioritize non-idempotent
   history inserts (only the H5P path currently has an idempotency key), MTurk
   message/pay/bonus, email/enrollment, package/S3 processing, billed OpenRouter
   calls, password/verification email and backup creation. Verify replay creates
   no duplicate, omission, cross-user action, payment, billable call, message or
   repeated external effect. Include backup, OpenRouter catalog, admin email and
   speech methods that call `this.unblock?.()`: later messages may overlap their
   long/external work, so interruption ordering is part of the contract. If an
   app idempotency contract is needed, implement
   it as a separately reviewable durable-data/external-API work package.
5. Test authorization revocation during the disconnect: admin/teacher role,
   TDF ownership/accessor, course enrollment and login/token revocation. Many
   publications authorize once and return a cursor; a resumed subscription does
   not rerun `onConnection` or re-publish. Prove protected documents/updates do
   not remain visible contrary to the approved policy. This snapshot behavior
   also exists for a long-lived current connection; record whether the upgrade
   preserves/tests it or a separately approved security remediation is needed.
6. Run the defined short-disconnect storm and soak. Measure retained sessions,
   cursors, queue depth/overflow, RSS/heap/GC, event-loop delay, subscription
   work, latency and fresh-session rate. Separately test process termination and
   replacement: rolling replacement can limit a mass outage but cannot preserve
   in-memory sessions on the replaced process.
7. If any correctness, memory, queue, auth, identity, routing or upstream gate
   fails, restore `disconnectGracePeriod = 0`, repeat the affected flow and
   record resumption as deferred. Any adopted nonzero value requires an owned
   private setting, numeric justification, monitoring and a tested zero rollback.

**Phase 2B exit gate:** record **adopt** only when all guardrails pass on a
stable fixed patch; otherwise record **defer**, retain grace period zero, and
allow the independently accepted Phase 2A runtime to continue.

### 2C — Contained Base Production Rollout on the Unchanged Database

This is the independent production completion path for the Meteor/Node upgrade.
It neither waits for nor authorizes a database topology or Change Streams
change. Its artifact uses the exact Phase 2A fallback reactivity, SockJS and
grace-period-zero configuration; Phase 2B may remain deferred.

1. Re-capture the protected production database/topology/driver and current app
   process/proxy facts. Verify the exact last-good 3.4.1 artifact/configuration,
   current authoritative database, supported backup and restore evidence, and
   that the 3.5 candidate introduced no schema/data/query-semantic change.
2. Obtain the separately required production/Docker authorization. Use the
   tracked one-instance maintenance procedure if runtime evidence confirms it;
   otherwise use the proven real deployment topology. Do not claim a rolling
   deployment or retained in-memory session across a replaced process.
3. Deploy the exact staging-approved Phase 2A artifact and configuration against
   the same authoritative database. Confirm release/runtime/config fingerprints,
   fallback driver, SockJS and grace period zero before returning traffic.
4. Run critical synthetic/operator checks for every auth provider, per-tab/fresh
   reconnect, learner launch/response/history/model/resume, representative TDF,
   admin/content/settings, HTTP/assets/uploads/background work, backup/readiness
   and accessibility/localization status behavior. Observe all quantitative
   dashboards through at least 24 hours spanning a peak period.
5. On any abort trigger, redeploy the exact last-good 3.4.1 artifact and its
   configuration against the unchanged authoritative database, then repeat the
   failed flow. Because this track forbids data-contract/topology changes, no
   database restore or URI switch is part of framework rollback. An unexpected
   incompatible write is an invariant breach: stop and invoke the separately
   approved data-recovery decision rather than improvising.
6. Record the exact artifact, contained capability disposition, measured result,
   rollback evidence and documentation updates. The database track may then run
   later and independently.

**Phase 2C exit gate:** the contained Meteor 3.5 base passes critical flows and
the 24-hour production soak on the unchanged authoritative database, and the
3.4.1 full-artifact rollback has been rehearsed against representative staging
evidence and remains operationally available for the production change window.

## Phase 3 — Production Database Qualification or Target-Transfer Rehearsal

1. Determine the real production topology using safe administrative checks:
   start with `db.hello()` and call `rs.status()` only after the result confirms
   replica-set membership; do not infer topology from a connection
   string alone. Record version/FCV, storage engine, authentication, database
   inventory, backups, external assets and all URI consumers. Inventory source
   write paths that must be stopped for cutover only if branch 2 applies.
2. Record branch 1 (qualify the existing acceptable replica/managed platform),
   branch 2 (build/transfer from a confirmed standalone or rejected platform),
   or branch 3 (unknown/stop). Branch 1 makes no copy or authority transition;
   branch 2 executes the continuity procedure; branch 3 blocks Phases 3–5.
3. Before using a replica-set seedlist, make URI ownership coherent. Prefer the
   smallest design: treat `MONGO_URL`/`MONGO_URI` as opaque secrets, pass them to
   the supported MongoDB driver or `mongosh`, and validate the connected
   database/topology with `ping`/`hello` after connection. Shell and PowerShell
   should consume only exit status/redacted structured results and never parse
   or echo the URI. Remove single-host parsing where this suffices. Only if an
   offline syntax/database-name check remains demonstrably necessary should D1
   request approval for a direct-pinned MongoDB connection-string parser and a
   single implementation/test corpus; never import the current transitive
   package implicitly or add more ad hoc parsers. Touch only consumers shown to
   parse or mishandle the URI; inspect and test at least
   `deploy/docker/validate-mongo-url.sh`,
   `deploy/hotfix/run-bundle.sh`, `deploy/hotfix-dev.ps1`,
   `mofacts/server/lib/openCoreSettingsValidation.ts`, and
   `mofacts/server/methods/deploymentReadinessMethods.ts`, plus every
   wait-host/backup/restore/sidecar consumer. Preserve strict database-name
   validation and secret redaction. The connected-client tests cover approved
   seedlist, `replicaSet`, `authSource`, encoded-credential, DNS/IPv6 and SRV
   forms; an offline parser corpus is added only for the approved exception.
   Test malformed/error paths and prove no full URI can reach output. Verify
   each runtime reaches all required members and survives a primary election.
4. Select and implement one deployment ownership model. Reconcile the direct
   remote-network sidecar route in the config repo with the hard-coded
   single-container SSH tunnel route in
   `mofacts-mcp-sidecar/scripts/start-production.ps1` and
   `mofacts-mcp-sidecar/docker-compose.production.yml`; remove duplicated database-name authority,
   stale defaults and `SECONDARY_PREFERRED` behavior unless an approved
   bounded-staleness contract requires it. Define `depends_on`/`WAIT_HOSTS`,
   startup and ongoing sidecar health, backup/restore, tunnels/network, and
   operator commands for the chosen target. Do not leave operational tools on
   the old local container while the app uses the target.
5. Decide what fallback reactivity means on the accepted/target platform. If actual oplog
   tailing is required, provision and protect `MONGO_OPLOG_URL`, least-privilege
   access, and monitoring, then prove `oplog` is active. Otherwise document that
   `oplog,polling` falls through to polling and capacity-test that rollback.
6. Keep `/health` as liveness and add a distinct bounded readiness contract for
   MongoDB, Redis and required storage. Readiness must use the shared URI
   contract, fail closed without leaking topology/credentials, and react to
   primary loss after startup. Align Compose health/dependency and deployment
   verification with the correct probe; do not turn transient dependency loss
   into an unbounded restart storm.
7. For branch 1, qualify the existing platform in a production-shaped staging/
   restore environment: exact version/FCV/service tier, member discovery,
   security, connection budget, backups, alerts and actual failover behavior.
   Complete at least one representative restore to an isolated target without
   changing production authority, repeating only under the rehearsal rule
   above. For branch 2, build the intended target. A one-member set may be
   used only for local functional smoke; production-shaped staging must match
   the approved production member/service/failure topology, which must preserve
   TLS/internal authentication, least privilege, health/readiness, member-volume
   ownership, backup/recovery, monitoring, alerting and on-call response. Pin
   exact MongoDB image/patch and FCV; a floating `mongo:8.0` tag is not release
   evidence.
8. For branch 2, select the topology-grade backup mechanism and run at least one
   timed representative rehearsal of the **recommended parallel target replica
   set and true data transfer** path, repeating under the rehearsal rule above.
   Each uses a fresh isolated target, encrypted/checksummed input, all writers
   stopped when required, and proves the continuity map, users/roles, indexes,
   options/TTL, assets, URI consumers, readiness, election and restoration
   behavior. Record RPO/RTO and resource results without data/secrets.
9. Write and approve the branch-specific runbook before touching production.
   Branch 1 documents unchanged authority, backup/failover response and any
   configuration-only acceptance. Branch 2 includes maintenance/write freeze,
   backup/verification points, restore, users/indexes/TTL, URI switch, authority
   rollback deadline, and learner communication.
10. Reconcile all public, wiki and config operator instructions before cutover.
   Remove the wiki fast rollback that reassigns traffic to the old co-located
   app/database after the target accepts writes; replace duplicate private
   deploy recipes with the approved owner/pointer. Verify no obsolete direct
   `docker restart mongodb`, unauthenticated URI, or old settings-path guidance
   can be mistaken for the new runbook.
11. Do not combine topology cutover with a TDF, history, or model-state schema
   change. Mixed application versions during a rolling deployment must be able
   to read and write the same persisted data. The tracked one-instance path
   does not support rolling replacement; Phase 0 must confirm live topology,
   and if no separate scaling design is
   approved, use the maintenance-window procedure and expect fresh DDP sessions.

**Phase 3 exit gate:** branch 1 proves the unchanged platform, a representative
isolated restore and production-shaped failover; or branch 2 proves the target,
a representative transfer and authority rehearsal. The applicable RPO/RTO gates, readiness,
backup/restore, monitoring/alerts/on-call, every URI/sidecar/operator consumer
and documentation owner are proven, and database operations/change authority
approve the protected branch runbook.

## Phase 4 — Change Streams Qualification

**Entry gate:** the selected stable Meteor patch contains every mandatory
Change Streams fix in the upstream register; Phase 3's accepted existing/new
platform, backup, URI, readiness, monitoring and failure-injection contracts
pass. Stable 3.5.0 does
not meet this entry gate on the review date.

1. Remove the temporary fallback override only in the isolated replica-set
   staging experiment
   so Meteor's default order (`changeStreams,oplog,polling`) is exercised.
   The configured order is global, while actual driver selection/fallback is
   per cursor. Verify from application/database evidence which cursors use
   Change Streams and which correctly fall back. Meteor documents no stable public
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
     after brief network loss or app-process replacement/restart;
   - narrow high-value publications, broad/high-write publications, ordered
     observers, selectors rejected by `Minimongo.Matcher`, and `skip`/`limit`
     cursors;
   - unbounded history and ID-array inputs at approved maximums, full settings/
     admin listings, and subscribe-time theme/audio initialization without
     duplicate writes or amplification;
   - ObjectID and nested/dotted projections, initial-snapshot plus concurrent
     writes, stream close/restart/history-loss conditions, primary election,
     operation-time comparison, login-style writes/write fences, and—if
     MoFaCTS uses more than one Mongo connection—cross-connection write
     coordination. These remain mandatory regressions even after the fixes ship.
     For TDF projections, assert excluded speech/TTS/OpenRouter secret fields are
     absent from both the initial snapshot and every reactive update.

3. Compare the fallback and Change Streams runs using:

   - method latency, publication readiness/propagation time, DDP reconnect
     behavior, error rate, and correct client-visible updates;
   - app CPU, RSS/heap/GC, event-loop pressure, subscription count, and
     process restarts;
   - MongoDB CPU/memory, connections, operation rates, open streams, query
     plans/index use, slow operations, replication lag, and disk I/O;
   - integrity checks on learner histories, model state, assignments, content,
     and authentication/audit records.

4. Run three alternating fallback/Change-Streams comparisons through the
   concurrency ladder and fault/soak protocol. Size and monitor the MongoDB
   connection pool above the proven open-stream and ordinary-operation demand;
   do not infer capacity from a configured maximum alone.
5. Keep the default only if every flow satisfies the quantitative guardrails
   and the named database/app benefit is material. Narrow broad selectors or add/verify indexes
   where evidence identifies a query problem. The 3.5 driver order is global;
   do not invent an unsupported per-cursor force-driver setting. Record the
   defaults—100 ms restart delays after error/close and a 1000 ms
   `waitUntilCaughtUpTimeoutMs`—and do not tune them until restart behavior and
   read-your-writes have been explicitly tested. The catch-up timeout does not
   lose the later stream event, but it can temporarily let a subscription
   become ready before the client's own write appears.

**Phase 4 exit gate:** application and database owners record actual driver use,
fallbacks, correctness, recovery, capacity and three-run A/B results. The
technical lead records **adopt** only when all gates pass and benefit is
material; otherwise record **defer** and retain the exact tested fallback.
Either outcome completes the experiment. Any integrity/fence/restart-loop or
capacity breach immediately restores the fallback and blocks production
Change Streams.

## Phase 5 — Production Database Acceptance and Optional Change Streams

### 5A — Production database-platform acceptance with fallback reactivity

**Entry gate:** the contained base has passed Phase 2C; Phase 3's live topology
branch, RPO/RTO, backup, monitoring/on-call and runbook are accepted; and the
real app/proxy topology is represented accurately.

1. For either branch, verify the topology-grade backup of MongoDB, private
   settings, environment files, dynamic assets, H5P content/libraries and key
   material. Record safe source/image/settings identities as required by
   `docs/deployment/upgrade-guide.md`. Run the exact Phase 2C app artifact with
   the Phase 3 fallback—`polling`, or `oplog,polling` only when oplog is proven.
2. **Branch 1—existing accepted platform:** make no data copy or authority/URI
   transition merely for Change Streams. Apply only the separately approved
   security/readiness/operations corrections, prove failover and restore in the
   production-shaped environment, run operator/learner smoke checks, and observe
   a 24-hour fallback soak spanning a peak period. Abort by reverting only the
   configuration/operations correction; data authority never moves.
3. **Branch 2—confirmed standalone/replacement:** begin the maintenance window,
   stop and verify every application/job/admin/external writer, take the final
   snapshot, transfer database/metadata/assets to the rehearsed target, and
   complete every continuity/authority validation before learner traffic.
4. On branch 2, switch every private URI consumer, make the target the only
   writable authority, and lock the old source against writers. Use the tracked
   one-instance maintenance restart if live evidence confirms it; any approved
   multi-instance rollout may contain only target-connected instances. Never
   canary across two databases.
5. On branch 2, an abort before the target's first accepted application write
   may restore source authority exactly as rehearsed. After that first write,
   the target remains authoritative; the old-host/EIP switch and old-container
   restart are prohibited. Invoke forward recovery/reconciliation.
6. For either branch, run `/admin/tests`, every critical synthetic/operator
   flow, backup/readiness/alert checks and the 24-hour fallback soak.

**Phase 5A exit gate:** branch 1 proves unchanged authority, failover/restore and
the fallback soak; or branch 2 proves RPO-zero freeze, RTO, continuity and
target-only authority plus the soak. In both cases, smoke, backup, readiness,
alerts and on-call meet all guardrails on the accepted platform.

### 5B — Production Change Streams rollout

1. A Phase 4 **adopt** result on the exact production artifact/configuration and
   the Phase 5A fallback-mode production soak are both
   prerequisites. Staging qualification does not authorize Change Streams in
   production before Phase 5A accepts the existing or transferred platform.
2. Remove the fallback override only through the approved production
   configuration change, then confirm the expected reactivity driver and
   monitor the agreed application, MongoDB, correctness, and reconnect
   metrics through a 24-hour soak spanning a peak period.
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

**Phase 5B exit gate:** active-driver evidence and the complete 24-hour result
meet every guardrail. Any threshold breach restores the tested fallback. A
deferred Change Streams decision is a valid final state and does not invalidate
the already accepted Meteor/runtime or database platform.

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
2. Verify end-to-end WebSocket upgrades and the official conservative
   proxy/load-balancer idle-timeout recommendation of at least 35 seconds,
   then test the selected stable release's actual server/client ping and
   response-timeout behavior. Cover representative
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

### 6C — Async DDP rate-limit matcher experiment

1. Keep existing synchronous `DDPRateLimiter` rules unless a named abuse-control
   requirement needs database context. For any async matcher, use a bounded,
   indexed or safely cached lookup; measure its contribution to the connection's
   sequential incoming-message latency; and verify that lookup rejection fails
   closed without disclosing account state.

### 6D — `accounts-express` route experiment

1. Evaluate `accounts-express` route by route. Adding it requires explicit
   dependency approval. Use `createAuthMiddleware({ required: true })` for a
   protected route; the default `required: false` is not an authorization gate.
   Verify Bearer-token precedence, `meteor_login_token` cookie behavior,
   expiration/revocation, CORS, CSRF where cookies are used, 401 versus 403,
   audit identity, and least privilege.
2. Keep `Meteor.fetch` and `meteor/fetch` unauthenticated by default unless a
   call explicitly uses `{ auth: true }`. Imports from
   `meteor/accounts-express` attach authentication by default, so prove tokens
   are never forwarded to third-party origins. Preserve the current one-time
   download-token and SAML contracts unless a separately approved design proves
   replacement is safer and behavior-equivalent.

`accounts-2fa` remains rejected/outside this plan; any future adoption starts a
separate approved product/security feature plan.

### 6E — MongoDB/Minimongo collation

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

   For semantic review, remember that strength 1 ignores case and diacritics,
   strength 2 distinguishes diacritics but normally ignores case, and strength
   3 distinguishes case. Regular expressions are not collation-aware. Do not
   promise a case-insensitive-index improvement for a regex path.

**Capability-adoption exit gate:** native async login, `uws`, async rate-limit
matching, `accounts-express`, and collation each have an owner, applicable
evidence, an adopt/defer/reject decision, and a tested rollback for any adopted
change or a documented reason that no runtime change was warranted.

## Required Verification Matrix

| Phase / surface | Mandatory verification and evidence | Environment / authority |
| --- | --- | --- |
| Plan-only change | `git diff --check -- docs-developer/meteor-3.5-upgrade-plan.md`; heading/anchor, table, code-fence, local-path and HTTP-reference validation; review final diff and working-tree scope. | Local, read-only except the plan edit. No app check is required for Markdown-only work. |
| Phase 0 telemetry/harness/baseline | Reuse existing telemetry/load tooling where possible; safe signal/redaction/alert tests; minimal versioned synthetic dataset/seed/workload/result schema; approved dependency/privacy/storage controls; two repeatable 3.4.1 runs at the approved current-capacity target with spread. | Isolated load environment and protected evidence system; performance/operations/security owners. |
| Release/package graph | Unsuppressed successful exact-release updater; reviewed `.meteor/release`, direct/resolved Atmosphere packages and npm lockfile; `meteor --version`, `meteor node -v`, `meteor npm -v`, bundle `.node_version.txt`, image metadata/digests and startup assertions all match. | Clean implementation checkout/change record; release engineering. |
| TypeScript/JavaScript/Svelte | From `C:\dev\MoFaCTS\mofacts`: `npm run typecheck`, `npm run typecheck:vendor`, and `npm run lint`. Required checks must pass before staging/commit/push. | Local/CI under selected Node; application owner. |
| Meteor integration | CI `npm run test:ci`, plus focused auth, methods, publications, EJSON, Mongo-error-policy, HTTP, Rspack/Svelte/roles and native-module tests. A local invocation needs fresh explicit single-use maintainer authorization every time. | Supported CI/Meteor environment; test/application owner. |
| TDF/schema compatibility | Representative config-repo TDF upload/validation/launch/response/resume. Run `npm run generate:schemas` from `mofacts` and inspect generated diffs **only** if a registry/schema field changes; no schema change is expected. | App + `C:\dev\mofacts_config`; content/schema owner. |
| Build/runtime | Clean target-architecture bundle; native Argon2 and SWC/Rspack; dependency install under bundle-declared Node; bounded build exit/no orphan; process shutdown; exact artifact checks. | CI and production-shaped Docker Compose/staging. Docker build/hotfix execution requires explicit user authorization. |
| DDP contained baseline | Polling/proven oplog driver evidence, SockJS network paths and grace-period-zero fresh reconnect; auth/per-tab/attempt identity; in-flight write and reconnect-storm correctness. | Staging matched workload; application/release owners. |
| Phase 2C contained production | Exact Phase 2A fingerprint, unchanged authoritative database/schema/URI, critical synthetic/operator flows, 24-hour peak-period soak, and representative rehearsal of complete 3.4.1 artifact/config rollback. | Separately authorized production change; release/change authority. |
| DDP resumption experiment | Short/long, resumable/non-resumable/process-replacement, overflow/HCP/logout/provider matrix; public `sessionResumed`, replay/side effects, memory/queue/workload gates; zero-grace rollback. | Stable fixed patch in staging; application/security owners. |
| URI/readiness/operations | Connection strings remain opaque to shell/PowerShell and are passed to a supported Mongo client; connected `ping`/`hello`, database-name and redaction evidence; no secret output; liveness/readiness distinction; election/failover from every affected app, hotfix, backup/restore, sidecar/tunnel and operator path. An offline parser corpus applies only if its exceptional need and direct dependency are separately approved. | Isolated accepted/target platform; release/database/security owners. |
| Branch 1 existing-platform acceptance | Sanitized live branch proof; exact platform/FCV/security/pool; at least one representative isolated restore, repeated after failure/material change or inadequate RTO margin; production-shaped failover; unchanged-authority/config rollback; operator/synthetic flows and 24-hour fallback soak. | Representative staging then separately authorized production correction/acceptance; database/change authority. |
| Branch 2 target transfer | At least one timed representative fresh-target rehearsal, repeated after failure/material change or inadequate RTO margin; frozen-source identity; encrypted/checksummed backup; continuity map, indexes/options/TTL/users/roles/assets/URI consumers; RPO/RTO, target-only authority and forward-recovery drill. | Isolated target then separately authorized maintenance window; database/change authority. |
| Change Streams | Selected stable-patch proof; active/fallback driver evidence; ordered/unsupported/pagination/projection/snapshot/restart/history-loss/operation-time/write-fence cases; three matched A/B runs and fault/soak protocol. | Replica-set staging, then separately approved production change; application/database owners. |
| Native async Accounts | Password/token/Google/Microsoft/SAML success/error parity, hook/callback ordering, per-tab storage, login-time reconnect, accessibility status/focus and types. | Focused CI/UI/staging; application/auth owner. |
| `uws` | Same-workload A/B against SockJS; required network/proxy/idle-timeout matrix; internal-port isolation; reconnect/session behavior and numeric benefit; SockJS rollback. | Isolated staging and representative networks; release/support owners. |
| Async rate matcher | Named policy; bounded/indexed lookup; queue latency, rejection/error leakage, fail-closed and abuse tests. | Focused security/integration environment; security/application owner. |
| `accounts-express` | Explicit dependency/route approval; authorization, Bearer/cookie/CORS/CSRF/revocation/audit/token forwarding and 401/403 tests. | Focused security/integration environment; security/route owner. |
| Collation | Approved locale/semantics; matching index/query plan; equality, diacritic/case/numeric ordering, regex non-equivalence, client/server parity, pagination/reactivity and representative languages/accessibility. | Staging; product/localization/application owners. |
| Production Change Streams (conditional) | Phase 4 adopt proof on exact artifact/platform, active/fallback driver evidence, operator/synthetic flows, all guardrails, 24-hour peak-period soak and exact fallback restoration. | Separately authorized production configuration change; application/database/change authority. |

No failed required check may be hidden by `|| true`, redirected output,
`--allow-incompatible-update`, or a targeted substitute. A required-check
failure blocks staging, commit and push unless the user explicitly accepts the
specific relevance and risk. Docker build, deployment and production-affecting
commands are never implied by this plan.

## Risks and Controls

| Risk | Measurable trigger / detection | Prevention and rollback/containment | Owner |
| --- | --- | --- | --- |
| Wrong or prerelease Meteor code is selected. | Artifact does not resolve to an official stable tag/tool/package set, or a required fix appears only in beta/PR state. | Stop Phase 0; select a stable release. Disable the dependent capability rather than consuming unreleased code. | Release engineering |
| Release/Node/npm/image graph drifts. | Any startup/build assertion, bundle `.node_version.txt`, digest or lock/package hash differs from the approved manifest. | Build all consumers from one ownership set; reject artifact. Roll back the complete artifact, never one image layer. | Release engineering |
| Updater/build silently changes packages. | Suppressed nonzero update, `--allow-incompatible-update`, unreviewed lock/version diff or non-deterministic clean rebuild. | Remove escape hatches; retain unsuppressed evidence. Abort until package graph is reviewed/reproducible. | Release engineering |
| Node 24 breaks Argon2, SWC/Rspack, native modules or build shutdown. | Load/build failure, hang beyond CI timeout, orphan process, ABI mismatch, missing native binary or threshold regression. | Target-architecture clean rebuild and bounded shutdown tests. Revert the complete Meteor/Node artifact. | Build/application |
| Overloaded `sessionID` meanings are silently collapsed or changed. | Any writer/reader, history/export/dashboard/model result changes its current value/lifetime interpretation. | Inventory and preserve every producer-specific contract with grace zero for the base. A unified app-owned identity is only a separately approved durable-data/migration outcome. | Application/data owner |
| Session resumption loses/replays work or retains resources. | Any duplicate/missing/cross-user side effect; auth mismatch; queue/memory/latency guardrail breach; stable patch lacks reconnect fixes. | Keep base at grace period zero. Isolate experiment; restore zero and verify fresh-session recovery. | Application/security |
| EJSON copy-on-write unexpectedly aliases data. | Mutation/reference-identity test changes an earlier payload/object or produces client/server mismatch. | Use `EJSON.clone` only where a deep-copy contract is intended; focused tests. Revert the independent source adjustment or framework artifact. | Application |
| Mongo driver error classifier restarts or masks incorrectly. | Pool/election/network fault causes a restart storm, or a fatal synthetic/real case remains alive/unreported. | Test selected-driver names/labels/messages and supported semantic signals; fail safely. Roll back artifact/classifier change. | Application/operations |
| Stable Change Streams retains known defects. | Mandatory issue not shipped, projection crash, fence/login hang, operation-time error or history-loss restart/log storm. | Do not enter Phase 4; keep exact fallback. If seen, restore fallback immediately and capture redacted evidence. | Application/database |
| Change Streams silently falls back or provides no benefit. | Declared default but observed streams/fallbacks differ; less than approved 15% bottleneck improvement. | Per-cursor evidence and A/B runs. Record defer; retain fallback without reverting topology. | Performance/application |
| Change Streams overloads MongoDB. | Any Mongo connection/pool/CPU/memory/I/O/lag/slow-query guardrail breach. | Narrow/index measured queries or defer. Restore fallback; retain target database. | Database operations |
| URI/readiness leaks a secret or fails a member/election. | Credential/URI appears in output, supported seedlist is rejected, readiness remains green without required DB, or primary election strands a consumer. | Shared spec, redaction tests, separate readiness. Abort cutover; before writes use source, after writes keep target and repair forward. | Release/security/database |
| Backup cannot meet continuity/RPO/RTO. | Checksum/restore/inventory mismatch, writer freeze uncertain, backup unencrypted/overdue, or a representative rehearsal exceeds the RTO gate or lacks its approved margin. | Select a topology-grade mechanism and repeat rehearsal. Do not cut over; preserve source authority. | Database operations/data owner |
| Old and target databases both accept writes. | Any old-source writer after authority transition or target write before source freeze. | Network/account/read-only lock and writer inventory. After first target write, never URI-switch back; recover/reconcile forward. | Change authority/database |
| Old EIP/container/wiki procedure is used as rollback. | Runbook or operator action points traffic/commands to the old co-located database after target write. | Retire contradictory instructions before Phase 3 exit; stop action and invoke the authority recovery plan. | Documentation/change authority |
| Liveness is mistaken for readiness. | `/health` is green while Mongo/Redis/storage cannot serve a critical flow, or deploy replaces the sole instance without successful readiness. | Separate bounded readiness and synthetic flow checks; abort promotion/restart last-good app only against the authoritative DB. | Release engineering |
| Observability exposes learner/security data. | Token, URI, selector/payload, identifier or raw record reaches logs/traces/benchmark artifacts; retention/access is undefined. | Redact at source, aggregate safe names, minimize data, set access/retention. Disable unsafe telemetry and rotate exposed secrets under incident procedure. | Security/privacy |
| `uws` blocks a supported network or conflicts on its internal listener. | Any required network cannot connect/recover or port isolation fails; material-benefit gate fails. | Keep SockJS baseline; restore `DDP_TRANSPORT=sockjs` and re-run affected networks. | Release/support |
| Optional auth/rate-limit work weakens security/availability. | Auth bypass, token forwarding/leak, CSRF/CORS failure, incorrect 401/403, matcher rejection leak or latency/error gate breach. | Separate approval and focused security tests. Remove the independent package/rule and restore existing route/sync rule. | Security/route owner |
| Collation changes results or misses its index. | Client/server order/equality mismatch, unstable pagination, collection scan, or language contract violation. | Separate locale decision and matching index. Revert query/index together and retain prior semantics. | Product/localization/application |
| Current single-instance deploy is described as rolling/HA. | Plan/runbook expects affinity, cross-instance resume or no-downtime replacement without implemented LB/multiple app instances. | Use maintenance/fresh-session contract, or approve and prove a separate scaling design. | Architecture/release |

## Implementation Work Packages and Candidate Commit Sequence

Each code row is intended to be an independently reviewable commit (or a small
PR if that is the team's chosen workflow); no-code and operational rows are
change records, not forced commits. Do not commit or push merely because this
plan names a sequence. Record Phase 0 evidence outside source control when it
contains operational facts. A conditional package is created only if the
audit/test demonstrates the named need.

| Order / package | Narrow change boundary | Verification and exit | Independent rollback / dependency |
| --- | --- | --- | --- |
| E0a — baseline source-of-truth and immutable pin lock | First edit `mofacts/.meteor/release` to `METEOR@3.5`; atomically align the approved Meteor builder digest, target-specific Node 24.15.0 image digest, exact `.nvmrc`/package/CI/hotfix ownership, version assertions and unsuppressed updater policy. Capture source/dependency dirty-tree intent and protected architecture evidence before editing overlapping files. No app behavior change belongs here. | Diff proves every release/toolchain consumer agrees; immutable builder reports Meteor 3.5, Node 24.15.0 and npm 11.12.1; target architecture and digest are named; no updater error is hidden; unrelated working-tree changes are preserved. | First repository change and prerequisite for E0d and every A/D/C/O source package. Hold E0a and A2 as one review stack so no mismatched release/resolved graph is promoted. |
| E0b — safe telemetry (conditional commit/config package) | Reuse current operations signals; add only a missing bounded app/DDP/Mongo/artifact signal required by a gate, with privacy/access/retention controls. Do not create a new monitoring platform. | Synthetic signal/alert/redaction tests and operations/security approval. | Revert instrumentation/config without changing product/data semantics; depends E0a. |
| E0c — minimal workload fixture | Extend existing load/test tooling with only the learner/admin/reconnect/write profiles and synthetic/minimized data needed for base comparison. Obtain explicit approval for any new dependency. | Repeatability, privacy, load-shape and environment-fingerprint review; no production learner data. | Remove test-only tooling; no runtime dependency unless separately approved. |
| E0d — base functional baseline (no code commit) | After E0a locks the candidate facts, execute two runs of the approved compatibility workload against the preserved exact 3.4.1 last-good artifact captured before E0a edits, and store protected raw plus safe summarized evidence. Defer capacity ladders, performance claims and optional-capability experiments. | Two repeatable runs, critical-flow correctness, exact 3.4.1 artifact/config fingerprint and approved interpretation; no learner data or URI in retained evidence. | No app mutation; prerequisite for D1/A1/A2 and A6 comparison. |
| I1 — durable identity inventory/decision (no code commit) | Inventory all overloaded `sessionID` writers/readers; approve preserving their current meanings/grace zero. Document a separate future semantic-migration boundary. | Data/application owner sign-off; no field/schema/value change. | No mutation; prerequisite for contained base and any later resumption design. |
| D1 — opaque URI and readiness security (base prerequisite) | Before A1/A2, remove shell/PowerShell and server single-host parsing from the existing app/deploy/hotfix paths; pass the URI opaquely to the supported driver/`mongosh`, validate the connected database and required authentication/capabilities with `ping`/`hello` or driver facts, redact errors, and keep database platform/authority unchanged. Add a direct parser only through a later separately approved exception. | Existing approved URI forms connect; selected database and required capabilities are asserted; wrong target/auth fails closed; no URI/credential reaches output; liveness remains distinct from readiness. | Revert before candidate use; do not add a parser or platform migration. This base security prerequisite is the only D-series work pulled ahead of A2. |
| A1 — private per-tab auth compatibility | Remove the labeled Meteor 2 `_storage` and token-method fallback branches and use only the supported Meteor 3 `Accounts.storageLocation` contract. Preserve existing per-tab UX; if Meteor 3.5 does not expose the contract, stop as a compatibility blocker rather than preserving or inventing another path. | Reload/two-tab/logout/provider/expired-token/fresh-reconnect security tests plus explicit supported-contract assertion. | Revert this auth-only commit; no durable identity change and no compatibility fallback. |
| A2 — exact Meteor package solution | Run the selected stable updater unsuppressed; review release/direct/resolved/npm graphs without CI/Docker escape hatches. | Clean re-run yields the same graph; release identity assertions and diff review. | Revert complete package/release set; depends E0a–E0d, I1, D1, A1 and Phase 1 dispositions. |
| A3 — resolved ABI and build validation | Reconcile A2's resolved Meteor/npm graph with E0a's exact Node/npm/image policy; assert the built bundle's `.node_version.txt`, rebuild target-platform native modules, verify package-manager identity, and remove unjustified incompatible-update flags. Do not introduce a second set of release or image pins. | Bundle/manifest assertions, target-platform native closure and config validation; final clean build proof occurs after A5 in A6. | Revert A3 with the A2 artifact; E0a remains the sole pin owner and no database/config contract changes. |
| A4 — containment settings | Wire proven fallback reactivity, SockJS and an app-owned startup mapping to `Meteor.server.options.disconnectGracePeriod = 0`; add safe behavior diagnostics. | Static/config propagation and redaction tests; full contained workload occurs in A6. | Revert settings/startup commit; depends A2–A3. |
| A5 — compatibility fixes (conditional; one commit per surface) | After A2–A4 assemble the candidate, fix only proven Rspack/roles, Mongo error-policy, EJSON, OAuth/SAML/Accounts, WebApp or native issues. | Focused unit/integration/auth/security/native tests; no unrelated surface in one commit. | Revert each surface independently; every blocker resolves before A6. |
| A6 — base 3.5 acceptance | Add/complete deterministic integration and workload coverage, including representative config TDF flow, without enabling optional capability. | All Phase 2A and quantitative gates; exact staging artifact. | Revert base artifact before DB contract changes. |
| A7 — contained base production | Deploy the exact A6 artifact against the unchanged authoritative database with fallback/SockJS/grace zero. | Phase 2C critical flows, fingerprint and 24-hour production soak. | Full last-good 3.4.1 artifact/config; no DB restore/URI change. |
| S1 — DDP resumption experiment (conditional) | On a stable fixed patch only, enable default grace/queue in staging and add replay, revocation, identity, queue/memory and same-process coverage. | Phase 2B adopt/defer record. | Grace period zero; independent of DB/Change Streams. |
| D0 — protected topology branch lock (no code commit) | Use sanitized live evidence to choose existing-platform qualification, standalone/replacement transfer, or unknown/stop. | Database/change authority signs the branch and deficits; no URI recorded. | No mutation; prerequisite for D-series. |
| D2 — deployment/sidecar ownership | Select canonical direct-network or approved topology-capable sidecar path; remove stale DB-name/single-container/tunnel assumptions; align wait-host, health and operator paths. | Sidecar app/database behavior and election/failure tests. | Restore old path only while old source remains authoritative; depends D1. |
| D3a — existing-platform qualification (branch 1) | Qualify exact replica/managed security, URI, backup/restore, monitoring, pool, failover and on-call without moving authority. | Representative isolated restore, production-shaped failover, RPO/RTO/alerts and continuity inventory; repeat only under the rehearsal rule. | Production authority/config unchanged until D5a. |
| D3b — target platform/rehearsal (branch 2) | Provision approved target security/volumes/monitoring and topology-grade backup; run a representative transfer rehearsal. | Fresh-target continuity, election/failover, RPO/RTO and alert evidence; repeat only under the rehearsal rule. | Destroy/recreate isolated targets; production source unchanged. |
| D4a — unchanged-authority runbook/docs (branch 1) | Document platform acceptance, failover/restore and approved operations corrections; consolidate wiki/config owners. | Tabletop, one doc hierarchy, no migration/old-host ambiguity. | Revert corrections; data authority unchanged. |
| D4b — transfer runbook/docs (branch 2) | Finalize freeze, authority transition, forward recovery and communication; remove unsafe old-host rollback; update owning repos separately. | Protected tabletop plus the accepted representative rehearsal evidence. | Before target write abort to source; after write recover forward. |
| D5a — production platform acceptance (branch 1) | Apply approved operations corrections with fallback reactivity and unchanged data authority. | Phase 5A failover/restore, smoke and 24-hour soak. | Revert configuration correction; authority never moves. |
| D5b — production target transfer (branch 2) | Execute approved maintenance transfer with fallback reactivity; no feature/schema change. | Phase 5A RPO/RTO, target-only authority, smoke and 24-hour soak. | Pre-write abort to source; post-write forward recovery on target. |
| C1 — Change Streams staging qualification (conditional) | On a stable fixed patch, remove fallback only in staging; add missing observer/projection/fence/failure coverage and A/B evidence. | Phase 4 adopt/defer result from three runs and soak. | Restore exact fallback; database target remains. |
| C2 — production Change Streams config (conditional) | Apply only the C1-approved setting after D5a or D5b accepts the platform. | Active driver, full metrics and 24-hour peak-period soak. | Restore exact fallback configuration; no data/topology rollback. |
| O1 — native async login APIs | Replace manual password/token promisification only; preserve UI/error/provider/per-tab behavior. | Focused auth/accessibility tests plus static/CI checks. | Revert source commit; independent of other optionals. |
| O2 — `uws` experiment (conditional) | Configuration/network experiment on a stable heartbeat-fixed patch; no product change. | Required-network matrix and >=15% named benefit with all gates. | SockJS setting. |
| O3 — async rate matcher (conditional) | One named abuse policy with bounded data lookup; no HTTP package. | Matcher latency/rejection/leak/abuse tests. | Restore synchronous rule. |
| O4 — `accounts-express` route (conditional) | One separately approved route and explicit package dependency; no rate-rule change. | Route auth/token/cookie/CORS/CSRF/revocation/fetch tests. | Remove package/route middleware; restore existing route auth. |
| O5 — collation (conditional) | One approved user-visible query/index/locale contract at a time. | Matching index, plans, parity, pagination, representative languages and docs. | Revert query and index together. |

Do not combine A-series framework/runtime work with D-series database authority
changes or C-series driver adoption. Do not combine optional packages with one
another. Update concise main-repo docs in the behavior-changing commit; make
wiki and config changes as separately reviewed changes in their owning
repositories. A commit that fails its required verification is not staged,
committed, or pushed without the user's explicit acceptance of that exact risk.

## Final Readiness Checklist

| Item | Status on 2026-07-25 | Evidence still required / blocking scope |
| --- | --- | --- |
| Official Meteor/MongoDB/API research and stable-versus-beta distinction | Complete for plan | Re-check mutable stable tags, final changelog and issue register in E0. |
| Main app, learning-components, deploy/CI, config repo and wiki audit | Complete for plan | Re-capture source commits/dirty intent; runtime behavior is not implied by source. |
| Capability classifications, phases, owners, gates, rollback and work sequence | Complete for plan | Named people/teams must accept responsibilities and default thresholds. |
| TDF/config compatibility | No Meteor-specific schema dependency found | Representative upload/launch/resume proof during A6; schema generation only if implementation changes a field/registry. |
| Current stable framework containment | Blocking repository entry | A4 must track polling, SockJS and grace period zero consistently; the audited repository does not yet contain those settings. |
| Exact selected stable patch/package/image graph | Blocking repository entry | E0a must land the release, builder, architecture-specific Node, local/CI/hotfix and assertion pins; A2 must then produce and review the resolved graph without hidden updater failures. |
| Working-tree/dependency intent | Required before A2 | Preserve and explicitly disposition existing package/zstd/upload work; do not mix it with updater output. |
| Protected production facts | Required before Phase 0 exit and all production conclusions | Sanitized Mongo patch/FCV/`db.hello()`, effective driver/settings, app count/proxy timeouts, resource/connection/index/backup/restore/monitoring facts. |
| Overloaded `sessionID` and private per-tab auth ownership | Identity preservation fixed; auth implementation blocking | Preserve every existing identity meaning with grace zero. A1 removes the Meteor 2 storage fallback and proves the supported Meteor 3 path; there is no retain-fallback option in this base track. |
| Private auth/Rspack/native/Mongo-error compatibility | Needs implementation proof | A5 is conditional on focused tests/build results. |
| Android support status | Blocking support claim, not server-only research | Retain/repair/replace/retire decision and build proof if retained. |
| Functional baseline and observability | Not implemented | E0d requires two repeatable compatibility runs and safe environment evidence. Capacity/performance experiments remain deferred and require no base-track adoption threshold. |
| Production database branch, URI and sidecar owner | Blocking Phase 3 | Protected existing-platform/transfer/stop branch; opaque-URI/readiness design, security, network and operations/on-call. A parser dependency is exceptional, not assumed. |
| Backup, RPO/RTO and recovery | Blocking Phase 3 | Both branches need approved mechanism/numbers/restores; only branch 2 needs freeze/authority transfer/forward recovery. |
| Change Streams stable-patch eligibility | Blocked on current stable 3.5.0 | Stable release containing mandatory fixes plus Phase 4 evidence; defer is acceptable. |
| Contained base production rollout | Not ready | Phase 2C requires A6, live facts, explicit Docker/deploy authorization, last-good artifact/backup, alerts and change authority. |
| Database-platform production acceptance | Not ready | Phase 5A requires the accepted Phase 3 branch and separate production authorization. |

**Final classification: `NOT READY FOR CONTAINED-BASE APPLICATION
IMPLEMENTATION`.** The desired contained-base decisions are complete, but the
audited repository has not satisfied E0a's release/toolchain pin gate or E0d's
baseline gate. Only E0a gate remediation may begin. After E0d, the base-relevant
D1, A1, A2, A3 and A4 prerequisites execute in order before compatibility and
acceptance work.
Production deployment remains separately unready and requires explicit
authorization plus protected evidence. Change Streams remains blocked on a
suitable stable patch and may remain deferred without invalidating the base
upgrade.

## Decisions Needed Before Implementation

### Fixed base-track scope

The base framework track uses the decisions above: v3.5.0 only, Meteor-owned
Node 24.15.0/npm 11.12.1, polling, SockJS, zero disconnect grace period, no
database-authority change, and no optional-capability work. It preserves all
stored identity values and current Android support claims. It does not add a
dependency, parser, configuration fallback, or user-visible behavior unless a
separate approved work package explicitly requires it.

E0a is the first implementation package. Its builder source is fixed: the
existing `geoffreybooth/meteor-base:3.5@sha256:58b203caa2c3dc963774117cbf45534d4533ddd77b220e075107da3f3600a083`
builder and official Node 24.15.0 Alpine image, pinned by the approved target
architecture digest. The release architecture itself must be named before that
digest can be selected.

### Resolved base-track design decisions

These conclusions are binding for the contained base track and are not
implementation choices:

| Design conclusion | Evidence and consequence |
| --- | --- | --- | --- |
| Retain Android support. | Android remains supported; include its build and smoke coverage in base-upgrade acceptance. |
| Retain one sidecar project with its existing local-hotfix and production SSH-tunnel modes. | The modes are deployment targets of `mofacts-mcp-sidecar`, not competing sidecar configurations. No sidecar architecture decision is required. |
| Keep the current database platform and do not introduce a replica-set project. | Change Streams is deferred. RPO/RTO, backup-retention, and database-platform commitments are therefore outside this framework-only upgrade. |
| Do not add offline URI validation. | MongoDB URIs remain opaque; the connected driver or `mongosh` validates them and errors must be redacted. |
| Defer all optional capability experiments. | No performance benchmark metric or optional-capability adoption threshold is needed for this release. E0d still runs the minimal functional compatibility workload required to compare the last-good 3.4.1 artifact with the 3.5 candidate. |
| Remove the legacy Meteor 2 Accounts-storage compatibility branch during A1. | `mofacts/client/lib/authStorage.ts` already prefers that Meteor 3 API, then falls back to old internal APIs. The fallback is not retained; failure of `Accounts.storageLocation` is an upgrade blocker, not a reason to add another path. |
| Retain the established Meteor builder publisher. | `geoffreybooth/meteor-base:3.5@sha256:58b203caa2c3dc963774117cbf45534d4533ddd77b220e075107da3f3600a083` is available for both amd64 and arm64. Keep the existing publisher and change only the release tag plus immutable digest. The first build must prove its bundled Meteor, Node, and npm versions; a failed assertion is a build blocker, not a reason to silently change publishers. |

### Unresolved release-architecture decision

The release engineering owner must decide whether the promoted artifact targets
only the current production architecture or is intentionally multi-architecture
for both `linux/amd64` and `linux/arm64`. A single target-manifest digest cannot
represent both architectures. Record the supported target set and use the
matching Node manifest digest(s) in E0a; do not substitute the mutable tag or
infer production architecture from a developer workstation.

Apart from this artifact-architecture decision, there are no remaining product
or architecture questions for the contained base upgrade. A Docker bootstrap
failure or a failure of the supported Meteor 3 Accounts-storage API is an
implementation blocker to report, not an invitation to invent a compatibility
path.

### Approvals required only before the database/production tracks

1. **Topology/URI branch:** accept Phase 0's protected branch: qualify an
   existing replica/managed platform with unchanged authority; build/transfer
   from a confirmed standalone/rejected platform; or stop while unknown. Approve
   the canonical sidecar/network/document owner and the opaque-URI/connected-
   client readiness design. Approve a direct connection-string parser only if
   D1 documents an unavoidable offline check that the current stack cannot own.
2. **Continuity:** for either branch approve backup mechanism, numeric RPO/RTO,
   security, monitoring and database/on-call/change authority. Branch 1 approves
   unchanged-authority acceptance and configuration rollback. Branch 2 also
   approves RPO-zero write freeze, maintenance/communication, post-write forward
   recovery, target architecture and any in-place-conversion exception.
3. **Reactivity:** preserve polling as the fallback and treat Change Streams as
   an optional measured adoption. A **defer** result is final for this release
   and is never a reason to use prerelease code.

Protected runtime facts are evidence to collect, not choices to guess. Optional
native async Accounts, `uws`, async rate matching, `accounts-express`, and
collation default to **defer** until their work package has a named need and
receives its capability-specific approval.

## References

- [Meteor 3.5 changelog and migration steps](https://docs.meteor.com/history)
- [Stable Meteor 3.5 release tag](https://github.com/meteor/meteor/releases/tag/release%2FMETEOR%403.5)
- [Meteor official tags (stable/prerelease check)](https://github.com/meteor/meteor/tags)
- [Meteor 3.5.1 beta changelog (unreleased evidence only)](https://github.com/meteor/meteor/blob/release/METEOR%403.5.1-beta.0/v3-docs/docs/generators/changelog/versions/3.5.1.md)
- [Open 3.5.1 release-preparation PR](https://github.com/meteor/meteor/pull/14555)
- [Official Meteor 3.5 release article and supplemental benchmark context](https://dev.to/meteor/meteor-35-is-out-j13)
- [Meteor installation and Node-version matrix](https://docs.meteor.com/about/install)
- [Change Streams driver requirements, fallbacks, and performance caveats](https://docs.meteor.com/performance/change-streams-observer-driver)
- [Meteor environment variables, including reactivity and oplog](https://docs.meteor.com/cli/environment-variables)
- [DDP transport selection, session resumption, and rollback](https://docs.meteor.com/performance/ddp-transport)
- [DDP reconnection/session-resumption API](https://docs.meteor.com/api/meteor#reconnection)
- [Accounts APIs, including 3.5 async login/logout methods](https://docs.meteor.com/api/accounts)
- [`accounts-express` authentication and fetch contracts](https://docs.meteor.com/packages/accounts-express)
- [Async `DDPRateLimiter` matchers](https://docs.meteor.com/api/ddpratelimiter)
- [Mongo/Minimongo collation options](https://docs.meteor.com/api/collections)
- [Meteor 3.5.1 milestone (unreleased patch status; re-check only)](https://github.com/meteor/meteor/milestone/132)
- Unreleased fixes to re-check against the final stable changelog:
  [nested projection fallback](https://github.com/meteor/meteor/pull/14518),
  [login/write-fence deadlock](https://github.com/meteor/meteor/pull/14564),
  [cross-connection fence scoping](https://github.com/meteor/meteor/pull/14602),
  [ChangeStreamHistoryLost restart handling](https://github.com/meteor/meteor/pull/14607),
  [operation-time comparison](https://github.com/meteor/meteor/pull/14609),
  [non-SockJS timeout](https://github.com/meteor/meteor/pull/14546), and
  [open method/disconnect handling](https://github.com/meteor/meteor/pull/14193)
- [Meteor deployment, staging, and rolling-data-version guidance](https://docs.meteor.com/tutorials/deployment/deployment.html)
- [MongoDB connection-string formats](https://www.mongodb.com/docs/manual/reference/connection-string/)
- [MongoDB: Convert a standalone to a replica set](https://www.mongodb.com/docs/v8.0/tutorial/convert-standalone-to-replica-set/)
- [MongoDB: Replica-set deployment and architecture](https://www.mongodb.com/docs/manual/administration/replica-set-deployment/)
- [MongoDB: Replica-set elections](https://www.mongodb.com/docs/manual/core/replica-set-elections/)
- [MongoDB: Production operations checklist](https://www.mongodb.com/docs/manual/administration/production-checklist-operations/)
- [MongoDB: Monitoring a self-managed deployment](https://www.mongodb.com/docs/manual/administration/monitoring/)
- [MongoDB: Indexes](https://www.mongodb.com/docs/manual/indexes/)
- [MongoDB: Change Streams](https://www.mongodb.com/docs/manual/changestreams/)
- [MongoDB: `mongodump`](https://www.mongodb.com/docs/database-tools/mongodump/)
- [MongoDB: `mongorestore`](https://www.mongodb.com/docs/database-tools/mongorestore/)
- [MongoDB collation](https://www.mongodb.com/docs/manual/reference/collation/)
- [MongoDB case-insensitive index behavior](https://www.mongodb.com/docs/manual/core/index-case-insensitive/)

### Repository evidence reviewed

- `mofacts/.meteor/*`, `mofacts/package*.json`, `mofacts/.nvmrc`, app/client/server,
  custom packages, `learning-components/`, settings and public/vendor paths;
- `Dockerfile`, `.github/workflows/ci.yml`, `deploy/`, Compose/Caddy files,
  scripts and `docs/`, including `docs/deployment/upgrade-guide.md`;
- `C:\dev\mofacts_config`, including config/TDF content and the duplicated
  `deploy and build.txt` operations sheet; and
- `C:\dev\MoFaCTS.wiki`, including deployment, remote install, local install,
  troubleshooting, backup/restore and FAQ guidance.
