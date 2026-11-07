# Isolated Linux Meteor integration

**Full-suite checkpoint passed on local Linux.** On 2026-11-06, committed source
`92d7d28b` passed 985 server and 1,237 Chromium client tests, with zero failures
and 15/seven pending, using the authorized Ubuntu-MoFaCTS 4 GiB/two-CPU worker.
Source before/after matched, job resources were removed, and pre-existing local
containers were unchanged. Earlier 2 GiB and 2.5 GiB staging2 trials failed with
OOM; its original services were restored. Do not repeat those small profiles.
This is one tested capacity profile, not a measured minimum or standing permission
to use an operator's PC. See the [acceptance record](../../docs-developer/security-audit-durable-redesign-status.md#local-linux-full-suite-acceptance-2026-11-06).

This operator-run lane executes the existing complete `npm run test:ci` suite
without GitHub scheduling. It requires explicit authorization for the tooling
image and each Meteor invocation. It is not a deployment, GitHub check result or
release/image qualification. Use only on an explicitly approved isolated host.

Use a new private (0700) `/var/tmp/mofacts-integration.<unique-id>` directory
(or the existing remote operator's `/home/ubuntu/mofacts-integration.<unique-id>`),
with `source/` containing a clean Git checkout of the exact 40-character commit.
Use umask 022 for Git checkout so source has ordinary Linux CI modes (directories
0755, ordinary files 0644). The private parent provides host confidentiality;
read-only container mounts provide runtime protection. Make `control/` and its
public tool files readable (0755 directory, 0644 files) by the capability-free
test container. Never put private configuration in that directory.
Write that commit to `owner`, and copy this directory's Dockerfile and executable tool files to
`control/`. Keep private settings, operator credentials and application volumes
outside the job. Run as the host Docker operator:

```sh
bash control/worker.sh prepare "$job" "$commit"
# Only after prepare succeeds and one run is authorized/reserved:
bash control/worker.sh run "$job" "$commit" --authorize-one-meteor-run
```

The image uses the digest-pinned official Playwright 1.60.0 Ubuntu 24.04 image
matching the application lockfile. The official Meteor installer selects the
repository-pinned release, as in CI. Exact Meteor/Node/npm assertions precede
application dependency installation. The ordinary Meteor bootstrap image uses
Ubuntu 26.04, unsupported by this locked browser release; it is not the test OS.
The vendor documents the image contents and version-matching requirement in its
[Docker guide](https://playwright.dev/docs/docker).
The trusted coordinator alone mounts the Docker socket, uses the existing local
builder binding and captures/verifies source through `captureBuildSource.mjs`.
Tests see a read-only retained capture and checkout, a writable test derivative,
their own Meteor cache and an evidence directory. They receive no Docker socket,
host privileges, staging settings or deployed-data mounts. A dedicated Docker
network publishes no ports and is separate from the application network. Package
downloads use ordinary outbound networking; this is not an offline sandbox.
Before the suite, a native probe reuses the existing kernel mount-table parser
to require private read-only checkout/capture mounts and a writable test mount.
The kernel must also reject write-open and same-mode chmod on worker-owned
retained source. It requires zero effective capabilities and no Docker socket.
Worker mounts use container-owned `/source` and `/capture` paths. Host paths are
kept only in the trusted coordinator; the browser image's private user-home
permissions must not be weakened to make tests accessible.
The setup/test worker uses image-local UID 2000 with zero capabilities. This
matches ordinary non-root Meteor execution and avoids privileged archive
ownership restoration. Only the disposable capture/results/cache belong to
that UID; no host account or application-data ownership is changed.

The complete suite uses a fresh MongoDB 8.0.34 replica set and synthetic CI
settings. Setup is capped at 2 GiB. The corrected test-worker cap is 6 GiB/two CPUs
and MongoDB at 384 MiB/0.25 CPUs; there is no swap allowance beyond RAM.
At least 8,192 MiB available host memory is required before starting that profile.
Phil approved publication and one fresh 6 GiB invocation on 2026-11-07; this
is not standing retry permission. The 4 GiB run on
7f373eff passed all 987 server tests, including the new receiver/Mongo case, then
was OOM-killed during client testing. It remains a failed/incomplete full run;
source/isolation/cleanup diagnostics and partial server evidence are retained.
The corrected profile records actual Docker memory/swap/CPU settings and rejects
missing or unexpected caps rather than printing fixed intended values. Earlier
accepted receipts keep their original observed 4 GiB limits. The initial
2 GiB and 2.5 GiB caps were exhausted during compilation on staging2. These caps do not promise the build fits. Capacity
failure remains a failure; never increase limits, add swap, stop the application
or retry without reviewing the result and existing authorization. Initial image
construction is Docker-builder-owned and does not share the worker cgroup.

The staging2 offline security-test window was rehearsed under the plan's
standing permission. `staging2-test-window.sh` verifies all three existing
containers belong to project `staging2` and are healthy, records their immutable
IDs/images, gracefully pauses them, invokes exactly one authorized test run,
then restores those same containers and checks their liveness/image identity.
Its exit handler releases test containers before restoring the existing services.
It does not remove application volumes or read environment/settings. Restoration
passed, but the 2.5 GiB test still exhausted memory. Further use requires a
resolved capacity profile, the plan's staging2 offline permission and an
available Meteor allowance. This wrapper does not authorize older-staging outages.

`CI=1` identifies automated execution for the existing harness; no GitHub run
coordinates are invented. Retain source observations before/after, full raw
server/browser evidence, actual container/image identities, resource limits,
tool-source hashes and the native receipt. `record-native.cjs` reuses the existing
module inventory and outcome validator and rejects changed source or a failed
container. Pending tests remain explicitly pending. This receipt does not satisfy
consumers requiring `SourceMeteorTestEvidenceV1` or genuine GitHub/image evidence.
Its `toolImageId`/`mongoImageId` are native Docker image IDs; a containerd-backed
engine may identify an OCI index rather than a config. They are not qualified OCI
config digests. The first accepted run's original receipt used misleading
`*ImageConfig` labels; it is preserved with a separate metadata correction, not
rewritten. The corrected writer is covered by bounded regression tests.

The run's EXIT handler removes only exact ownership-labelled test/setup/Mongo
containers, their anonymous database volumes, the job's network and Meteor cache.
It preserves the source, tooling image and results for review. If preparation or
the operator shell is interrupted, inspect the job's matching labels before any
cleanup. Never use a global Docker prune or delete deployed volumes. Job source
and logs are private operator artifacts and must not be committed. Collect a
post-cleanup inventory and confirm existing staging services remain healthy.

Before using a changed receipt writer, run its bounded rejection regressions
with the pinned Node runtime:

```sh
node --test deploy/meteor-integration/record-native.test.cjs
```

MoFaCTS deployment maintainers own this optional lane. When upgrading, align
Meteor/Node/npm assertions with the application and CI, resolve immutable image
digests, and match the browser image to the lockfile's Playwright version. Run
the receipt rejection tests, native isolation probes and one explicitly
authorized full suite before recording a new accepted checkpoint. Keep failed
attempts and exact source/tool identities distinct; this lane issues no release
receipt and changes no application permissions or dependencies.
