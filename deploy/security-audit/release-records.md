# Release record history and protected host receipt

This opt-in tooling implements the approved storage arrangement. It has local
filesystem/parser tests and hosted Linux permission fixtures that passed in
[CI at `936a64aa`](https://github.com/memphis-iis/MoFaCTS/actions/runs/41465187050).
No live host installation or production command-sheet hook has run. It does not acquire or
authenticate complete test evidence, prove OCI registry mappings, qualify a
release, or close Phase 0. See the [audit status](../../docs-developer/security-audit-durable-redesign-status.md).

## Authority and stored data

Keep the existing operator-selected `ProdReleaseRecordPath` authoritative. The
Node helper `mofacts/scripts/security-audit/qualification/releaseRecordStore.mjs`
accepts historical six-field records and current eight-field records, with the
existing optional qualification extension. Unknown fields, invalid encodings,
files over 16 KiB and internally inconsistent qualification tuples fail before
publication. No credentials, command output, provider settings or learner data
are accepted as extra fields. A valid tuple remains **consistent-unqualified**:
the tuple checker cannot authenticate the evidence supplied to it.

The helper creates `<ProdReleaseRecordPath>.history` beside the latest record.
Before replacing latest, it archives the exact previous bytes and the new
record under their SHA-256 filenames, without rewriting dates or inferring
missing evidence. History publication is exclusive and never overwrites a
collision. Files become read-only; the helper never updates or prunes them.
This is append-only behavior under the operator's control, not protection from
that owner changing permissions or deleting files.

Latest is replaced through a new, synced file in the same directory and atomic
rename, followed by read-back. Linux also syncs directory entries. Windows uses
native file flush/rename; Node does not supply equivalent directory-fsync or
OneDrive-cloud-durability guarantees. Windows directory ACLs remain the existing
operator's responsibility. Linux rejects writable/shared owner boundaries.
Do not run this helper and the old direct record writer concurrently: its
exclusive lock serializes participating writers, not other programs.

## Workstation actions

These are commands for a later authorized release operation, not evidence of
execution. Use the pinned Node toolchain and the existing record-path variable.
The candidate must already contain truthful observations from the release
procedure. No helper below builds, pushes, deploys or invents successful checks.

```powershell
# After deployment acceptance, replace the existing direct record-write step
# with this action when integration has been verified and authorized.
node C:\dev\MoFaCTS\mofacts\scripts\security-audit\qualification\releaseRecordStore.mjs `
  write $ProdReleaseRecordPath $CandidateReleaseRecordPath
if ($LASTEXITCODE -ne 0) { throw 'Release record write failed; inspect its state before continuing' }

# Produce the small server projection from the authoritative record.
node C:\dev\MoFaCTS\mofacts\scripts\security-audit\qualification\releaseRecordStore.mjs `
  project $ProdReleaseRecordPath |
  Set-Content -LiteralPath $ReleaseReceiptTransferPath -Encoding utf8NoBOM
if ($LASTEXITCODE -ne 0) { throw 'Release receipt projection failed' }
```

The projection requires the current record's explicit `imageId`. A historical
record without it stays readable in history but cannot supply an inferred host
receipt. `recordDigestSha256` is the hash of the exact authoritative record bytes;
the host projection deliberately omits the operator note and qualification tuple.

## Host installation and reading

Destination: `/etc/mofacts/release-receipt.json`, root:root, mode 0600, one regular
file with no additional hard links. The existing root-only
`/etc/mofacts/security-audit.conf` owns the selected application container through
`MOFACTS_APP_CONTAINER`. The helper takes no container override or new config key.

After a separately authorized owner-controlled file transfer, install the source
script and standalone parser from their reviewed commit. These examples assume
the two reviewed files are in the current transfer directory on the host:

```bash
sudo install -d -o root -g root -m 0755 /usr/local/libexec/mofacts-security-audit
sudo install -o root -g root -m 0755 release-receipt.sh /usr/local/libexec/mofacts-security-audit/release-receipt.sh
sudo install -o root -g root -m 0644 releaseReceipt.mjs /usr/local/libexec/mofacts-security-audit/releaseReceipt.mjs
sudo /usr/local/libexec/mofacts-security-audit/release-receipt.sh install < release-receipt-transfer.json
sudo /usr/local/libexec/mofacts-security-audit/release-receipt.sh read
```

The reviewed `host-exposure-audit.sh` must also be installed through its existing
owner-controlled process to expose `releaseReceipt` over the forced-command
channel. Its no-argument SSH boundary is unchanged. Do not grant that SSH identity
write access or a path to the `install` action.

The host uses its existing Bash/coreutils, Docker and jq; it executes the single
shared wire parser in the running app's Node with no host Node installation or
npm dependency. The parser and script must themselves be root-owned with safe
ancestor directories. Input is bounded at 8 KiB. Installation requires a match
to the independently inspected running container config ID and image revision
label. It writes a root-only temporary file in the destination directory, syncs
and atomically replaces the receipt, then checks permissions and reads it back.
An unsafe existing receipt or concurrent installation causes refusal.

Reading returns `observed` with `MATCH` or `MISMATCH`, or explicit `unavailable`
with a bounded reason. These are identity observations, **never release PASS**.
The current V1 report assembler does not yet consume/retain the extra receipt
field or turn it into a control; that remains part of qualified evidence joining.
Missing receipt tooling does not change application startup or learner access.

## Interruption and recovery ownership

The operator owns workstation recovery; the root deployment owner owns host
recovery. Neither helper takes over a stale lock automatically.

- Workstation exceptions normally remove only their own temporary file and lock.
  Process death leaves `<record>.lock` containing a UUID and PID. Verify that
  writer is stopped, read/validate latest and the exact hash-named history files,
  and inspect only temporary names carrying that lock UUID. A crash between
  archive hard-link publication and unlink can leave two links or a writable
  archive. After byte/hash validation, remove only that writer's temporary link
  and restore the archive's read-only mode. Remove the verified stale lock and
  rerun the same candidate. Never overwrite a conflicting archive or delete
  history to obtain success. Unsupported hard links fail explicitly.
- A failure before latest replacement leaves the old latest; a failure during
  post-replacement sync/read-back may leave the complete new latest. Both records
  have been archived first. Inspect actual state rather than assuming rollback.
- A killed host installer may leave `/etc/mofacts/release-receipt.json.lock` and
  one `.release-receipt.*` temporary file. Root must verify no installer runs,
  inspect the old/new receipt and remove only the identified temporary file and
  empty stale lock directory. Repeat installation from the authoritative record.
- Workstation and host publication are not a distributed transaction. If host
  installation fails after a local record write, preserve both states and repeat
  the receipt operation after resolving the failure; never change recorded image
  identifiers to manufacture a match. This tooling does not roll back the app.

Hosted Linux fixtures exercise root permissions and the actual shell/parser
lifecycle against synthetic Docker observations. They do not establish behavior
on staging2, OneDrive synchronization or a production host. Those remain explicit
execution/acceptance steps.
