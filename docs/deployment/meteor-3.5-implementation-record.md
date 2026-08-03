# Meteor 3.5 Contained-Base Implementation Record

This record identifies the local contained-base candidate assembled on
2026-07-30 and the additional verification and qualification preparation
captured through 2026-08-01. It contains
no private settings, MongoDB URI, credential, learner
record, or production topology fact. Production, database-platform, Change
Streams, DDP-resumption, and optional-capability tracks remain separate and are
not authorized by this record.

## Candidate identity

- Source base commit: `ca41d19469e4220f70a51d4fceac91b419d74ae3` plus the current reviewed working-tree changes.
- Meteor release: `METEOR@3.5`.
- Node/npm ownership: Node `24.15.0`, npm `11.12.1`.
- Containment: `METEOR_REACTIVITY_ORDER=polling`, `DDP_TRANSPORT=sockjs`, and `disconnectGracePeriod=0`.
- Builder OCI index: `geoffreybooth/meteor-base:3.5@sha256:58b203caa2c3dc963774117cbf45534d4533ddd77b220e075107da3f3600a083`.
  - `linux/amd64`: `sha256:7a3ac31ca6536b2d2d46566e0969fe87940a964f34a216b56558233630fc4d84`.
- Runtime OCI index: `node:24.15.0-alpine@sha256:d1b3b4da11eefd5941e7f0b9cf17783fc99d9c6fc34884a665f40a06dbdfc94f`.
  - `linux/amd64`: `sha256:8e2c930fda481a6ec141fe5a88e8c249c69f8102fe98af505f38c081649ea749`.
- Final verified local `linux/amd64` application image:
  `mofacts-local/mofacts-mini:meteor-3.5-amd64`, local image ID
  `sha256:0bb98e7fac73db32cf4525dc90fcf1fef3da3cc4955bb413fc5eeeb18c79b921`.

This image is development evidence, not a published application image. Release
promotion remains separately gated on commit/push and registry authority. It
was built before the dev-only browser-test dependency ownership was corrected
from `@playwright/test` to `playwright`; application source and production
dependencies did not change, but an exact current-lockfile image has not been
rebuilt without new Docker-build authorization.

## Safe file fingerprints

All hashes are SHA-256 over the file bytes used for this candidate.

| File | SHA-256 |
| --- | --- |
| `Dockerfile` | `74799c42f79095cb5d3d16910990d4eab1f92048ea77ddeece8b9bb3cfd2a768` |
| `mofacts/.meteor/release` | `f7129efa2723d7bf3b5c9b8c44d3498b1e8a6148a29cab415051830ed1cc168b` |
| `mofacts/.meteor/packages` | `ef440023759e07e645ebf89db78dace709a3d498df0f4903744898d844d55412` |
| `mofacts/.meteor/versions` | `6e38b93e1c311fde04e0f5dedee4e64cb485477830b3f39a1c37eb42b88bd175` |
| `mofacts/package-lock.json` | `bf27cca6ffb375259b229d291fae8483337c6dc38a3ab19b0ff3832d2ef13e12` |
| `mofacts/.nvmrc` | `b911698dc3cf3227d34d0ad6727f1c4408791203c9665de99ab959331a1fb07d` |
| `deploy/settings.local.example.json` | `14fbcace7b9d1ce075b383dd64698ae356178af36156f726b7a8256cf27ec02c` |
| `deploy/settings.self-hosted.example.json` | `d01eebbbcb1d4e954fe46da258de44ab5757b340d628599d2aeb14bdcfe0e4db` |
| `mofacts/settings.ci.json` | `3af190404b391279e6b2bf46918ce13fa0045f319f1349c1ddab95663405d828` |

Private runtime settings require a protected fingerprint at promotion time and
must not be copied into source control.

## Verification completed

- The official updater completed unsuppressed and a clean rerun reported the app already at Meteor 3.5.
- `meteor --version`, `meteor node --version`, and `meteor npm --version` resolved to Meteor 3.5, Node 24.15.0, and npm 11.12.1.
- `npm run typecheck`, `npm run typecheck:vendor`, and `npm run lint` passed both locally and in an isolated pinned Node 24.15.0/npm 11.12.1 container.
- A clean `linux/amd64` image built from the pinned OCI indexes. Its bundle declared Node `v24.15.0`; its runtime reported Node `v24.15.0` and npm `11.12.1`.
- The verified amd64 image passed an isolated `/health` smoke test against an isolated MongoDB service. The deployment contract keeps `ROOT_URL=http://localhost:3200` while the container listens internally on port 3000; CI is configured to exercise that same split. Startup logs confirmed polling reactivity, SockJS, and disconnect grace period zero. The user's active localhost service was not replaced solely to repeat this evidence.
- The existing production-shaped hotfix container was inspected without a
  restart on 2026-07-31. It was healthy after 14 hours, exposed host port 3200
  to container port 3000, reported Node `v24.15.0`, and exposed
  `ROOT_URL=http://localhost:3200`, polling reactivity, and SockJS. Its
  `/health` endpoint returned HTTP 200 with `status: "ok"`.
