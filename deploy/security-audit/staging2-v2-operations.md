# Staging2 security-audit operating baseline

The current staging2 application release and rollback revision are recorded in
the [audit status](../../docs-developer/security-audit-durable-redesign-status.md).
The image and receipt coordinates in the first section are current. The later
V2 sections preserve the November 11 activation and rollback history.

## Current V3 receiver qualification (2026-11-27)

Staging2 runs exact source
`41e02b2ed3b66256331e930c4dd02e1b1e3e7141` with the V3 receiver selected
explicitly in the server composition. The separately owned scheduled producer
selection remains unchanged. V1, V2 and V3 report catalogs remain readable; new
staging2 ingestion accepts V3 only.

Published tag:
`ppavlikmemphis/mofacts-staging2:audit-v3-41e02b2e-20261127`.
Registry root:
`sha256:3515794a3335ab5f11400903c22f2cfa5a7e403968c478700eff5a4162c96fed`.
Linux/amd64 manifest:
`sha256:a7c8ca34cab60e3edef2d33e65fb2629b8452794b6faba4bbc2ca4381d8f27cf`.
Configuration:
`sha256:27b3d52e68c006ed8c34ea2fc558e7c5878fc13ccd839edb903727d4cf9dfdcd`.
The accepted source snapshot is
`cbe3a8d1f8f6ef2bc6d26aa4c8bf75507b9f8761bbe7971526f5cb4f8dc460f7`;
the embedded 255-case verification bundle is
`741a6ae2b65dca1585c12ae9b47b4100978e06d316fbe21dcf66154c314aad9b`.

The running container became ready at
`2026-11-27T21:43:12.56899507Z`. HTTPS health, protected administrator login,
the exact runtime inventory, public image mapping, installed V2 receipt and the
current host acquisition all matched. The root-private rollback directory is
`/etc/mofacts/rollback-41e02b2e-20261127`; it retains the previous environment,
receipt and image observation. Do not replace that recovery set with inferred
coordinates.

The accepted report ID is
`staging2-reproducible-closeout-41e02b2e-20261127`. It has 70 PASS, zero
FAIL/ERROR/NA and no execution errors. Report digest:
`6a828baa6226304209035569b6db32f0332d17298de4bf38b518861cbca94227`;
writer/readback bytes SHA-256:
`9935a18a5c66ad1f8ce43a6dc6b7fdb63b4a469ba69b9fef756d094d073cf1ef`;
encrypted archive SHA-256:
`30a92de92e489cfb19eba5663bef9d5331b122f17b65f1179f5bcc041eb22097`.
The receiver returned HTTP 201, independent administrator readback matched the
writer bytes and catalog, and workstation in-memory decryption matched the same
bytes. Temporary plaintext source/readback files were removed only after those
comparisons passed. The encrypted archive and receipts remain in the protected
release-evidence store.

The earlier V3 attempt from `e89e10eb` was rejected before storage because the
running receiver still selected V2. Preserve its protected diagnostic evidence
as a failed attempt; it is not an accepted report or rollback authority.

## Historical V2 activation baseline (2026-11-11)

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

## Current acceptance boundary

The historical 22-PASS/one-UDP-ERROR exposure result and the separate 22-control
authentication result remain valid only in their original scopes. They are not
the current completion claim. The 2026-11-27 V3 report supersedes the fifteen
formerly open evidence requirements through the approved reproducible contracts
and closes all seventy controls for the exact staging2 release recorded above.

This is staging2 acceptance only. Production retains its separately coordinated
receiver/scanner/host selection and has not been changed by this procedure. The
final production cutover must use its own exact image, receipt, host observation,
report, readback, archive and rollback record under explicit production
authorization. Never present the staging2 report as production evidence.
