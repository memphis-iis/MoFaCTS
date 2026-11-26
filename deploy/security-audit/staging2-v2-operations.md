# Staging2 V2 operating baseline

The current staging2 application release and rollback revision are recorded in
the [audit status](../../docs-developer/security-audit-durable-redesign-status.md).
The image and receipt coordinates below describe the November 11 baseline.

On 2026-11-11 the clean Meteor-accepted application revision
`1c72734b3f03f9c3b95bbbbab1bd1e1a0ce07140` was accepted on staging2.
It uses the published tag `ppavlikmemphis/mofacts-staging2:audit-v2-1c72734b-20261111-2303`.
The immutable registry root is
`sha256:a3d9bdca33831351a042fc4ba4bbcd466887b4776aea1a214d783b9be630dae9`;
Linux/amd64 manifest is
`sha256:1e8503c49c1ba74fb7a3832384f6bbd3c0f0dbf39fab121ea101a6ac78609ace`;
configuration is
`sha256:82da247e1a5f45178d44717ec710e664f3265f684dbc0952a7929b6a40413f39`.
These are distinct identities, not interchangeable Docker `.Id` observations.

## Application and receipt

The existing project is `staging2`, directory `/opt/mofacts/deploy`, environment
`/etc/mofacts/.env.self-hosted`. Its Compose files, in order, are:

1. `docker-compose.yml`.
2. `docker-compose.staging2-runtime.yml`.
3. `security-audit-receiver-release.compose.yml`, the exact public
   [receipt overlay](receiver-release.compose.yml).

Use that complete configuration for later operations. The last file mounts only
`/etc/mofacts/release` read-only at `/run/mofacts/release`; it does not mount the
secret-bearing parent. The directory is root:root 0700 and its single receipt
root:root 0600. No automatic bind-path creation or alternate receipt is allowed.

The workstation release record remains authoritative. Its ordinary eight-field
record and history are written by `qualification/releaseRecordStore.mjs write-v2`
only after real readiness/participant acceptance and independent running-image
and registry mapping checks. See [the release owner](release-records.md).
Current record SHA-256 is
`c2d6e598ee57d3bf9c3ed4811e9a40c2cedad38d3f475db1c761fd055730fb71`.
It is an accepted operational baseline, without a fabricated ReleaseQualification.
The four public image fields in the Desktop staging2 profile match the host;
the exact previous credential-bearing profile stays in its approved Desktop
backup folder. Credential values were not transferred during this change.

## Restricted host pairing

The existing forced-command path `/usr/local/sbin/mofacts-host-exposure-audit`
now contains `host-audit-v2.sh` (root:root 0755). It runs the qualified collector
at `/usr/local/libexec/mofacts-security-audit/host-observations.sh` and the shared
protected receipt tool, returning `MoFaCTSHostAuditAcquisitionV2`. The nine-file
raw-measurement cohort is unchanged from its prior qualification. No SSH key,
sudo rule, forwarding permission or network grant changed.

The manual access workflow pins Node checker
`c79735ff91e2dcd9109d9dc389c03c6646104152`. Supply the exact accepted workstation
record digest above on a later authorized dispatch. The current acceptance used
actual restricted SSH plus the new shared Node evaluator: eleven host controls
PASS and receipt MATCH. Arbitrary commands did not execute and PTYs were denied.
The earlier tagged-runner/44-negative-connection proof is retained for unchanged
access rules; a fresh tagged-runner execution is not claimed.

The separate manual V2 report workflow is now published as
`.github/workflows/staging2-security-audit-v2.yml`. Its existing main-only GitHub
environment has the additional staging2 report-signing binding and public
RSA-3072 encryption-key variable. The private key stays in the approved operator
Desktop folder. Saved-key encryption/decryption, binding withdrawal and actual
HTTPS signer checks passed: the valid signer reaches invalid-report validation
(400), while an incorrect signer receives 401; no report was accepted by these
probes. See [setup/custody evidence](staging2-report-writer-review.md).

GitHub currently refuses to start jobs because of an account billing lock.
Use the [operator exposure workflow](operator-exposure-v2.md) for the existing
approved Linux/operator lane. It composes the same V2 owners and keeps the final
incomplete-execution assertion; GitHub billing is not a prerequisite.
No fresh hosted audit was dispatched into that known block, no paid change was
made, and no hosted acceptance is claimed. The installed binding is a continuing
staging2-only audit function; ordinary app and restricted-host access are unchanged.

## Rollback and retained evidence

The live rehearsal saved exact root-private previous environment, active V1
receipt, protected tools and helper presence/modes before changing the app.
The configuration inode used by the receipt lock was preserved. The operator's
bounded one-use controller and its hashes, job pointers, backup inventory and
results are retained in private `phase1-20261105/live-v2-1c72734b` evidence.
Inspect that owner/job before recovery; do not guess paths, start another owner
or restore another server's configuration. Keep the previous image locally.

Recovery restores the saved app environment and V1 tools/receipt, removes only
the owned optional overlay and newly added helper files, then starts only the
`mofacts` service with the original two-file Compose configuration using
`up -d --no-deps --no-build --pull never mofacts`. It restores the exact previous
workstation record through the same history owner. It does not roll back Mongo,
delete accepted reports or restart Redis, Mongo or unrelated JEDM services.

