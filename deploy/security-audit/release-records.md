# Release record history and protected host receipt

This opt-in tooling implements the approved storage arrangement. It has local
filesystem/parser tests and hosted Linux permission fixtures that passed in
[CI at `936a64aa`](https://github.com/memphis-iis/MoFaCTS/actions/runs/41465187050).
The staging2 live rehearsal completed on 2026-11-04 as described below; no
production command-sheet hook has run. This storage/receipt tooling does not acquire or
authenticate complete test evidence, prove OCI registry mappings, qualify a
release, or close Phase 0. See the [audit status](../../docs-developer/security-audit-durable-redesign-status.md).

## Authority and stored data

### Inert V2 receiver projection (P1-D7)

The single standalone parser now lives at
`mofacts/common/securityAudit/releaseReceipt.mjs`. Node, Meteor and the protected
host reader use that source. The old source path under `qualification/` is removed;
no forwarding module is retained. V1 wire bytes/actions remain unchanged until
coordinated cutover. Installed V1 tooling is not silently upgraded by a source edit.

The opt-in `project-v2` operation uses the existing authoritative record plus an
explicit published-image tuple from the workstation's retained publication
observation. Its shape is the existing `publishedImage` contract: manifest or
index digest, config digest, platform, and an explicit platform-manifest digest
for an index. The tuple must match the record's registry digest and image ID;
any supplied qualification tuple must also agree. Missing mapping is an error,
never a guessed tag/config/index substitution. Phase 3 proof is not required to
project a valid ordinary eight-field record. Projection is an identity statement,
not authenticated source/image/release qualification.

```sh
node mofacts/scripts/security-audit/qualification/releaseRecordStore.mjs \
  project-v2 "$release_record" "$published_image_observation" > "$private_transfer"
```

The tuple input is a bounded JSON file containing only the existing published-image
object, not an entire registry response, CI smoke tuple or new release authority.
The resulting `MoFaCTSReleaseReceiptV2` contains only bounded public identity
fields and the existing record's SHA-256; it contains no credentials or settings.

#### Deployment-owner identity hook

The root deployment owner can acquire an independent running-image observation
with `release-receipt.sh observe-image`. This action resolves the actual Docker
image graph to its configuration digest and reads the revision label. It checks
that the same running container/image is still selected afterward. It neither
requires nor selects a receipt and grants no additional restricted-SSH command.
Do not give this deployment-owner action to the audit account.

The read-only `qualification/observePublishedImage.mjs` helper accepts an
immutable registry reference and the independently observed image configuration
and platform. It verifies exact registry blob hashes and, for an index, its
single matching platform manifest. It cannot build, pull, publish or qualify an
image. Keep registry-root, platform-manifest, configuration and engine-reference
identities distinct.

After the existing readiness and participant smoke acceptance has actually
passed, an extended release candidate can be recorded and projected together:

```sh
node mofacts/scripts/security-audit/qualification/releaseRecordStore.mjs \
  write-v2 "$release_record" "$accepted_candidate" \
  "$published_image_observation" "$running_image_observation" > "$private_transfer"
```

`write-v2` requires the existing explicit image ID and acceptance fields. It
checks source/configuration/platform against the independent running observation
and registry mapping before allocating record files. The existing record owner
archives prior and accepted bytes, replaces the authority atomically, then
re-reads its accepted bytes before returning the receipt. A missing observation,
failed write or changed readback cannot return a successful receipt. A retained
lock after interruption requires explicit owner recovery as documented below.

This optional evidence hook does not replace ordinary unqualified deployment
recording or add an application startup/deployment gate. Health alone cannot
manufacture participant acceptance. No production command-sheet execution or
installation is implied by these source tools. The image-source reader shared
with CI can independently verify the embedded source in an immutable local
image; that observation alone creates no CI proof or release qualification.

At authorized cutover, the root deployment owner saves the current V1 receipt
and tooling for explicit rollback, removes the old *active* receipt, provisions
`/etc/mofacts/release` as root:root 0700, and uses `install-v2` on the protected
receipt tool. It writes one root:root 0600 `release-receipt.json` atomically.
`read-v2` checks that mapping against the actual running image config/revision
and platform. V1 and V2 actions explicitly reject simultaneous active receipts;
they never select another path on failure. A shared kernel lock on the existing
root-private 0600 configuration inode serializes both generations' checks and
writes; reads take that same lock in shared mode. Busy acquisition is explicit
unavailability, and process exit releases the kernel lock. The existing per-file
interruption marker remains visible for owner recovery. No lock file is created
by a read. The deployment owner must leave that configuration inode unchanged
through a receipt transition; the qualification window retains its fingerprint.
The existing restricted host reader
must be upgraded/tested in the same coordinated change to use `read-v2`.

Add `deploy/security-audit/receiver-release.compose.yml` as the last optional
Compose overlay only after provisioning the protected directory. It mounts only
that directory read-only at `/run/mofacts/release`, with automatic path creation
disabled. The current runtime UID is root; the reader requires root-owned 0700/
0600 metadata. A different runtime UID requires an explicit reviewed reader
permission contract, not automatic chmod or a startup retry. Never mount the
parent `/etc/mofacts`, which contains private configuration. Directory mounting
lets the app see atomic receipt replacement without recreating its container.

`securityAuditReceiverRelease.ts` is inert: it reads only when invoked after
ingestion authentication, bounds and validates the current file, checks the
embedded revision/dirty flag and platform, and resolves a platform manifest
instead of treating an index digest as one. It reopens the file per request.
Missing/malformed/conflicting proof stays explicit audit unavailability/ERROR;
ordinary startup, health, login and default Compose remain unchanged. The
receiver factory still requires an explicitly supplied independent platform
adapter; no route is activated by this implementation.

Required acceptance before protected installation: full typecheck/lint,
source-security and affected storage/capture tests, root installer/reader
fixtures, actual read-only container write/chmod denial and atomic replacement/
rollback, plus fresh supported Meteor parity/receiver proof. Staging2 verification
is authorized after those checks; production/original staging remain excluded.
If that verification fails, remove the V2 mount/active receipt and restore the
exact saved V1 receipt/tooling through the deployment owner. Keep both version
contracts only while their existing rollback/provenance consumers remain; no V1
historical report UI or alternate active release authority is introduced.

### Bounded staging2 receipt verification

`receiver-release-window.sh` is a root-operator test controller, never an audit
account command or sudo grant. It requires a private
`/var/tmp/mofacts-receiver-release.<12 alphanumeric characters>` packet, separate
SHA-256 pins for the packet, baseline and controller, eight exact public source
files, a successful native Meteor receipt bound to that source, and the reviewed
credential-free transfer. The baseline pins existing protected file hashes and
permissions, the app image/configuration hash and the absence of the V2 directory.

The controller verifies the staging2 target and current Compose definition before
mutation, saves the V1 receipt/tool/parser, installs the candidate, adds the
optional mount to the *existing* image and verifies host MATCH, actual app
EROFS write/chmod denial and atomic inode replacement visibility. An isolated
256 MiB/no-network/no-extra-swap container using that same image checks the new
independent adapter against the image's embedded source identity. It has only
read-only public source/receipt mounts and receives no application settings,
database volumes or Docker socket. No image is built, pulled or published.

EXIT/TERM/INT restoration removes the mount by recreating only the app through
the exact original Compose files, restores the exact V1 files and verifies their
hashes/permissions and the original app image/configuration hash. Other project
container IDs/images/start times/states must remain unchanged. Commands are
bounded, and the outer operator uses a 900-second timeout with 300 seconds for
termination cleanup. A separately retained root `restore` action recovers from
untrappable termination. An unexpected file edit is retained and reported as a
restoration failure instead of being overwritten. Only the exact ownership-labeled
disposable proof container may be removed. Keep the private packet, original
files and structured results for recovery; do not publish runtime logs/settings.

The four Linux orchestration tests cover success/idempotent recovery, activation
failure, foreign edits and preflight drift with explicit synthetic Docker/reader
doubles. They do not establish kernel or deployed-reader behavior; the separate
actual mount fixture and live staging2 results provide that evidence. The source
controller is maintained alongside those tests; using it requires explicit
staging2 execution permission and passing applicable source checks.

Keep the existing operator-selected `ProdReleaseRecordPath` authoritative. The
Node helper `mofacts/scripts/security-audit/qualification/releaseRecordStore.mjs`
accepts historical six-field records and current eight-field records, with the
existing optional qualification extension. Unknown fields, invalid encodings,
files over 16 KiB and internally inconsistent qualification tuples fail before
publication. No credentials, command output, provider settings or learner data
are accepted as extra fields. A valid tuple remains **consistent-unqualified**:
the tuple checker cannot authenticate the evidence supplied to it.

### Versioned evidence references

`ReleaseQualificationV2` extends the same optional `qualification` field. It
retains one build identity, a required source-acquisition digest and an optional
CI-image-observation digest. The actual workstation identity tuple is optional;
missing image/command evidence is never filled from CI's smoke image or invented.
The top-level commit and dirty-source flag must agree with the qualification's
build identity, including when the actual tuple is absent.

The local linkage draft also permits `ciImageAcquisitionDigestSha256` when the
observation digest is present. This locates the complete retained image bundle;
the observation digest checks its exact statement bytes. The two identify
different objects. Existing records without the bundle reference stay readable;
new candidate preparation supplies both. Neither digest alone authenticates
evidence. Immutable bundle names and retention remain unchanged.

A valid incomplete V2 record may be preserved as `incomplete-unqualified`, while
the identity evaluator returns `ERROR/proof-unavailable`. A supplied actual
workstation tuple must pass the same consistency checks as V1 before storage;
its storage label remains `consistent-unqualified`. Neither label is complete
release qualification. Digest syntax alone does not establish that referenced
bytes exist, are authentic, or satisfy the required verification catalog.

Historical six-field, eight-field and V1 records retain their parsing and
evaluation behavior and are not rewritten. The existing exact-byte history and
atomic latest-record replacement remain in use. Host projection still omits the
qualification payload; its authoritative-record digest binds the extended bytes
while its image ID continues to come from the explicit workstation record.

The parser/storage and three new shared Meteor parity cases passed in
[CI at `29394ded`](https://github.com/memphis-iis/MoFaCTS/actions/runs/41537962904).
It is not installed in the private production writer. Staging2 now has retained
source/image references, a separate workstation identity and a protected matching
receipt. Full evidence authentication and production integration remain separate
gates. See the
[status record](../../docs-developer/security-audit-durable-redesign-status.md).

### Prepare a candidate without publishing it (local draft)

`deploy/prepare-release-evidence.ps1` accepts a fresh six/eight-field candidate
without a `qualification` field. It uses the same pinned Node, PowerShell 7 and
approved GitHub sign-in as the acquisition helpers, with the same explicit run,
expected-source, test-app and evidence-directory arguments, plus `-CandidateFile`.
It acquires and verifies source/image evidence before emitting only the new JSON
candidate on stdout. The input file and authoritative release record are not
written. Existing qualification payloads are rejected explicitly; this operation
does not migrate historical proof or replace an existing observation.

The candidate's commit and dirty flag must match the expected and acquired full
build identity. Input changes during acquisition fail before candidate output.
The prepared V2 block remains `unqualified`, with both image references and no
actual workstation tuple. All existing deployment fields, including an explicit
workstation image ID, remain as supplied; CI's image cannot replace them.

```powershell
# Capture the emitted JSON; this does not publish a release record.
$PreparedReleaseRecordJson = .\deploy\prepare-release-evidence.ps1 `
    -CandidateFile $CandidateReleaseRecordPath `
    -CiRunId $CiRunId -SecurityRunId $SecurityRunId `
    -ExpectedSourceFile $VerifiedSourceObservationPath `
    -TestAppRoot $CapturedTestAppRoot -OutputDirectory $EvidenceDirectory
```

Preserve the emitted JSON when saving a candidate. PowerShell JSON conversion
can coerce timestamp strings to dates and change their required representation
on reserialization; inspecting a converted object does not preserve its bytes.

The expected source observation must come from the independently captured
candidate when assessing a release. Echoing a hosted observation validates that
run's internal linkage only. Publishing the prepared record remains owned by the
existing storage helper after separately authorized release acceptance. This
draft adds no production command-sheet hook, host installation or default gate.

### Record history and replacement

The storage helper creates `<ProdReleaseRecordPath>.history` beside the latest record.
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

The receipt's existing `imageId` means the image **configuration digest**. The
host reader resolves the running container's immutable engine reference through
the same standalone `imageArchiveIdentity.mjs` content-graph reader used by CI.
It does not compare a containerd index/manifest ID as though it were a config ID.
The running application's Node streams the export; no extra host Node package or
registry access is required. Export and metadata limits are documented in
[source capture](source-capture.md#external-ci-image-observation). Missing or
untrusted support files and failed/ambiguous observations remain unavailable;
existing receipt bytes are not rewritten to conceal a mismatch.

After a separately authorized owner-controlled file transfer, install the source
script and both standalone parsers from their reviewed commit. These examples
assume the three reviewed files are in the current transfer directory on the host:

```bash
sudo install -d -o root -g root -m 0755 /usr/local/libexec/mofacts-security-audit
sudo install -o root -g root -m 0755 release-receipt.sh /usr/local/libexec/mofacts-security-audit/release-receipt.sh
sudo install -o root -g root -m 0644 releaseReceipt.mjs /usr/local/libexec/mofacts-security-audit/releaseReceipt.mjs
sudo install -o root -g root -m 0644 imageArchiveIdentity.mjs /usr/local/libexec/mofacts-security-audit/imageArchiveIdentity.mjs
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

## Staging2 rehearsal prerequisites and procedure

The receipt integration gate uses the existing owners above. Protected-host
installation requires explicit authorization, separate from the standing
permission to take staging2 offline/reset/rebuild. Production and the older
staging installation are excluded. The receipt projection adds no SSH capability,
storage owner or service; missing host-audit prerequisites must be established
through their own approved setup.

The 2026-11-02 conditional preflight found no existing protected audit
configuration, host-audit entry point or receipt tooling on staging2. It stopped
before installation. At that checkpoint the server used Caddy without Apache or Tailscale;
the production host-audit template's corresponding assumptions therefore need
an explicit target-compatibility review. Provisioning the missing audit access
and configuration is an expanded setup operation, not receipt installation under
the prerequisites below. See the [current audit record](../../docs-developer/security-audit-durable-redesign-status.md).

On 2026-11-03 Phil approved that expanded production-like staging2 setup and
selected the PC's existing Tailscale network. It covers Apache/private management,
dedicated restricted audit access, protected configuration, necessary scoped
database audit access and a verified staging2 release, preserving the usable
prior image/configuration. It does not waive the receipt gates below, authorize
new spending or production changes, or establish enrollment, access-rule safety,
release qualification or successful receipt installation. Recovery state has
been preserved. The later completion checkpoint below supersedes this setup state.

1. **Read-only preflight.** Confirm staging2's actual container, config ID,
   revision label and existing protected container-selection setting. Inspect
   owner/mode/link/ancestor safety and existing receipt/tool bytes. Select a
   rehearsal workstation record and evidence directory isolated from production
   authority. Missing actual identity, independent expected-source observation,
   accepted release metadata or matching retained evidence halts before writes.
   CI's smoke image and synthetic probe records cannot supply staging2 identity.
   Retain only allowlisted identity, permission and hash summaries; never copy or
   log protected configuration contents.
2. **Workstation rehearsal.** Use the accepted staging2 candidate with prepare,
   the existing storage/history owner and projection. Check that both evidence
   locators resolve, prior record bytes remain in history, latest reads back and
   the receipt omits qualification and operator assertions. A six-field record
   without an actual image ID cannot be projected. Preserve the previous usable
   rollback image and matching configuration/evidence if a staging2 build is
   needed under its existing authorization.
3. **Protected installation.** Preserve exact prior receipt/tool bytes and their
   owners/modes in owner-protected recovery storage. Transfer only the reviewed committed
   `release-receipt.sh`, standalone `releaseReceipt.mjs` and, if needed, the
   matching `host-exposure-audit.sh` with all required root-owned policy files
   into their existing documented destinations. The current auditor requires
   `MOFACTS_PUBLIC_HOSTNAME` in protected configuration and its Apache policy;
   complete those before installing the updated auditor.
   Stop for unexpected host customization or unsafe ownership. Install through
   the deployment owner; retain root-only receipt/config ownership and the
   current read-only forced-command identity. Do not change the protected
   container selector, SSH access or production command sheets.
4. **Real-host acceptance.** Require an independent actual-container comparison,
   `observed/MATCH` read-back and the bounded receipt through the existing
   restricted channel. Reject a deliberately mismatched transfer without changing
   the accepted receipt. Verify receipt/parser permissions and application health.
   Use the existing hosted interruption/history fixtures for their covered cases;
   the live rehearsal concentrates on actual host ownership, channel and identity.
   A receipt match remains an identity observation, never release qualification.
5. **Recovery and record.** If acceptance fails, restore only the saved receipt
   and tooling state through their owner; an originally absent receipt returns to
   absent. Retain workstation history and bounded evidence. If an application
   candidate was separately deployed, use its existing image/configuration
   rollback procedure. Record exact outcomes and remaining Phase 0 gates without
   waiving an unsafe or unavailable observation.

### Completed staging2 rehearsal (2026-11-04)

The selected application source `65875553` passed complete CI
[`41824718448`](https://github.com/memphis-iis/MoFaCTS/actions/runs/41824718448)
and matching Security, independent Linux source capture, canonical workstation
Compose construction and isolated image startup. Its separately published
staging2 image was deployed and the actual running config bytes verified.
The host listener policy at `c7444b4e` passed its separate complete CI run before
installation; its CI smoke image did not replace the selected application's proof.

The staging2-only authority is the native, operator-owned
`C:\Users\ppavl\MoFaCTS-Release-Evidence\staging2-release-record.json`, isolated
from production and from the old Desktop bootstrap status. The supported writer
published/read back its first immutable history entry with retained source/image
evidence references and the actual workstation/registry/host tuple. Its digest is
`5090b3fa162cffe158cd5ec3dbb27de1a160875bbbe14c1ad22d1585b39552e6`.
Credentials remain in their separately approved Desktop storage.

The supported root owner installed the 0600 receipt. Independent actual-container
comparison and restricted forced-command read-back both returned
**observed/MATCH**. A deliberately wrong config transfer was rejected without
changing accepted bytes; transient lock cleanup and direct private-file read
denial passed. All nine host controls, restricted-key isolation/PTY/forwarding
checks, application/HTTPS health and actual Chrome regression acceptance passed.
The prior image, env/settings, Compose files and application-only rollback remain
root-protected. Production and the older staging installation were untouched.

The isolated GitHub access procedure is documented in
[staging2 audit access](staging2-access.md); its manual acceptance is separate
from installing or replacing a receipt.

This is **consistent-unqualified** identity/evidence linkage. Full verification
catalog authentication, receipt integration into the V1 report, AWS secret-recovery
provisioning and Phase 1 activation remain separate gates. The separately approved
GitHub staging2 identity passed its manual private-channel acceptance in
[run `41845349663`](https://github.com/memphis-iis/MoFaCTS/actions/runs/41845349663),
including nine controls, receipt MATCH and negative access probes. It is not yet
a scheduled or ingested security report. UFW blocks public SSH, while removing the separate
Lightsail cloud SSH rule awaits an operator AWS login. See the
[exact audit outcomes and next decision](../../docs-developer/security-audit-durable-redesign-status.md).

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
