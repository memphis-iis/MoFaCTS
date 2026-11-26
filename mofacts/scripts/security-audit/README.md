# MoFaCTS security audit maintenance

The audit turns bounded observations into catalog-shaped reports. Controls
identify a passed check, a security finding, or missing execution evidence.
Use the [operator guide](../../../docs/deployment/security-audit.md) for
deployment and [the status ledger](../../../docs-developer/security-audit-durable-redesign-status.md)
for the exact tested releases and open gates.

## Data flow

1. Each producer evaluates its own observations and writes the exact controls
   from the selected report profile. Fixture bindings supply environment values.
2. The assembler joins the producer files with the report window and separately
   verified scanner, application and image identities. The catalog supplies
   titles, severities and membership. Assembly derives the counts and digest.
3. The writer encrypts the exact report bytes. The scoped uploader signs those
   bytes for the V2 receiver, which validates the signature, time, target,
   catalog, digest and replay constraints before storing them.
4. A qualifying run has zero execution errors. Its independently downloaded
   receiver copy and the saved archive match the writer's report. Findings
   remain visible in a complete run.

The report schema, control catalog and host observation format have separate
versions. Staging2 accepts control catalog v2. Its Full report procedure verifies
the clean tool revision and uses the exact deployed application checkout to
check the registry verification catalog. Follow the
[staging2 Full report procedure](../../../deploy/security-audit/staging2-v2-operations.md#catalog-v2-full-report-qualification).

## Code owners

| Concern | Source |
| --- | --- |
| Registered catalogs, profile membership and evidence shape | [catalogs](../../common/securityAudit/catalogs), [catalogRegistry.ts](../../common/securityAudit/catalogRegistry.ts), [evidenceContracts.ts](../../common/securityAudit/evidenceContracts.ts) |
| Synthetic authorization cases and their expected outcomes | [verificationCatalog.ts](../../common/securityAudit/verificationCatalog.ts), [authorizationOutcomes.ts](../../common/securityAudit/authorizationOutcomes.ts) |
| Canonical report and exact producer validation | [reportV2.ts](../../common/securityAudit/reportV2.ts), [producerArtifact.ts](../../common/securityAudit/producerArtifact.ts), [core](core) |
| Acquisition and evaluation | [external](external), [internal](internal), [composite](composite), [authentication](authentication), [repository](repository) |
| Raw host observations and protected deployment receipt | [deployment audit files](../../../deploy/security-audit) |
| Source, installed registry, release and image proof | [qualification](qualification), [server surface bindings](../../server/securitySurfaces) |
| Encryption, signed upload, readback and completion checks | [report](report) |
| Receiver composition, ingestion, storage and admin downloads | [server audit runtime](../../server/securityAudit), [HTTP bindings](../../server/http/securityAudits.ts) |
| Optional recovery fixture inventory | [verification](verification), [protected-transfer guide](../../../deploy/security-audit/recovery-transfer/README.md) |

Use the documented command entry points for operator calls. Report commands
import their implementation from the report directory. The release tools use
the existing record and Compose owners.
Authentication retains progress-backed passwordless return and the existing
[connected Gmail procedure](../../../deploy/security-audit/connected-mail.md).

## Local verification

From `mofacts/`, use the Node and npm pins in `package.json` on the operator
Linux worker. Privileged host fixtures exercise disposable data and file
permissions with the existing jq installation. Environment-specific skips
remain visible in the test results.

```sh
npm run lint
node --test scripts/security-audit/source-security-v2.test.mjs
npm run security:test:phase0
node --test scripts/security-audit/tests/productionScannerIsolation.test.mjs
```

The V2 suite includes the base source suite. The Phase 0 command retains the
pinned V1 membership and current release and compatibility checks. The
frozen V1 report membership also supports rollback tests. Use the
[standard Linux executor](../../../deploy/security-audit/operator-security-checks.md)
for the four repository Security jobs and the
[isolated Meteor worker](../../../deploy/meteor-integration/README.md) for
authorized installed-runtime verification. The audit status owns the Meteor
allowance ledger.

## Add or revise a control

1. Identify the security property, producer, report profile and failure severity.
   Keep existing IDs for unchanged properties. Released catalogs remain immutable.
2. Start with the test-only example in
   [catalogRegistry.test.mjs](tests/catalogRegistry.test.mjs). It clones the
   accepted catalog, adds one Full-only repository control, and exercises the
   existing producer validator. The registered catalog and its digest stay intact.
3. Exercise complete passing evidence, an observed violation and missing input
   in the owning producer and evidence contract. Check that assembly and
   ingestion enforce the same exact membership independently.
4. For a released change, version the catalog and pin its digest in the shared
   registry. Verify prior catalogs still parse retained reports. When changing
   application behavior, update the owning surface descriptor and verification
   case and run the required installed-runtime checks.
5. Qualify the exact receiver, immutable scanner selection, host observation
   contract and protected release receipt together. Record source, staging and
   production results separately.

Run the offline catalog exercise from `mofacts/` with the pinned Node.

```sh
node --test --test-name-pattern='test-only Full control' scripts/security-audit/tests/catalogRegistry.test.mjs
```

## Cutover and rollback

The staging2 Full report remains an open acceptance gate. Production's
last recorded receiver is V2 and its configured scanner and host pairing still
use V1. The [production cutover packet](../../../deploy/security-audit/production-operator-cutover.md)
records that mismatch, the retained rollback sources and the outstanding
execution decisions. For an authorized cutover, switch the verified receiver,
scanner pin, host collector and protected receipt together. Preserve the
previous pairing for rollback and verify real receiver readback and archive
retention before marking the window complete.
