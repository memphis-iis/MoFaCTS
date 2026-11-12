# Staging2 V2 operating baseline

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

## Remaining evidence limits

The accepted exposure report has 22 PASS and one UDP ERROR. All seven selected
external UDP results were inconclusive; the scanner does not treat silence as
closure even with safe host measurements. This establishes neither an exposure
finding nor complete UDP clearance. Keep that limitation visible.

The 29-case selected authorization run is complete. The remaining authentication
protocol scenarios, repository/image qualification and a complete four-section
run remain distinct. Production still uses its pinned V1 scanner/receiver; this
procedure grants no production deployment or audit permission.
