# Security audit code and tests

The active scanner and receiver still use `SecurityAuditReportV1`. Production setup is documented in [the operator guide](../../../docs/deployment/security-audit.md). Target architecture and progress are in [the plan](../../../docs-developer/security-audit-durable-redesign-plan.md) and [status record](../../../docs-developer/security-audit-durable-redesign-status.md).

## Inert V2 file pipeline

The V2 HTTP/admin composition passes supported Meteor verification on
`603c1233`: 990 server and 1,237 client cases passed, zero failures/hooks.
That proves the tested source, including the shared test-only collection owner;
it does not activate a route or qualify a release/deployment.

`core/producerFilesV2.mjs` owns file carriage for the existing producer/report
contracts. Producers call `writeAuditProducerFileV2` to validate their entire
catalog-owned subset before creating a new mode-0600 canonical JSON file.
Use a private per-run producer directory with exactly `<producerId>.json` names
derived from the selected catalog profile. Keep raw host/UDP inputs and the
assembled report outside that directory. Unknown or profile-excluded files fail
the directory boundary; missing/invalid expected files receive the assembler's
existing whole-producer `ERROR` recovery. No untrusted bytes enter diagnostics.
Reads are bounded and reject symlinks, non-files, multiple links, changed files,
invalid UTF-8, duplicate JSON keys and noncanonical encodings. Existing output
files are never replaced.

`assembleAuditReportFilesV2({ artifactDirectory, outputPath, envelope, env })`
accepts the existing report envelope fields except `target` and derives that
field exclusively from required `env.AUDIT_TARGET` (default `process.env`). The
selected protected environment owns this fixed HTTPS origin. The future workflow
must supply the actual scanner checkout revision in `scannerSourceRevision`;
event metadata is not evidence of the checked-out scanner source. This module
does not acquire release identity or assert authenticity of input observations.

Two explicit, unscheduled Node entry points are available:

```text
node scripts/security-audit/emit-host-producers-v2.mjs <exposure|full> <host-observations.json> <udp-observations.json> <producer-directory>
node scripts/security-audit/upload-report-v2.mjs <report.json>
```

The host emitter reads the current host envelope and the composite evaluator's
existing three-count UDP observation input. It writes `internal.json` and
`composite-exposure.json` through their shared validators. Missing/old/malformed
host input produces explicit errors; an independently confirmed UDP response
still preserves its approved HIGH failure. Emission success means files were
written, not that their controls passed. It performs no SSH or host installation.

The uploader requires the same `AUDIT_TARGET` plus the existing
`AUDIT_REPORT_INGEST_SECRET`, validates canonical report bytes/digest and target/
time constraints, and reuses the server's unchanged V2 HMAC implementation. It
makes one 30-second-bounded POST to `/internal/security-audits/v2`, with redirects
disabled, and accepts only HTTP 201. It neither reads nor prints response bodies.
There is no alternate target, endpoint or retry. Tests use synthetic files and
an injected request transport, never a real audit target.

Run `node --test scripts/security-audit/tests/producerFilesV2.test.mjs` with the
pinned Node runtime, or the full `npm run security:test:source`. The active V1
workflow and its producers/uploader remain unchanged. V2 external/authentication/
repository acquisition, full orchestration and coordinated cutover remain open.

The opt-in build-source tooling is documented in [the capture guide](../../../deploy/security-audit/source-capture.md). Its isolated tests run with `npm run security:test:capture`; local tests use synthetic tar streams and injected Docker responses, and hosted Linux CI additionally exercises actual source export and kernel write protection. CI retains the protected candidate through tests and canonical Compose construction. These remain unqualified observations, not release qualification.

The approved release-history and protected-receipt tooling is documented in
[release records](../../../deploy/security-audit/release-records.md). It preserves
the existing record owner and adds no automatic production hook. Its storage,
parser and hosted Linux permission fixtures run under `security:test:phase0`.

## Recovery transfer review draft

The [protected-transfer review](../../../deploy/security-audit/recovery-transfer/README.md)
documents the current-GitHub bootstrap, temporary expiring OIDC access and exact
one-secret destination. Its workflow is inactive outside `.github/workflows`.
`recovery-transfer.mjs` owns complete binding serialization/validation and the
initial-version protocol; `transfer-recovery-baseline.mjs` owns the Linux
hosted-runner/OIDC/AWS CLI boundary. Their synthetic tests run in
`security:test:source`; they never retrieve real secrets or contact AWS. No cloud
transfer, accepted rollback version or Phase 0 completion follows from these
tests. Execute only under the review's explicit setup/access/spending permission.

## Phase 0 contract tests

From `mofacts/`, using pinned Node 24.22.1:

```powershell
npm run security:test:phase0
```

This runs synthetic characterization and draft proof-contract tests. It does not run a production scan, Docker build, Meteor server, browser, SSH command, uploader or deployment. The assembler tests create bounded temporary synthetic files and remove their own temporary directories. No production fixtures or private settings are read. This separate entry point is not automatically added to the active scheduled scanner.

The release-store tests also exercise bounded filesystem writes and process-death
recovery in owned temporary directories. A hosted Linux-only fixture uses sudo
for root permissions inside its own temporary tree, with synthetic Docker
observations. It requires the runner's existing jq and never writes host `/etc`
or contacts a deployment. Local runs skip that fixture explicitly.

- `tests/phase0CurrentScanner.test.mjs`: V1 membership, canonical fixture digest, and known-defect witnesses. **A passing WITNESS test confirms the defect still exists.** Replace it with the opposite regression assertion in its owning fix phase.
- `tests/phase0RuntimeSemantics.test.mjs`: selected current policy/callback behavior using synthetic dependencies, including Brand Profile guard ordering, its public publication and progressive-launch early denials, plus the reviewed manifest entries; not a substitute for Meteor or HTTP-stack integration.
- `tests/phase0ReleaseIdentity.test.mjs`: strict proof parsing, clean/dirty identity, image-coordinate separation and failed/missing command observations.
- `tests/helpers/sourceWitnesses.mjs`: extracts exactly one first-party expression/callback for characterization. Source changes fail the selection visibly; there is no alternate source lookup or arbitrary private-script evaluation.
- `tests/fixtures/v1-membership.json`: frozen current IDs only, never imported by runtime producers or treated as a second canonical catalog.

## Surface classification maintenance

The V1 surface manifest now includes the previously omitted Brand Profile and progressive-launch entries. Its `public` label denotes intentional anonymous access without a throttling claim; `public-rate-limited` additionally claims throttling and must not be used merely because a surface is public. The checker accepts these labels but does not enforce or prove their policies. Existing classifications outside this bounded correction have not been recertified. Discovery remains syntactic, with known omissions documented by the witness tests.

## Draft shared proof ownership

`common/securityAudit/buildIdentity.ts` and `releaseQualification.ts` own the new pure draft proof contract. They are not imported by current startup, authorization, scanner orchestration or deployment commands. The optional qualification extends the existing workstation release record; it does not replace it. `evaluateReleaseIdentity` proves only consistency of supplied observations, not their authenticity or complete release/security assurance.

`common/securityAudit/releaseQualification.test.ts` supplies parity cases for the existing Meteor test discovery. Writing those cases or running full app typecheck does not mean Meteor CI passed. Every `npm run test:ci` needs fresh explicit authorization; Docker and remote actions also require separate permission.

See the [Phase 0 contract notes](../../../docs-developer/security-audit-phase0-contracts.md) before connecting these modules to acquisition or release tooling. No new dependency, public status, startup gate or access restriction is introduced.
