# Optional CI evidence acquisition

The standard repository Security checks now use the
[operator Linux executor](operator-security-checks.md), because GitHub billing is
unavailable. This optional adapter acquires actual hosted evidence only; it does
not convert operator results into GitHub results or require billing to continue
the project's supported local verification.

`deploy/collect-ci-evidence.ps1` uses the existing stored GitHub CLI sign-in to
download bounded source-test evidence. This dependency was approved on
2026-11-02. Use the Node version in `mofacts/package.json`, installed application
dependencies, PowerShell 7 and `gh`. The helper rejects token environment
overrides instead of switching credential sources. It fixes API requests to
`github.com` and never exports, stores or prints the sign-in token.

This is opt-in tooling. It performs GET requests and writes an evidence bundle;
it does not run workflows, build images, publish images, deploy or modify the
authoritative release record. Success is always **acquired-unqualified**.

## Inputs and invocation

Select completed successful `main` push runs of the canonical CI and Security
workflows for the exact expected clean commit. PR/fork, dirty and alternate-lane
qualification are unsupported by this adapter and fail explicitly.

`ExpectedSourceFile` is the trusted, saved `verify-tests` observation containing
the expected build identity, test-input contract digest and supplemental-input
digest. Do not derive the expected identity from the download being validated
when assessing an independently captured release candidate. `TestAppRoot`
supplies the reviewed test-module filenames; this inventory alone does not
attest that directory's source bytes or define the required security-test catalog.

Use an existing operator-owned output directory outside the test application:

On Windows, use a native directory whose resolved path is unchanged and whose
ancestor chain has no reparse points, for example an operator-owned release-evidence
folder directly under the user profile. The archive reader rejects OneDrive's
reparse-point directories. Desktop-app redirection of LocalAppData can also fail
canonical-path checks. Do not relax those checks or silently redirect an accepted
evidence locator. Keep credentials in their separately approved storage; the
non-secret acquired evidence bundles need their own stable native directory.

```powershell
.\deploy\collect-ci-evidence.ps1 `
    -CiRunId $CiRunId -SecurityRunId $SecurityRunId `
    -ExpectedSourceFile $VerifiedSourceObservationPath `
    -TestAppRoot $CapturedTestAppRoot -OutputDirectory $EvidenceDirectory
```

All arguments are explicit. The helper does not choose the latest green run or
infer a missing source identity. Missing credentials, unsupported Node/ZIP
capabilities, unavailable/expired artifacts, incomplete jobs or contradictory
results fail. Raw CLI/API errors and actor/account details are not retained.

## Validation and retained bytes

The Node owner validates workflow/repository IDs, the exact commit and attempts,
one CI job and all four Security jobs, artifact identity, ZIP size and SHA-256,
and exactly three expected source/Meteor JSON payloads. It reconstructs the
joined record, checks expected discovery, rejects duplicate JSON keys and
re-observes workflow/run/artifact metadata before publication. Artifact expiry
is checked against the acquisition clock as well as GitHub's expired flag.

The .NET adapter streams exactly three unique regular ZIP entries, checks actual
length and CRC, and rejects links, paths, duplicate entries and malformed data.
Limits: 8 MiB archive, 4 MiB per JSON file, 12 MiB total, 2 MiB API metadata per
response, 64 JSON nesting levels and 500,000 JSON syntax nodes. Processes have
bounded output, a two-minute timeout and a five-second termination grace. The ZIP checksum property is available
in the existing PowerShell 7 runtime family; an explicit capability check fails
if it is missing. No second ZIP parser or additional archive dependency is used.

Accepted data is retained under `<EvidenceDirectory>/<record SHA-256>/`:

- `acquisition.json`: at most 16 KiB of sanitized digest references and counts.
- The three exact validated JSON payloads and their original `artifact.zip`.

Files become read-only and are never automatically pruned. A repeat acquisition
reuses an existing directory only after every expected byte and read-only file
matches; it never overwrites a collision or repairs altered evidence. Incomplete
allocations are cleaned only when still owned by that invocation. Linux file and
directory modes are enforced; Windows read-only attributes do not establish
directory ACL isolation, OneDrive synchronization or cloud durability. Those
remain operator-owned storage requirements. Raw API metadata is memory-only.
Linux also rejects an output directory owned by another UID or writable by
group/others, matching the existing release-record storage boundary.

The bundle is evidence, not a second release authority. Retention beside the
existing release record and a bounded reference in that record remain integration
work. Successful source acquisition cannot establish required-test coverage,
protocol qualification, a built/registry/running image mapping or complete release
qualification. The current source artifact is produced before image construction;
external structured post-build proof remains required.
The image-proof workflow supplies a separate CI image observation; this
source-only acquisition command does not silently consume that artifact or
promote it to workstation release proof. See [source capture](source-capture.md#external-ci-image-observation).

## Optional CI image acquisition

`deploy/collect-ci-image-evidence.ps1` explicitly acquires both source evidence
and the separate image observation from the selected run. It uses the same
required arguments and approved stored sign-in as the source-only command:

```powershell
.\deploy\collect-ci-image-evidence.ps1 `
    -CiRunId $CiRunId -SecurityRunId $SecurityRunId `
    -ExpectedSourceFile $VerifiedSourceObservationPath `
    -TestAppRoot $CapturedTestAppRoot -OutputDirectory $EvidenceDirectory
```

