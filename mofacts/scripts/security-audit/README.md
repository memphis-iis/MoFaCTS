# Security audit implementation

This directory owns the scanner-side acquisition, assembly, qualification and
retention tools for the MoFaCTS security audit. Shared catalog and evidence
contracts live in `common/securityAudit`; the Meteor receiver, storage and
administrator presentation live in `server/securityAudit`; host/deployment
procedures live in `deploy/security-audit`.

The normative design is the
[durable redesign plan](../../../docs-developer/security-audit-durable-redesign-plan.md).
Completed work and exact evidence coordinates are recorded in the
[status ledger](../../../docs-developer/security-audit-durable-redesign-status.md).
Operational production guidance is in
[the deployment guide](../../../docs/deployment/security-audit.md), and the
current non-production release is in the
[staging2 operating record](../../../deploy/security-audit/staging2-v2-operations.md).

## Current catalog ownership

Catalog versions are append-only files under
`common/securityAudit/catalogs/`. `common/securityAudit/catalogRegistry.ts`
parses their exact bytes, pins their golden digests and keeps all released
versions readable.

- V1 is the separately owned scheduled-producer selection.
- V2 is the accepted integrated-authentication catalog retained for historical
  report decoding.
- V3 changes exactly the fifteen approved reproducible closeout evidence
  contracts. Its full profile still contains the same seventy control IDs.
- The staging2 receiver selects V3 explicitly in `server/serverComposition.ts`.
  Receiver selection does not change the scheduled producer selection or
  reinterpret a historical report.

On 2026-11-27 staging2 accepted a V3 report containing 70 PASS and zero
FAIL/ERROR/NA. Its exact source, image, report, readback and archive coordinates
are in the status ledger. Production has not inherited that staging2 result; its
coordinated cutover remains separately authorized work.

## Data flow and owners

1. Acquisition modules under `authentication/`, `external/`, `internal/` and
   `repository/` create bounded observations. Credentials and raw learner data
   are never report fields.
2. Producer owners validate their complete catalog-owned section and write one
   canonical `MoFaCTSSecurityAuditProducerArtifactV1` file. The shared file
   owner is `core/producerFilesV2.mjs`.
3. `core/assembleV2.mjs` validates exact profile membership and creates the
   canonical signed-report payload. It does not acquire evidence or infer an
   identity omitted by a producer.
4. `qualification/composeVerificationBundle.mjs` joins the exact clean source,
   executed Meteor cases and expected sealed runtime registry into a
   `VerificationBundleV1` carried by the image.
5. Image/release observers under `qualification/` independently bind the
   source snapshot, published Linux/amd64 manifest, running configuration,
   protected release receipt and deployed registry.
6. `qualification/reproducibleCloseoutV3.mjs` replaces exactly the fifteen V3
   evidence rows in the five already reviewed artifacts. It rejects a missing
   producer, any non-passing unchanged row, duplicate/missing control or a
   report other than exactly seventy unique controls.
7. `upload-report-v2.mjs` sends one bounded request to the selected receiver.
   The server validates the HMAC, exact selected catalog and canonical report
   before storage. Administrator list/get/download read the stored bytes back.
8. `encrypt-report-v2.mjs` creates the operator-held public-key archive. The
   acceptance path independently compares receiver readback and an in-memory
   archive decryption with the writer bytes before deleting temporary plaintext.

The report status is evidence evaluation, not transport status. A security
`FAIL` is a finding; an `ERROR` means required evidence or execution is absent.
Successful upload or encryption alone never changes either result.

## Registration and runtime proof

The maintained application surface inventory is the typed registration system
under `server/securitySurfaces`, not a parallel JSON manifest. The lint-owned
`checkRegistrationBypasses.mjs` rejects application-owned method, publication,
HTTP, Accounts/OAuth and collection-rule registrations outside their approved
owners. The sealed runtime registry supplies the deployed inventory and its
required verification IDs. `VerificationBundleV1` must close over that exact
inventory before a release can be accepted.

Historical catalog fixtures and witnesses are compatibility tests only. They
are not another policy owner, producer, receiver selection or current report.

## Maintainer commands

Run commands from `mofacts/` with the repository-pinned Node/npm/Meteor tools:

```text
npm run typecheck
npm run lint
npm run security:surfaces
npm run security:test:source
npm run security:test:phase0
npm run security:test:capture
```

The complete Linux source gate is:

```text
node --test scripts/security-audit/source-security-v2.test.mjs
```

Windows may skip Linux-only file-mode/firewall fixtures; a matching supported
Linux result must account for every required case. A source test is not a
substitute for the authorized Meteor integration suite, canonical Compose image
qualification, deployed readback or a production audit.

The explicit report commands remain unscheduled building blocks:

```text
node scripts/security-audit/prepare-metadata-v2.mjs ...
node scripts/security-audit/emit-authentication-producer-v2.mjs ...
node scripts/security-audit/emit-external-producer-v2.mjs ...
node scripts/security-audit/emit-host-producers-v2.mjs ...
node scripts/security-audit/emit-repository-producer-v2.mjs ...
node scripts/security-audit/assemble-report-v2.mjs ...
node scripts/security-audit/upload-report-v2.mjs <report.json>
node scripts/security-audit/encrypt-report-v2.mjs <report.json> <encrypted-report.json>
node scripts/security-audit/assert-execution-complete-v2.mjs <report.json>
```

Do not run those commands by inventing missing arguments, alternate targets,
credentials or evidence. Follow the matching procedure under
`deploy/security-audit` and the plan's authorization boundary.

## Adding or changing a control

1. Decide whether the existing control and evidence contract can express the
   property. If its meaning, severity or required evidence changes, append a
   catalog version; never edit released catalog bytes.
2. Add the evidence-contract validator in `common/securityAudit` and keep
   acquisition separate from evaluation.
3. Add the control to exactly one producer and one section/profile. Catalog
   parsing must reject duplicates, unknown references and incomplete profiles.
4. Declare deterministic verification cases in
   `common/securityAudit/verificationCatalog.ts`. Bind each case to the real
   registered surface that owns the behavior; do not create synthetic runtime
   surfaces only to satisfy coverage.
5. Add positive baselines, expected denials, malformed-input behavior, side
   effects and cleanup checks at the owning boundary. A timeout or unrelated
   error is not authorization evidence.
6. Update the typed registration descriptor and its owning Meteor/HTTP/package
   integration test when the protected surface changes.
7. Run typecheck, lint, the complete source gate and the supported Meteor suite
   when its contracts are affected. Compose a new exact-source verification
   bundle; never reuse proof from a different commit.
8. Coordinate the receiver before activating an incompatible producer catalog.
   Verify upload, independent readback, archive round trip and rollback as one
   release unit.
9. Record the exact commit, source snapshot, bundle, image, receipt, report and
   archive digests in the status ledger. Keep staging and production claims
   separate.

## Storage, privacy and recovery

Producer directories contain only the exact expected canonical files. Shared
readers reject symlinks, multiple links, non-files, changed files, invalid UTF-8,
duplicate JSON keys, noncanonical encodings and oversized input. Existing output
files are never overwritten.

The upload secret, signing material, provider credentials, reset links and
offline private key remain in their approved protected stores. Retained public
evidence is sanitized. Temporary plaintext report/readback files are removed
only after remote-byte and archive-byte equality pass; the encrypted artifact,
receipts and rollback records remain. Failed attempts are recorded honestly and
are never relabeled as accepted reports.

GitHub billing is unavailable. Repository Security checks use the documented
operator Linux executor. Hosted, operator, Meteor, image, staging2 and production
evidence are distinct and must not be substituted for one another.