- A read-only, credential-redacted `db.hello()` check on 2026-07-31 confirmed
  that the active local Docker MongoDB is standalone, writable, and has no
  replica-set name. This local runtime cannot activate MongoDB Change Streams;
  it does not establish the protected production topology.
- Bundle dependency installation and its high-severity audit passed with zero runtime-bundle vulnerabilities.
- The public Accounts setting is owned only by `public.packages.accounts.clientStorage="session"`; installed Meteor 3.5 source reads that exact key before initializing session storage. The app no longer mutates private Accounts storage or reads private token storage.
- A signed-in existing tab and a fresh tab showed distinct authentication state in the upgraded runtime. Direct browser-storage inspection and the full provider matrix remain CI/staging evidence.
- Compose configuration, repository diff whitespace, and searches for port
  3100, private Accounts storage overrides, and active Mongo URI parsing
  passed.
- A redacted boolean-only check of the authoritative operator-local files
  confirmed external `ROOT_URL` 3200, internal port 3000, polling, SockJS, both
  opaque Mongo inputs, an existing mounted settings target, and documented
  Accounts session storage. No private value was printed or copied.

## Phase 3 repository preparation

The maintainer selected an in-place, configurable one-member replica set on the
existing server and data volume. A second server is not required for the current
Change Streams topology, and no live conversion was performed while preparing
or rehearsing the repository.

- Canonical self-hosted, local, hotfix, and staging Compose inputs now use a
  named replica set while retaining `METEOR_REACTIVITY_ORDER=polling`.
- MongoDB internal member authentication uses a private host keyfile. The
  wrapper copies it inside the Linux container with owner-only permissions
  before invoking the official MongoDB entrypoint, so Windows bind-mount
  permissions are not treated as sufficient.
- A one-shot initializer waits for authenticated MongoDB readiness, initializes
  only an uninitialized set, waits for writable-primary election, and verifies
  the configured member. It rejects a different set identity and does not
  automatically reconfigure or remove existing members.
- Application startup and the pre-start connected check require the exact
  configured replica-set name. MongoDB URIs remain opaque and errors remain
  redacted.
- The replica-set name and advertised initial member are explicit rather than
  encoded in application logic. The same logical database contract therefore
  supports later `rs.add(...)` expansion or a separately rehearsed parallel
  target and authority migration.
- Mongo MCP sidecar Compose variants no longer replace the private URI with an
  unauthenticated standalone URL or resolve/tunnel to one container. They
  require one opaque authenticated URI, database name, and expected replica-set
  identity. Sidecar startup validates an authenticated database ping and the
  exact connected set before listening; focused tests cover exact-set success,
  standalone/wrong-set rejection, ping failure, and redacted errors.
- `deploy/New-MongoReplicaSetKeyfile.ps1` creates a private ignored local keyfile
  without overwriting an existing secret unless `-Force` is explicit. Public
  operator docs describe the corresponding Linux key generation and warn that
  all future members need the same secret.
- Repository-only validation passed for both canonical/local and staging
  `docker compose config --quiet` renders; Bash and JavaScript syntax;
  PowerShell parsing; quoted replica-set URI consumption; keyfile format and
  no-overwrite behavior; the installed database-tools users/roles and
  stop-on-error flags; every sidecar Compose variant; sidecar PowerShell
  parsing and connection-validation tests; full app typecheck; and lint.

### Isolated Docker conversion rehearsal (2026-07-31)

The conversion was exercised in the uniquely named disposable Compose project
`mofacts-rs-rehearsal-20260731a`. It did not connect to, restart, or reuse the
volume of the active local MoFaCTS stack.

- MongoDB 8.0 first started as an authenticated standalone and received a
  synthetic collection with a representative document, validator, named index,
  application user, and recorded collection UUID.
- The standalone container was removed without deleting its project volume.
  That same volume then started with the canonical keyfile and replica-set
  configuration, initialized `mofacts-rs`, elected `mongodb:27017` PRIMARY, and
  passed the exact-set health check.
- The document, validator, index, UUID, and application-user authentication
  remained unchanged. A real collection Change Stream observed a synthetic
  insert event.
- An authenticated archive including database users and roles was created. A
  post-backup mutation was then overwritten by `mongorestore --drop`; the
  snapshot, validator, index, and application-user authentication all passed
  after restore.
- MongoDB restarted successfully after restore, and the initializer reran
  idempotently without changing the configured member list.
- The recorded Meteor 3.5 amd64 image started against the converted database on
  isolated host port 13200. `/health` returned `ok`, and startup reported the
  expected replica-set connection, polling-only reactivity, SockJS, and zero
  disconnect grace period.

The rehearsal exposed and corrected three defects before any protected
conversion: `replSetGetConfig` reports the uninitialized state by throwing in
`mongosh`; a transient status may have no member array; and restoring database
users/roles requires the database selector. It also removed a local Compose
command override that had accidentally discarded the canonical replica-set and
keyfile arguments.