The rehearsal actually restored V1 and then restored the candidate/V2 pair.
Independent snapshots confirmed one unchanged V2 report and an empty V1 report
collection throughout. V1 rejected V2 get/download operations; restored V2 JSON
and HTML hashes matched. The separate sealed three-image synthetic trial also
verified positive existing V1 and V2 records; do not confuse these two datasets.
Both fixture attempts' four accounts, role assignments and seven rows are absent.

## Provider sign-in evidence

Use the approved Google and Microsoft test accounts in a regular Chrome tab.
The operator handles the provider prompts in their own browser.

1. Open the [staging2 sign-in page](https://staging2.optimallearning.org/auth/login).
   Choose Google and confirm that the browser returns to staging2 and MoFaCTS
   displays an authenticated session.
2. Sign out of MoFaCTS and repeat with Microsoft.
3. Record the provider outcomes and test times with the observed staging2
   release. A passing observation requires the signed-in return to staging2.
   Use only a sanitized outcome or error summary in the evidence record.

For `401 invalid_client`, inspect the outgoing client identifier and check
whether the private staging2 settings contain both `google.clientId` and
`google.secret`. Verify a Google Auth Platform Web client has the exact
`https://staging2.optimallearning.org/_oauth/google` callback before installing
its pair. Verify the corrected authorization request before asking the operator
to retry. [Google OAuth Web client configuration](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred)

For `Username already exists [403]` after returning from the provider, use the
existing MoFaCTS account's established sign-in method. To complete a separate
Google qualification, use an approved Google identity already bound to its own
staging2 account or whose email is unused on staging2.

## Catalog v2 Full report qualification

Use the reviewed report-tool commit from a clean Linux checkout with the
repository-pinned Node runtime. Supply the same tool revision pin and clean
deployed application checkout for assembly and final qualification. The tool
checks both Git revisions, validates the verification bundle against the deployed
source's catalog and binds the reported application and Linux/amd64 image to the
accepted staging2 release evidence. Use the current application start recorded in the
[audit status](../../docs-developer/security-audit-durable-redesign-status.md)
when setting the report window.

Use a protected evidence directory with `accepted.json`, `publication.json`,
`running-image.json`, `host-receipt.json`, `verification-bundle.json`,
`metadata.json` and the catalog v2 producer files under `producers/`. Supply
the exact accepted workstation release authority as a separate argument.

```sh
node mofacts/scripts/security-audit/qualification/bindStaging2ReleaseRegistry.mjs \
  "$evidence_dir" "$release_authority" "$evidence_dir/report.json" \
  --assemble-full "$report_tool_revision" "$deployed_source_checkout"
```

The assembler retains findings and records unavailable producer evidence as
execution errors. For live qualification, use all 70 controls with zero execution
errors. Use the approved staging2 signing and archive workflow. Download the
stored JSON independently from Security Audits into `receiver-readback.json`
in the evidence directory. Keep `report-encrypted.json` and `archive-receipt.json`
from the writer, plus the separately retained key fingerprint and offline key.

```sh
node mofacts/scripts/security-audit/qualification/bindStaging2ReleaseRegistry.mjs \
  "$evidence_dir" "$release_authority" "$evidence_dir/report-release-binding.json" \
  --report-archive "$key_fingerprint_file" "$offline_key_file" \
  "$report_tool_revision" "$deployed_source_checkout"
```

Require `executionComplete: true` and verified archive evidence in the binding
before checking off Full qualification. The [control register](../../docs-developer/security-audit-staging2-control-evidence.md)
records which observations are still due.

The retained preparation index names the outstanding controls and the original
observation times. Supply protected results for those exact controls with the
target, application revision, platform image and observation times. The current
gaps are 13 authentication controls, four external controls and one MongoDB
host control. Provider round trips also belong in the Phase III acceptance
record. See the [per-control register](../../docs-developer/security-audit-staging2-control-evidence.md).

## Remaining evidence limits

The accepted exposure report has 22 PASS and one UDP ERROR. All seven selected
external UDP results were inconclusive; the scanner does not treat silence as
closure even with safe host measurements. This establishes neither an exposure
finding nor complete UDP clearance. Keep that limitation visible.

The separate Phase 2 run completed all 22 authentication controls. The hosted
workflow still acquires only selected authorization. For the coordinated Phase 3
rehearsal, the protected operator driver can call
`assembleIntegratedStaging2AuditV2` with the independently observed revision
and platform image, the full report envelope, and the existing scoped phase
executors. The function takes its authentication evidence directly from those
executors in the same process. Leave the authentication slot in the producer
directory empty. The active producer catalog must match catalog v2 before the
function starts a phase.

Keep the accepted staging2 release in service while preparing the complete
producer and protected driver. Rehearse the catalog switch with the complete
four-section report, independent image and registry observations, signed storage
and readback in one qualification window. Production still uses its pinned V1
scanner and receiver. Its cutover has a separate approval and release record.
