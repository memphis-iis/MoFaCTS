# Unattended encrypted-archive verification

Status: offline-key approach explicitly approved by Phil, 2026-11-16.
The rules below are the selected policy; implementation/acceptance remain tracked separately.

## Verified starting point

The staging2 cloud connection now supports a live status call and an actual
scheduled status call after service restart. Refresh rotation is corroborated
by sanitized state counts. This does not qualify Gmail carriage, the complete
scanner, storage/readback, alerts or production.

The existing staging2 RSA-3072 key pair and saved-key round trip were accepted
on November 12. That is completed evidence, not an instruction to repeat setup
or create another key. The private key remains in the approved Desktop folder;
only its public part is authorized for the signer. Preserve all retained keys.

`staging2-unattended-design.md`, qualification item 5, requires keeping the
decryption key off the scanner host and resolving the owner for unattended
readback. Before this approval, `operator-exposure-v2.md` required saved-key decryption and
exact payload-digest comparison before claiming recoverable retention and
removing that run's private plaintext. The current operator can do that while
the workstation is available. A fully unattended server cannot use an offline
Desktop key while the workstation is off. A ciphertext checksum does not prove
that it can be decrypted.

## Approved decision: offline recovery key, distinct routine checks

Keep the existing private key offline. Automate these checks for every run:

- Validate the exact report and canonical digest before encryption.
- Require the already accepted public-key fingerprint and supported algorithms.
- Save the encrypted envelope, read back those saved bytes and compare their
  cryptographic checksum with the just-created envelope.
- Independently read back the ingested report and compare its exact report ID,
  catalog and payload digest. An upload acknowledgement alone is insufficient.
- Complete owned cleanup and enforce retention. Any unavailable required
  observation remains an execution error.

Perform a saved-archive decrypt/digest comparison during complete release
qualification, after any key or encryption implementation change, and when
testing recovery. Use the operator's existing private key through the approved
private mechanism; retain only fingerprints/outcomes and discard decrypted data.
The current full qualification still needs its real report round trip.

This changes the frequency of the archive decrypt check: it is qualification
and recovery evidence, rather than a new decrypt operation on every recurring
run. Routine evidence must say what was actually checked; it must never claim
that a ciphertext checksum proves successful decryption. After the required
automated storage/readback checks, the runner may remove its owned plaintext
without waiting for an offline-key operation on every run.

This option needs no new mailbox grant, online private key, paid service or
production access. It keeps all security controls and the separate application
readback requirement. This policy is approved; execution evidence is separate.

## Unselected alternative: decrypt every recurring archive

Preserve the current per-run saved-key decryption condition. That requires a
reviewed, always-available decryption owner with access to a private key. Its
host, trust boundary, credential custody, permissions, revocation and recovery
must be approved before implementation. The standing delegation does not
authorize moving the operator's private key out of its approved Desktop folder.
No such owner or access has been provisioned. Do not copy the key onto staging2
or assume the newly connected mail/status service can decrypt reports.

## Unchanged gates

The decision does not close Phase 2, schedule a production audit, waive real
Gmail/reset/unused-token-aging tests, suppress ERROR findings, change learner
passwordless access or authorize production cutover. Continue those gates from
the sole status checklist. The policy choice is resolved; its implementation and
live acceptance remain separately tracked.

## Implementation owners

`core/reportFilesV2.mjs` owns the pinned archive write, saved-byte verification,
exact validated receiver comparison and gated temporary-plaintext cleanup.
The receipt reuses the accepted `publicKeySha256`, `reportBytesSha256` and
`encryptedBytesSha256` names. Its hash pins are not calculated from an untrusted
readback and then accepted as expected values. Keep the accepted fingerprint
separate from the supplied public PEM.

`core/reportReadbackBrowserV2.mjs` reads only the selected staging2 report through
the existing admin-protected JSON download. It creates no account or access,
validates the operator before/after, rejects redirects/foreign URLs, bounds the
stream and verifies the download hash before strict V2 parsing. Its returned
bytes remain private runner input, never console output or public evidence.
This interactive operator reader does not establish unattended administrator
custody or expand the mail/status connection's authority.

The run owner must persist its private manifest and content-free verification
receipts before asking `completeOfflineKeyRetentionV2` to remove temporary source
and receiver-copy paths. It owns cancellation and recovery after partial cleanup.
Do not delete unrelated plaintext or keys, infer a missing readback, or call a
synthetic ERROR report a complete audit.