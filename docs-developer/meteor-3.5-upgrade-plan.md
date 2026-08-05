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

Stable 3.5.0 includes Change Streams and enables them by default when MongoDB 6+
is a replica set or sharded cluster. The newer
`release/METEOR@3.5.1-beta.0` ref contains fixes for defects discovered after
3.5.0, but those fixes are a known-risk and qualification register—not a claim
that Change Streams are unavailable in stable 3.5.0. Check stable tags and the
changelog again before promotion. Never substitute a beta, release branch, PR
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

### Readiness after repository audit and implementation

Repository entry state was re-audited on 2026-07-25. This readiness verdict is
updated through the local candidate, conversion rehearsal, Phase 4
qualification, full client/server regression repair, exact-image smoke, and
the production rollout recorded through 2026-08-05 and is
about what is present in the current working tree, not merely what this plan
intends.

- **Decision readiness: `READY`.** The contained base track is bounded by the
  defaults in [Resolved planning defaults and execution
  rule](#resolved-planning-defaults-and-execution-rule). No additional
  product behavior or optional capability decision is needed to prepare the
  baseline.
- **Repository candidate implementation: `IMPLEMENTED`.** The current working
  tree pins Meteor 3.5 and Node 24.15.0/npm 11.12.1, treats MongoDB URIs as
  opaque driver inputs, uses documented per-tab Accounts storage, applies the
  polling/SockJS/zero-grace containment settings, and rejects updater graph
  drift. The deterministic native-amd64 build, ABI check, runtime audit, and
  isolated health smoke pass. The maintainer confirmed the supplied 3.4.1
  state was working; rebuilding and rerunning it is not an upgrade gate.
- **Base-candidate acceptance: `ACCEPTED FOR REPOSITORY PROGRESSION`.** The
  exact framework/runtime graph, static checks, server integration suite,
  deterministic amd64 build, bundle ABI assertion, runtime audit, and isolated
  health smoke provide proportionate evidence for A6. The supported Linux
  Meteor/Playwright run now passes with zero server and client failures; broader
  browser/provider coverage remains ordinary CI and release evidence.
- **Production release: `DEPLOYED`.** The approved Meteor 3.5 image is healthy
  on the converted one-member `mofacts-rs` production topology. Protected
  backup, continuity, authentication, resource, history, administration, and
  runtime checks passed during the 2026-08-05 cutover.
- **Change Streams: `ENABLED IN PRODUCTION`.** Stable 3.5.0 supports Change
  Streams and the
  project qualifies `METEOR_REACTIVITY_ORDER=changeStreams,polling`. Across the
  thirteenth and fourteenth Linux invocations, MongoDB reported one active
  qualification `$changeStream`; the supported dotted projection, bounded
  `$in`, snapshot-race, secret-containment, and login-shaped write-fence cases
  passed. The thirteenth invocation also passed injected error-286 history-loss
  recovery and one-member-primary restart recovery. It exposed a separate
  production defect in the real polling-owned `filteredUsers` publication:
  Meteor 3 returns a promise from `observeChanges`, so its handle must be
  awaited before `stop()`. After that correction, the fourteenth invocation
  passed all 565 server tests with 12 pending and no server failure. Its manual
  coordinator missed both 45-second recovery acknowledgments, so those two
  repetitions are not counted as new recovery passes; the checked-in workflow
  polls and acknowledges them automatically. The combined adjacent-run
  evidence is accepted because the intervening change is confined to the
  ordered polling publication and does not alter Change Stream recovery code.
  The subsequent full-suite repair reduced the 70 client failures to zero. On
  2026-08-03 the supported isolated Linux run completed with 0 server failures,
  883 passing client tests, 7 pending client tests, and 0 client failures.
  Phase 5B was separately authorized and deployed on 2026-08-05. Production
  logged `changeStreams,polling (Change Streams enabled)`, and MongoDB reported
  8 active `$changeStream` operations. Polling remains second in the driver
  order as the reviewed configuration recovery path.
- **Phase 4B canonical localhost runtime: `COMPLETE`.** On
  2026-08-02 the single localhost application instance was started through
  `deploy/hotfix-local.ps1` as the native Meteor/Rspack source watcher. The base
  and local Compose files supplied MongoDB and its replica-set initialization,
  not a second application instance. The application was healthy on port 3200,
  logged `changeStreams,polling (Change Streams enabled)`, connected to the
  named replica set, exposed a nonzero live `$changeStream` count, and completed
  the local-admin DDP bootstrap. The native watcher was the only application
  port owner; no competing Docker application container was running. An
  authenticated browser smoke then proved password login, the
  publication-backed home dashboard, populated learning-history/owned-content
  data, content management, live admin status and user metrics, and an actual
  `Times_Tables` learner-content launch. The browser reported no warnings or
  errors; the corresponding server log showed successful login and lesson-data
  calls without a smoke-time error. This completes Phase 4B but does not
  authorize production.

### Resolved planning defaults and execution rule

The following choices are fixed for this plan. They remove choices that were
previously described as approvals while preserving the boundaries that cannot
be decided from repository or upstream evidence.

| Topic | Binding decision | Consequence |
| --- | --- | --- |
| Meteor release | Use exactly `METEOR@3.5` / v3.5.0. Do not use 3.5.1-beta.0 or any other prerelease. | `meteor update --release 3.5` is the only upgrade command in scope. A later patch is a new plan amendment, not an automatic substitution. |
| Toolchain ownership | Meteor 3.5.0's bundled Node 24.15.0 and npm 11.12.1 are the canonical bundle-build and bundle-runtime versions. | Retain the established builder for the existing `linux/amd64` deployment architecture. Pin the builder and official `node:24.15.0-alpine` base to verified immutable OCI index digests, build and smoke-test the amd64 artifact, and assert the bundled Meteor, Node, and npm versions before the source change is accepted. ARM64 is not an established deployment target and is not an upgrade gate. |
| Base reactivity | Set `METEOR_REACTIVITY_ORDER=polling` in every base-track environment. | Oplog and Change Streams are out of scope for the base release. This is also the tested rollback state. |
| Base DDP transport and resumption | Use SockJS and set `Meteor.server.options.disconnectGracePeriod = 0`. | `uws` and DDP session resumption are not enabled or evaluated in the base release. |
| Database authority | Convert the existing self-hosted MongoDB service and data volume in place to a configurable replica set, initially with one member. Preserve the existing logical database and writer authority. | The first member stays on the current server; no second server is required for Change Streams. Keep the replica-set identity, member address, credentials, and seed-list URI explicit so later members or a parallel target can be added without changing the application data contract. Production execution remains separately authorized. |
| Connection-string handling | Treat MongoDB URIs as opaque credentials. The driver or `mongosh` validates a live connection; plan code must not parse or print a URI. | A bespoke parser is prohibited unless a later, separately approved exception names the unavoidable offline check and its redaction contract. |
| Capability sequence | Change Streams are the intended performance-capability track after the contained base and database qualification. DDP resumption, `uws`, async rate matching, `accounts-express`, collation, and native async Accounts refactoring remain independent. | Qualify stable 3.5.0 now in isolation, using the post-3.5.0 fixes as named regression scenarios rather than an entry prohibition. Continue until a demonstrated technical blocker or a newly discovered material design question is reached. |
| Android web app | MoFaCTS remains installable and usable through an Android browser. It does not ship a native Cordova package. | Cover Android-browser and installable-web-app behavior through the ordinary browser build; do not require an APK/AAB build, Android SDK, emulator, or signing toolchain. |

The following boundaries require user authority for the named external action,
but they do not block safe repository-owned work that can continue independently:

| Blocker | Required evidence | Decision owner |
| --- | --- | --- |
| Production conversion and effective reactivity driver | Sanitized pre/post-conversion topology evidence and effective environment configuration, with no URI, keyfile, or credential recorded. | Database operations |
| Production rollout | Explicit deployment authority, last-known-good artifact, rollback owner, and required protected operational evidence. | Change authority |

#### Outcome-driven continuation and blocker rule

Once the requested outcome is clear, continue every safe, in-scope,
repository-owned implementation and verification step without waiting for
optional evidence, a named owner, a preferred test environment, a benchmark,
or a formal phase-promotion ceremony. Missing nice-to-have evidence is recorded
as a verification limitation and followed up through normal CI or release work;
it does not stop progress.

Pause only for:

1. a **technical blocker**: the required implementation cannot work safely or
   correctly after reasonable in-scope investigation and attempts; or
2. a **design question**: two or more viable choices would materially change
   user-visible behavior, a durable data contract, database topology or writer
   authority, security/privacy behavior, or another product invariant.

Required authorization for a production, destructive, credential-bearing, or
otherwise externally consequential action blocks only that action. It does not
block independent source, configuration, documentation, test, or staging
preparation. A failed check blocks only work whose correctness it actually
contradicts; unrelated work continues.

##### Blocker-declaration protocol

Because a recorded blocked status is terminal and may not be reversible to an
active status, do not record this plan or its execution goal as blocked on the
first or second observation of a problem. The same condition must remain a
real impasse for three consecutive continuation passes. Before declaring that
impasse, all of the following must be written down and verified:

1. the exact required outcome that cannot currently be achieved;
2. direct evidence of the failure from the current stable artifact, current
   worktree, or current protected boundary—not an inference from an unreleased
   branch, proposed fix, missing optional evidence, or an unrun experiment;
3. the safe in-scope attempts and alternatives already tried, including why
   each failed to reach the required outcome;
4. confirmation that no meaningful independent source, configuration,
   documentation, test preparation, isolated rehearsal, or verification work
   remains; and
5. whether the condition is the technical blocker or material design question
   defined above, rather than an authorization boundary affecting only one
   external action.

The following are explicitly **not whole-plan blockers** by themselves:

- a Docker build, integration-test invocation, workflow trigger, deployment,
  or protected-environment operation awaiting explicit authorization;
- a test or benchmark that has not yet been run;
- an upstream defect fixed only on a beta or unreleased branch, unless the
  current stable artifact reproduces that defect in a required flow;
- incomplete promotion, soak, performance, or production evidence while safe
  repository or isolated work remains; or
- a failure confined to an optional capability when the contained base remains
  valid.

When one of those conditions is reached, keep the goal active, record the
specific pending action and verification boundary, and continue every other
safe step. If a genuine blocker is eventually proven, state it to the
maintainer with the evidence and affected outcome before recording the blocked
status.

Performance experiments support quantitative MoFaCTS performance claims, but
they are not prerequisites for installing or configuring an upstream
capability. When a benchmark is run, use comparable workloads and report its
limits honestly; do not invent a numeric adoption threshold merely to advance
the phase.

### Entry gate and exact first implementation slice

There are no additional product-feature decisions before the contained base
track. The repository prerequisites described in this section have been
completed in the current working tree. The table below is the historical entry
audit that bounded the implementation; it is not a statement that the current
tree still contains the listed 3.4.1 inputs. **E0a was a read-only preflight.**
It recorded the supplied known-good 3.4.1 source/artifact identity without
rebuilding or rerunning that state. D1 and A1 then preceded A2, which ran the
official updater and aligned the complete release/package/toolchain consistency
set as one atomic review package. No intermediate state claimed Meteor 3.5 while
retaining the 3.4.1 resolved package graph.

| Entry gate | Audited repository state | Required preflight or A2 exit evidence |
| --- | --- | --- |
| Meteor release owner | `mofacts/.meteor/release` is `METEOR@3.4.1`. | Preserve it through E0a. In A2 run `meteor update --release 3.5` unsuppressed and review `.meteor/release`, `.meteor/packages`, `.meteor/versions`, and the npm lockfile together. Never edit the release pin ahead of the resolved graph. |
| Builder identity | Root `Dockerfile` and hotfix Compose use `geoffreybooth/meteor-base:3.4.1`. | In E0a verify the selected `geoffreybooth/meteor-base:3.5` immutable OCI index and its `linux/amd64` child; do not edit consumers. In A2 pin the verified index everywhere the builder is selected and assert Meteor 3.5, Node 24.15.0 and npm 11.12.1 in the amd64 artifact. |
| Bundle dependency/runtime Node | Docker and hotfix dependency/runtime paths use Node 22.22.0 tags. | In E0a verify an immutable OCI index and its `linux/amd64` child for official `node:24.15.0-alpine`; do not edit consumers. In A2 pin it in bundle-dependency, runtime and hotfix paths. Build native dependencies for the target amd64 environment and never copy native modules from another OS, ABI or architecture. |
| Developer/CI Node owner | `.nvmrc` says `22`; package engines permit Node 22; CI installs Node 22 and Meteor 3.4.1. | Make one exact Node 24.15.0 owner and align `.nvmrc`, package engine/package-manager policy, CI Meteor/Node installation and explicit version assertions. |
| Updater observability | CI and the Docker build redirect `meteor update --npm` errors and continue successfully. | Remove redirection and `|| true`; a migration/update failure is blocking and its non-secret output is retained in the change record. |
| Opaque Mongo URI contract | Shell, hotfix and server readiness/settings paths locally parse the URI. | Before A2, complete the base-relevant part of D1: pass the URI opaquely to the supported driver or `mongosh`, assert a live authenticated connection and selected database/capabilities, redact failures, and add no parser or compatibility fallback. |
| Per-tab authentication contract | `authStorage.ts` assigns `Accounts.storageLocation` and falls through private Meteor storage/token APIs to force per-tab credentials. | Before A2, complete A1: configure the documented `clientStorage: "session"` contract through the one settings owner verified in the stable 3.5 implementation, remove the private mutation layer, preserve per-tab UX, and make failure of the documented contract an explicit compatibility blocker. Do not set both `accounts` and `accounts-base` keys as a compatibility measure. |
| Framework containment | Base/staging Compose does not track polling, SockJS or reconnect-grace settings. | Before candidate acceptance, complete A4: `METEOR_REACTIVITY_ORDER=polling`, `DDP_TRANSPORT=sockjs`, and app-owned `Meteor.server.options.disconnectGracePeriod = 0` across every base environment. |
| Pre-upgrade baseline | The maintainer supplied and confirmed a working Meteor 3.4.1 state. | Record its source/artifact identity for rollback. Do not rebuild or rerun 3.4.1 merely to prove the supplied starting state worked; acceptance effort belongs to the 3.5 candidate. |

E0a records the source commit, dirty-tree disposition, exact last-good 3.4.1
artifact/configuration fingerprint, candidate OCI index identities,
and the intended A2 consistency set so updater output cannot absorb unrelated
package, Zstd, upload, OpenRouter, SPARC or other user work. A2 then applies the
release pin, resolved package graph, image pins, exact local/CI Node policy, and
updater-observability correction as one review package; do not commit or
promote an intermediate state whose release file and resolved graph disagree.

After E0a passes, execute the base prerequisites in this order: the
base-relevant D1 opaque-URI/readiness correction, A1 documented authentication
storage, A2 atomic framework/package/toolchain transition, A3 resolved ABI
validation, A4 containment settings, then conditional compatibility fixes and
A6 acceptance. A6 covers only upgrade-owned contracts. Broader Android/browser,
provider, TDF, and whole-product regression coverage remains ordinary CI or
release work and does not block the Change Streams track by absence alone.

### Upstream issue and fix disposition register

Status is relative to stable `METEOR@3.5` (`meteor-tool@3.5.0`) on the review
date. A merged PR on an unreleased branch is not a shipped fix.

| Behavior | 3.5.0 disposition | Qualification disposition |
| --- | --- | --- |
| Standalone MongoDB Change Streams capability detection | Included in 3.5.0. | Still prove that standalone selects the declared polling path; do not infer production topology from this fix. |
| Initial-snapshot/restart races, `skip`/`limit` polling selection, and ObjectID projection handling listed in the 3.5 changelog | Included in 3.5.0. | Run the focused observer regression matrix against MoFaCTS publications. |
| Nested-object projection crash handling ([PR 14518](https://github.com/meteor/meteor/pull/14518)) | Fix is not in stable 3.5.0; upstream identifies dotted projection notation as the workaround. | MoFaCTS production publications already use dotted notation. Qualify that supported form and keep a static guard against introducing the unsupported nested-object form; do not make an unused syntax defect a production-adoption blocker. |
| Change Stream write-fence/multiplexer deadlock affecting login-style writes ([PR 14564](https://github.com/meteor/meteor/pull/14564)) | Fix is not in stable 3.5.0. | Stress login-style and learner-write fences on stable 3.5.0. Any unresolved method, readiness-before-own-write defect, or deadlock blocks production adoption. |
| Cross-connection write-fence timestamps ([PR 14602](https://github.com/meteor/meteor/pull/14602)) | Fix is not in stable 3.5.0. | Current source inventory finds only Meteor's default runtime Mongo connection; the direct `MongoClient` belongs to an offline audit process and cannot participate in a DDP fence. Record not applicable for the current app, and reopen this case if a `RemoteCollectionDriver`, second runtime Mongo connection, or server-side DDP connection is introduced. |
| `ChangeStreamHistoryLost` restart loop ([PR 14607](https://github.com/meteor/meteor/pull/14607)) | Fix is not in stable 3.5.0. | Inject stream interruption/history loss and observe recovery on stable 3.5.0. A restart loop, lost reactivity, or unbounded resource growth blocks production adoption. |
| Change Stream operation-time comparison crash ([PR 14609](https://github.com/meteor/meteor/pull/14609)) and related observer fixes listed in the beta changelog | Fixes are not in stable 3.5.0. | Run concurrent snapshot/restart/fence cases on stable 3.5.0. Any crash or integrity failure blocks production adoption. Reconcile later stable patches before promotion, but do not use a beta. |
| Quiet `uws` connection closed by the legacy heartbeat watchdog ([PR 14546](https://github.com/meteor/meteor/pull/14546)) | Merged only toward the unreleased 3.5.1 line. | `uws` remains deferred until a stable fix and the network experiment pass. |
| DDP resumption dropped messages, spurious reconnects, closed-connection leaks, subscription stop/double-stop and batching edge cases (3.5.1 beta PRs 14526, 14528, 14530, 14532, 14534, 14536, 14538, 14542, 14544) | Present only in the 3.5.1 beta line. | Stable 3.5.0 baseline uses grace period zero. Enable resumption only on a stable patch whose final notes contain the applicable fixes and after the isolated Phase 2B experiment. |
| Non-retrying client method can remain unresolved when force-disconnected between `result` and `updated` ([PR 14193](https://github.com/meteor/meteor/pull/14193)) | Open upstream; not proven fixed in 3.5.0 or the beta. Grace period zero does not fix this client abort semantic. | No app-owned `DDP.connect`/`retry:false` path was found; inventory packages/custom connections and, where applicable, test the precise force-disconnect window. Record not-applicable only with that evidence. |
| Rspack Docker-build hang ([issue 14445](https://github.com/meteor/meteor/issues/14445)) and orphan processes on shutdown ([issue 14384](https://github.com/meteor/meteor/issues/14384)) | Open upstream on the review date. | Exercise bounded build shutdown/retry behavior in supported Docker/CI paths; a hang or leaked process aborts promotion. |

The release owner must update this register from stable changelogs and linked
issue/PR state. Beta code is never installed. Post-3.5.0 fixes define focused
regression scenarios and production risks; they do not prohibit isolated
qualification of the supported stable 3.5.0 capability.

## Goal

Move MoFaCTS from `METEOR@3.4.1` to the deliberately selected stable Meteor
3.5 release without changing learner data contracts, TDF/config schemas, or
deployment semantics as a side effect. Capture the automatic runtime gains,
qualify the new default DDP behavior, and deliberately evaluate every relevant
opt-in capability. Enable Change Streams only after the framework upgrade is
stable and MoFaCTS runs against a qualified, operationally owned MongoDB
replica-set or managed platform whose workload has been proven compatible.

This plan now authorizes the repository-owned framework and one-member
replica-set configuration described here. It does not authorize executing the
live production conversion, deploying an artifact, mutating production data, or
changing writer authority.

## Advantages MoFaCTS Can Realistically Gain

The release-wide benefit is broader than Change Streams. This is the capability
decision register; a capability is not adopted merely because its code ships.

| Capability | Classification | MoFaCTS advantage | Prerequisites and principal risks | Proof required | Rollback / non-adoption path | Owner | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Selected-release Node/npm (3.5.0: Node 24.15.0/npm 11.12.1) | **Automatic/unavoidable** | Supported runtime used by the selected Meteor release. | Exact release selection; Node 24/Alpine support for Argon2, SWC/Rspack and all native modules; npm lockfile review. Maintenance benefit only—no speed claim. | Rebuild builder, bundle dependencies, runtime and CI from clean inputs; static/integration/build evidence and exact-version assertions. | Roll back the complete Meteor image/package set before any incompatible data write; no mixed Node bundle. | Release engineering | 2A |
| EJSON/DDP allocation reductions and shipped correctness fixes | **Automatic/unavoidable** | Potentially fewer copies/allocations and less GC pressure; maintained core behavior. | Copy-on-write aliasing may break code that expected a deep clone; exact shipped-fix set varies by patch. | Payload/custom-type mutation tests and same-workload heap/GC/DDP correctness comparison. | Roll back the complete framework release; no feature switch. | Application | 2A |
| DDP session resumption | **Enabled by default but configurable; initially disable** | Can reduce full re-subscribe work on brief same-process reconnects. | Open reconnect defects; the tracked deploy is one process/no cross-instance resume, but Phase 0 must confirm live topology. MoFaCTS also persists private/overloaded identity values. Replay, memory, auth and identity risks are high. | Preserve base identity semantics; then require a separate identity contract plus short/long and same-/different-process, idempotency, auth, queue, memory and storm gates. | `disconnectGracePeriod = 0`; fresh session/re-subscribe. | Application + release engineering | 1, 2B |
| MongoDB Change Streams | **Infrastructure-dependent; default-preferred by Meteor but initially disable** | Eligible unordered observers may move matching work from app processes to MongoDB. | MongoDB 6+ replica set/sharded cluster, privileges, connection capacity, and suitable selectors/indexes. Stable 3.5.0 has named projection, fence, operation-time, and recovery risks from fixes shipped later; reproduce those cases during isolated qualification and defer adoption if any fails. May increase database load or select polling for unsupported cursor shapes. | Driver evidence; publication compatibility matrix; failure injection; correctness/integrity; matched fallback A/B workload only for a quantified performance claim. | Tested `polling`; oplog adoption is outside this plan and would require a separately approved change. | Database operations + application | 3–5 |
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

## Pre-implementation Baseline

This table records the state that motivated the upgrade. It is intentionally
historical; the current uncommitted candidate and verification status are
recorded in the readiness checklist and
`docs/deployment/meteor-3.5-implementation-record.md`.

| Surface | Current state | Upgrade implication |
| --- | --- | --- |
| Framework | `mofacts/.meteor/release` pins `METEOR@3.4.1`; the researched stable target is `METEOR@3.5`. | This is an incremental 3.4.1 -> 3.5 update, not the Meteor 2 -> 3 async conversion. The older v3 migration site is background only, not this upgrade procedure. |
| Node/tooling | Exact Node ownership is currently split: Docker, CI, and hotfix paths pin Node 22.22.0; `mofacts/.nvmrc` says only `22`; `package.json` permits `>=22.13.0 <23`; and Meteor 3.4.1 itself bundles Node 22.22.1. The audit shell was Node 22.20.0/npm 10.9.3. Meteor 3.5 bundles Node 24.15.0/npm 11.12.1. | Establish one exact Node owner and make every other surface assert or derive it. Rebuild native dependencies; do not let the Meteor-bundled build Node differ from the bundle-install/runtime Node. |
| Build/runtime pins | `Dockerfile` and the hotfix services in `deploy/docker-compose.local.yml` use third-party `geoffreybooth/meteor-base:3.4.1`; CI and developer docs install Meteor 3.4.1/Node 22. Meteor now documents an official `meteor/meteor-base` image. | Retain `geoffreybooth/meteor-base` and the established `linux/amd64` deployment architecture. Pin verified immutable OCI index digests for the 3.5 builder and official Node 24.15.0 Alpine, assert their amd64 contents, build and smoke-test the amd64 artifact, and update all selected pins atomically in A2. ARM64 and emulator coverage are outside this upgrade. |
| Meteor packages | `.meteor/packages` directly constrains `mongo@2.2.0`, `accounts-password@3.2.2`, `session@1.2.2`, `ejson@1.1.5`, `ecmascript@0.17`, `email@3.1.2`, and `rspack@1.0.0`. Resolved `.meteor/versions` includes `accounts-base@3.2.1`, `accounts-password@3.2.3`, `ddp-client/ddp-server@3.2.0`, `minimongo@2.1.0`, `mongo@2.3.0`, `npm-mongo@6.16.1`, `alanning:roles@4.0.0`, `ostrio:files@3.0.1`, `rspack@1.1.0`, and `webapp@2.1.2`. The 3.5 set moves relevant packages again. | Distinguish direct constraints from the resolved graph. Run the official updater and review `.meteor/packages`, all of `.meteor/versions`, npm lockfile, and user-owned dependency work; do not assume the release pin alone selects the intended packages. |
| npm build stack | The dirty working-tree lock currently resolves `@meteorjs/rspack@2.0.1`, Rspack core/CLI 1.7.6, SWC 1.15.33, Svelte 5.55.7, `svelte-loader` 3.2.4 and `svelte-preprocess` 6.0.3; app Meteor types remain `@types/meteor@2.9.11`. | Re-capture after user dependency work is dispositioned. Reconcile Atmosphere/npm Rspack and Meteor-provided/community types; prove Node 24 and target-platform binary closure rather than inferring it from permissive engine ranges. |
| Upgrade command observability | CI and the Docker build currently run `meteor update --npm` with errors redirected and ignored. | Run the 3.5 migration interactively without suppression, retain its non-secret output in the change record, and make the reviewed lockfiles authoritative. Do not accept a green build that hid an update failure. |
| MongoDB version | Repository Compose uses the mutable line tag `mongo:8.0`; exact patch, image digest and FCV are not repository facts. | The declared line satisfies the Change Streams minimum, but Phase 0 must capture/pin the exact deployed patch/digest/FCV and verify topology. |
| MongoDB topology | At audit start, repository Compose started MongoDB without `--replSet`; the observed local runtime was standalone. | The candidate converts the same service/volume to a configurable one-member replica set. It does not claim host redundancy. |
| Reactivity configuration | At audit start, no repository-owned `METEOR_REACTIVITY_ORDER` or `MONGO_OPLOG_URL` wiring was found. | The contained candidate now forces `METEOR_REACTIVITY_ORDER=polling`. Do not provision or select oplog in this upgrade. |
| Replica-set URI compatibility | WHATWG/single-host parsing exists in `deploy/docker/validate-mongo-url.sh`, `deploy/hotfix/run-bundle.sh`, `mofacts/server/lib/openCoreSettingsValidation.ts`, and `mofacts/server/methods/deploymentReadinessMethods.ts`. Standard multi-host seedlists are not safely supported, and one hotfix error path can echo the full URI. | Remove local parsing and establish one opaque-URI/connected-validation contract across shell, PowerShell and app code. Pass approved seedlist, `replicaSet`, `authSource`, encoded-credential, DNS/IPv6 and SRV forms to the supported driver or `mongosh`; assert the connected database/authentication/capabilities and redact every error path. A direct parser requires the separately approved exception. |
| Deployment database ownership | Canonical Compose depends on/waits for its local `mongodb` and backup/restore execs into that container. There are two inconsistent production MCP paths: `mofacts-mcp-sidecar/scripts/start-production.ps1` plus `mofacts-mcp-sidecar/docker-compose.production.yml` tunnels to hard-coded `mofacts-mongodb-1`, while `C:\dev\mofacts_config\deploy and build.txt` launches `mofacts-mcp-sidecar/docker-compose.remote-server.yml` directly on a remote Docker network. The base sidecar default database name is also inconsistent. | Select one authoritative production sidecar/DB contract and retire or redirect the other through a separately approved config-repo change. A replica-set target requires coherent health/readiness, backup/restore, dependencies, URI, network/tunnel, sidecar and failover behavior. |
| Deployment shape | Tracked Compose has one fixed-name app container and one Caddy upstream; replacement restarts that sole instance. `/health` is liveness only, although Compose uses it as a healthcheck. | Do not claim current rolling, canary, cross-instance resumption or load-balancer affinity support. Either keep a one-instance maintenance deployment and expect fresh sessions after process loss, or separately approve a multi-instance/LB design. Add DB-aware readiness distinct from liveness before database failover/cutover. |
| Reactive surfaces | `mofacts/server/publications.ts` contains learner, content, dashboard, settings and sorted/paged user publications and manual `observeChanges`; `serverComposition.ts` observes Dynamic Settings. The roles path uses `(Meteor as any).roleAssignment` across publications, shared collections, startup, and client utilities because the package export is undefined in the Rspack bundle. | Classify every selector/projection/sort/skip/limit/observer and verify roles publication/global/autopublish/allow-rule behavior as a named Rspack/package gate. |
| DDP sessions and durable identity | The app has no public resumption configuration, but private `_lastSessionId` is polled, persisted to the user and written to history. The overloaded history `sessionID` also receives app attempt IDs, timestamp-plus-TDF values from video/AutoTutor, and learning-component/SPARC session values. Readers include model/history exchanges, dashboards/analytics and exports. | Recommended base disposition: preserve every current value/meaning, keep grace zero, inventory all writers/readers, and do not collapse or reinterpret the field in this upgrade. A unified app-owned identity is a separate durable-data design/migration; resumption stays deferred until its contract is approved. |
| DDP transport | No repository `DDP_TRANSPORT`/`DISABLE_SOCKJS` configuration was found, so the effective target default remains `sockjs`. MoFaCTS is public/mobile-facing. | Hold `sockjs` during the framework and database work. Treat `uws` as a measured, reversible later experiment, not part of the base migration. |
| Accounts and HTTP | `signIn.ts` manually promisifies password/token login; `authStorage.ts` monkeypatches per-tab token storage through `Accounts.storageLocation` plus private Accounts/Meteor storage and token APIs; `client/index.ts` also reads private stored-token/local-storage surfaces. Meteor 3.5 documents `clientStorage: "session"` for per-tab credential storage, but the documentation uses both `packages.accounts` and an older `packages.accounts-base` reference, so the stable implementation must identify the one canonical settings owner. The Microsoft package uses private `OAuth._*` helpers; Memphis SAML uses `globalThis.Package.oauth` and private credential/login-response helpers. The server has multiple `WebApp`/Connect handler tiers. | Treat password/token, per-tab storage, Microsoft OAuth, Memphis SAML, handler ordering and scoped download routes as separate contracts. A1 configures the documented session-storage contract through exactly one verified owner, then removes the private storage/token mutation layer and unnecessary token migration. Inability to preserve per-tab parity with that documented contract blocks the upgrade and does not authorize dual-key configuration or private fallback preservation. |
| Rate limiting | `server/runtime/ddpRateLimits.ts` defines synchronous method rules. | Verify them unchanged first. Async matchers are an available later refinement only where a database-backed condition improves policy. |
| Async migration | MoFaCTS is already Meteor 3-style and contains async raw MongoDB calls and async server code. | Re-audit custom packages, raw MongoDB calls, HTTP middleware, and native modules against the selected release; do not assume the prior migration covers a new toolchain/runtime bump. |
| Client/build integration | The application uses Blaze/Svelte/Rspack and custom `mofacts:*` packages. Its Svelte loader wrapper globally suppresses one warning while loading, which could hide a changed diagnostic. Argon2 is enabled in CI/local settings and relies on a prebuilt native binary in Alpine; Docker also prunes platform-specific SWC binaries. Android installation uses the ordinary web application, not Meteor's Cordova platform. | Treat bounded Rspack build/shutdown, suppressed-warning scope, Svelte integration, roles workaround, Argon2 password/rehash, SWC/OXC/native closure, custom packages, and representative Android-browser/web-app behavior as named Node 24 gates. Do not introduce or require an APK/AAB build toolchain. |
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
| TDF/config content and private operator procedure | `C:\dev\mofacts_config` | No TDF/schema/config-name change is expected. Keep `deploy and build.txt` as the canonical private operator checklist for the exact staging/production host, key, build, copy, conversion, rollout, and status commands. Update it in the same work package whenever the public deployment contract changes, while keeping credentials and workstation-specific mappings out of the public repository. Preserve unrelated config-repository work. |
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
- Do not silently switch the production database platform or writer authority.
  The approved current change converts the existing service and volume in place
  to a one-member replica set. A later parallel target remains separately gated
  by backup/restore, authority and cutover procedures.
- Keep `METEOR_REACTIVITY_ORDER=polling` as the capacity-tested contained-base
  reactivity contract through private deploy-time settings; do not introduce a
  public UI control or an oplog alternative in this upgrade.
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
   3.5.0, the tuple is Node 24.15.0/npm 11.12.1. Accept the contained base as
   the A6 repository candidate. The maintainer cancelled a separate Phase 2C
   production rollout; the exact A6 artifact is first deployed to production
   with polling inside Phase 5A after replica-set readiness is established.
2. **DDP session resumption:** after a stable patch contains the applicable
   fixes, qualify the enabled-by-default reconnect semantics as an isolated
   experiment and retain grace period zero as the behavior rollback.
3. **Database-platform conversion:** configure the existing service and volume
   as a secure, named one-member replica set, rehearse the in-place conversion,
   then execute it during an authorized maintenance window with a verified
   backup and stopped writers. Keep member identity and URIs explicit so adding
   members or moving to a parallel target remains possible later.
4. **Reactivity driver:** experiment with Change Streams on stable 3.5.0 in
   staging. Treat every known post-3.5.0 fix as a focused regression scenario;
   adopt in production only if all gates and a polling fallback soak pass.
   Deferral is a valid result.
5. **Explicit opt-ins:** separately evaluate native async Accounts APIs,
   `uws`, async rate-limit matchers, `accounts-express`, and collation. Adopt
   only those with a demonstrated MoFaCTS benefit and an approved contract.

The one-member in-place conversion is the intended current destination, not a
claim of high availability. A future parallel or multi-member deployment remains
an independent extension. This separation prevents framework, Node, DDP
lifecycle, DDP transport, database topology, query semantics, and reactive-driver
changes from being debugged as one opaque event.

### Phase control cards

Owner and approver columns identify operational accountability; their absence
does not stop safe repository-owned work. Explicit user authority remains
required for production, destructive, or externally consequential actions. A
failed gate stops only the dependent behavior it disproves, while unrelated
work continues. “Rollback” always means the tested action in this table plus
the phase-specific detail below, never an improvised data rewind.

| Phase | Objective | Owner / approver | Entry gate | Promotion evidence | Abort trigger | Tested rollback or containment |
| --- | --- | --- | --- | --- | --- | --- |
| 0 — release and evidence | Lock an exact stable release and artifact identity. | Release engineering / technical lead | Named sponsor/change authority and authorized protected-environment access. | Immutable release/package/image identity, source/dirty-tree disposition, and the supplied known-good 3.4.1 rollback identity. No reconstructed 3.4.1 workload run is required. | Source/dependency intent is ambiguous, secrets appear in evidence, or an enabled base capability has no safe containment. | Revert only conditional instrumentation if unsafe; redact/discard unsafe evidence and recapture. |
| 1 — compatibility | Give every package, private API, publication, identity and deployment consumer a disposition. | Application lead / technical lead | Phase 0 release candidate and source identity. | Inventory signed off; focused test owners; no unresolved compatibility blocker; overloaded identity is explicitly preserved for the contained base. | Unsupported native/package/private surface or duplicate identity/deploy owner has no accepted disposition. | Do not change the release; split a separately approved remediation package. |
| 2A — framework/toolchain | Produce a deterministic Meteor 3.5 artifact with old reactivity, SockJS and session resumption disabled initially. | Release engineering / technical lead | Exact release/source identity and release architecture are known. | Reviewed package graphs, exact versions, normal static checks, focused upgrade-owned tests, deterministic build/ABI evidence, and startup health. | Hidden update, mismatched Node, reproducible build/startup failure, or a focused test proving an upgrade-owned compatibility defect. | Redeploy the complete last-good 3.4.1 artifact/config before any database contract changes. |
| 2B — DDP resumption | Decide whether retained sessions are safe and useful. | Application lead / technical lead + security for auth behavior | Phase 2A stable with grace period zero; separate identity contract approved. | Replay/idempotency, auth, memory, reconnect and same-process tests pass; tracked-versus-live process topology documented. | Duplicate/missing side effect, durable identity drift, auth leakage, memory/queue breach, or unresolved upstream defect. | Set `disconnectGracePeriod = 0` and prove fresh-session recovery. |
| 3 — database conversion rehearsal | Implement and rehearse the selected in-place one-member replica-set conversion while preserving later expansion. | Database operations / change authority | Phase 2A accepted; backup, keyfile, member identity, URI consumers, and maintenance owner are defined. | Disposable-copy conversion proves authenticated primary readiness, unchanged data/users/indexes, polling app startup, and restore. | Secret leak, identity mismatch, data loss, failed initialization/readiness, or failed restore. | Repository rehearsal never changes production; live rollback follows the conversion runbook. |
| 4 — Change Streams staging | Prove compatible observers, correctness, and recovery on stable 3.5.0; measure performance when making a quantitative MoFaCTS claim. | Application + database operations / technical lead | A Change-Streams-capable isolated topology exists and the stable 3.5.0 candidate is identified. | Active-driver evidence plus focused observer, write-fence, restart, integrity, and known-3.5.0-risk checks. A comparable workload is required only for a quantified performance claim. | Correctness/write-fence/restart defect or database capacity breach. | Restore polling; keep replica-set topology. |
| 4B — hotfix localhost rollout | Run the qualified configuration first on the hotfix server at `localhost:3200`. | Application maintainer | Phase 4 records adopt for staged progression and the local MongoDB member is a healthy named replica set. | Healthy app startup, explicit `changeStreams,polling` log, active MongoDB stream evidence, and focused local smoke. | Startup, observer, write-fence, or local database-health regression. | Set the canonical local Compose reactivity order back to polling; keep the local replica-set topology. |
| 5A — production database and contained-app acceptance | Convert the existing service/volume in place, prove replica-set readiness, then deploy the exact A6 artifact with polling before reopening traffic. | Database operations + release engineering / change authority | A6 and Phase 3 pass; protected production facts, backup/runbook/communications, and the post-write recovery path are current. | Named-set primary readiness, exact A6 fingerprint, unchanged logical data/authority, all URI consumers, restore, focused smoke, and polling-mode production soak pass. | Concrete continuity, authentication, readiness, recovery, app compatibility, or capacity failure. | Before application writes, use the rehearsed standalone/3.4.1 abort. Afterward retain the replica set and recover forward or use only a replica-set-compatible last-good app artifact. |
| 5B — production Change Streams | Enable only the qualified reactivity configuration. | Release engineering + database operations / change authority | Phase 4 records **adopt** and the Phase 5A polling-mode production soak passes. | Active-driver evidence and at least 24-hour threshold-compliant soak including peak period. | Any integrity, auth, observer, restart-storm or resource threshold breach. | Restore exact fallback order; do not roll back data/topology. |
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

The topology direction is now resolved: convert the existing self-hosted
MongoDB service and data volume in place to a named replica set, initially with
one member on the current server. The live pre-conversion state remains a
`PROTECTED-RUNTIME-FACT` to capture before execution, but it no longer leaves
the architecture undecided. This is branch 2 below, using the in-place path:

1. **Existing acceptable MongoDB 6+ replica set/managed cluster:** qualify its
   members/service tier, FCV, security, URI consumers, backups/restores,
   monitoring, connection budget and failover. Preserve the existing data
   authority and skip the transfer/write-freeze steps. Any architecture deficit
   discovered is a separate approved platform change.
2. **Current selected path — existing self-hosted standalone:** convert the
   current data-bearing service in place to a configurable one-member replica
   set. The host, data volume, logical database, collection names, document
   shapes, `_id` values, references and external-asset relationships remain
   unchanged. The design must permit later `rs.add(...)` expansion or a
   separately rehearsed parallel-target migration.
3. **Unknown or contradictory topology:** stop the database/Change Streams
   tracks and obtain sanitized `db.hello()`/service evidence. Do not infer a
   migration or eligibility from a URI or tracked Compose file.

Branch 2 requires a maintenance-window write stop and verified backup before
the in-place topology conversion. It does not require copying data to a second
server. If a parallel target is adopted later, the separate transfer and
authority boundary below applies at that time; a standalone source has no oplog
that can synchronize its last writes, so that future transfer requires a final
write freeze.

### Decisions this section must settle

| Decision | Candidate choices | Required recorded outcome |
| --- | --- | --- |
| Live topology branch | **Selected:** in-place conversion of the current self-hosted service/volume to a one-member replica set. | Capture sanitized pre/post topology evidence; no URI, keyfile, or credential enters the record. |
| Migration path (branch 2 only) | **Selected now:** convert the existing service and volume in place. **Preserved future option:** restore/copy into a parallel replica set when high availability or a server move is wanted. | Record the in-place conversion and keep the parallel-transfer runbook independent rather than making a second server a prerequisite. |
| Target architecture | One current member on the existing server, with a stable replica-set name and explicit advertised DNS name. This supplies Change Streams but not host redundancy. Later members or a parallel target use distinct volumes and the same logical database contract. | Current member identity, keyfile ownership, URI, backup/recovery, monitoring, and the separately approved future HA design when one is requested. |
| Availability target | Current one-server availability is retained; the conversion adds replica-set capability, not host redundancy. | Planned maintenance/write stop, backup/recovery owner, communication, and explicit future HA path. |
| Data-transfer mechanism | **Current conversion:** none; the existing volume remains authoritative. **Future parallel target:** verified physical/logical source-to-target transfer. | Current backup/restore proof stays separate from any later transfer tooling and authority cutover. |
| Change Streams policy | Remain on fallback initially; experiment in staging; optionally enable only after a target-only production fallback soak. | Driver order, required metrics, promotion authority, and tested rollback configuration. |

The one-member production choice is explicit: it enables replica-set features
but does not claim host redundancy or failover. That limitation is recorded,
not treated as a blocker to the chosen outcome. A later multi-member or parallel
target must use resolvable member names, dedicated member volumes, internal
authentication, and its own rehearsal before data or writer authority moves.

### Old-to-target continuity map

For the selected in-place conversion, use this as a before/after continuity
checklist with no source-to-target transformation. For a future parallel target,
it becomes the mapping to complete before writer authority moves. "Same"
means preserve the exact logical contract; it does not mean assume the target
will recreate the item automatically.

| Current source / contract | Target state | Transformation rule | Acceptance evidence |
| --- | --- | --- | --- |
| `MoFACT-meteor3` application database (or the protected, environment-specific configured database name) | Same logical database on the replica-set primary. | Keep the namespace and document data unchanged unless a separately approved migration says otherwise. | Exact inventory of collection names and source/target document-count snapshots; targeted semantic checks. |
| Collection documents and `_id`-based relationships: learner histories, model/experiment state, users, roles, TDFs, courses/assignments, content, settings, caches, and audit/backup records | Same document shapes, `_id` values, references, and lifecycle meaning. | No renaming, transformation, re-keying, or re-interpretation in this project; preserve historic collection names, including `dynaminc_settings`. | Referential/semantic spot checks: sign-in, course access, launch, response/history write, resume, content edit, and administrator workflows. |
| Collection metadata: indexes, collection options, validation rules, TTL behavior, and any MongoDB-managed metadata | Equivalent metadata on the target. | Inventory and restore/recreate deliberately; do not infer metadata coverage from a document-only export. | Source/target index and collection-option comparison, startup index checks, query-plan checks for critical paths. |
| MongoDB root/app identities and roles | Intentionally bootstrapped/verified identities with the same least-privilege application capability. | Do not put secrets in the migration record. The existing shell backup archives the application database, while the Compose bootstrap creates the app user only for a fresh data directory; verify/provision admin and app users separately. | Authenticated app connection, role/privilege review, and a staging Change Streams authorization check. |
| `MONGO_URL`/`MONGO_URI` consumers: app containers, hotfix/native paths, CI/staging inputs, Compose health/dependency gates, backup/restore tools, operators, and MCP/sidecar/tunnel tooling | Private URI with replica-set seed hosts, the chosen `replicaSet` name, application database, and required `authSource`, or an explicitly designed managed-service/tunnel contract. | Update every consumer in one controlled cutover; remove single-container/single-host assumptions, use resolvable hostnames, and keep credentials private. | Protected configuration inventory; connection and primary-failover tests from every supported runtime path; backup/restore and sidecar proof against the selected target. |
| Dynamic assets, uploaded resource files, object-storage data, settings, environment files, and key material | Same associated external state as the selected database snapshot. | Back up/snapshot independently; MongoDB data alone is not sufficient. | Manifest/checksum or storage-snapshot evidence plus asset/resource smoke tests. |
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

This table applies only to a future parallel-target migration. The selected
in-place conversion never changes data authority and must not perform a copy or
cutover merely to enable Change Streams.

| Cutover point | Authoritative database / allowed writers | Required action if the step fails |
| --- | --- | --- |
| Before the maintenance window | Source standalone only; normal production writers may use it. | Continue operating the source and repair/rehearse the target. |
| During final snapshot/export and target restore | Neither database; all production writers are stopped. | Abort before target writes, retain the source as authority, and investigate from preserved evidence. |
| After continuity validation and URI cutover, before normal traffic | Target replica set only; start only target-connected application instances. | If the target has not accepted application writes, stop it and return the URI/configuration to the source under the runbook. |
| After the target accepts any production write | Target replica set only; old source is locked read-only. | Do not automatically return traffic to the source. Use a separately approved recovery/reconciliation plan if the target must be abandoned. |

### Branch 2 future option — Parallel target replica set and true data transfer

Use this later if the maintainer chooses high availability, a new server, or a
platform move. Build an
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

### Branch 2 selected current path — In-place standalone-to-replica-set conversion

This is the approved current path. It is a topology conversion, not a copy into
a new application database: MongoDB starts the existing data-bearing node as
the initial primary once a replica-set name and member-authentication keyfile
are configured and the set is initialized. It enables Change Streams but does
not provide host redundancy. The configuration must remain extensible: do not
hard-code application logic to one member, and preserve the ability to add
members or execute the parallel-target procedure later.

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
   `METEOR_REACTIVITY_ORDER=polling` still forced. Do not provision or select
   oplog as part of this plan.
7. Run the mapping-table acceptance evidence and retain the old standalone
   configuration/backup as recovery material until the migration is accepted.

### Cutover validation and rollback boundary

Before allowing normal writes, record source and target evidence without
retaining learner data in source control or handoff notes:

- MongoDB version/FCV, replica-set name, member health, election state,
  replication lag, oplog window, connection/auth status, and backup success;
- collection/index/collection-option inventories and document-count snapshots;
- authentication/role checks and representative learner history, model-state,
  course, content, asset/resource, audit, and backup-control checks;
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
3. In isolated staging only, apply the explicit qualification gate and switch
   the exact order from `polling` to `changeStreams,polling`; execute Phase 4's
   workload and promote only when data correctness and operational thresholds
   pass. Do not remove the order override, because Meteor's default would also
   admit the unapproved oplog driver.

**Topology/data-continuity exit gate:** the in-place conversion and applicable
continuity-map rows have evidence and the one-member replica set is operationally
owned. Only a later parallel-target migration requires an old/new authority
boundary rehearsal.

## Phase 0 — Select the Exact Target and Capture Evidence

1. Apply this release-selection algorithm immediately before implementation:

   1. enumerate official stable Meteor 3.5 tags and ignore betas, RCs, branches,
      PR builds and `latest`;
   2. choose the newest stable 3.5 patch whose final changelog/package set,
      Node/npm tuple and open-regression review pass the compatibility gate;
   3. require stable fixes before the separately deferred `uws` and DDP
      resumption experiments, while using post-3.5.0 Change Streams fixes as
      named qualification scenarios rather than an entry prohibition;
   4. if stable `METEOR@3.5`/tool 3.5.0 remains the selected release, proceed
      with the polling/SockJS/zero-grace base and the isolated stable-3.5.0
      Change Streams qualification as separate configurations; and
   5. record the release tag/commit, tool/package graph, Node/npm versions,
      builder/runtime image tags and digests, application source and settings
      fingerprint as the immutable candidate identity.
2. Read the selected release's official changelog and enumerate changes to the
   core Meteor packages, bundled Node/npm, Mongo driver, Accounts, EJSON/DDP,
   and WebApp. Record that Rspack is an existing 3.4/3.4.1 capability, not a new
   3.5 benefit. Update the issue-disposition register from shipped code. Do not
   install prerelease code; use focused stable-3.5.0 testing and polling rollback
   to decide the Change Streams production disposition.
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
4. Build a repeatable concurrency harness only before making a quantified
   MoFaCTS capacity, speed, or memory claim. Focused correctness and recovery
   work does not wait for that harness.
5. Before an externally consequential production action, name the owner for
   that action, its protected evidence, alerts, and recovery decision. Missing
   operational ownership blocks that production action only; it does not block
   independent repository implementation or static verification.

The pre-implementation inputs described one standalone Compose `mongodb`
endpoint. The current candidate instead declares a named one-member replica set,
polling, and SockJS. Neither source state proves the live production process or
database; sanitized runtime facts remain required immediately before a live
conversion or production recommendation.

**Phase 0 repository exit gate:** the exact stable candidate and containment
settings are locked, source/dependency intent is unambiguous, and mandatory
upstream issues have a shipped-fix or the affected capability remains disabled.
Protected production facts and owners are required only before their associated
live action; workload and numeric-threshold approval is required only for a
quantified performance claim.

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
   Trace the stable 3.5 Accounts initialization and settings reader to select
   exactly one canonical owner for documented `clientStorage: "session"`; do
   not configure both the documented `accounts` example and older
   `accounts-base` reference. Inventory every `authStorage.ts` mutation and
   private token-storage read so A1 can remove only behavior superseded by the
   documented contract. Document what refresh, two-tab, logout, redirect,
   expired-token and resume behavior depends on it. Cover health,
   backup/own-history token downloads, uploaded resources, PWA, social
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
   authentication; per-tab session persistence; representative Android-browser
   and installable-web-app behavior; and the custom package API surfaces. The
   native Cordova Android target is not part of the product.
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
10. Prove no TDF field/config/schema change is required through the cross-repo
    field/registry audit and focused tests for any upgrade-owned TDF boundary.
    The current implementation changes no registry, schema, config key, or TDF
    reader contract, so representative upload/launch/response/resume coverage
    remains ordinary CI/release evidence rather than a Phase 1 gate.
    `npm run generate:schemas` is required only if an implementation actually
    changes the registry or schema; this unchanged upgrade must produce no
    generated schema diff.
11. Trace the `learning-components` history envelope and pedagogical consumers
   through the app facade. Verify new/freshly reconnected trials, ordinary versus
   uploaded-resource trials, feedback/model-state, restore and resume preserve each existing
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

1. Preserve `.meteor/release`, `.meteor/packages`, `.meteor/versions`, the npm
   lockfile, and every release/toolchain consumer unchanged through E0a. If
   current stable `METEOR@3.5` remains selected, begin A2 by running
   the official command exactly on a clean, intentionally scoped working tree:

   ```bash
   meteor update --release 3.5
   ```

   If Phase 0 selects a later stable patch, use that patch's official exact
   release identifier instead. Run without suppressed output or ignored exit
   status. Do not manually edit `.meteor/release` before this command. Review
   every change to `.meteor/release`, `.meteor/packages`, `.meteor/versions`, and
   the npm lockfile. Confirm the resulting release/tool identity and reconcile
   all direct constraints with the selected release set.
2. In the same A2 worktree and review package, update the complete
   release-consistency set together:

   - `mofacts/.meteor/release`;
   - `mofacts/.meteor/packages`, `.meteor/versions`, and
     `mofacts/package-lock.json`;
   - `mofacts/package.json` `engines`, npm ownership, and an exact
     `mofacts/.nvmrc` matching the selected release's bundled Node
     and affected npm package constraints;
   - the explicitly approved official or third-party `Dockerfile` builder image
     by exact tag/digest and matching build/runtime Node images;
   - `deploy/docker-compose.local.yml` hotfix builder and runtime images;
   - `.github/workflows/ci.yml` exact Meteor and Node/npm setup;
   - Docker bundle dependency overrides for `@mapbox/node-pre-gyp`, `node-gyp`,
     and `underscore`, verifying whether every override is still necessary;
   - deploy-time reactivity/transport setting examples and
     `docs/deployment/settings-reference.md`;
   - `deploy/README.md`, `docs/development.md`, and any release/version docs;
   - a build/startup assertion that prints only safe exact release/tool/runtime
     identities and fails on drift.

   Do not commit, stage for promotion, or treat as a buildable checkpoint any
   intermediate state in which `.meteor/release`, the resolved Meteor package
   graph, Node/npm ownership, builder/runtime images, CI, or hotfix pins
   disagree. The official updater output and all owning pins are one atomic
   framework/toolchain transition.

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
   METEOR_REACTIVITY_ORDER=polling
   DDP_TRANSPORT=sockjs
   ```

   Use the equivalent private settings only where officially supported, and set
   `Meteor.server.options.disconnectGracePeriod = 0` from an owned, validated
   server-startup contract. Record which
   reactivity mechanism and transport are actually active in each environment.
   The contained-base value is always `polling`, regardless of whether Phase 0
   discovers an oplog-capable environment; adopting oplog is outside this plan
   and requires separate approval. This isolates Change Streams and `uws` and
   disables session retention; it does **not**
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
5. Run the normal static checks and focused automated tests for upgrade-owned
   changes. Require the exact framework/Node/npm graph, deterministic amd64
   build and ABI assertion, clean application startup, health response, Mongo
   connection validation, canonical Accounts client-storage configuration, and
   EJSON backup round trip. A local `npm run test:ci` invocation still requires
   fresh, single-use maintainer authorization; when it is not authorized or the
   client runner is unavailable, preserve its CI ownership and continue unless
   existing evidence reveals a concrete client compatibility defect.
6. Use ordinary CI and release smoke coverage for unaffected authentication
   providers, routes, asset/download handlers, background jobs, admin/content
   flows, learner flows, reconnect permutations, Android-browser installation,
   and TDF examples. These surfaces become A6 blockers only when the upgrade or
   an upgrade-owned source change affects their contract or a focused check
   exposes a regression. Conditional Meteor APIs such as Minimongo async
   iterators or HttpOnly-cookie login are `N/A` when MoFaCTS does not use them.

**Phase 2A exit gate:** the selected Meteor release and exact runtime graph pass
the normal static checks, focused upgrade-owned tests, deterministic amd64
build/ABI assertions, and startup health with forced polling, `sockjs`, and
grace period zero. No known technical defect contradicts the candidate, and no
database migration or unapproved product behavior was introduced. Broader CI,
browser, provider, workload, or staging evidence is follow-up release evidence,
not a blocker by absence alone.

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
   history inserts, MTurk
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

### Phase 2C — Cancelled Separate Production Rollout

The maintainer cancelled Phase 2C on 2026-08-02. It is not an entry gate,
production action, work package, or prerequisite for any later phase. The A6
candidate remains the accepted contained base, and its first production
deployment now occurs within Phase 5A with polling after the converted database
has passed authenticated replica-set readiness. This intentionally trades the
extra standalone-database production step for one maintenance sequence; Phase
5A therefore owns both exact A6 app compatibility and database-platform
acceptance before traffic returns.

## Phase 3 — Production Database Qualification or Target-Transfer Rehearsal

1. Before the authorized conversion, capture the real production state using
   safe administrative checks: `db.hello()`, version/FCV, storage engine,
   authentication, database inventory, backups, external assets and all URI
   consumers. Do not infer those runtime facts from a URI or Compose file.
2. Execute the selected branch-2 in-place conversion on the existing service
   and data volume. Use a stable configurable replica-set name, an explicit
   DNS member address, keyfile member authentication, and an idempotent
   initializer. Keep the logical database and writer authority unchanged. A
   second server and a data copy are not prerequisites.
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
   `deploy/hotfix/run-bundle.sh`,
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
5. Preserve `METEOR_REACTIVITY_ORDER=polling` on the accepted/target platform
   and capacity-test that exact rollback contract. Do not provision
   `MONGO_OPLOG_URL` or add oplog selection in this plan; oplog adoption requires
   a separate capability decision and qualification package.
6. Keep `/health` as liveness and add a distinct bounded readiness contract for
   MongoDB, Redis and required storage. Readiness must use the shared URI
   contract, fail closed without leaking topology/credentials, and react to
   primary loss after startup. Align Compose health/dependency and deployment
   verification with the correct probe; do not turn transient dependency loss
   into an unbounded restart storm.
7. Rehearse the same in-place conversion against a disposable restored copy.
   Prove that the existing data volume starts with replica-set configuration,
   initializes exactly once, elects the member primary, accepts the authenticated
   application URI, preserves users/indexes/options/data, and restores polling
   operation. Record that one member has no host-level failover; do not require a
   simulated multi-server architecture that is not part of this change. Pin the
   exact MongoDB image/patch and FCV before production execution.
8. Select and verify a topology-grade backup/restore mechanism before the live
   conversion. A successful restore rehearsal, not an arbitrary performance
   threshold, is the gate. The parallel-target transfer rehearsal is required
   only when that future migration is actually selected.
9. Write the in-place conversion runbook before touching production. It names
   the write-stop, backup/verification point, keyfile placement, replica-set
   initiation, URI update, post-conversion checks, abort point, recovery owner,
   and communication. Once the converted primary accepts writes, recovery uses
   the converted database or the verified backup; it does not run the old and
   new configurations as concurrent authorities.
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

**Phase 3 exit gate:** repository configuration and a disposable-copy rehearsal
prove the selected in-place conversion, authenticated primary readiness,
backup/restore, unchanged logical data, and every URI/sidecar/operator consumer.
The repository rehearsal may use synthetic representative data; the separately
authorized live conversion still requires a protected-backup restore rehearsal
with the real continuity inventory before writer authority changes.
The live conversion then requires explicit production authorization and its
protected backup/runtime evidence. Lack of multi-server failover does not block
this one-member outcome; a future parallel or multi-member move gets its own
authority and rehearsal.

## Phase 4 — Change Streams Qualification

**Entry gate:** stable Meteor 3.5.0 is the selected candidate and Phase 3's
converted isolated platform, backup, URI, readiness, and recovery contracts
pass. The known post-3.5.0 fixes in the upstream register are mandatory test
scenarios, not prerequisites. No beta or release-branch artifact is used.

1. Only in the isolated replica-set staging experiment, change the explicit
   order from `polling` to `changeStreams,polling` and set
   `MOFACTS_CHANGE_STREAMS_QUALIFICATION=true`. The application must reject the
   changed order without that explicit gate and reject the gate when the order
   does not match. The tracked
   `deploy/docker-compose.change-streams-qualification.yml` overlay owns this
   isolated difference; the base, local, staging, and hotfix definitions remain
   pinned to polling. Do not exercise Meteor's
   upstream default `changeStreams,oplog,polling`, because oplog adoption is not
   approved by this plan. The configured order is global, while actual driver
   selection is per cursor. Polling is the intentional driver for ordered/
   paginated cursor shapes that Change Streams cannot own; verify from
   application/database evidence which driver owns each tested cursor.
   Meteor documents no stable public
   per-observer driver-introspection API: use declared configuration, supported
   logs/APM, MongoDB stream/operation evidence, and behavior tests rather than
   production code that reaches into private observer-driver fields.
   The manually triggered
   `.github/workflows/meteor-35-change-streams-qualification.yml` workflow is
   the repository-owned execution path for the opt-in client/server observer
   and write-fence matrix. It uses stable Meteor 3.5 and a disposable MongoDB 8
   replica set; it never installs the beta or touches a protected database.
   The workflow uses a test-only MongoDB failpoint to inject error 286 and then
   restarts the disposable one-member primary while client subscriptions remain
   active. Both cases require post-fault reactive delivery and write-fence
   completion; no production failpoint or private observer-driver hook is added.
2. Use the completed static inventory in
   `docs/deployment/meteor-3.5-implementation-record.md`. Exercise an unordered
   equality/`$in` publication, `filteredUsers` or `pagedTdfsListing` as the
   ordered/paginated polling-owned path, the exact-id server-verbosity manual
   observer, an unsupported or nested projection, initial snapshot with a
   concurrent write, a login-style write fence, stream restart/history loss,
   and primary election. Add a
   MoFaCTS flow only when it owns one of those contracts; do not turn unrelated
   product surfaces into phase gates. For any TDF projection exercised, assert
   excluded speech/TTS/OpenRouter secret fields remain absent from both the
   initial snapshot and reactive updates.

3. Compare the fallback and Change Streams runs using:

   - method latency, publication readiness/propagation time, DDP reconnect
     behavior, error rate, and correct client-visible updates;
   - app CPU, RSS/heap/GC, event-loop pressure, subscription count, and
     process restarts;
   - MongoDB CPU/memory, connections, operation rates, open streams, query
     plans/index use, slow operations, replication lag, and disk I/O;
   - integrity checks on learner histories, model state, assignments, content,
     and authentication/audit records.

4. When claiming a measured MoFaCTS speed, memory, or capacity improvement, run
   at least one comparable polling/Change-Streams workload and report the
   workload, variance, and limitations. Additional alternating runs are useful
   when variance makes the result ambiguous, but an arbitrary run count is not
   an implementation gate.
5. Keep the capability when focused correctness/recovery checks pass and the
   database remains within safe operating bounds. Narrow broad selectors or add/verify indexes
   where evidence identifies a query problem. The 3.5 driver order is global;
   do not invent an unsupported per-cursor force-driver setting. Record the
   defaults—100 ms restart delays after error/close and a 1000 ms
   `waitUntilCaughtUpTimeoutMs`—and do not tune them until restart behavior and
   read-your-writes have been explicitly tested. The catch-up timeout does not
   lose the later stream event, but it can temporarily let a subscription
   become ready before the client's own write appears.

**Phase 4 exit gate:** active-driver evidence plus the focused observer,
write-fence, restart, integrity, and database-capacity checks pass. Quantitative
A/B evidence is additionally required only for a quantified performance claim.
Any integrity/fence/restart-loop or capacity breach restores polling and is a
technical blocker for production Change Streams.

### Phase 4B — Hotfix Server on Localhost First

1. The first non-test Change Streams runtime is the one canonical hotfix server
   running on `http://localhost:3200`. Do not create a second local application
   server.
2. Manage that server only with `deploy/hotfix-local.ps1`. The script owns the
   native Meteor/Rspack source watcher and uses exactly
   `deploy/docker-compose.yml` plus `deploy/docker-compose.local.yml` for the
   local MongoDB service and its named one-member replica set. Do not start a
   second native process, Docker application container, or localhost
   application overlay on port 3200.
3. Set `MOFACTS_CHANGE_STREAMS_ENABLED=true` and
   `METEOR_REACTIVITY_ORDER=changeStreams,polling` in the environment owned by
   the canonical local management script.
   Do not set the test-only `MOFACTS_CHANGE_STREAMS_QUALIFICATION` flag.
   Base, staging, and production configurations remain explicitly on polling.
4. Require healthy application startup, the startup mode log, an active
   `$changeStream` in sanitized MongoDB operation evidence, and focused login,
   publication, learner-history, content, and admin smoke on localhost.
5. Use the hotfix server during normal local work before requesting a production
   configuration change. A quantitative performance claim still requires a
   comparable workload; ordinary local use is correctness and operational
   evidence.

**Phase 4B exit gate:** the hotfix server at `localhost:3200` is healthy with
Change Streams explicitly active and the focused local flows remain correct.
Failure restores only the hotfix reactivity setting to polling and does not
undo the local replica-set topology.

The repository previously supplied separate native-watcher and Docker-bundle
management paths, with both described as localhost hotfix servers. That
duplication caused operators and agents to select different application
instances while using the same name and port. Phase 4B consolidates ownership
under `deploy/hotfix-local.ps1` while retaining the source-watching native
Meteor/Rspack workflow. The canonical script stops and removes any obsolete
Docker application container before starting the watcher; Docker continues to
own MongoDB and replica-set initialization. The invariant is one application
version, one application port owner, and one management script—not one process
or an all-Docker runtime.

**Completion record (2026-08-02):** `deploy/hotfix-local.ps1 status` reported the
canonical app and local MongoDB healthy and verified four active Change Streams.
The authenticated localhost browser smoke reached `/home` with 17 published
lessons (14 in progress and 3 new), loaded the populated `/dataDownload` owned-TDF
table and learning-history action, rendered `/contentUpload`, rendered live
server state in `/adminControls`, loaded persisted user-learning metrics in
`/userAdmin`, and continued `Times_Tables` to the learner `/content` screen with
the active response control. Browser warning/error capture was empty. No data
download, admin mutation, or learner answer was submitted.

## Phase 5 — Production Database Acceptance and Optional Change Streams

The production-only execution sequence for the already prepared release is
maintained in
`docs-developer/meteor-3.5-production-cutover-steps-4-13.md`. That runbook adds
the externally served maintenance page, preserves separately authorized gates,
and records the exact Steps 4-13 cutover order. The Phase 5 contracts below
remain authoritative; the cutover runbook translates them into operator-sized
actions.

### 5A — Production database-platform acceptance with fallback reactivity

**Entry gate:** A6 and Phase 3 are accepted; the in-place conversion rehearsal,
backup/restore, readiness, and runbook are current; the real app/proxy topology
is represented accurately; and the post-write recovery path is explicit.

1. Verify the topology-grade backup of MongoDB, private
   settings, environment files, dynamic assets, uploaded resources and key
   material. Record safe source/image/settings identities as required by
   `docs/deployment/upgrade-guide.md`. Lock the exact A6 application artifact
   and its Phase 3 fallback fixed to `polling`.
2. Begin the maintenance window and stop every application, job, admin, and
   external writer. Confirm the verified backup and keyfile are available before
   changing MongoDB startup configuration.
3. Restart the existing data-bearing service with the configured replica-set
   name and member-authentication keyfile. Run the idempotent initializer once,
   wait for the current member to become writable primary, and update every
   private URI consumer to include the same replica-set identity. Do not copy
   data or introduce a second writer authority.
4. Validate users/roles, collections, indexes/options, representative data,
   assets, backups, and readiness while writers remain stopped. Then deploy the
   exact A6 artifact with polling, confirm its release/runtime/config
   fingerprint and database connection, and run representative learner and
   admin checks before reopening traffic. Record the one-member no-HA
   limitation.
5. Before the converted primary accepts application writes, an abort may restore
   the rehearsed standalone startup configuration and exact 3.4.1 app/config.
   After it accepts writes, retain the replica-set configuration and recover
   forward or use only a last-good app artifact already proved compatible with
   the replica-set URI; do not run standalone and replica-set forms concurrently.
6. Run focused operator/learner smoke checks and observe normal production
   operation with polling. Only a concrete correctness, readiness, recovery, or
   capacity failure blocks acceptance; missing optional evidence does not.

**Phase 5A exit gate:** the existing database is a healthy authenticated
one-member replica set, the exact A6 application is running with polling, the
logical data and writer authority are unchanged, all supported URI consumers
connect to the named set, backup/recovery and readiness pass, and focused smoke
plus the polling-mode production soak show no concrete regression.

### 5B — Production Change Streams rollout

1. A Phase 4 **adopt** result, a successful Phase 4B hotfix-localhost rollout,
   and the Phase 5A polling-mode production soak are all
   prerequisites. Staging qualification does not authorize Change Streams in
   production before Phase 5A accepts the converted platform.
2. Apply the exact C1-qualified `changeStreams,polling` order and its explicit
   gate only through the approved production configuration change; do not
   remove the explicit order and thereby select Meteor's unqualified oplog
   alternative. Then confirm the expected reactivity driver and
   monitor the agreed application, MongoDB, correctness, and reconnect
   metrics through a 24-hour soak spanning a peak period.
3. If a reactive-behavior problem appears, restore:

   ```text
   METEOR_REACTIVITY_ORDER=<the tested Phase 3 fallback>
   ```

   Replace the placeholder with `polling`; do not deploy it literally or select
   oplog. Confirm polling is active and re-run the affected flow. Roll
   back the app image/configuration only if the framework issue remains. Do not
   roll back database data or topology merely to reverse Change Streams.
4. Promote documentation changes, release notes, measured outcomes, selected
   driver configuration, topology ownership, and any operational warnings only
   after the Change Streams soak succeeds.

**Phase 5B exit gate:** active-driver evidence and the authorized production
observation show no correctness, stability, or database-capacity regression.
Any such regression restores polling. If a technical blocker or topology/
authority design question remains, the base Meteor/runtime remains valid but
the Change Streams objective remains explicitly incomplete rather than being
silently reclassified as a successful defer result.

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
| Phase 0 source/artifact identity | Record the supplied known-good 3.4.1 source/artifact identity, dirty-tree disposition, selected 3.5 release, and immutable amd64 base-image identities without exposing private settings or rebuilding the old application. | Local read-only inspection and safe implementation record; release engineering. |
| Release/package graph | Unsuppressed successful exact-release updater; reviewed `.meteor/release`, direct/resolved Atmosphere packages and npm lockfile; `meteor --version`, `meteor node -v`, `meteor npm -v`, bundle `.node_version.txt`, image metadata/digests and startup assertions all match. | Clean implementation checkout/change record; release engineering. |
| TypeScript/JavaScript/Svelte | From `C:\dev\MoFaCTS\mofacts`: `npm run typecheck`, `npm run typecheck:vendor`, and `npm run lint`. Required checks must pass before staging/commit/push. | Local/CI under selected Node; application owner. |
| Meteor integration | CI `npm run test:ci`, plus focused auth, methods, publications, EJSON, Mongo-error-policy, HTTP, Rspack/Svelte/roles and native-module tests. A local invocation needs fresh explicit single-use maintainer authorization every time. | Supported CI/Meteor environment; test/application owner. |
| TDF/schema compatibility | Representative config-repo TDF upload/validation/launch/response/resume. Run `npm run generate:schemas` from `mofacts` and inspect generated diffs **only** if a registry/schema field changes; no schema change is expected. | App + `C:\dev\mofacts_config`; content/schema owner. |
| Build/runtime | Clean `linux/amd64` bundle from the pinned OCI indexes; recorded amd64 child digests; native Argon2 and SWC/Rspack; dependency install under bundle-declared Node; bounded build exit/no orphan; process shutdown; exact artifact checks and an amd64 smoke test. | CI and production-shaped Docker Compose/staging. Docker build/hotfix execution requires explicit user authorization. |
| DDP contained baseline | Active polling-driver evidence, SockJS network paths and grace-period-zero fresh reconnect; auth/per-tab/attempt identity; in-flight write and reconnect-storm correctness. | Staging matched workload; application/release owners. |
| Phase 5A combined production acceptance | Exact A6 fingerprint with polling; authenticated replica-set readiness; unchanged data/authority; all URI consumers; critical synthetic/operator flows; protected backup/recovery evidence; and a 24-hour peak-period polling soak. | Separately authorized production maintenance change; release/database/change authority. |
| DDP resumption experiment | Short/long, resumable/non-resumable/process-replacement, overflow/HCP/logout/provider matrix; public `sessionResumed`, replay/side effects, memory/queue/workload gates; zero-grace rollback. | Stable fixed patch in staging; application/security owners. |
| URI/readiness/operations | Connection strings remain opaque to shell/PowerShell and are passed to a supported Mongo client; connected `ping`/`hello`, database-name and redaction evidence; no secret output; liveness/readiness distinction; election/failover from every affected app, hotfix, backup/restore, sidecar/tunnel and operator path. An offline parser corpus applies only if its exceptional need and direct dependency are separately approved. | Isolated accepted/target platform; release/database/security owners. |
| Branch 1 existing-platform acceptance | Sanitized live branch proof; exact platform/FCV/security/pool; at least one representative isolated restore, repeated after failure/material change or inadequate RTO margin; production-shaped failover; unchanged-authority/config rollback; operator/synthetic flows and 24-hour fallback soak. | Representative staging then separately authorized production correction/acceptance; database/change authority. |
| Branch 2 target transfer | At least one timed representative fresh-target rehearsal, repeated after failure/material change or inadequate RTO margin; frozen-source identity; encrypted/checksummed backup; continuity map, indexes/options/TTL/users/roles/assets/URI consumers; RPO/RTO, target-only authority and forward-recovery drill. | Isolated target then separately authorized maintenance window; database/change authority. |
| Change Streams | Stable 3.5.0 artifact identity; active-driver evidence; focused ordered/unsupported/pagination/projection/snapshot/restart/history-loss/operation-time/write-fence cases; comparable A/B workload only for quantified performance claims. | Replica-set staging, then separately approved production change; application/database owners. |
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
| Stable Change Streams retains known defects. | Projection crash, fence/login hang, operation-time error or history-loss restart/log storm appears in the mandatory stable-3.5.0 qualification scenarios. | Enter Phase 4 only on the isolated platform. If a defect is reproduced, record **defer**, restore polling, and capture redacted evidence; do not promote Change Streams to production. | Application/database |
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
| E0a — read-only source, artifact and immutable-candidate lock | Make no repository edit. Record the source commit, dirty-tree disposition, supplied known-good 3.4.1 rollback identity, candidate Meteor builder and Node 24.15.0 Alpine OCI index identities, their `linux/amd64` child manifests, and the intended A2 release-consistency set. Inspect candidate indexes without changing their consumers. Do not reconstruct or rerun the 3.4.1 application. | Evidence proves unrelated work is dispositioned; the supplied last-good identity is recoverable; both candidate indexes contain the required `linux/amd64` target; amd64 child digests are recorded; and A2 has one bounded file/owner set. An ambiguous source/artifact identity stops before implementation. | First activity and prerequisite for every A/D/C/O source package; no commit or framework-owned edit. |
| E0b — safe telemetry (conditional commit/config package) | Reuse current operations signals; add only a missing bounded app/DDP/Mongo/artifact signal required by a later gate, with privacy/access/retention controls. Do not create a new monitoring platform. | Synthetic signal/alert/redaction tests and operations/security approval. | Revert instrumentation/config without changing product/data semantics; depends E0a. |
| I1 — durable identity inventory/decision (no code commit) | Inventory all overloaded `sessionID` writers/readers; approve preserving their current meanings/grace zero. Document a separate future semantic-migration boundary. | Data/application owner sign-off; no field/schema/value change. | No mutation; prerequisite for contained base and any later resumption design. |
| D1 — opaque URI and readiness security (base prerequisite) | Before A1/A2, remove shell/PowerShell and server single-host parsing from the existing app/deploy/hotfix paths; pass the URI opaquely to the supported driver/`mongosh`, validate the connected database and required authentication/capabilities with `ping`/`hello` or driver facts, redact errors, and keep database platform/authority unchanged. Add a direct parser only through a later separately approved exception. | Existing approved URI forms connect; selected database and required capabilities are asserted; wrong target/auth fails closed; no URI/credential reaches output; liveness remains distinct from readiness. | Revert before candidate use; do not add a parser or platform migration. This base security prerequisite is the only D-series work pulled ahead of A2. |
| A1 — documented per-tab Accounts storage | Trace stable 3.5 initialization to select exactly one canonical settings owner for documented `clientStorage: "session"`; configure that owner, then remove `Accounts.storageLocation` assignment, private `_storage`/token-method overrides, `_sessionStorage` access, and migration code only where the documented contract supersedes them. Preserve existing per-tab UX and do not configure both `accounts` and `accounts-base`. If the documented contract cannot preserve parity, stop as a compatibility blocker rather than preserving or inventing a private fallback. | Password/token/Microsoft OAuth/Memphis SAML success and failure; reload; two tabs with distinct users; close/reopen; one-tab logout; redirect; expired token; fresh reconnect; no token in `localStorage`; token only in the intended tab's `sessionStorage`; explicit canonical-settings-owner assertion. | Revert this auth-only commit; no durable identity change, dual-key configuration or private compatibility fallback. |
| A2 — atomic framework/package/toolchain transition | After E0a, run `meteor update --release 3.5` unsuppressed and, in the same worktree/review package, align `.meteor/release`, direct/resolved Meteor and npm graphs, verified builder/Node index pins, exact `.nvmrc`/engines/package-manager policy, CI/hotfix consumers, version assertions and updater observability. Do not manually edit the release first or create an intermediate commit. | Complete diff proves every release/package/toolchain consumer agrees; clean updater re-run yields the same graph; amd64 image identities are asserted; no update failure is hidden; no intermediate mismatched state is staged or promoted. | Revert the complete release/package/toolchain set; depends E0a, I1, D1, A1 and Phase 1 dispositions. |
| A3 — resolved ABI and build validation | Validate A2's unified Meteor/npm/image solution; assert the built bundle's `.node_version.txt`, rebuild target-platform native modules, verify package-manager identity, and remove unjustified incompatible-update flags. Do not introduce a second set of release or image pins. | Bundle/manifest assertions, target-platform native closure and config validation; final clean build proof occurs after A5 in A6. | Revert A3 with the complete A2 artifact; no database/config contract changes. |
| A4 — containment settings | Wire proven fallback reactivity, SockJS and an app-owned startup mapping to `Meteor.server.options.disconnectGracePeriod = 0`; add safe behavior diagnostics. | Static/config propagation and redaction tests; full contained workload occurs in A6. | Revert settings/startup commit; depends A2–A3. |
| A5 — compatibility fixes (conditional; one commit per surface) | After A2–A4 assemble the candidate, fix only proven Rspack/roles, Mongo error-policy, EJSON, OAuth/SAML/Accounts, WebApp or native issues. | Focused unit/integration/auth/security/native tests; no unrelated surface in one commit. | Revert each surface independently; every blocker resolves before A6. |
| A6 — base 3.5 acceptance | Confirm the exact runtime graph with normal static checks, focused upgrade-owned tests, deterministic amd64 build/ABI evidence, and startup health, without enabling later capabilities. | Proportionate evidence covers changed contracts; missing broad regression or benchmark evidence is tracked through ordinary CI/release work and does not block by itself. | Revert base artifact before DB contract changes. |
| S1 — DDP resumption experiment (conditional) | On a stable fixed patch only, enable default grace/queue in staging and add replay, revocation, identity, queue/memory and same-process coverage. | Phase 2B adopt/defer record. | Grace period zero; independent of DB/Change Streams. |
| D0 — topology decision and protected preflight | Use the approved in-place one-member design; capture sanitized live standalone/version/FCV/backup facts before execution. | Repository design is explicit; production facts contain no URI, keyfile, or credential. | No live mutation; prerequisite for production execution. |
| D2 — deployment/sidecar ownership | Use one required opaque topology-capable URI and exact connected-set validation; remove stale DB-name/single-container/tunnel assumptions; align wait-host, health and operator paths. | All Compose variants render; exact-set/ping validation tests pass; the isolated polling app connects through the canonical path. Multi-member election behavior is tested only when a second member exists. | Restore old path only while old source remains authoritative; depends D1. |
| D3 — in-place replica-set configuration and rehearsal | Configure keyfile authentication, named-set startup, idempotent initialization, exact-set readiness, and opaque replica-set URIs. Rehearse against a disposable restored copy. | Existing data/users/indexes remain intact; member becomes writable primary; polling app startup and backup restore pass. | Production source remains unchanged during repository work and rehearsal. |
| D4 — in-place conversion runbook/docs | Document write stop, backup, keyfile placement, initialization, URI updates, validation, abort boundary, recovery, and the one-member no-HA limitation. Preserve a separate future parallel-target path. | Focused tabletop and one authoritative operator path. | Documentation/config can be reverted before live conversion; data authority remains on the current volume. |
| D5 — production in-place conversion | During an authorized maintenance window, convert the existing service/volume with polling retained and no data copy. | Phase 5A exact-set readiness, continuity, smoke, backup/recovery, and normal-operation evidence. | Before application writes, use the rehearsed abort; after writes, recover the converted set or backup without concurrent authorities. |
| D6 — future multi-member or parallel target (optional) | Add members with the shared keyfile or execute the separately rehearsed transfer when HA/server migration is selected. | Member/target-specific security, volumes, failover, continuity, and authority evidence. | Independent of the current one-member outcome. |
| C1 — Change Streams staging qualification (conditional) | On stable 3.5.0, use the explicit qualification gate and tracked isolated Compose overlay to select `changeStreams,polling`; add focused observer/projection/fence/restart and known-defect coverage, with a comparable workload only when making a quantified performance claim. | Fail-closed configuration tests plus Phase 4 correctness/recovery result and active-driver evidence. | Remove the qualification overlay and restore polling; database target remains. |
| C1B — hotfix localhost Change Streams | Enable the qualified order on the hotfix server running at `localhost:3200`, without the test-only qualification flag. | Healthy startup, active-stream evidence, and focused local application smoke. | Restore polling in the canonical local Compose definition; local replica-set topology remains. |
| C2 — production Change Streams config (conditional) | Apply only the C1-approved setting after D5 accepts the converted platform. | Active driver and focused correctness/capacity observation. | Restore exact polling configuration; no data/topology rollback. |
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

| Item | Status through 2026-08-02 | Evidence still required / blocking scope |
| --- | --- | --- |
| Official Meteor/MongoDB/API research and stable-versus-beta distinction | Complete for plan | Re-check mutable stable tags, final changelog and issue register in E0. |
| Main app, learning-components, deploy/CI, config repo and wiki audit | Complete for plan | Re-capture source commits/dirty intent; runtime behavior is not implied by source. |
| Capability classifications, phases, owners, gates, rollback and work sequence | Complete for plan | Named people/teams must accept responsibilities and default thresholds. |
| TDF/config compatibility | No registry/schema change; static compatibility retained | No A6-specific TDF exercise is required because the upgrade did not change a field, registry, or TDF reader contract. Ordinary CI/release smoke coverage remains appropriate. |
| Current stable framework containment | Implemented and accepted for repository progression | Polling, SockJS and grace period zero are wired consistently and the verified amd64 image logged the expected active settings. |
| Exact selected stable patch/package/image graph | Runtime graph implemented; exact current dev-lock image not rebuilt | Meteor 3.5, Node 24.15.0, npm 11.12.1, immutable OCI indexes, synchronized runtime package graphs, build-time drift checks, bundle ABI assertions, and the verified amd64 image identity are recorded in `docs/deployment/meteor-3.5-implementation-record.md`. That image predates the dev-only Playwright ownership correction; an exact current-lockfile rebuild requires new Docker authorization. Commit/push/promotion remain separate. |
| Working-tree/dependency intent | Recorded candidate working tree | The implementation record binds the candidate to the supplied source identity plus reviewed working-tree changes. No commit or push was performed. |
| Protected production facts | Required before Phase 0 exit and all production conclusions | Sanitized Mongo patch/FCV/`db.hello()`, effective driver/settings, app count/proxy timeouts, resource/connection/index/backup/restore/monitoring facts. |
| Overloaded `sessionID` and private per-tab auth ownership | Canonical settings owner implemented; accepted for A6 | Existing identity meanings remain unchanged with grace zero. Public `accounts.clientStorage: "session"` is the sole owner and the private mutation layer is removed. Broader provider/browser-storage permutations remain normal CI/release evidence, not a blocker by absence. |
| Private auth/Rspack/native/Mongo-error compatibility | Bridge accepted; corrected Change Streams qualification executed | The eighth through tenth runs isolated the upstream injection, browser-footer, and external-type boundaries. Injected test/production clients now combine a browser-owned library target with explicit `commonjs2` externals; server and development/HMR ownership is unchanged. The eleventh run proved the repaired bridge executes the client suite. The thirteenth and fourteenth runs exercised the corrected production-shaped mixed-driver cases. The remaining 70 ordinary client failures are a separate release gate, not a Rspack bridge or Change Streams failure. |
| Android web-app support | Packaging disposition complete; not an A6 blocker | Android remains supported through the ordinary installable web application. The unused Cordova platform and APK/AAB wrappers are removed; representative browser testing remains ordinary release coverage. |
| Pre-upgrade baseline and observability | Maintainer-provided baseline accepted | Preserve the supplied known-good 3.4.1 rollback identity; do not reconstruct the old environment. Capacity/performance experiments remain deferred. |
| Database topology branch | Repository implementation and isolated Docker rehearsal complete | The same disposable MongoDB 8.0 volume was converted from authenticated standalone to `mofacts-rs`; data, collection UUID/options/indexes, app-user authentication, PRIMARY readiness, a real Change Stream event, backup/restore, restart, idempotent initialization, and polling-app startup passed. Every Mongo MCP sidecar variant now consumes an opaque topology-capable URI and rejects a standalone or wrong set without leaking it. This requires no second server and preserves later member expansion or a parallel-target migration. Live conversion and protected production evidence remain separate. |
| Backup, RPO/RTO and recovery | Required only for an authorized production topology/authority change | Continue source and isolated-staging preparation independently. Define transfer/freeze/forward-recovery details only if the chosen branch moves writer authority. |
| Change Streams stable-release eligibility | Stable 3.5.0 is eligible for isolated qualification, corrected 2026-08-01 | Official 3.5.0 documentation supports and enables Change Streams by default. The later beta fixes identify targeted crash, fence, projection, and restart risks to test on stable 3.5.0; the beta is not installed. Production adoption depends on the Phase 4 evidence and retains polling rollback. |
| Change Streams qualification configuration | **Enabled in production on 2026-08-05** | Local `rspack@1.1.1` is copied exactly from PR #14562 commit `fa20c29abb4ae30fe78facab2819ce4f5c99e588`. The corrected suite proves dotted projections on Change Streams and the actual `filteredUsers` ordered page on polling under `changeStreams,polling`. The thirteenth run found one active qualification stream and passed history-loss, primary-restart, and login-shaped fence recovery. It also found the real Meteor 3 async-handle defect in `filteredUsers`; awaiting `observeChanges` fixed it, and the fourteenth run passed 565 server tests with 12 pending and zero failures. Production now reports the qualified driver order and 8 active `$changeStream` operations; polling remains second as the configuration recovery path. |
| Canonical localhost Change Streams rollout (Phase 4B) | **Complete on 2026-08-02** | The single localhost application instance is the native Meteor/Rspack watcher managed by `deploy/hotfix-local.ps1`; Docker supplies MongoDB and replica-set initialization, not a second application instance. The application is healthy at `localhost:3200` under `changeStreams,polling`, the status gate found active Change Streams, and authenticated login, publication, learner-history, content, learner launch, and admin flows passed without browser errors. This does not authorize Phase 5A or 5B. |
| Optional capability dispositions | Repository evaluation complete; all independent optionals explicitly dispositioned | Automatic EJSON/DDP allocation changes are part of the stable base without a quantified performance claim. DDP resumption, native async Accounts refactoring, `uws`, async rate matchers, `accounts-express`, and collation are deferred for their named missing need/fix/design evidence; `accounts-2fa` is rejected as out of scope. No optional is partially enabled or blocks Change Streams. |
| Separate contained-base production rollout (Phase 2C/A7) | **Cancelled by maintainer on 2026-08-02** | It is not a prerequisite. The exact A6 artifact is first deployed with polling inside the authorized Phase 5A maintenance sequence after replica-set readiness. |
| Database-platform production acceptance | **Accepted and deployed on 2026-08-05** | The protected backup and restore rehearsal, in-place conversion, continuity checks, authenticated application startup, focused smoke, and recover-forward boundary were completed on the canonical production server and volume. |

**Final classification: `CONTAINED-BASE CANDIDATE IMPLEMENTED; A6 ACCEPTED FOR
REPOSITORY PROGRESSION`.** E0a and the source-owned D1/A1-A4 candidate work are
represented by the implementation record and current working tree. The normal
static checks, server integration suite, deterministic native-amd64 build, ABI
assertion, runtime audit, and isolated health smoke provide proportionate A6
evidence. On 2026-08-03 the supported isolated Linux Meteor/Playwright suite
completed with zero server failures and 883 passing, 7 pending, and zero
failing client tests. The exact current working-tree image then built for
`linux/amd64` on the first Meteor attempt, reported Node 24.15.0/npm 11.12.1,
passed its runtime-bundle audit with zero vulnerabilities, and returned
`status: "ok"` from an isolated production-shaped `/health` smoke under
polling, SockJS, and disconnect grace zero. The fully preflighted sixth
authorized Meteor 3.5
qualification run passed all 565 server tests with 12 pending and then
correctly failed its empty client phase. This established a concrete stable
Rspack Blaze test-bridge defect rather than merely absent browser coverage. A
pinned source-owned copy of the upstream correction is implemented, and the
eleventh run proved that it loads and executes the full browser suite. That run
did not settle Phase 4 because two focused gates modeled unsupported or
intentionally polling behavior. Those gates were corrected, and the
thirteenth/fourteenth adjacent-run evidence now settles the repository-owned
staging qualification.

Production deployment remains a separate externally consequential action and
requires explicit authorization plus the data-safety facts necessary for that
action. Repository-owned Phase 3 is accepted and the Change Streams
qualification machinery is prepared. The maintainer authorized a project-owned
bridge and the exact PR #14562 source is pinned under
`mofacts/packages/rspack`. The eighth run proves that correction loads the
client suite but also exposes its unhandled `commonjs2` browser-output boundary.
That source-owned boundary is now corrected in `rspack.config.js`, with
standalone regression coverage for test/production versus server/development
ownership. Phase 4 is accepted for staged progression. The next plan boundary
is Phase 5A production database acceptance; it requires protected runtime facts
and separate authorization rather than another routine local integration run.
Remove the override only after an official stable Rspack release contains the
complete fix and passes the same client and recovery gates.

## Decisions Needed Before Implementation

### Fixed base-track scope

The base framework track uses the decisions above: v3.5.0 only, Meteor-owned
Node 24.15.0/npm 11.12.1, polling, SockJS, zero disconnect grace period, no
database-authority change, and no optional-capability work. It preserves all
stored identity values and current Android web-app support claims. It does not add a
dependency, parser, configuration fallback, or user-visible behavior unless a
separate approved work package explicitly requires it.

E0a is the first activity and is read-only. Its platform contract is the
established `linux/amd64` deployment target. Retain the existing
`geoffreybooth/meteor-base` publisher and use official Node 24.15.0 Alpine.
During E0a, inspect each candidate immutable OCI index, record its amd64 child
digest, and verify the selected image contents without editing any consumer.
After E0a, A2 pins the verified indexes as part of the
atomic framework and toolchain transition. ARM64 is not an established
deployment target and emulator-based ARM64 validation is outside this upgrade.

### Resolved base-track design decisions

These conclusions are binding for the contained base track and are not
implementation choices:

| Design conclusion | Evidence and consequence |
| --- | --- | --- | --- |
| Retain Android web-app support and retire unused Cordova packaging. | Android remains supported through its browser/installable-web-app path; APK/AAB packaging is not a product requirement. |
| Retain one sidecar project with its existing local-hotfix and production SSH-tunnel modes. | The modes are deployment targets of `mofacts-mcp-sidecar`, not competing sidecar configurations. No sidecar architecture decision is required. |
| Convert the existing database service in place to a configurable one-member replica set. | Change Streams remain the intended next performance capability. The current server and volume remain authoritative, no second server is required, and explicit replica-set/member/URI configuration preserves later expansion or a parallel-target migration. |
| Do not add offline URI validation. | MongoDB URIs remain opaque; the connected driver or `mongosh` validates them and errors must be redacted. |
| Keep unrelated optional capabilities independent. | DDP resumption, `uws`, async rate matching, `accounts-express`, collation, and native async Accounts refactoring do not block Change Streams or the base upgrade. Performance benchmarks are needed only for quantified MoFaCTS improvement claims, not for installing or configuring the capability. |
| Replace the private Accounts storage mutation layer during A1. | Meteor 3.5 documents `clientStorage: "session"` for per-tab credentials. Trace the stable implementation to choose exactly one canonical settings owner because the documentation contains both an `accounts` example and an older `accounts-base` reference. Configure only that owner, remove `Accounts.storageLocation` and private token/storage overrides that it supersedes, and prove password, token, OAuth, SAML, reload, close/reopen, two-tab, logout, expiry and reconnect parity. Failure of the documented contract is an upgrade blocker, not a reason to configure both keys or restore a private path. |
| Retain the established Meteor builder publisher. | Keep `geoffreybooth/meteor-base`, but treat `geoffreybooth/meteor-base:3.5@sha256:58b203caa2c3dc963774117cbf45534d4533ddd77b220e075107da3f3600a083` as the candidate index reference until E0a proves its amd64 child. Pin the verified immutable index and assert its amd64 child digest and bundled Meteor/Node/npm versions. |
| Retain the established application architecture. | The supported deployment target remains `linux/amd64`, matching the 3.4.1 path. Build and smoke-test that artifact and record its resolved base-image child manifests. ARM64 can be added only through a separately justified architecture decision and native validation, not as an incidental framework-upgrade requirement. |

### Resolved release-architecture decision

The promoted artifact remains `linux/amd64`, matching the established 3.4.1
deployment path. E0a verifies and records the amd64 child manifest for each
immutable base-image index. CI builds and smoke-tests the amd64 application
artifact directly; it does not install QEMU or emulate an unsupported target.
Native modules must be built for the amd64 runtime environment.

There are no remaining product or architecture questions for the contained
base upgrade. A failed amd64 build or smoke test, Docker bootstrap failure, or
failure of the supported Meteor 3 Accounts-storage API is an implementation
blocker to report, not an invitation to invent a compatibility path.

### Approvals required only before the database/production tracks

1. **Topology/URI execution:** the in-place one-member replica-set design is
   approved. Before live conversion, supply the protected backup/runtime facts
   and authorize the maintenance action. Keep the canonical sidecar/network/
   document owner and opaque-URI/connected-client readiness design. Approve a
   direct connection-string parser only if D1 documents an unavoidable offline
   check that the current stack cannot own.
2. **Continuity:** for either branch approve backup mechanism, numeric RPO/RTO,
   security, monitoring and database/on-call/change authority. Branch 1 approves
   unchanged-authority acceptance and configuration rollback. Branch 2 also
   approves RPO-zero write freeze, maintenance/communication, post-write forward
   recovery, target architecture and any in-place-conversion exception.
3. **Reactivity:** preserve polling as the tested rollback and continue the
   Change Streams track through topology qualification and focused staging
   correctness evidence. Pause only for a stable-release technical defect or a
   material database-topology/writer-authority design question; do not use
   prerelease code to bypass either condition.

Protected runtime facts are evidence to collect, not choices to guess. Optional
native async Accounts, `uws`, async rate matching, `accounts-express`, and
collation default to **defer** until their work package has a named need and
receives its capability-specific approval.

## References

- [Meteor 3.5 changelog and migration steps](https://docs.meteor.com/history)
- [Stable Meteor 3.5 release tag](https://github.com/meteor/meteor/releases/tag/release%2FMETEOR%403.5)
- [Meteor official tags (stable/prerelease check)](https://github.com/meteor/meteor/tags)
- [Rspack Blaze client-test bridge defect](https://github.com/meteor/meteor/issues/14561)
- [Pinned upstream Rspack serve-and-inject correction](https://github.com/meteor/meteor/pull/14562)
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
