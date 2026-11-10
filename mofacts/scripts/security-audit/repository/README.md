# Inert V2 repository observations

This source candidate is separate from the pending 16-path file/external batch.
It does not invoke npm audit, Gitleaks, Trivy, Docker, a provider or Meteor.
The acquisition entry points remain unscheduled and have not invoked live tools.
Protected fixture carriage and workflow integration are still open. The active
V1 repository producer remains unchanged.

`findingTiers.mjs` remains the one owner of repository finding-group bindings.
Its new `repositoryFindingGroups` function derives an ownership view from that
map and the shared catalog; it is not another control table. The new
`observationsV2.mjs` adapter/evaluator emits the exact 25 repository controls in
the full profile. Exposure has no repository producer. Missing/invalid inputs
become explicit errors in their owning group; unexpected configured slots fail
instead of disappearing. Final artifacts use the shared validator and contain
no copied title, severity or report metadata.

The raw adapters reuse the bounded duplicate-key/UTF-8 JSON parser already used
by the qualification/image collectors. They validate tool exit protocols and
actual finding inventories rather than infer empty results from missing files.
npm package counts must agree with their per-severity metadata and exit status.
Package/advisory identities must survive the existing bounded display parser
exactly; normalization or truncation cannot collapse dependency graph entries.
Runtime findings retain the existing fixed tiers; development advisories can
fail only for the existing explicitly reviewed exposure policy. Maintenance
package counts remain bounded numeric observations. No advisory identifiers,
raw output, paths, canaries or secret values enter these artifacts.

Gitleaks metrics count its complete reported finding inventory, not commits or
files searched. Trivy input must be a completed vulnerability-only result for
the intended OS/library scope; absent or malformed target results cannot become
zero findings. High/critical records are classified by the existing tier helper.
The reported Trivy artifact must equal the explicitly selected immutable image;
unknown severities or target mismatches cannot disappear into a clean inventory.

Image controls require both existing deployed revision/platform observations
and exact equality with `AUDIT_RUNTIME_IMAGE` as a fully qualified immutable
platform reference. A tag or configuration ID cannot substitute. Missing proof
is ERROR; an explicit known identity conflict stays visible even if other
identity input is absent. This checks supplied coordinates and shape, not their
authenticity. The eventual coordinator must supply independently acquired
observations through the already-approved release/host channel; the receiver
continues to compare its own independent observations.

Source-test coverage uses the current flat Node source-security test plan. Its
owned runner must record the exact `--test --test-reporter=tap <absolute-file>`
invocation and empty `NODE_OPTIONS`. Unsupported/filtering configuration is
ERROR; this parser does not remove or reinterpret caller options. It requires
complete TAP case/plan/summary agreement and distinguishes confirmed assertion
failures from skipped/cancelled/TODO, empty-file, runner and import failures.
The latter cannot count as completed policy matches. Other verification slots
also require complete actual observations; command success alone supplies none.

Run the synthetic cases with the pinned Node runtime:

```text
node --test scripts/security-audit/tests/repositoryV2.test.mjs
```

The tests use synthetic tool bytes and real disposable Node-only subprocesses.
The test fixture explicitly owns a fresh CLI environment instead of inheriting
its parent worker IPC/filter settings. It exercises successful, failed, skipped,
filtered, empty and crashed plans and report-assembly/parser parity. This is not
live repository/image scanning, full authentication evidence, or Phase 1 cutover
acceptance. The authentication sequencing decision remains separate.

## Inert acquisition boundaries

`acquireV2.mjs` now connects the existing observation parsers to Gitleaks, both
runtime/all npm lockfile graphs, and Trivy. Invoking that exported function runs
real tools and can contact audit/image databases; importing it does not. There
is no registered CLI or workflow invocation. Live execution needs its separately
approved environment/target/run. The selected source and tool-version proof
remain the coordinator's responsibility; this helper does not qualify a release.

Reports use a private 0700 temporary directory, stable bounded reads, and owned
cleanup. Gitleaks remains redacted; Trivy explicitly selects vulnerability-only
OS/library scanning of the supplied immutable image. Missing tools, timeouts,
malformed output and missing lockfile directories stay explicit. An unavailable
all-dependency graph does not erase an independently valid runtime graph.

`commandV2.mjs` is a Linux-only binary protocol/process boundary: explicit narrow
environment, empty `NODE_OPTIONS`, no inherited worker IPC/auth fixture variables,
no shell, bounded stdout, discarded bounded stderr and an absolute deadline.
It owns a process group and terminates descendants before accepting completion.
Incomplete termination is an error. Unlike the existing V1 text helper and CI
success-only collector, it preserves expected finding exits and raw JSON bytes.
Callers must keep credential values out of argument strings; canary data travels
only through bounded stdin. Nothing silently removes caller filtering options.