The source bundle is preserved unchanged. A separate immutable image bundle
contains its own `acquisition.json`, the exact `mofacts-ci-image-observation.json` and the
original image `artifact.zip`. Its acquisition record links the source bundle's
digest and the exact image-observation-byte digest. Neither command writes the
authoritative release record.

The image must come from the same canonical successful CI run/attempt and clean
source identity, with a successful matching Security run. The helper matches its
source-evidence reference to the hash of the exact retained
`mofacts-meteor-test-evidence.json` bytes. Remote workflow, run, job and artifact
metadata are rechecked before publication. Missing, expired, replaced or
contradictory evidence fails; an already published source bundle remains valid
when subsequent image acquisition fails.

The native ZIP adapter's explicit `image` profile accepts exactly one regular
`mofacts-ci-image-observation.json` file, at most 16 KiB, in an archive at most 64 KiB.
Its default `source` profile and existing limits remain unchanged. Both profiles
verify streamed length and CRC and reject links, paths and duplicate entries.
The existing parser rejects duplicate JSON keys and unknown observation fields.

This remains CI test-image evidence and **acquired-unqualified**. It does not
establish the workstation's built, published or running image, required security
catalog coverage, or release qualification. Connecting the returned references
to a release-record candidate and installing protected host proof remain
separate operations.

The November 3 workstation rehearsal exposed an image-identity limitation in the
previous draft collector: it treated `docker image inspect .Id` as a config digest. On the
observed Docker 29.7.2 containerd store, default inspection returned an OCI index
digest, and platform-selected inspection returned a manifest digest. Neither was
the config digest referenced by that manifest. Source/CI acquisition success must
not waive this distinction or qualify a workstation tuple with the wrong coordinate.
The local correction now resolves the configuration from the actual Docker-save
content graph for both stores; see [identity collection](source-capture.md#external-ci-image-observation).
Existing stored observations are not rewritten. The corrected producer and shared
host reader passed complete [CI at `65875553`](https://github.com/memphis-iis/MoFaCTS/actions/runs/41824718448).
The corresponding staging2 release-record/receipt rehearsal completed with an
independently observed workstation tuple and protected host MATCH; these remain
unqualified observations. See [the receipt checkpoint](release-records.md#completed-staging2-rehearsal-2026-11-04).

## Verification

From `mofacts/`, `npm run security:test:phase0` includes pure validation and
injected acquisition tests. It does not contact GitHub or run Meteor. Native ZIP
fixtures run separately on the workstation:

```powershell
.\deploy\security-audit\test-ci-evidence-archive.ps1
```

The current staging2 acquisition used successful CI `41824718448` and Security
`41824718440`, for exact clean source `65875553`. The native decoder validated
and retained the actual artifacts against an independent clean Linux capture
and captured test inventory. Source acquisition digest:
`9e6cb25709533a860ada4bde2b1d64cbc206963bfae0df182da00141df01fd3b`;
image acquisition digest:
`6f8d0b711209a025a6cbe2af39d04516bd1c6e1a323e7815782210924fc4affb`.
The later host-policy CI `41828857886` is a separate source revision and did not
supply the selected application's evidence. Acquisition itself did not run CI,
build/deploy an image or qualify a release. Native ZIP fixtures previously passed
**31/31**. See the
[audit record](../../docs-developer/security-audit-durable-redesign-status.md).
