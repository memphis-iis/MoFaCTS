# Periodic Confidentiality and Account-Compromise Audit

MoFaCTS records evidence about confidentiality, authentication, host/public
exposure and repository security. Audit findings do not stop services, change
permissions/firewalls, deploy code or alter real accounts. Backup/recovery and
application availability remain separate responsibilities.

## Production reconciliation observed 2026-11-15

The November 14 production release now presents the V2 receiver, but its
restricted host command still emits V1 and its GitHub scanner remains pinned
to V1. The earlier production-V1 pairing statements below describe the prior
baseline, not the current live pairing. The scheduled audit is not operational.
See the [verified finding and offline cutover packet](../../deploy/security-audit/production-operator-cutover.md).
The observed MongoDB role FAIL comes from the obsolete single-role expectation;
bounded metadata checks confirmed the current approved app/Sidecar role policy.
No production permission, configuration, mail transport or schedule changed.

## Current execution and deployment

The target scheduler/scanner host is **staging2**, independent of the operator's
desktop. Original staging is excluded. Read-only host inventory is complete;
no recurring audit timer or cloud mail-handoff service is installed. The
[staging2 unattended design](../../deploy/security-audit/staging2-unattended-design.md)
records measured prerequisites, the connected-Gmail boundary and required
independent missed-run detection. This is planned architecture, not acceptance.

GitHub billing is unavailable. The four repository Security jobs use the
[standard operator Linux executor](../../deploy/security-audit/operator-security-checks.md).
Its exact-commit result is operator evidence, not a GitHub check or release
qualification. The optional GitHub Security workflow is manual-only.

The latest accepted staging2 V2 application recorded in the audit ledger is
`e9d14a25`. The catalog v2 Full report uses a separately pinned writer and the
exact deployed application source for registry verification. Its live evidence,
signed storage, independent download and archive verification are tracked in
the [staging2 operating procedure](../../deploy/security-audit/staging2-v2-operations.md#catalog-v2-full-report-qualification)
and [control register](../../docs-developer/security-audit-staging2-control-evidence.md).
The [operator exposure workflow](../../deploy/security-audit/operator-exposure-v2.md)
composes the same V2 producers, assembler, encryption, uploader and final
assertion without GitHub scheduling or new server access.

Production's scanner still selects V1 although its receiver is now V2. Its
workflow selects `09f0c32fc2af6d220c699dd805133df3c0507c2e`; publishing V2 source
neither upgrades production nor authorizes scanning it. The configured daily
06:00 UTC exposure/weekly Monday full schedule does not prove execution while
GitHub is locked. The existing V1 setup is preserved in its
[immutable operating guide](https://github.com/memphis-iis/MoFaCTS/blob/09f0c32fc2af6d220c699dd805133df3c0507c2e/docs/deployment/security-audit.md).
Reconcile the entire host/scanner/receiver unit at the complete cutover. Production execution,
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
ERROR. The separate Phase 2 authentication run passed all 22 controls on its
recorded release. The latest Full report requires evidence for the current
staging2 release. See the [audit ledger](../../docs-developer/security-audit-durable-redesign-status.md).

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

From `mofacts/`, lint and `npm run security:surfaces` check registration
ownership in application source and local Meteor packages. The maintained
upload package has one reviewed registration in its FilesCollection constructor.
The integration suite separately verifies its installed handlers. Access and
data-egress classifications belong to the registration descriptors and their
reviewed verification cases. The sealed runtime registry supplies the installed
inventory. Management route metadata links to those server surfaces for review.
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
