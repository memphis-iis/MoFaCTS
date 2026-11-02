# Optional CI evidence acquisition

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

## Verification

From `mofacts/`, `npm run security:test:phase0` includes pure validation and
injected acquisition tests. It does not contact GitHub or run Meteor. Native ZIP
fixtures run separately on the workstation:

```powershell
.\deploy\security-audit\test-ci-evidence-archive.ps1
```

The recorded live acquisition of CI `41511591350` and Security `41511591390`
validated existing synthetic results; it did not execute a new CI run or prove
the current working tree matches that earlier candidate. See the
[audit record](../../docs-developer/security-audit-durable-redesign-status.md).