The current active local runtime observation above remains accurate: the
disposable rehearsal was separate and was removed after verification.
Repository configuration and rehearsal evidence are not evidence that any
protected environment has already been converted.

## Phase 4 static observer inventory

This is source classification, not runtime proof that Meteor selected the
Change Streams driver. Stable Meteor 3.5.0 supports and enables Change Streams
by default on a compatible replica set. The converted isolated topology is
therefore eligible for qualification without installing a beta.

The release interpretation was corrected on 2026-08-01: the later
`3.5.1-beta.0` fixes identify specific projection, write-fence, connection-state,
history-loss, and operation-time risks to exercise against stable 3.5.0. They
are not an entry prohibition. Production remains on polling until the focused
stable-3.5.0 qualification yields an adopt/defer result.

Repository preparation now provides a separate
`docker-compose.change-streams-qualification.yml` overlay. It can select only
the exact stable driver order `changeStreams,polling` when paired with
`MOFACTS_CHANGE_STREAMS_ENABLED=true` and the test-only
`MOFACTS_CHANGE_STREAMS_QUALIFICATION=true`; the application fails closed when
the gates and order disagree, retains SockJS and disconnect grace zero, and logs
the selected mode. At that preparation stage, base, staging, local, and hotfix
definitions remained pinned to `polling`. This is configuration-path evidence only: no new application image
was built and no Meteor observer qualification was run as part of this change.

Preparation verification on 2026-08-01 passed:

- full `npm run typecheck`;
- full `npm run lint`;
- normal Compose rendering with polling and no qualification gate;
- isolated Compose rendering with the gate, `changeStreams,polling`, and
  SockJS; and
- a focused source-level contract smoke covering normal mode, qualification
  mode, and fail-closed gate/order mismatch.

The first Phase 4 Meteor integration invocation received single-use
authorization on 2026-08-01 and ran in a disposable Linux container against an isolated
MongoDB 8 one-member replica set. The exact runner resolved Meteor 3.5, Node
24.15.0, npm 11.12.1, and Playwright Chromium. It completed 561 server tests,
then exited with three server failures; the client reporter showed zero tests
after an earlier Svelte/TypeScript client-build diagnostic. This is not a
passing qualification result and no fault marker was reached, so active-driver,
history-loss, and primary-restart evidence were not claimed.

The failures produced three source-owned corrections in the current working
tree: the qualification fixture now initializes the authoritative verbosity
document in an otherwise empty test database and awaits Meteor 3 observer
handles; the deployment-readiness test fixture returns the replica-set identity
that its environment requires; and `tsconfig.json` explicitly enables
`verbatimModuleSyntax`, as required by the installed Svelte TypeScript compiler.
Static inspection also found that the bundled Playwright worker does not report
browser `pageerror`, allowing a failure during the client test module's static
application import to appear as an empty passing suite. An initial correction
started the application through a root Mocha hook and added a discovery
sentinel.

A second single-use-authorized invocation used a freshly built image of that
corrected tree against a new MongoDB 8 one-member replica set. All 564 server
tests passed, and startup reported stable `METEOR@3.5` with
`changeStreams,polling`, SockJS, and zero disconnect grace. The browser runner
again returned `0 passing` and process exit zero before either coordination
marker, so this invocation is also not a passing qualification result. The
active-driver, history-loss, and primary-restart assertions remain unexecuted.

The second result proved that the initial guard was still insufficient, but it
did not expose the browser-side exception because the bundled Playwright worker
does not listen for `pageerror`. Static inspection of the installed Rspack
integration showed that explicit test-module paths are passed directly to
Rspack, so directory placement alone was not claimed as the root cause. The
entrypoints now live at the application root to remove the documented
`tests/`-directory ambiguity, and the client entry immediately captures its
application-import rejection so it becomes a Mocha hook failure rather than an
unhandled pre-run rejection. It also reports synchronous, unhandled-rejection,
and pre-Mocha bootstrap errors through the console channel that the bundled
worker does forward. The CI wrapper independently captures the Meteor reporter
output and fails an otherwise-zero exit when the client section is absent or
reports zero passing tests. Its capture is bounded to the final 2 MiB.

The Docker context now includes both test-only shared files referenced from the
explicit entries: the Change Streams contract and the existing standalone log
comparison suite. The latter contains the 12 long-standing pending cases seen
in the contained-base integration evidence; it was absent from the first two
Phase 4 disposable images because the old `.dockerignore` allowlist covered the
entry files but not that imported standalone test.

A third single-use-authorized invocation used a new stable-only image and a new
MongoDB 8 one-member replica set. The six pre-Meteor harness tests passed. All
564 server tests passed with the expected 12 pending cases, while the client
reporter again returned `0 passing`. This time the wrapper correctly converted
the false-green Meteor exit into process exit 1. Neither the client bootstrap
sentinel nor its error channel ran, proving that the client test entry was
compiled but never executed.

