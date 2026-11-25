# Production operator audit cutover preparation

Status on 2026-11-15: **not installed, scheduled or accepted**. GitHub billing
remains unavailable. This preparation does not grant production configuration,
mailbox access, scheduler or GitHub disable permission.

## Observed mismatch and exact finding

Production's local accepted release record identifies clean `206488737f8f`,
deployed 2026-11-14. Its live V2 endpoint rejected unsigned requests with 401 and
authenticated empty reports with 400; V1 returned 405. No report was stored.
The existing restricted host command still returns nine V1 controls. Its
`internal.mongodb-auth` HIGH FAIL is the old `mongodb.roles-scoped` check:
unauthenticated access denial, replica/authentication and both service-account
connectivity checks passed.

A separate bounded read using the existing metadata observer confirmed:

- The app's direct roles exactly match the configured app role on its own DB,
  plus the approved `admin.mofactsReadDefaultConcern` role.
- The helper role has no inherited roles and precisely one cluster privilege:
  `getDefaultRWConcern`. The Sidecar has exactly its configured role on the app DB.
- The old single-role expectation fails; the current reviewed two-role policy
  passes. This finding is an outdated-auditor mismatch, **not evidence of extra
  unapproved database access**. This is not clearance of all database controls.

The installed command SHA-256 is
`d6578ce200e70bba69b8c45cc8a451e666c0203776b23b045db820c9ebc4be3e`.
The modern Mongo role helper, release-receipt helper and protected V2 receipt
are absent. The protected configuration lacks `MOFACTS_PUBLIC_HOSTNAME` and
`MOFACTS_SIDECAR_EXPECTED_STATE`. Merely replacing the command would produce
missing-evidence errors. The running app also has no `/run/mofacts/release` mount. No roles, firewall, credentials or settings were changed.

## Offline public host packet

From the canonical repository on the approved Linux worker, using pinned Node:

```sh
node deploy/security-audit/prepare-production-host-v2.mjs prepare \
  EXACT_40_CHARACTER_COMMIT /absolute/new/private-parent/production-host-packet
node deploy/security-audit/prepare-production-host-v2.mjs verify \
  /absolute/new/private-parent/production-host-packet MANIFEST_SHA256
node --test deploy/security-audit/tests/prepare-production-host-v2.test.mjs
```

The tool exports only 13 explicit public Git blobs, including the raw-measurement
collector, V2 forced command, policy cohort and receipt/image parsers. It rejects
moving refs, an output inside the checkout, existing output, links, extra files,
changed destinations and source changes even if an attacker recomputes hashes.
Files are LF Git bytes, independent of Windows checkout conversion. The manifest
records exact source SHA, destinations, owner/modes and SHA-256 values. A returned
`prepared-not-installed` result is never production qualification. Verification
requires the original Git objects and independently retained manifest digest.

No installer or remote executor is included. Protected settings, the live release
receipt, database records and credentials are intentionally not packet inputs.
The operating-system owner must authorize the concrete reviewed installation
at action time. Before that request, retain the actual previous cohort, prove
matching image/receipt identity and inspect receipt mounts. Use the existing
release-record owner; never fabricate a receipt from a tag or overwrite authority.

The proposed configuration scope is only explicit production hostname and the
already configured Sidecar policy. Do not change database roles to satisfy the
obsolete single-role check, add access, alter application services, or relax
missing-evidence semantics. V2 acceptance must include protected modes, strict
restricted SSH, a fresh complete measurement envelope, receipt MATCH, exact
report ingestion/admin readback and tested rollback to the saved cohort.

## Unattended weekly boundary

The old V1 authentication scanner needs IMAPS even to start its non-mail checks.
Current rules prohibit an IMAP reader and exporting Gmail authorization. The
existing connected-Gmail V2 adapter and reset binding explicitly accept only
staging2. Its two-minute delivery window, exact synthetic recipient/namespace,
provider receipt timestamp, origin checks and private token handoff are required
coverage, not optional setup. An existing connector in an interactive agent
does not by itself make it callable from a scheduled Node worker.

No unattended solution has yet been qualified within those constraints. A
possible no-new-credential design would keep mailbox operations inside the
existing connected-Gmail execution environment and use a bounded private handoff
to the same leased scanner job. It requires a supported unattended execution and
handoff mechanism plus explicit permission for production synthetic recipients.
Those capabilities/permissions are not established here. Do not deploy a polling
task and call it a full audit, copy connector credentials, broaden reset bindings,
read tokens directly from production collections, or omit mail-dependent cases.

After that boundary and the full producer qualification are resolved, use the
existing worker with a Windows scheduler entry that can start WSL, exact-source
verification, serial execution, independent daily/weekly catch-up, bounded runs,
private content-free status and encrypted retention/readback. Verify actual
triggers, failure injection and missed-run detection before retiring GitHub.
Workstation availability and logon requirements must remain visible. No paid
service, external notification recipient or unattended credential is implied.

## Offline verification on 2026-11-15

The existing Linux worker generated the actual packet at
`/var/tmp/mofacts-production-host-206488737f8f-20261115` from exact committed
source `206488737f8fe3e9ad6c98d02c14bce38ac5f67a`. Its 13-file manifest SHA-256 is
`53fc61e43e984ba499e787a5e2cbcbefef8e1a670316ed01c789df704685476f`.
All five packet regressions and all 21 existing Mongo-role/host-observation
regressions passed on pinned Node 24.22.1; explicit lint of the new tool/tests
passed. Full `npm run lint` also passed, including the 330-surface contract, server algorithm boundary and Meteor manifest checks. These are offline/source proofs. No package was transferred to production
and no host, application, mailbox or scheduler cutover was attempted.

The missing protected receipt and app mount mean reconciliation also needs a
verified receipt and app-only Compose recreation with the reviewed read-only
mount. That is a production-affecting operation requiring action-time approval;
it is not hidden inside the packet generator. Preserve learner/Mongo/Redis data
and existing service identities. The next confirmation must describe the exact
saved baseline, receipt identity and app-only change, not grant a blanket deploy.