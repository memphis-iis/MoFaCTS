# Security audit code and tests

Staging2 runs the qualified V2 application/receipt/host pair; production retains
its immutable V1 scanner/receiver selection. See the [staging2 baseline](../../../deploy/security-audit/staging2-v2-operations.md),
[production operator guide](../../../docs/deployment/security-audit.md),
[plan](../../../docs-developer/security-audit-durable-redesign-plan.md) and
[current status](../../../docs-developer/security-audit-durable-redesign-status.md).

The selected authorization adapter passes all 29 live cases. Its authentication
producer validates the complete finite case vector and emits its catalog-owned
22-control subset: only the selected authorization control can pass from that
proof; the other 21 protocol scenarios remain explicit Phase 2 ERROR results.
`run-selected-authorization-v2.mjs` accepts canonical private value-only bindings
and writes canonical finite observations after browser cleanup.
`emit-authentication-producer-v2.mjs` consumes only those finite observations.
Phase 2 source intent now references all 22 authentication controls through
`AUTHENTICATION_CONTROL_CASES` in the same verification catalog (68 unique
verification entries, including baselines). This does not change the active
producer's selected-only boundary. The current reset/two-session and lifetime
subcases have live staging2 acceptance through the existing
[connected Gmail procedure](../../../deploy/security-audit/connected-mail.md).
The passwordless evaluator distinguishes observed violations from missing facts
and exact method denials from unrelated errors. Material observation requires all
five installed/complete channel hooks; throttle evaluation requires independent
fresh-scope attribution. These source helpers grant no access and acquire no
provider credentials. Live remaining protocols, complete fixture/lease ownership,
new evidence-contract catalog activation and a complete authentication artifact
remain pending. The immutable historical boolean helper is test-only.

`authentication/protocolBindingsV2.mjs` owns the value-only
`MoFaCTSAuditProtocolBindingsV1` preparation/validation and child projections.
It generates seven fresh scoped credentials, accepts the existing operator as
the eighth actor, rejects policy/role/unused IMAP blocks and projects the accepted
selected schema. A credential plan does not create an account or establish its
server ownership/role; the fixture owner must verify both before acquisition.
`core/childEnvironmentV2.mjs` owns the shared explicit Linux-tool and Windows-
browser environment profiles. Repository callers use the unchanged Linux
allowlist; authentication children receive only their scenario's actor/value
subset through private input, with no provider, signing or mailbox credential.
Unknown variables and Node injection/filter flags fail at that shared boundary.

P2-D2's [passwordless identity review](../../../deploy/security-audit/passwordless-identity-review.md)
records a separate existing history-only identity inference. Its proposed login
gate change is pending approval; source characterization does not establish that
affected accounts exist in a deployed database. No account migration is implied.

The repository and metadata entry points share the existing V2 owners. Metadata
completion is stamped after acquisition; no environment revision or tag replaces
a missing/mismatched protected receipt.

The manual-only staging2 workflow is maintained at
[staging2-security-audit-v2.yml](../../../.github/workflows/staging2-security-audit-v2.yml).
Its report-writing binding and separate operator-owned encryption key are now
authorized by Section 0's bounded access delegation of 2026-11-12; follow the
[report-writer procedure](../../../deploy/security-audit/staging2-report-writer-review.md)
without another approval question when its technical and custody gates pass.
Its one signing binding and operator-held RSA pair are installed and verified;
GitHub billing is unavailable. The standard
[operator exposure sequence](../../../deploy/security-audit/operator-exposure-v2.md)
uses the same owners without hosted execution; actual report acceptance is
recorded independently. No production action has been performed. Missing tools,
canaries and protocol acquisitions remain ERROR,
and the final completion assertion runs after signed storage/encrypted retention.

Current source no longer contains the superseded V1 scanner/assembler/upload
executables or duplicate control tables. Production remains on its immutable
historical checkout until separately authorized cutover. Test-only Phase 0
witnesses retrieve that exact Git revision and run only its synthetic file
assembler; no old network/browser acquisition is exposed by the fixture owner.
Shared canonical JSON/command, scanner parsing and recovery-binding helpers
remain where V2 and recovery code actually consume them.