`clientBundleCanariesV2.mjs` uses only Node built-ins, so that same source can be
mounted read-only in the selected runtime image. It scans every regular file in
both existing `web.browser` and `web.browser.legacy` targets, including binary
bytes and matches crossing read boundaries. It counts inspected files and files
containing at least one configured canary; repeated matches count once per file.
It never emits matched bytes, canary identities or paths. Missing/empty targets,
links/devices, unstable files and exceeded work bounds fail the inspection.
Both inventories remain required under the existing V1 policy.

Default limits are 10,000 files, 20,000 directory entries, 1,024 directories,
512 MiB total file bytes and depth 64. Reads use 64 KiB chunks. At most 64 unique
canary strings of 8 or more characters and at most 512 UTF-8 bytes each are
accepted; test options may lower limits only. The direct mounted entry point
accepts the canary array on stdin (64 KiB maximum) and scans the existing image
path `/opt/bundle/bundle/programs`. It returns only counts or a constant error.
It must run in the independently selected immutable image with read-only files,
private/no network, resource limits and verified owned-container cleanup. That
Docker bridge is implemented below but remains uninvoked against a real image;
passing filesystem fixtures is not proof that an image's bundles are clean.

Additional synthetic regression entry points:

```text
node --test scripts/security-audit/tests/repositoryCommandV2.test.mjs scripts/security-audit/tests/repositoryAcquireV2.test.mjs scripts/security-audit/tests/clientBundleCanariesV2.test.mjs
```

These exercise actual disposable Node processes, synthetic tool boundaries and
temporary files. They do not invoke npm audit, Gitleaks, Trivy, Docker or Meteor.
The tool-boundary acquisition tests verify that their four unprovided static,
source and canary slots remain ERROR; those slots cannot be inferred from the
other tools' success. Live image-container acceptance and final artifact/workflow
wiring remain open.

## Source observations

`sourceV2.mjs` now acquires the three independent source observations. It invokes
the existing surface checker's `--discover` mode and normal check separately,
validates the exact inventory and completed count, and cross-checks agreement.
The active checker, classification vocabulary and source patterns are unchanged.
This is proof of the current inference contract, not runtime authorization;
Phase 3 retains that review/redesign. An arbitrary nonzero exit or unstructured
diagnostic cannot supply a confirmed violation/count and remains ERROR.

Sensitive logging uses the same V1 source extensions, test-file exclusion and
`countPotentialSensitiveLogStatements` policy owner. Its inventory counts source
files inspected and files containing at least one flagged statement. It emits
no statement text or filenames. Missing/empty inventories, symlinks/special files,
invalid UTF-8, changing files or exceeded bounds fail the observation. Bounds
are 20,000 directory entries, 10,000 selected files, 8 MiB per file, 64 MiB
selected bytes and nesting depth 64. These bounds do not broaden the policy's
statement matching or imply that all forms of sensitive logging are detected.

The source-suite command explicitly selects `source-security-v2.test.mjs`. That
entry point includes the existing suite plus the inert external/repository,
retention and pure authorization-outcome contracts. Active V1 continues selecting
its existing entry point. The raw TAP
adapter requires complete unfiltered case counts and rejects skipped/crashed
runs. The existing synthetic host-exposure fixture now uses the established
root-Linux-with-jq capability check, also used by the V2 host-collector fixture,
instead of requiring the GitHub label on a capable native worker. Its direct
root and existing hosted-sudo paths run the same temporary synthetic harness;
they install no dependencies and inspect/change no live services.

Run the complete Node-only source gate on a capable supported Linux worker:

```text
node --test --test-reporter=tap scripts/security-audit/source-security-v2.test.mjs
```

The V2 collector consumes that actual TAP output through its owned runner.
It does not convert process success into a case count. Tool acquisition and
source acquisition remain separate explicit exports, so source verification
does not invoke live dependency/image scanners or require auth fixture values.
Live image-canary acceptance and full workflow activation are still open.

## Protected image-canary bridge (source only)

`imageCanariesV2.mjs` explicitly operates on an already-selected immutable
platform reference. It never pulls/builds images or loads full auth fixtures.
The caller still owns independent release/platform provenance; matching local
image graphs is not authenticating a publisher or qualifying the release.

It resolves the selected reference through the existing bounded image-archive
reader, then independently resolves the created container's native reference and
compares actual configuration digests/platforms. Classic config references and
containerd index/manifest references keep their existing distinct roles. Exact
native references are memoized within this invocation only. No engine index is
silently substituted for a configuration or platform digest.