Inspection of the stopped container's generated artifacts established the
owning defect. `_build/test/client-entry.js` imports the explicit test entry,
and `_build/test/client-rspack.js` contains that entry, the discovery sentinel,
and the client tests. Stable Atmosphere `rspack@1.1.0` nevertheless generates
`_build/test/client-meteor.js` with only the comment `In Blaze, import happens
last so HTML files preload first`; it omits the required
`import './client-rspack.js'`. The same branch remains in
[Meteor's current upstream source](https://github.com/meteor/meteor/blob/devel/packages/rspack/lib/build-context.js).
The documented `rspack.config.js` surface reserves entry and output wiring, so
an application config cannot repair this bridge. The current stable package
catalog ends at `rspack@1.1.0`; the only newer package is a prerelease and is
outside this plan. No beta, local package fork, generated-file patch, or
alternate-bundler test path was introduced.

Typecheck, vendor typecheck, lint, Node syntax checking, and
`git diff --check` pass after the source-owned harness corrections. Six
standalone Node harness tests prove explicit entrypoint validation,
Docker-context inclusion, plus absent, ANSI-zero, and nonzero client-reporter
outcomes; `npm run test:ci` executes those guards before starting Meteor. The
third run proves the guard works and identifies a stable upstream test bridge
blocker, but it cannot supply the client-coordinated Phase 4 evidence.

An opt-in Meteor client/server matrix and a manually triggered Linux workflow
are now prepared for that authorization. The matrix exercises a bounded `$in`
observer, dotted secret exclusion, the stable-3.5.0 nested-object projection
regression, an ordered limited page, a concurrent initial-snapshot write, the
real TDF runtime secret-exclusion projection across initial and reactive data,
the real exact-id server-verbosity setting observer, and a login-shaped method
that writes and creates a new observer before its DDP write fence completes.
The server-verbosity callback contract is separately unit-tested for initial,
changed, unrelated-change, and fail-closed removal behavior. The workflow
supplies stable Meteor 3.5, MongoDB 8 as an isolated one-member replica set, the
exact qualification gate/order, SockJS, and the existing Playwright-backed
Meteor runner. Before injecting a fault, it requires `$currentOp` evidence that
the unordered qualification collection has an active `$changeStream`; it also
records sanitized MongoDB connection, operation, memory/cache, primary, and
election metrics before faults and after recovery. These files compile and lint.
The workflow now treats process exit before either required coordination marker
as failure even when the underlying test command exits zero, preventing an empty
client suite from advancing fault injection. Each resource snapshot also
requires a writable primary and available connection capacity; it is bounded
functional health evidence, not production sizing or an A/B performance claim.
None of the three authorized executions reached the client-coordinated recovery
markers. The first exposed source-owned server/client-build failures, the
second exposed the false-green client phase, and the third isolated the stable
Rspack Blaze test-bridge defect. Active-driver, history-loss, and
primary-restart assertions were not executed by those runs. The subsequently
approved source-owned bridge changed the test path; later attempts and their
remaining output-format defect are recorded below.

**Phase 4 disposition: `DEFER`.** The required client and recovery gates did
not pass, so Change Streams must not be adopted in production. The contained
base and every normal Compose definition remain on `polling`. The isolated
qualification overlay and focused contracts stay in the repository so the
same evidence can be collected with the pinned source-owned correction without
redesigning the database topology or migration path.

A fourth single-use-authorized `npm run test:ci` invocation was attempted on
2026-08-01 in a newly built stable-only Linux image. It stopped before Meteor:
five harness tests passed and the Docker-context contract test failed because
the disposable runner copied `mofacts/` but omitted the repository-root
`.dockerignore` expected at `/workspace/.dockerignore`. This was a local runner
construction error, not application, Meteor, MongoDB, Change Streams, or Rspack
evidence. No server/client count or recovery marker is claimed, the Phase 4
`DEFER` disposition is unchanged, and another invocation requires fresh
authorization.

A fifth single-use-authorized invocation used a corrected image that included
the root `.dockerignore`; its six harness tests passed. The Meteor process then
stopped during Rspack server compilation with 38 unresolved imports because the
disposable image still omitted the repository-root `learning-components/`
source tree referenced by `mofacts/`. No Meteor test count or recovery marker
was reached. This is also a local runner construction error rather than
application, MongoDB, Change Streams, or stable-Rspack qualification evidence.
The Phase 4 `DEFER` disposition remains unchanged, and another invocation
requires fresh authorization.

A sixth single-use-authorized invocation used a fully preflighted stable-only
image containing the root `.dockerignore`, `learning-components/`, and
`mofacts/`. Before the invocation, all six harness tests and the full
application typecheck passed inside that image. Rspack then compiled the test
application, all 565 server tests passed with 12 pending, and the client phase
again reported `0 passing`. The fail-closed wrapper returned exit 1. No client
bootstrap or recovery marker ran. This valid run reproduces the already proven
stable `rspack@1.1.0` Blaze client-test bridge defect; it does not change the
Phase 4 `DEFER` disposition, and another invocation requires fresh
authorization.

On 2026-08-02, the maintainer explicitly authorized the project-owned bridge
approach anticipated by the plan. `mofacts/packages/rspack` is now an exact
source copy of [upstream PR #14562](https://github.com/meteor/meteor/pull/14562)
at commit `fa20c29abb4ae30fe78facab2819ce4f5c99e588`, exposed locally as
`rspack@1.1.1`. Both Meteor package graphs select that version. The correction
serves and injects the client Rspack bundle for test/build/production, removes
the Blaze-specific drop branch, and constrains disk serving to the configured
build context. Its provenance, license, removal condition, and static harness
contract are tracked with the package. The existing CI wrapper's mandatory
nonzero client passing count remains the end-to-end regression gate.

This implementation does not install a Meteor or Rspack beta and does not
modify generated `_build` files or the local Meteor package cache. Phase 4
remains `DEFER` until a fresh, separately authorized Linux `npm run test:ci`
invocation proves that the client suite executes and reaches the active-driver,
history-loss, and primary-restart coordination markers. Normal and production
Compose definitions remain on polling in the meantime.

A seventh single-use-authorized invocation was attempted on 2026-08-02 in a
fresh disposable Linux container with the current uncommitted tree, stable
Meteor 3.5, Node 24.15.0, npm 11.12.1, Playwright Chromium, and an isolated
MongoDB 8 replica set. All seven pre-Meteor harness tests passed, including the
new local-Rspack pin contract. Meteor then refused to start because the
root-owned disposable CI container had not been given its required
`METEOR_ALLOW_SUPERUSER=true` setting. The process exited before Rspack
compilation, server/client tests, or either recovery marker. This is disposable
runner configuration failure, not evidence for or against the Rspack correction
or Change Streams. No retry was made because the authorization was single-use;
the disposable containers and network were removed. Phase 4 remains `DEFER`.

An eighth single-use-authorized invocation used the corrected disposable Linux
environment, including `METEOR_ALLOW_SUPERUSER=true`. Before the test, Meteor
resolved the project-owned package as `rspack 1.1.1+`. All seven harness checks
passed, Rspack compiled the client application, and all 565 server tests passed
with the expected 12 pending cases. The browser then loaded the previously
dropped `client-rspack.js` bundle and executed 29 client checks, proving that
PR #14562 repairs the original missing-bundle bridge.

The client phase nevertheless failed once with
`ReferenceError: module is not defined`. Generated-artifact inspection placed
the error at the final `module.exports = __webpack_exports__` assignment in
`client-rspack.js`. Stable `@meteorjs/rspack@2.0.1` owns that output shape and
sets the web bundle's `libraryTarget` to `commonjs2`; directly injecting that
bundle as a browser script does not supply the CommonJS `module` binding. The
process reported zero server failures and one client failure, then exited 1
before requesting the history-loss or primary-restart marker. MongoDB remained
a writable `mofacts-ci-rs` primary. The disposable resources were removed.

Therefore the pinned PR is a demonstrated partial correction, not a completed
qualification bridge. No unchanged rerun is warranted. Phase 4 remains
`DEFER`, normal/production definitions remain on polling, and the next bridge
change must address the stable client output format with a clean-bootstrap
regression before another qualification invocation.

The client output boundary is now implemented in project-owned source.
`rspack.config.js` selects a named `window` library only when Rspack builds an
injected test or production client bundle. Server bundles retain CommonJS
ownership, and development clients retain the established HMR configuration.
The policy is isolated in `scripts/rspackClientOutputContract.cjs`; standalone
harness coverage asserts both the browser-safe modes and the unchanged modes.
This removes the known `module.exports` footer condition but does not change the
Phase 4 disposition until a newly authorized Linux qualification run proves the
complete client and recovery path.

A ninth single-use-authorized Linux invocation verified that footer correction:
the local package resolved as `rspack 1.1.1+`, all nine then-current harness
checks passed, Rspack compiled the client, and all 565 server tests passed with
12 pending. The generated client bundle no longer failed at `module.exports`.
The root client hook nevertheless failed before any client test passed because
Meteor package exports were unavailable (`Package.mongo`, `Package.meteor`,
`Package.reactive-dict`, and related contracts). Generated `client-meteor.js`
contained the required `require('meteor/...')` calls, but only inside an
uncalled `lazyExternalImports1()` function. The process exited 1 before the
history-loss marker; MongoDB remained a writable `mofacts-ci-rs` primary and
all disposable resources were removed.

A tenth single-use-authorized Linux invocation ran in a fresh disposable
stable-only environment. All 12 then-current harness tests passed, Rspack
compiled the client, and all 565 server tests passed with 12 pending under
`changeStreams,polling`. The client root hook still failed at 0 passing before
the history-loss marker. Generated `client-meteor.js` proved the eager static
imports were present, while generated `client-rspack.js` proved the actual
failure: changing the library target to `window` had implicitly changed the
external type, producing `module.exports = window["meteor/mongo"]` and related
lookups. Those entries do not exist. This disproves the eager-import diagnosis
and replacement.

The corrected source-owned contract now combines the named browser `window`
library with explicit `externalsType: "commonjs2"`, preserving Meteor's browser
module loader for external `meteor/*` dependencies without restoring the
invalid bundle footer. The eager-plugin replacement was removed. Nine revised
standalone harness tests, full typecheck, and lint passed. Phase 4 remained
pending a fresh authorized full qualification.

An eleventh single-use-authorized Linux invocation proved that corrected
bridge. All nine then-current harness tests passed, Rspack compiled, and all 565
server tests passed with 12 pending under `changeStreams,polling`. The browser
then executed 891 checks: 819 passed and 72 failed. Two focused failures were
initially recorded as mandatory Change Streams defer criteria, but subsequent
source and upstream review disproved that classification. The nested-object
fixture used unsupported object projection syntax; MoFaCTS production
publications use supported dotted projection syntax. The ordered limited
fixture demanded Change Streams behavior from a cursor that Meteor intentionally
routes to polling because skip/limit pages are moving windows. These results do
not establish a stable-3.5.0 Change Streams defect in MoFaCTS. The remaining 70
client failures remain separate full-suite triage and release evidence.

The qualification is now aligned with the application architecture. Its
Change Streams projection case uses dotted notation, and ordered pagination is
tested through the real `filteredUsers` publication as the expected polling
path under `METEOR_REACTIVITY_ORDER=changeStreams,polling`. The unused
`pagedTdfsListing` publication and a synthetic ordered publication are no
longer qualification substitutes. No beta or source backport is required for
these two cases.

Three additional single-use-authorized Linux invocations exercised that
corrected suite on 2026-08-02. The twelfth exposed two qualification-harness
defects rather than a framework result: the isolated database did not yet own
the `admin` role needed by the real `filteredUsers` test, and the MongoDB 8
`$currentOp` probe omitted idle cursors and the cursor-owned
`originatingCommand`. Both were corrected and pinned by the standalone harness.

The thirteenth invocation then found exactly one active qualification Change
Stream. The supported dotted projection, bounded `$in`, snapshot-race, TDF
secret-containment, error-286 history-loss recovery, one-member-primary restart
recovery, and login-shaped write fence passed. The pre-fault database was
healthy (`PRIMARY`, 27 current and 201150 available connections, 281 MiB
resident memory, 2618804 WiredTiger cache bytes, and no election). The real
ordered/paginated polling case exposed an application defect:
`Mongo.Cursor.observeChanges()` returns a promise on Meteor 3, but
`filteredUsers` retained it as though it were already a handle and later called
`stop()`. The publication now awaits the handle.

The fourteenth invocation validated that production correction: 565 server
tests passed with 12 pending and zero failures. It again found one active
qualification Change Stream and passed the focused pre-fault observer,
projection, snapshot, containment, and login-fence cases. Its manual local
coordinator acknowledged both recovery markers after their 45-second client
deadlines, so those two repetitions timed out and are not counted as recovery
passes. This is a coordination limitation of that manual container
reproduction, not the checked-in workflow, which polls host-owned markers every
second and performs the actions immediately. Post-restart MongoDB remained
healthy (`PRIMARY`, 5 current and 201172 available connections, 203 MiB
resident memory, 1383784 WiredTiger cache bytes, and no election). The
adjacent-run evidence is accepted for Phase 4 because the only intervening
production change awaits the polling-owned publication handle and does not
alter Change Stream recovery. The 70 ordinary client failures common to the
runs remain a separate full-suite release gate.

**Phase 4 disposition: `ADOPT FOR STAGED PROGRESSION`.** This accepts the
stable-3.5.0 mixed-driver design and qualification machinery. It does not claim
a quantified speed or memory improvement, make the whole dirty-tree client
suite green, authorize a production topology change, or enable Change Streams
in production. The base configuration remains polling until Phase 5A accepts
the production database platform and Phase 5B is separately authorized.

The next deployment stage uses one canonical hotfix server at
`http://localhost:3200`, managed only by `deploy/hotfix-local.ps1`. The initial
consolidation incorrectly replaced the source-watching workflow with a manual
Docker bundle rebuild. That violated the hotfix-loop requirement and was
corrected: the sole server is again the native Meteor/Rspack watcher, while
`docker-compose.yml` plus `docker-compose.local.yml` provide MongoDB and its
replica-set initialization. The watcher explicitly enables
`changeStreams,polling`; base, staging, and production Compose retain their
separately controlled settings.

Consolidation means one owner and one port, not removal of watch behavior. The
canonical script stops and removes any obsolete local app container before
claiming port 3200, validates configuration and the pinned Meteor tool before
generated-file cleanup, and then watches the source tree continuously.

The removed native Windows launcher set `HOME` to `deploy/local-data`, so
FilesCollection persisted Windows absolute paths for local dynamic assets. The
canonical Linux bundle mounts the same files at `/root/dynamic-assets`. Startup
therefore runs the restart-safe `migration.dynamicAssetLocalPaths.v1` migration
before asset-dependent recovery: it derives each local filename from the asset
id and extension, verifies the file at the configured root, and updates all
three FilesCollection path fields together. Completion is keyed by the resolved
storage root, so a later host or mount change reruns the migration instead of
silently retaining paths from the previous runtime. Missing or invalid targets
remain unchanged and keep the migration incomplete.

The Docker bundle runtime recorded on 2026-08-02 is retained here as historical
evidence, not as the current localhost workflow. The corrected workflow must be
verified by observing the native Meteor process, the Rspack HMR endpoint, and an
automatic rebuild after a source edit.

Phase 4B was completed on 2026-08-02 with an authenticated browser smoke against
that same canonical server. Password login reached the publication-backed home
dashboard with 17 lessons (14 in progress and 3 new); the data page loaded the
learning-history action and populated owned-TDF table; content management, live
admin status, and persisted user-learning metrics rendered; and continuing the
existing `Times_Tables` lesson reached the learner content screen with an active
response control. Browser warning/error capture was empty. The corresponding
server log recorded the successful password login and lesson-data calls without
a smoke-time error. No download, admin mutation, or learner answer was submitted.

Both recovery marker files were created, but the old client tests waited a
fixed three seconds and then continued. By the time the local coordinator
observed the first marker, the suite had ended and `$currentOp` correctly found
zero active qualification streams, so no fault was injected and the primary
was not restarted. The apparent recovery passes are not claimed as evidence.
The fixture now waits for marker removal as an explicit acknowledgment, and the
workflow removes each marker only after completing its corresponding fault and
recovery action. Ten focused harness tests, full typecheck, and lint pass after
that fail-closed correction.

The plan's continuation rule now includes a blocker-declaration protocol. It
requires three consecutive impasse checks, current direct evidence, exhausted
safe alternatives, confirmation that no independent work remains, and a real
technical-blocker or material-design-question classification before a blocked
status may be recorded. Missing authorization for one external action, unrun
tests, unreleased upstream fixes, and incomplete optional or production
evidence are explicitly not whole-plan blockers.

The runtime connection inventory found no app-owned `RemoteCollectionDriver`,
second Mongo connection, or second DDP connection. MoFaCTS collections and raw
database operations share Meteor's default connection; the standalone
`scripts/auditSharedHydration.ts` process uses `MongoClient` only as an offline
audit tool. The 3.5.0 cross-connection fence regression is therefore recorded
as not applicable to the running application unless a second runtime connection
is introduced later. The qualification suite invokes the real client-used
`filteredUsers` publication handler for its ordered/page-boundary polling case
rather than an unused publication or a synthetic cursor.

The manual workflow also coordinates two recovery cases without exposing a
private observer-driver API. A test-only server method creates an exclusive
temporary marker; the workflow then injects MongoDB error 286
(`ChangeStreamHistoryLost`) across pending `getMore` calls on the disposable
server, disables the failpoint, and requires a subsequent fenced write to reach
the client. A second marker causes the one-member MongoDB container to restart
and re-elect itself; the existing subscription and a subsequent write fence
must recover. Marker paths exist only in the test environment, and the test
methods reject execution outside the explicit qualification mode.

The complete ordinary Meteor suite runs in the same qualification process, so
its existing authentication, learner-history, model-state, assignment, content,
and audit-record assertions remain integrity gates under the selected driver
order. No quantitative MoFaCTS speed, memory, or capacity improvement is claimed;
the captured database metrics are correctness/safe-operation evidence for this
bounded workload, not an A/B benchmark or a production-sizing result.

| Publication/observer shape | Source examples | Qualification consequence |
| --- | --- | --- |
| Unordered exact-id, equality, or bounded `$in` cursors | roles autopublish; theme/settings; user history and experiment state; dashboard cache; assets; runtime/edit/listing TDFs; assignments; user audio settings | Primary focused Change Streams candidates. Verify add/change/remove propagation, authorization, stop/restart, and write-fence completion. |
| Ordered/paginated cursor | `filteredUsers` and `pagedTdfsListing` use `sort` with `skip`/`limit`; `filteredUsers` manually republishes page ids | Verify the intended non-Change-Streams driver selection and page-boundary correctness; do not misreport these paths as Change Streams coverage. |
| Manual unordered exact-id observer | server verbosity watches one `DynamicSettings` document with `added`/`changed`/`removed` | The qualification server test uses the real document/cursor for initial value, reactive update, and stop; focused callback tests prove unrelated-change handling and fail-closed removal. Primary-restart recovery remains part of the workflow-wide observer recovery gate. |
| Security-sensitive projections | runtime TDF publications exclude speech, text-to-speech, and OpenRouter API keys; user/content publications use explicit field lists | Assert excluded fields remain absent from initial snapshots and reactive updates, including nested/dotted projection cases. |

No publication behavior was changed by this inventory; the shared TDF secret
projection constant was exported so the qualification publication cannot drift
from production. A quantified
performance comparison remains necessary only if a quantified MoFaCTS speed or
memory claim is made.

## Optional Meteor 3.5 capability dispositions

These dispositions complete the repository evaluation required by Phase 6;
they do not imply that production has already received the contained base.
Each deferred capability remains an independent future work package and is not
a prerequisite for Change Streams.

| Capability | Current disposition | Evidence and trigger to reconsider |
| --- | --- | --- |
| Automatic EJSON/DDP allocation improvements | Adopted with the stable 3.5 base | They ship in the selected framework graph. Existing correctness coverage and the contained build apply; no MoFaCTS speed or memory percentage is claimed without a comparable workload. |
| DDP session resumption | Defer | Grace remains exactly zero. Stable 3.5.0 lacks the later resumption corrections, and MoFaCTS has overloaded durable session identities. Reconsider only on a stable fixed patch with an approved identity/replay contract. |
| Native async password/token Accounts APIs | Defer | Existing promisified calls remain behaviorally owned and no failure requires migration. Reconsider as an isolated auth refactor after the base is stable, with provider, error, hook-order, and per-tab parity. |
| `uws` transport | Defer | SockJS remains the supported public-network contract, no measured SockJS bottleneck exists, and the quiet-connection heartbeat correction is not in stable 3.5.0. |
| Async DDP rate-limit matchers | Defer | All current rules are synchronous and no named abuse policy requires database context. Reconsider only for a bounded indexed lookup with latency and fail-closed evidence. |
| `accounts-express` | Defer | No approved route needs the dependency or its cookie/Bearer contract. A future route requires separate dependency and security approval. |
| MongoDB/Minimongo collation | Defer | No approved locale-owned equality/sort defect or matching index change exists. Current query and user-visible ordering semantics remain unchanged. |
| `accounts-2fa` / OTPAuth change | Reject for this upgrade | MoFaCTS does not directly use the package; adoption would be a separate product/security feature. |

## Compatibility dispositions and remaining gates

- The maintainer confirmed the supplied Meteor 3.4.1 state was working. It was
  retained as rollback identity (`ca41d19469e4220f70a51d4fceac91b419d74ae3`)
  and was not rebuilt or rerun merely to reconstruct a baseline.
- The supported server-image target remains `linux/amd64`, matching the 3.4.1
  deployment path. ARM64 and QEMU emulation are not upgrade gates and were
  removed from CI and the plan.
- Meteor 3.5's shipped core declarations are present, but the official
  `zodern:types` `meteor lint` generator rejects this app's valid
  `client/index.ts` and `server/main.ts` main-module paths before generating its
  declaration file. The existing `@types/meteor@2.9.11` dependency is retained
  as the explicit compatibility disposition. Vendor declarations are checked
  with `skipLibCheck=false`; only `exactOptionalPropertyTypes` is disabled in the
  vendor-only configuration for XState's incompatible declarations. Application
  typechecking retains `exactOptionalPropertyTypes=true`.
- The root dependency audit reports 22 development-tree advisories. The runtime
  bundle audit reports zero. No broad dependency update or automatic audit fix
  is part of the framework transition.
- No TDF registry or schema field changed, so schema generation is not required.
- `npm run test:ci` is satisfied. After the source-owned Rspack test bridge made
  the supported Linux browser suite executable, the 70 exposed client failures
  were repaired without weakening the runtime contracts they exercised. On
  2026-08-03 a fresh pinned Meteor 3.5/Node 24.15.0 Linux container completed
  with 0 server failures, 883 passing client tests, 7 pending client tests, and
  0 client failures. The runner's 12 standalone harness tests also passed.
- Android remains supported through the installable browser/web-app path.
  Meteor's separate Cordova `android` platform and APK/AAB build wrappers were
  removed because MoFaCTS does not ship a native Android package.
- The exact current working-tree image rebuilt successfully for `linux/amd64`
  on 2026-08-03 using the canonical Compose path. Meteor compilation succeeded
  on its first attempt, the bundle reported Node 24.15.0/npm 11.12.1, and the
  runtime-bundle audit found zero vulnerabilities. An isolated production-shaped
  startup connected to a disposable replica set with polling, SockJS, and zero
  disconnect grace; `/health` returned `status: "ok"`. The disposable app
  container was removed afterward. No emulator or non-amd64 application
  artifact was used.
- No production deployment, database migration/topology change, Change Streams,
  DDP resumption, optional Meteor 3.5 capability, commit, push, or registry
  publication was performed. A6 is accepted for continued repository work from
  the proportionate evidence above; broader client/browser/provider coverage
  remains ordinary CI/release evidence rather than a blocker by absence alone.
