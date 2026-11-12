# Periodic Confidentiality and Account-Compromise Audit

MoFaCTS records evidence about confidentiality, authentication, host/public
exposure and repository security. Audit findings do not stop services, change
permissions/firewalls, deploy code or alter real accounts. Backup/recovery and
application availability remain separate responsibilities.

## Current execution and deployment

GitHub billing is unavailable. The four repository Security jobs use the
[standard operator Linux executor](../../deploy/security-audit/operator-security-checks.md).
Its exact-commit result is operator evidence, not a GitHub check or release
qualification. The optional GitHub Security workflow is manual-only.

Staging2 runs the accepted V2 application revision `1c72734b` with its matching
protected release receipt and raw-measurement host auditor. Live ingestion,
admin downloads, 29 selected authorization cases and paired rollback/restoration
passed. See the exact image/receipt identities and evidence limits in the
[staging2 operating baseline](../../deploy/security-audit/staging2-v2-operations.md).
The [operator exposure workflow](../../deploy/security-audit/operator-exposure-v2.md)
composes the same V2 producers, assembler, encryption, uploader and final
assertion without GitHub scheduling or new server access.

Production retains the separately pinned V1 scanner/receiver pairing. Its
workflow selects `09f0c32fc2af6d220c699dd805133df3c0507c2e`; publishing V2 source
neither upgrades production nor authorizes scanning it. The configured daily
06:00 UTC exposure/weekly Monday full schedule does not prove execution while
GitHub is locked. The existing V1 setup is preserved in its
[immutable operating guide](https://github.com/memphis-iis/MoFaCTS/blob/09f0c32fc2af6d220c699dd805133df3c0507c2e/docs/deployment/security-audit.md).
Do not install current V2 source into that V1 pairing. Production execution,
credential changes and cutover require their own explicit authorization.

## Reports and evidence semantics

The V2 report has an independently versioned schema, catalog and evidence
contracts. Its exact exposure/full profile comes from the shared catalog;
unknown, duplicate, misclassified or digest-invalid input cannot be ingested.
Missing producer evidence becomes complete catalog-shaped ERROR controls.
An external proven violation remains FAIL even when other evidence is missing;
PASS requires all required safety evidence. A timeout or failed login alone
cannot establish successful access denial or a vulnerability.

Ingestion uses only `/internal/security-audits/v2` on the V2 application. It
requires a timestamped HMAC signature, fresh nonce, bounded canonical report,
matching target and replay/duplicate protection. Its private V2 collection is
separate from retained V1 records. V1 access is retired in the V2 application;
existing records are not rewritten/deleted and no historical reader is added.

A security FAIL is a finding, not an execution failure. Missing tools, malformed
output and incomplete evidence remain ERROR. The workflow encrypts and submits
the report before its final completeness assertion; accepted storage does not
turn an ERROR report green. UDP silence alone is not clearance. The accepted
staging2 exposure baseline contains 22 PASS and one evidence-incomplete UDP
ERROR. The 29 selected authorization cases prove their one selected control;
the other 21 authentication protocol controls remain Phase 2 work.

## Private access and retention

Use the existing [restricted no-argument host command](../../deploy/security-audit/staging2-access.md).
It returns bounded validated host facts and the matching shared release receipt;
it does not grant a shell, PTY, forwarding or broad administrator access.
The [host install/restore procedure](../../deploy/security-audit/host-qualification-review.md)
owns the exact reviewed cohort and recovery hashes. No scanner installs or
upgrades those files automatically.

Acquisition receives neither a signer nor private encryption key. Only the
separate uploader receives the existing staging2 HMAC signer. Reports use the
existing RSA-OAEP-SHA256/AES-256-GCM encryption; the private key stays with the
operator, outside GitHub/server/application settings. Verify retained encrypted
bytes by saved-key decryption and exact report identity before removing that
run's private plaintext. Keep encrypted recovery evidence under the existing
90-day retention policy. Never commit raw reports, keys, settings or diagnostics.

Administrators review bounded summaries at `/admin/security-audits`, including
latest exposure/full cards, separate scanner/application/image identity and
freshness warnings. Full findings are not published to the page. JSON and
escaped HTML downloads require authenticated admin access and short-lived,
single-use tokens. Responses have no-store/nosniff, download isolation and
exact-body SHA-256 protection. Verify report ID/digest through list/get/download
before retrying an upload whose transport outcome is uncertain.

## Verification and release ownership

From `mofacts/`, lint includes `security-surface-contract.json` verification.
Discovered surfaces still require human-reviewed source authorization
classification; a matching manifest is not proof of all runtime registrations.
The standard repository executor runs both source-security entry points and the
existing full/runtime dependency policies. Development-only advisories remain
visible; they block only under the reviewed build-exposure policy. Runtime and
built-image findings retain their independent gates.

Use the separately authorized [isolated Linux Meteor worker](../../deploy/meteor-integration/README.md)
for actual Meteor integration and its bounded allowance ledger. Operator checks,
Meteor proof, accepted image identity and live staging acceptance are distinct.
Reuse accepted unchanged evidence rather than restarting completed trials.
The [source-capture owner](../../deploy/security-audit/source-capture.md) and
[release-record/receipt owner](../../deploy/security-audit/release-records.md)
retain the supported Compose and standard post-acceptance recording contracts;
ordinary builds/startup do not require fabricated qualification metadata.

## Coordinated cutover and rollback

Follow the [scanner selection/cutover procedure](../../deploy/security-audit/scanner-cutover.md).
Before an authorized production change, retain its exact app image, workflow
selection, host cohort, configuration and release authority. Verify candidate
source/Meteor and staging2 report/rollback evidence first; obtain any new
production-specific permission before touching production. Stop the old scanner
before changing its receiver, and switch app, host/receipt and immutable scanner
selection as one reviewed pairing. Do not enable dual ingestion or translate
old-format reports. Verify the new report through actual admin downloads.

If acceptance fails, restore the complete previous app/host/receipt/scanner
pairing using the recorded owner and retained configuration. Preserve MongoDB,
Redis, learner records and both report generations. The staging2 live and sealed
previous-image trials already proved their respective datasets; they need not
be repeated for unchanged inputs. An operational release record is not a
ReleaseQualification receipt. Production cutover remains unexecuted and outside
the staging2 standing mandate. The [current checklist](../../docs-developer/security-audit-durable-redesign-status.md)
is the authority for completed gates and remaining decisions.