## V2 file pipeline

The V2 HTTP/admin composition passes supported Meteor verification on
`603c1233`: 990 server and 1,237 client cases passed, zero failures/hooks.
That historical checkpoint proves the tested source, including the shared
test-only collection owner. Later staging2 activation/rollback passed on the
accepted 1c72734b image; its exact evidence remains in the current worklist.

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
selected protected environment owns this fixed HTTPS origin. Workflow assembly
supplies the actual scanner checkout revision in `scannerSourceRevision`;
event metadata is not evidence of the checked-out scanner source. This module
does not acquire release identity or assert authenticity of input observations.

Explicit, unscheduled Node entry points include:

```text
node scripts/security-audit/emit-host-producers-v2.mjs <exposure|full> <host-observations.json> <udp-observations.json> <producer-directory>
node scripts/security-audit/assemble-report-v2.mjs <metadata.json> <producer-directory> <report.json>
node scripts/security-audit/upload-report-v2.mjs <report.json>
node scripts/security-audit/encrypt-report-v2.mjs <report.json> <encrypted-report.json>
node scripts/security-audit/assert-execution-complete-v2.mjs <report.json>
```

The assembly command accepts canonical metadata containing the report ID,
profile, start and completion times, the two deployment identity observations,
and tool versions. It resolves the scanner revision using Git in the scanner
checkout and takes the target from `AUDIT_TARGET`. Metadata that supplies either
field is rejected. The command uses the same producer membership and file
validation as the assembly library.

The V2 admin state adapter consumes the store's projected history and two latest
cards directly, including an empty list and distinct scanner, application, and
image identities. The explicit `adminSecurityAuditsV2` template prepares the
Blaze presentation with that adapter, existing theme CSS and admin components.
It displays unavailable/conflicting identity observations explicitly and keeps
the existing download actions, retry, announcements and focus handling. Its
metadata labels are present in all ten interface locales. Source tests cover
the store projection, separate freshness windows and HTML/JSON export rendering.
The prepared Meteor browser cases cover rendered cards, empty history, rejected
responses, exact download selection, duplicate clicks, focus and view cleanup.

The current application has replaced the V1 route loader/template and controller
with this V2 presentation and removed their superseded source. Its rendered
page, actual get/downloads and previous-image exclusion/restoration passed on
staging2. Browser unit tests still use synthetic method responses; their proof
is separate from live acceptance. Production retains its pinned V1 pairing.

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

The encryption entry point validates the complete V2 report, canonical bytes,
catalog/digest and protected `AUDIT_TARGET` before using the existing
RSA-OAEP-SHA256/AES-256-GCM envelope implementation. It requires the existing
`AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY` setting and exclusively creates a mode-0600
file. Existing output is never overwritten. The encrypted-file limit includes
base64 and envelope overhead; the unchanged plaintext limit remains 2 MiB.
It accepts diagnostic reports containing execution errors so they can be retained.
It reads no private decryption key, uploads nothing and proves only local output.

The final assertion independently rejects either nonzero ERROR row counts or a
nonempty execution-error list. Security FAIL rows remain findings and do not
make an otherwise complete execution fail. This command verifies neither stored
report identity nor remote artifact retention. The future workflow must verify
HTTP storage and encrypted-artifact retention before calling it; a successful
local encryption command alone is insufficient for acceptance.

Run focused file/retention tests with the pinned Node runtime:

```text
node --test scripts/security-audit/tests/producerFilesV2.test.mjs scripts/security-audit/tests/reportFilesV2.test.mjs
```

The complete inert gate is `node --test scripts/security-audit/source-security-v2.test.mjs`
on the supported root Linux/jq worker. It includes the existing source suite and
new V2 acquisition, retention and authorization-outcome tests. Active V1 retains
its existing entry point, producer, crypto implementation and workflow. The
external and repository acquisition modules have synthetic source proof; real
acquisition, authentication cases, full orchestration and coordinated cutover
remain open. No new setting, dependency, scheduled job or registered route is
introduced by these explicit commands.

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
