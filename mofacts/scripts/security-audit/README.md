# MoFaCTS security audit maintenance

The audit turns bounded observations into catalog-shaped reports. Controls
identify a passed check, a security finding, or missing execution evidence.
Shared contracts live in `common/securityAudit`; acquisition, assembly and
qualification tools live here; the Meteor receiver and administrator downloads
live in `server/securityAudit`; deployment procedures live in
`deploy/security-audit`.

Use the [operator guide](../../../docs/deployment/security-audit.md) for
deployment, the
[durable redesign plan](../../../docs-developer/security-audit-durable-redesign-plan.md)
for normative contracts and the
[status ledger](../../../docs-developer/security-audit-durable-redesign-status.md)
for exact tested releases and current gates.

## Current catalog ownership

Catalog versions are append-only files under
`common/securityAudit/catalogs/`. `common/securityAudit/catalogRegistry.ts`
parses their exact bytes, pins their golden digests and keeps released versions
readable.

- V1 remains the separately owned scheduled-producer selection.
- V2 is the accepted integrated-authentication catalog retained for historical
  reports.
- V3 changes exactly the fifteen approved reproducible-closeout evidence
  contracts while preserving the same seventy control IDs.
- The qualified receiver selects V3 explicitly in `server/serverComposition.ts`.
  Receiver selection does not change the scheduled producer or reinterpret a
  historical report.

The November 27 staging2 qualification accepted one V3 report with 70 PASS and
zero FAIL/ERROR/NA. Its source, image, readback and archive coordinates are in
the status ledger. Staging and production require their own release evidence;
the staging2 report cannot be relabeled for another target.

## Data flow

1. Producers under `authentication/`, `external/`, `internal/` and `repository/`
   evaluate bounded observations and emit their exact catalog-owned controls.
2. `core/producerFilesV2.mjs` validates complete canonical producer files.
   `core/assembleV2.mjs` joins them with the report window and independently
   verified scanner, application and image identities.
3. `qualification/composeVerificationBundle.mjs` joins exact clean source,
   executed Meteor cases and the expected sealed runtime registry into a
   `VerificationBundleV1` carried by the image.
4. Image/release observers under `qualification/` independently bind the source
   snapshot, published Linux/amd64 manifest, running image, protected release
   receipt and deployed registry.
5. `qualification/reproducibleCloseoutV3.mjs` replaces exactly the fifteen V3
   evidence rows in the five reviewed producer artifacts. It rejects incomplete
   producers, non-passing unchanged rows, duplicate/missing controls and any
   result other than exactly seventy unique controls.
6. `report/uploadV2.mjs` sends one bounded signed request. The receiver validates
   the signature, target, time, catalog, digest and replay constraints before
   storage. Administrator list/get/download reads the stored bytes back.
7. `report/reportCrypto.mjs` creates the operator-held public-key archive. Final
   acceptance compares independent receiver readback and in-memory archive
   decryption with the writer bytes before temporary plaintext is removed.

The report status is evidence evaluation, not transport status. A security
`FAIL` is a finding; an `ERROR` means required evidence or execution is absent.
Successful upload or encryption alone never changes either result.

## Code owners

| Concern | Source |
| --- | --- |
| Catalogs, profiles and evidence shapes | [catalogs](../../common/securityAudit/catalogs), [catalogRegistry.ts](../../common/securityAudit/catalogRegistry.ts), [evidenceContracts.ts](../../common/securityAudit/evidenceContracts.ts) |
| Verification cases and expected outcomes | [verificationCatalog.ts](../../common/securityAudit/verificationCatalog.ts), [authorizationOutcomes.ts](../../common/securityAudit/authorizationOutcomes.ts) |
| Canonical reports and producer validation | [reportV2.ts](../../common/securityAudit/reportV2.ts), [producerArtifact.ts](../../common/securityAudit/producerArtifact.ts), [core](core) |
| Acquisition and evaluation | [external](external), [internal](internal), [composite](composite), [authentication](authentication), [repository](repository) |
| Source, registry, release and image proof | [qualification](qualification), [server surface bindings](../../server/securitySurfaces) |
| Encryption, upload, readback and completion | [report](report) and the root command wrappers |
| Receiver, storage and administrator downloads | [server audit runtime](../../server/securityAudit), [HTTP bindings](../../server/http/securityAudits.ts) |
| Host observations and release receipt | [deployment audit files](../../../deploy/security-audit) |

The maintained surface inventory is the typed registration system under
`server/securitySurfaces`, not a parallel JSON manifest. The lint-owned
`checkRegistrationBypasses.mjs` rejects registrations outside approved owners.
The sealed runtime registry supplies deployed inventory and verification IDs;
the verification bundle must close over that exact inventory.

## Maintainer verification

Run from `mofacts/` with the repository-pinned tools:

```text
npm run typecheck
npm run lint
npm run security:surfaces
npm run security:test:source
npm run security:test:phase0
npm run security:test:capture
node --test scripts/security-audit/source-security-v2.test.mjs
```

Use the [standard Linux executor](../../../deploy/security-audit/operator-security-checks.md)
for repository Security jobs and the
[isolated Meteor worker](../../../deploy/meteor-integration/README.md) for
authorized installed-runtime verification. Windows-only and Linux-only results
may be combined only when every required case is named and passed. Source tests
do not substitute for Meteor, immutable-image qualification, deployed readback
or a production audit.

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

Do not invent missing arguments, targets, credentials or evidence. Follow the
matching procedure under `deploy/security-audit`.

## Add or revise a control

1. Identify the property, producer, profile, severity and evidence contract.
   Keep existing IDs for unchanged properties; never edit released catalog bytes.
2. Add the evidence validator in `common/securityAudit` and keep acquisition
   separate from evaluation.
3. Add the control to exactly one producer and section/profile. Catalog parsing
   must reject duplicates, unknown references and incomplete profiles.
4. Declare deterministic cases in `verificationCatalog.ts` and bind each case to
   the real registered surface that owns the behavior. Do not invent synthetic
   runtime surfaces to satisfy coverage.
5. Test positive baselines, expected denials, malformed input, side effects and
   cleanup at the owning boundary. A timeout or unrelated exception is not
   authorization evidence.
6. Update the typed registration descriptor and owning Meteor/HTTP/package test
   when a protected surface changes.
7. Run typecheck, lint, the complete source gate and supported Meteor suite when
   affected. Compose a new exact-source bundle; never reuse proof from another
   commit.
8. Coordinate receiver activation before an incompatible producer catalog.
   Verify upload, independent readback, archive round trip and rollback as one
   release unit.
9. Record exact source, snapshot, bundle, image, receipt, report and archive
   digests in the status ledger. Keep staging2, staging and production separate.

## Storage, privacy and recovery

Producer directories contain only expected canonical files. Shared readers
reject symlinks, multiple links, non-files, changed files, invalid UTF-8,
duplicate JSON keys, noncanonical encodings and oversized input. Existing output
files are never overwritten.

Upload secrets, signing material, provider credentials, reset links and the
offline private key stay in approved protected stores. Retained public evidence
is sanitized. Remove temporary plaintext only after remote-byte and archive-byte
equality pass; retain the encrypted artifact, receipts and rollback records.
Failed attempts remain failed evidence and are never relabeled as accepted.

GitHub billing is unavailable. Repository Security checks use the documented
operator Linux executor. Hosted, operator, Meteor, image, staging2, staging and
production evidence remain distinct.