The bridge creates its uniquely named/labeled container without starting it,
then inspects identity and restrictions before sending canaries or executing the
scanner. It requires Linux/amd64, a read-only root and sole read-only scanner
bind, no network/capabilities/new privileges, UID/GID 65534, disabled healthcheck
and restart/logging, 128 MiB memory with no swap, half a CPU and 64 PIDs. Its
entry point is the image's explicit Node executable and a private stable copy of
the maintained scanner. The shared canary validator is owned by that scanner.
Canaries travel only as a bounded JSON array on stdin after validation, never
in argv, environment, labels, files or logs. The archive subprocess receives
the same explicit narrow tool environment; its previous qualification caller's
default behavior is unchanged.

The attached start has an absolute five-minute budget. Accepting counts also
requires an exited, non-OOM, zero-exit daemon state, unchanged restrictions/image
and scanner bytes, and verified owned cleanup. A successful CLI attachment alone
is insufficient. The bridge uses the documented [Docker create/start options
and attachment configuration](https://github.com/docker/cli/blob/v29.7.2/cli/command/container/opts.go)
and [attached start](https://github.com/docker/cli/blob/v29.7.2/cli/command/container/start.go),
and independently checks daemon state afterward.

Cleanup lists exact full IDs/names, verifies the invocation's owner label,
removes only that immutable owned ID, and verifies absence again. It applies to
success as well as malformed output, timeout and failed/ambiguous creation.
When create returned no ID, a currently visible owned container can establish
completion and be removed. An empty immediate listing alone cannot prove a
cancelled daemon request finished, and fails cleanup rather than claiming absence.
Foreign labels, removal/listing uncertainty or a remaining container raise
`AUDIT_IMAGE_PROBE_CLEANUP_INCOMPLETE`; no normal observation is returned, even
for a confirmed canary finding. The error carries only credential-free owner,
probe and optional owned-workspace coordinates for explicit operator recovery.
The coordinator must stop and retain that recovery information; it must not
downgrade this exception into an ordinary report control and continue silently.

Run the ten synthetic bridge cases and existing identity compatibility cases:

```text
node --test scripts/security-audit/tests/repositoryImageV2.test.mjs scripts/security-audit/tests/dockerImageIdentity.test.mjs
```

These use real synthetic OCI/config bytes and private temporary source copies,
with injected Docker/archive subprocess boundaries. They prove orchestration
branches, not a real container's isolation, memory fit or image cleanliness.
No Docker operation occurred during those tests. A separately approved actual
image run remains required before operational acceptance or pipeline activation.

## Complete repository artifact writer

`producerFilesV2.mjs` now composes the individual boundaries and the existing
shared artifact writer. Its explicit invocation can run scanners, the Node
source suite and the selected-image Docker probe; it remains unscheduled and
has no registered CLI/workflow. Source tests inject those external boundaries.
It supports only profiles that actually schedule the repository producer.

Before acquisition it rejects an existing output, an excluded profile, unsafe
tool environment, unexpected image-context fields or incomplete component wiring.
It snapshots the existing deployed-revision/platform/selected-image observations,
the narrow environment and selected canaries before asynchronous work. Missing
or conflicting image context suppresses both Trivy and canary Docker I/O and
produces the existing three image-control errors; the other observations remain
independent. Missing canaries affect only their owning control. It never guesses
image identity from a tag, local image, fixture, current caller or tool result.

The development-exposure policy comes only from the selected checkout's existing
`development-dependency-exposure.json`, through the shared bounded JSON/file
reader. It is not taken from protected fixtures or a parallel policy setting.
Missing/malformed policy remains explicit in the existing development controls;
runtime observations can still be retained. Checkout/release authenticity and
live-run authorization remain the coordinator's responsibility.

Component slots are checked before merging: group ownership comes from the
existing tier-binding owner, and source slots from the source collector's one
exported binding map. A globally valid control ID cannot let one component
overwrite another. All 25 final rows pass the shared artifact validator before
the canonical `repository.json` file is exclusively created with mode 0600.
A competing file is never overwritten. Image cleanup recovery exceptions stop
the writer and propagate unchanged before a normal artifact is created.

Seven new orchestration cases exercise raw tool parsing, an actual two-case
disposable Node fixture, filesystem writing, exact 25-row membership and complete
report assembly/independent parsing. They also cover context/canary gates,
component overlap, stale/competing output, input mutation and cleanup failures.
The other 45 report rows in that assembly fixture are explicit errors, so it
cannot be mistaken for a successful live full audit. No npm audit, Gitleaks,
Trivy or Docker command is executed by those synthetic tests.

```text
node --test scripts/security-audit/tests/repositoryProducerFilesV2.test.mjs
```

The full authentication adapter and whole-pipeline/workflow orchestration remain
open. This writer does not load complete auth fixtures, sign/upload a report,
register an application route or qualify/deploy an image. The active V1 producer
and workflow remain unchanged.
