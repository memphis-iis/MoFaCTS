# Previous-image storage prequalification

This optional operator lane supplies actual previous-image evidence for the
[Phase 1 storage decision](../../docs-developer/security-audit-durable-redesign-plan.md#previous-image-storage-qualification-contract).
It does not qualify the future application candidate, alter a deployed database,
or complete candidate/previous/candidate acceptance. Keep the existing V1 scanner
and deployed services running. Execution requires the applicable staging2/Docker
permission; these tools grant none.

The selected Linux/amd64 previous-production platform is
`ppavlikmemphis/mofacts-mini@sha256:f8784b4afe9a4875fd62c5ccb153bab26796381548d47ded54d9a65d5148cc05`,
revision `18677291993b66b890a090e55d65f703b45ff653`, expected config
`sha256:214793c9cf7534eb4568934fc83843328b202a23b99d108fc323ead2ceafb697`.
This selection is already approved; missing later build/deployment history stays
unknown. Do not repeat a production query or substitute a staging image/tag.

## Prepare and review

From the repository root, use pinned Node 24.22.1:

```sh
node deploy/security-audit/prepare-rollback-fixtures.mjs \
  /private/new-packet /private/accepted-staging2-metadata.json
```

The input is the retained read-only staging2 snapshot: explicit
`configurationTargetMatched`/`configurationRootOnly` true and `containers` with
the existing `/staging2-mongodb-1` and `/staging2-redis-1` image IDs. This is bounded
host metadata, not settings, environment or data. Preparation creates a fresh
`mofacts_audit_rollback_<12-hex>` namespace, synthetic administrator resume token,
Redis password, settings, one valid V1 report and one valid catalog-complete V2
ERROR report. Both reports are parsed and digested by the current shared owners.
All generated files and the manifest stay private; never commit/upload them.

Transfer the ten packet members through the existing trusted staging2 operator
SSH channel to the generated `/var/tmp/mofacts-audit-rollback.<12-hex>` path. Seal
the directory root:root 0700 and its regular, single-link files root:root 0600;
reject symlinks. Pin the packet manifest and reviewed controller SHA-256 locally.
The packet carries the existing shared `imageArchiveIdentity.mjs` verbatim in
addition to fixture/runtime files. Do not modify a sealed packet to retry a run;
preserve its result and prepare a separately identified reviewed attempt.

The [Compose definition](rollback-runtime.compose.yml) publishes no host ports,
mounts no Docker socket or existing volumes, and uses one internal-only network.
Mongo has a fresh job-owned private disk directory and replica set, never deployed credentials or
data. Its authentication-free synthetic database is confined to that private
network; this tests report-reader compatibility, not database exposure/auth policy.
Redis uses generated authentication. Limits are 1 GiB/one CPU for the old app,
512 MiB/0.35 CPU for Mongo and 96 MiB/0.1 CPU for Redis, without extra swap.
At least 2.25 GiB available memory and 5 GiB free Docker disk are required.
The private job filesystem also requires 5 GiB free; Mongo must observe at least
1 GiB free before app startup. Its normal index-build disk safety floor is not
changed. The initial 256 MiB tmpfs design failed with Mongo code 14031 and about
55 MiB free: Mongo requires 500 MB available by default for index builds.
See [MongoDB's parameter contract](https://www.mongodb.com/docs/manual/reference/parameters/#mongodb-parameter-param.indexBuildMinAvailableDiskSpaceMB).

## Execute and recover

Run [rollback-runtime-window.sh](rollback-runtime-window.sh) through the existing
operator channel, retaining a second recovery session:

```sh
sudo timeout --signal=TERM --kill-after=25s 480s bash -s -- \
  "$job" "$manifest_sha256" < deploy/security-audit/rollback-runtime-window.sh
```

The root controller checks the explicit staging2 configuration hostname, private
job/namespace, exact packet bytes, existing service health and unused Compose
project. It pulls only the selected immutable platform. Docker native IDs may
denote manifests/indexes: the existing bounded Docker-save reader independently
binds the image's OCI graph to the expected config digest. A raw native ID is not
treated as a config digest. No application is compiled and no Meteor integration
allowance is consumed.

The controller starts only owned private services, seeds only the synthetic
database, and runs [rollback-runtime-baseline.mjs](rollback-runtime-baseline.mjs)
inside the previous app image. That probe refuses foreign namespaces, Mongo
hosts/databases, target routes and fixture identities before connecting. It checks:

- Anonymous denial and synthetic admin login over actual DDP; app/health access.
- V1 list/latest/get, authorized JSON/HTML download bytes and response digests.
- Actual old-reader behavior when a V2 record shares the original collection.
- V1 bytes/access after moving only the owned synthetic V2 fixture to an isolated
  V2 collection; exclusion of that unsupported report and preservation of its digest.
- Existing V1 TTL index retention. No deployed retention policy is changed.

The result proposes the delegated storage choice; it does not bind a production
collection or claim a new candidate passed. No unsupported report may silently be
presented as V1. Full candidate/previous/candidate qualification is still required.

EXIT/HUP/TERM/INT cleanup removes only the unique Compose project's containers
and network, checks that none remain, removes only the verified job-owned Mongo
directory after all owned containers have stopped, and compares the three original container
IDs/images/start times/healthy states. Inspect the same live controller/job after
an observation timeout; never start a replacement merely because polling expired.
After an untrappable interruption, use the sealed job's exact project/file/env
with `docker compose down --volumes --timeout 15`, remove only its verified labelled
identity-reader container if still present, and independently verify cleanup and
unchanged original services. A diagnostic-reader container has the same closed
project label and cleanup rule. Remove the synthetic `mongo-data` directory only
after all owned containers are absent, verifying it is a non-symlink directory
whose real path is exactly `$job/mongo-data`, owner/group 999:999, under the sealed
root-only job. Preserve it for operator attention if these checks fail. Keep all receipts and the cached approved image;
do not prune unrelated images, volumes or networks.

Only bounded public image metadata, final boolean/outcome receipts and synthetic
report digests may leave the job. Do not copy the environment, token/password
fixture, application logs or raw database records into reports or public artifacts.
Retain honest failures alongside corrected attempts. An acquisition/setup failure
is not an old-reader incompatibility result.

The four Node regression tests cover fixture isolation, concurrent DDP result
correlation, sanitized denials and prompt failure on channel loss:

```sh
node --test deploy/security-audit/tests/rollback-runtime-baseline.test.mjs
```

The three root-Linux coordinator tests use fake Docker and synthetic capacity
inputs. They prove non-seed children cannot consume controller stdin, an early
zero exit cannot become acceptance, and image-acquisition failure starts no data
or app services. They do not replace the actual previous-image observation.
Two additional preparation tests verify current-HEAD provenance, exact packet
hashes, operation from another working directory and rejection of wrong-target
metadata before a credential packet exists. The manifest's source commit is a
provenance locator, not a clean-source or release-qualification claim.

## Accepted observation: 2026-11-07

At 14:17:38Z the exact selected image passed actual DDP anonymous denial/admin
login, root/health access, V1 list/latest/get and authorized JSON/HTML downloads.
The shared-collection probe confirmed V2 was listed as V1, selected as latest full
and served through the old download route. The version-separated case preserved
exact V1 JSON/HTML bytes, excluded V2, retained its digest and kept the V1 TTL
index. This selects version separation under the existing plan delegation.

The corrected Mongo filesystem had 27,286,404 KiB available before app startup.
Operation and cleanup exited zero. Independent readback confirmed no owned
containers/network or Mongo directory remained, and original cohort/policy hashes
and service IDs/images/start times/healthy states matched the retained baseline.
No deployed app restart, production request or Meteor suite invocation occurred.

The private acceptance receipt is retained under
`phase1-20261105/previous-image-baseline-6a7acc1e/attempt6`, SHA-256
`cbcc45dea01018a99ee96b83ec0855fbf7faf9d684da0a0dcbff3ddf5f1d0a85`.
Earlier setup attempts remain recorded as failed/incomplete: native-ID/config
confusion, controller stdin consumption, and the undersized Mongo tmpfs. None was
accepted as compatibility evidence. Their cleanup preserved original services.
Full candidate/previous/candidate qualification remains open.
