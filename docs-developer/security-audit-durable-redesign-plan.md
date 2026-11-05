# Security Audit Durable Redesign Plan

Status: Phase 0 pure draft contracts and local characterization tests are implemented; the active scanner/application release path remains unchanged. Phase 0 runtime/ownership gates are still incomplete; Phases 1–4 have not started.

Source review date: 2026-09-06 (static review and local synthetic tests; no Meteor/Docker/remote qualification).

Original audit baseline: `main` at `fa8dc09156500bb0458de3028a9e0ee11e4ae5c7`. Workflow/compatibility review baseline: `main` at `74f0e68dc1bb353747d4bf49f0bb27eb72a43f4d`, with unrelated CI/test-harness working-tree changes preserved. Progress and evidence belong in [`security-audit-durable-redesign-status.md`](security-audit-durable-redesign-status.md).

This document is the developer implementation plan for making the MoFaCTS security-audit system maintainable, efficient, and resistant to false-green results. It does not claim that any phase has been implemented, tested, deployed, or verified in production.

Before Phase 1 implementation begins, re-run the Phase 0 inventory against the then-current source. This baseline records what was audited; it does not authorize relying on stale paths or control membership after intervening changes.

Concrete Phase 0 contract ownership and test limitations are now recorded in [Phase 0 contracts and characterization](security-audit-phase0-contracts.md). The optional draft release-record proof is not wired into operation and is not a completed qualification carrier.

The operator identified `C:\dev\mofacts_config\deploy and build.txt` as the production build/deploy procedure. It is a private PowerShell command sheet, not an executable wrapper: its production app section builds and pushes on the workstation, then invokes remote Compose over SSH. That sequence remains authoritative. CI supplies verification evidence; it does not become the production image publisher. Section 2.1 traces the actual commands and existing release record without reproducing private environment values.

The current operator-facing behavior and protected-environment setup remain documented in [`docs/deployment/security-audit.md`](../docs/deployment/security-audit.md). That file is the operational source of truth. This plan owns target architecture, implementation sequencing, verification gates, and eventual cleanup; it must not duplicate secrets or environment-specific operator commands.

Reading order for every AI worker: first read and follow the repository [AGENTS.md](../AGENTS.md) and any applicable deeper AGENTS.md instructions. Then read Section 0 below, the current execution entry point in the [status record](security-audit-durable-redesign-status.md#current-execution-entry-point-2026-11-02), and the [Phase 0 contracts](security-audit-phase0-contracts.md). Sections 1-5 define the problem and invariants; Sections 6-11 define contracts, architecture, layout, and ownership; Section 12 is the work sequence; Sections 13-15 are verification and deployment gates; Sections 16-21 cover extension, impact, decisions, completion, and source mapping.

## 0. Controlling decisions and worker entry point (2026-11-02)

These decisions record Phil's explicit answers to the nine-question design review on 2026-11-02. They control current work wherever older recommendations or dated checkpoints differ. The later report-storage answer supersedes the earlier archive choice: no old-format report access or archive work is required. This register records design and bounded standing permission; it does not claim implementation or executed qualification.

| Decision | Controlling instruction |
| --- | --- |
| Bounded Meteor integration authorization - 2026-11-04 | Phil authorized up to five Meteor integration invocations for continued security-audit integration checks, including necessary retries, with a written count and continuation to a real decision point. This task-specific instruction supersedes fresh single-use approval for those five invocations only; prior runs do not consume it. Reserve before triggering, record actual commit/run/attempt and result in the status ledger, and do not exceed five. Acceptance, staging2 scope, privacy, dependency and spending boundaries remain in force. |
| Optional CI acquisition dependency - approved | The workstation acquisition helper may require GitHub CLI and use Phil's existing stored GitHub sign-in. No new token-storage mechanism or GitHub permission is selected. This is the narrow exception to the no-added-dependency helper constraint; ordinary build/application paths do not require it. |
| 1. Release receipt - approved | Keep the workstation release record authoritative. Supply only a bounded, credential-free server projection through the existing restricted host-evidence channel; no second release authority or new service/credentials. Validate the protected destination, reader identity and access controls before installation. Current opt-in tooling uses root-owned mode-0600 `/etc/mofacts/release-receipt.json`; the status/contracts record implementation separately from unexecuted live installation. |
| 2. Release metadata/rollback - approved | Retain all small accepted release-metadata records for now, with no automatic deletion. Preserve the previous usable rollback image and its matching evidence; this does not require retaining every Docker image indefinitely. Use immutable history under the existing record owner and atomic latest-record replacement, with collision, interruption and read-back checks. |
| 3 and 7. Old reports/storage - settled by the later answer | Do not build or preserve old-format historical-report UI, downloads or an archive for this redesign. Choose the simplest new-report storage design that supports a safe application rollback, based on previous-image compatibility evidence. Existing records are not authorized for deletion or rewriting. Release metadata and rollback evidence in decision 2 are distinct and remain retained. Keep released catalog/evidence validators needed for report integrity; that is not a report-archive feature. |
| 4. Secret recovery - AWS design selected | Phil selected AWS Secrets Manager and is the accountable recovery owner. One encrypted secret holds complete fixture/provider configurations as current and explicitly retained last-accepted rollback versions; GitHub secrets are deployment copies. See the [selected recovery design](#aws-secrets-manager-recovery-design-approved-2026-11-02). Account/MFA readiness and current GitHub baseline selection are accepted; approximately $0.40/month cost and first transfer were approved. Prerequisite CI/Security passed. The optional SDK implementation 62ae8fe3 passed complete CI/Security and its single authorized transfer 42024117227 passed exact read-back: one 10,911-byte baseline, nine secret bindings and one public variable. Temporary permissions/trust/role and active workflow are retired; source credentials and stored SSH key are unchanged. AWS remains an optional operator tool with its own dependencies. Both single-use execution allowances are spent. The [isolated cold-restore review](../deploy/security-audit/recovery-transfer/restore-rehearsal-review.md) is the next approval gate; no accepted-rollback copy, cold restore or operational recovery is claimed. |
| 5. Testing environment - approved bounded standing permission | Use staging2 as the default isolated environment with synthetic accounts/resources. For this security work, Phil permits taking staging2 offline, resetting it and rebuilding it as needed. Original staging and production are excluded. This does not authorize irreversible data deletion, new persistent access/security-sensitive permission changes, new spending, or a blanket override of fresh `npm run test:ci` authorization. |
| Staging2 protected audit setup - approved 2026-11-03 | Following the failed conditional preflight, Phil approved making staging2 a production-like security test target: Apache, Tailscale private management, a dedicated restricted audit identity/key and narrowly scoped sudo binding, root-only audit configuration, necessary scoped database audit access, and a current verified staging2 release with matching evidence. Phil selected the existing Tailscale network on this PC. Preserve the prior usable image/configuration and prove private operator/audit access before closing public maintenance SSH. Verify account, access and cost prerequisites; new spending, production/original-staging changes, blanket Meteor runs and unrelated persistent access remain excluded. This is the specific expanded setup approval, not a general change to decision 5. |
| Isolated GitHub staging2 audit identity - approved 2026-11-04 | Phil approved a separate `staging2-security-audit` GitHub environment restricted to main, a single-tag `tag:staging2-audit` Tailscale OAuth client with only auth-key issuance scope, TCP 22 to staging2's existing forced-command auditor, and verification that production/operator/application/database access remains denied. Existing production rules/client/secrets remain unchanged. The manual access workflow does not run Meteor, deploy, schedule or ingest reports, create AWS recovery resources, or qualify a release. See the [public access and revocation procedure](../deploy/security-audit/staging2-access.md) and exact outcomes in the status record. |
| Shared-tailnet staging2 partition - approved 2026-11-03 | Phil approved replacing the blanket grant with preserved current PC/production IPv4/IPv6 and `tag:ci` connectivity, plus only the verified PC addresses to `tag:staging2` TCP 22. Staging2 receives only that tag and no outgoing grant to the existing group. Preserve existing SSH rules and CI tag ownership. Future identities require explicit rules. This permits the reviewed shared-policy change while retaining the production host exclusion; native policy acceptance and actual host/tag/access verification are separate evidence. |
| Staging2 Sidecar absence - approved 2026-11-03 | Phil selected keeping the optional database-tooling Sidecar absent and explicitly auditing that condition. Require a protected `MOFACTS_SIDECAR_EXPECTED_STATE=absent`; do not infer absence from missing credentials or skip checks. Retain a reserved Sidecar username for an authenticated absence query, but no password, role or unused service account. Verify no known helper container, reserved endpoint declaration/publication or listener, including stopped/unpublished and loopback cases. Unexpected presence is a finding; unavailable evidence is `ERROR`. The separately selected `configured` policy retains genuine scoped-role/authentication checks and the existing loopback contract without claiming service uptime. No helper service/account is authorized merely to make the audit pass. |
| 6. Scanner isolation - approved conditional design | Prefer inert V2 development with the active V1 path unchanged. If that is insufficient, use a reviewed immutable scanner checkout with tested selection, update and rollback procedures without reopening the design choice. Workflow publication, dispatch and disable/enable actions retain their operational authorization requirements. |
| 8. Policy review - Phil | Prepare one consolidated list of genuinely ambiguous access classifications and proposed permission changes for Phil. Clear classifications that preserve established behavior may proceed without asking; retain traceable policy review and characterization evidence. Do not infer new permissions, waive required policy review, or automatically classify ambiguous surfaces. |
| 9. Engineering discretion - approved within boundaries | Resolve routine implementation choices without asking when they follow the approved design and do not change scope, security boundaries, cost, ownership, retention or application behavior. Report failed acceptance checks; never waive them. For a new unavoidable design conflict, report the evidence and recommendation instead of silently deciding. |
| Staging2 registry publication - approved 2026-11-03 | Phil approved the separate public Docker Hub repository `ppavlikmemphis/mofacts-staging2` using the existing Docker sign-in, with candidate verification before publication and runtime-only credentials/settings. This excludes changing production repository tags/configuration and does not waive exact image/config identity or release qualification. The published `630eabdb` candidate and the containerd identity incompatibility are recorded in status. |
| Docker image identity compatibility correction - approved 2026-11-03 | Phil approved correcting the collectors and protected receipt reader to distinguish immutable engine references from configuration digests. One bounded Docker-save content-graph reader owns resolution for classic and containerd stores; missing, tampered or ambiguous evidence fails explicitly. Preserve historical proof/receipt schemas and actual config semantics. No Docker backend switch, provenance disabling, new dependency or substitution of registry identity is authorized. Continue to the next decision point; fresh Meteor CI and commit/push retain their explicit authorization rules. |

Start each continuation by reading AGENTS.md and checking the latest status evidence. Do not reopen settled decisions merely because older text calls them pending, and do not confuse incomplete technical proof with an undecided preference. Current implementation work remains the separately authorized three-batch continuation; this register does not itself authorize later-phase implementation or phase activation. Keep production secrets, learner data and raw sensitive evidence out of these documents.

Execution boundaries remain explicit: each `npm run test:ci` invocation needs fresh, explicit, single-use authorization, including retries. Commit/push, workflow dispatch or state changes, production builds/pushes/deployment, protected-host installation and other restricted operations require the authorization applicable to the concrete action. The staging2 permission above is the scoped exception for its necessary offline/reset/rebuild lifecycle; it is not a production or general access grant. Required acceptance and rollback evidence still applies. No code, test, build, deployment, commit, push or host operation is authorized by this documentation update.

## 1. Goal

The completed redesign must make these statements true:

- Every accepted report contains exactly the controls required by its report type and catalog version, once each, in the correct section.
- Missing, malformed, timed-out, contradictory, or otherwise unproven evidence can never become `PASS`.
- An authorization denial passes only when the expected security policy caused the denial. A domain error, transport failure, timeout, missing route, or unrelated exception is not denial evidence.
- Every security-relevant Meteor method, publication, HTTP handler, protocol endpoint, and data-egress surface is registered with a precise, runtime-coupled policy descriptor.
- Client route visibility is clearly separated from server authorization.
- Control metadata, report membership, policy metadata, and data-egress classification each have one canonical owner.
- Scanner acquisition, pure evaluation, report assembly, signed ingestion, storage, and presentation remain separate trust boundaries.
- A future maintainer can add or change a control through one documented path without duplicating control-metadata tables; implementation code references the canonical ID but never redeclares its title, severity, section, or report membership.
- Each phase can be reviewed and deployed coherently. No partially migrated runtime path, implicit compatibility route, or silent fallback remains.

The immediate implementation scope is the three P0 audit findings:

1. Replace the incomplete, syntactic security-surface inventory with runtime-coupled typed descriptors and verification requirements.
2. Replace ambiguous authorization booleans with explicit observations, expected outcomes, positive baselines, and fail-closed evaluation.
3. Introduce an immutable, versioned control catalog and a report contract that enforces exact control membership at every boundary.

Item 3 is implemented first because it creates the integrity boundary consumed by items 2 and 1. The implementation order does not change the original risk ranking.

## 2. Verified Current State

The current system has several strong foundations that must be preserved:

- HMAC-SHA256 request authentication over timestamp, nonce, and exact body digest.
- Timestamp tolerance and replay protection through unique nonce, report ID, and digest indexes.
- Bounded and sanitized report evidence.
- Admin-only summary and download methods.
- Short-lived, random, hashed, single-use download tokens.
- Escaped HTML reports and restrictive download response headers.
- Ninety-day live report retention.
- Encrypted GitHub Actions recovery artifacts.
- Explicit `ERROR` results for many missing-tool and malformed-output conditions.

The main structural problem is duplicated authority:

- Report types, sections, statuses, canonical JSON, counts, sanitization, and digest behavior are independently implemented in `mofacts/common/securityAuditReport.ts` and `mofacts/scripts/security-audit/audit-lib.mjs`.
- Control IDs and titles are repeated in `assemble-report.mjs`, individual producers, `internal-audit-contract.mjs`, and the separately installed host script.
- `assemble-report.mjs` converts raw controls to a `Map`; duplicate IDs collapse and unknown controls are ignored while expected controls are reconstructed.
- Server parsing checks shape and uniqueness but does not enforce the expected controls for `exposure` versus `full` reports.
- The authorization runner treats several unrelated errors and missing-resource outcomes as evidence that access was denied.
- The security-surface checker discovers only selected source patterns and verifies only that an access label belongs to a small vocabulary. It does not establish that the implementation enforces the declared policy.

The current data flow is:

```text
external scanner -----------+
host forced command --------+
authentication scanner -----+--> hand-maintained assembler --> V1 JSON
repository/image scanner ---+                                |
                                                              +--> HMAC upload
                                                              +--> encrypted artifact

V1 upload --> Meteor parser --> MongoDB --> admin summaries / tokenized downloads
```

The target replaces hand-maintained joins with explicit contracts:

```text
                 immutable catalog/evidence registry
                           /        |         \
                          /         |          \
             producer contracts   assembler   server validator
                    |                 |               |
measurements --> bounded results --> V2 report --> HMAC ingestion --> storage
                                          |                              |
                                          +--> encrypted artifact       +--> admin view

runtime security descriptors --> sealed deployed inventory --> required verification IDs
              |
              +--> enforced lifecycle

verification catalog + protected fixture bindings + deployed inventory
                         |
                         +--> explicit observations --> outcome evaluator
```

### 2.1 Confirmed release workflow and source limits

The workstation origin and command sheet are operator-confirmed. The following are static source observations, not evidence of a current production deployment:

| Source | Actual behavior | Integration constraint |
| --- | --- | --- |
| Config repo `deploy and build.txt`, production app section (reviewed lines 165–329) | Pasteable PowerShell commands, with SSH/SCP for remote operations; separate sections own local/staging/sidecar work | This is the integration entry point, not `autobuild.sh`, `build-timed.ps1`, or the generic remote validator. Do not execute the whole file |
| Command sheet lines 188–195 | Records HEAD and dirty-tree flag; uses commit-based tags for clean builds and timestamp-plus-base-commit tags for uncommitted local builds; sets `IMAGE_TAG` and `MOFACTS_SOURCE_REVISION` | Preserve both clean and dirty build paths and existing variable names. A dirty build's label identifies its base commit, not all built source |
| Command sheet lines 240–246 | Validates base Compose plus the config-owned production Change Streams overlay; builds `--no-cache` with base Compose/root Dockerfile; pushes from workstation; resolves the published manifest digest with Buildx | Keep the deliberate base-build/runtime-overlay distinction. Do not add the runtime overlay to image construction as an incidental change |
| Command sheet lines 248–293 | Updates the authoritative private environment's `IMAGE_TAG` after publication, copies runtime inputs, preflights remote base+overlay, pulls app and runs `up -d --no-build --wait mofacts`, then checks running tag and OCI revision label | Preserve environment update timing, runtime mounts, topology and Compose wait behavior; no remote rebuild and no generic-validator substitution |
| Command sheet lines 295–322 | Installs tracked Apache configuration with its own configtest/reload rollback, checks live CSP, then writes `ProdReleaseRecordPath` using combined identity/CSP predicates | Extend the existing release record/validation contract; do not invent a parallel deployment-success record or conflate Apache rollback with app-image rollback |
| `deploy/docker-compose.yml` and root `Dockerfile` | Repository-root build context; image naming uses `DOCKER_REGISTRY`, `IMAGE_NAME`, `IMAGE_TAG`; the command sheet supplies the existing `MOFACTS_SOURCE_REVISION` OCI-label arg | Reuse these contracts. Preserve current dependency-audit checks and private runtime mounts; generic source builds currently permit the label default `unknown` |
| `.github/workflows/ci.yml` | Tests source and builds/smoke-tests a separate runner-local amd64 image; does not publish/export that image | Source CI success is useful evidence, not proof that the workstation-built image was tested |
| `deploy/SERVER_IMAGE_DEPLOY_RUNBOOK.md` and self-hosted docs | Support image-based maintainer deployment and source-build operation; generic validator is optional | Preserve these current alternatives; the private hosted command sheet must not become the only documented qualification interface |
| `deploy/security-audit/host-exposure-audit.sh` | Reads the running container's `.Image` value | This is a Docker config image ID, not an OCI repository/platform manifest digest |

The existing release record fields are `deployedAtUtc`, `baseCommit`, `includedUncommittedLocalChanges`, `image`, `tag`, and `digest`. Preserve their meaning and existing readers before extending that record. The recorded registry digest is not yet correlated to the running config ID/platform manifest; running checks compare the tag and base-commit label. Buildx `.Manifest.digest` may identify an index or a platform manifest: inspect the returned media type/platform mapping rather than guessing. A dirty build remains an intentional supported release, but clean-commit CI does not prove its modified source. Future qualification must either bind/test the actual build-context snapshot or record the missing source assurance as `ERROR`, without prohibiting that build/deploy path.

The procedure is a pasteable command sheet, not a fail-fast process with a tested transaction boundary. Static inspection does not establish consistent native-command exit propagation for each Docker/SSH/SCP call, nor an app-image rollback procedure. Do not infer successful publication or Compose health solely from later variable values; the future helper must capture execution results for the qualification it owns and never write successful proof after an earlier failure. Preserve existing deployment checks and explicitly scope any broader command-runner/rollback changes before implementing them. The Apache-specific rollback is already present and must remain intact.

Original staging is frozen and is not authorized for this work. The 2026-11-02 decision selects staging2 and grants its bounded offline/reset/rebuild permission in Section 0; do not reopen target selection or infer permission for production, new environments or production data/configuration copies. App and MCP sidecar deployments remain separate tasks.

The other tracked helpers are not called by this production sequence. `build-timed.ps1` only builds; `autobuild.sh` has mismatched metadata/tag paths and is not this release owner; `server-deploy-validate.sh` only waits for running state and has limited rollback before its optional readiness command. Their limitations must not be attributed to the confirmed command sheet or used to replace it. Leave them untouched in this redesign unless an independently approved integration actually needs them.

### 2.2 Qualification is not application access policy

This plan distinguishes three boundaries:

- **Existing operation:** current clean/dirty build commands and tags, hosted Compose `--wait` and CSP checks, optional readiness in other supported routes, source builds, native localhost watcher, and application behavior remain usable. Existing security, dependency-audit, configuration, MongoDB, and Redis enforcement remain unchanged.
- **Audit qualification:** missing or conflicting build/registry/test evidence is unqualified evidence and maps to the existing report `ERROR` vocabulary. It never becomes `PASS`, but it does not newly stop application startup, health checks, sign-in, learner work, or deployment commands.
- **Redesign acceptance:** maintainers require the verification described here before declaring a P0 phase complete or authorizing its coordinated production cutover. These are review/acceptance gates, not permission to add automatic deployment gates.

There is no implicit missing-proof recovery to a trusted build. Source builds without qualification remain operational but cannot claim the missing assurance. Do not introduce a new public status, UI control, required GitHub dependency, startup bundle requirement, rate limit, role restriction, or mandatory immutable-image enforcement in the name of this scanner work. Any such behavior change needs separate approval. The deliberate V2-only audit ingestion cutover is the scoped exception: it changes the report transport contract through the coordinated procedure, not ordinary application access.

## 3. Scope and Non-Goals

### In scope

- The canonical control catalog and report schema.
- Producer-section contracts and exact report assembly.
- Signed report ingestion, storage, summaries, and downloads as affected by the new contract.
- Authorization fixture validation and probe evaluation.
- Method, publication, route, download, reset-token, and session evidence semantics.
- Runtime security-surface descriptors and registration adapters.
- Source checks that prohibit bypassing the registration adapters.
- Focused code organization, test decomposition, and maintainer documentation.
- Local, CI, staging, and production cutover gates.
- Safe handling of existing report records and application rollback without building old-format historical access or an archive (Section 0).

### Not part of P0 implementation

- Adding broad SAST, DAST, fuzzing, SBOM, KEV, or manual penetration-testing programs.
- Remediating application vulnerabilities discovered while reclassifying surfaces.
- Automatically changing firewalls, proxies, accounts, or production services in response to findings.
- Replacing the production deployment workflow.
- Making CI the production publisher or making audit qualification a new application startup/deploy prerequisite.
- Tightening current allow/deny decisions, throttling, or endpoint behavior as part of descriptor migration.
- Copying production data or credentials into a local or staging environment.
- Changing TDF/config schemas or content.

Those needs remain in the post-P0 roadmap in Section 17. A discovered vulnerability must be reported and scoped separately; it must not be silently folded into a scanner refactor.

## 4. Non-Negotiable Invariants

1. **No missing-evidence pass.** Missing, malformed, timed-out, unreadable, contradictory, or unclassified evidence maps to `ERROR`, never `PASS` or `FAIL`.
2. **One metadata owner.** A control ID, title, section, failure severity, applicability, producer owner, and evidence-contract ID are defined once in its immutable catalog; the referenced proof validator is defined once in the evidence-contract registry.
3. **Exact membership.** The selected catalog profile determines the complete ordered set for a report. Section producers, the assembler, and the server verify their respective exact sets independently.
4. **No silent normalization.** Duplicate, unknown, wrong-section, or wrong-profile results are observable errors. They are never dropped or renamed.
5. **Derived summaries.** Producers do not supply section status, report counts, titles, or severities. Assembly derives them from catalog metadata and validated outcomes.
6. **Separate observation from judgment.** Transports acquire bounded facts; pure evaluators classify those facts; assembly converts classifications into report controls.
7. **Runtime-coupled authorization.** A security-surface descriptor is part of the actual registration path. It is not a second manual inventory beside the handler.
8. **Server enforcement is authoritative.** Client route visibility and hidden controls are never authorization evidence.
9. **Stable identities.** Control and surface IDs are never reused for a different meaning. Semantic changes require a new catalog version; replacement concepts receive new IDs.
10. **Fail at the owning boundary.** Producers validate their own output, assembly validates every section, and ingestion independently validates the complete signed report.
11. **Bounded evidence only.** No credential, token, cookie, learner identifier, raw response, unrestricted source excerpt, or complete database record enters a report or retained artifact.
12. **No dual current ingestion.** The cutover has one accepted version for new reports. Existing V1 records are not a current path; Section 0 removes historical-access/archive work without authorizing deletion.
13. **No new dependency by default.** Use the pinned Node runtime, TypeScript already present in the app, Node's test runner, and existing Meteor test infrastructure unless a dependency is separately justified and approved.
14. **Behavior-preserving migration.** Preserve existing access decisions and transport/invocation semantics. A newly discovered vulnerability is reported separately, not silently fixed by moving a guard or selecting a stricter policy constructor.
15. **Preserve the release owner.** The confirmed workstation script builds and pushes; Compose deploys. Shared qualification tooling interfaces with those owners. CI image evidence cannot substitute for exact workstation-image evidence.
16. **No new operational lockouts.** Missing/invalid audit identity, bundle, registry coverage, or scenario evidence invalidates audit qualification, not ordinary application availability. Existing startup/security failures are not weakened.
17. **Protect the active scanner.** Default-branch publication can change scheduled scanner behavior before an app image is deployed. Isolate incomplete contract changes before touching active producers; follow Section 15.1.

## 5. Public Status and Internal Outcome Vocabulary

Keep the administrator-facing report statuses stable:

- `PASS`: the required security property was positively established by complete evidence.
- `FAIL`: complete evidence established that the security property was violated.
- `ERROR`: the check could not establish the property because execution, transport, configuration, evidence, or classification was incomplete.
- `NOT_APPLICABLE`: section-only status used when the selected catalog profile contains zero controls for that section.

Included V2 controls use only `PASS`, `FAIL`, or `ERROR`. If a check is conditional, encode that condition in report-profile membership rather than letting a scheduled producer declare itself not applicable at runtime.

Do not add a user-visible `INCONCLUSIVE` status. Internally, probe acquisition uses a discriminated outcome:

```text
ALLOWED
DENIED_BY_POLICY
DOMAIN_REJECTION
TRANSPORT_OR_RUNNER_ERROR
INCONCLUSIVE
```

The authorization evaluator is a total decision table:

| Expected policy result | Observed result | Report result |
| --- | --- | --- |
| Allow | `ALLOWED` | `PASS` |
| Deny | `DENIED_BY_POLICY` | `PASS` |
| Deny | `ALLOWED` | `FAIL` |
| Allow | `DENIED_BY_POLICY` | `FAIL` |
| Either | `DOMAIN_REJECTION` | `ERROR` |
| Either | `TRANSPORT_OR_RUNNER_ERROR` | `ERROR` |
| Either | `INCONCLUSIVE` | `ERROR` |

An internal outcome may retain a bounded `inconclusive: true` metric for diagnosis, but that metric does not create another public status.

## 6. Canonical Control Catalog and Report V2 — P0 Item 3

### 6.1 Catalog ownership

Use immutable, checked-in, language-neutral JSON catalog versions under `mofacts/common/securityAudit/`, with exactly one selected for current ingestion. JSON is selected because the catalogs are consumed by Meteor TypeScript and Node `.mjs` scripts in GitHub Actions. The separately installed Bash host producer emits a versioned observation envelope but never parses or copies catalog data. The catalogs contain metadata only; they never contain credentials, target-specific values, or executable policy.

Recommended files:

```text
mofacts/common/securityAudit/
  catalogs/
    control-catalog.v1.json
  catalogRegistry.ts
  evidenceContracts.ts
  reportV2.ts
  canonicalReport.ts
```

Each immutable `control-catalog.vN.json` is the only source for its version's control metadata and report membership. `catalogRegistry.ts` imports every released version, maps each approved version to exactly one digest, and names exactly one `activeIngestionCatalog`. New reports must use the active catalog; historical reads select the immutable catalog named by the stored coordinates. Released catalog versions are append-only: never edit or delete them, because exported encrypted artifacts may outlive application TTL records.

`catalogRegistry.ts`, `evidenceContracts.ts`, `reportV2.ts`, and `canonicalReport.ts` are runtime-neutral, erasable TypeScript with no Meteor imports or application state. The pinned Node 24.15 scanner imports these exact modules with explicit `.ts` extensions, and the Meteor server imports the same modules. They must never enter the client bundle; the client consumes bounded summary DTOs and type-only imports. Bash host acquisition never parses the catalog; the Node internal evaluator validates and classifies its observation envelope, and the trusted assembler attaches catalog metadata.

Every Node section producer, the assembler, and the receiver still invokes validation independently at its own trust boundary. The Bash host validates its bounded observation envelope locally, and the Node internal evaluator validates it again before creating catalog results. That means independent validation events, not independently copied catalog or report implementations. Phase 0 must prove explicit `.ts` imports, erasable syntax, JSON import attributes, and the fixed catalog digest under the exact pinned Node workflow command and the supported Meteor server build. A failure at either runtime is a design blocker; do not respond by restoring parallel TypeScript and `.mjs` contract logic.

Do not add a generated TypeScript copy, parallel JSON schema, Node adapter that reimplements validation, or producer-local list of the same definitions.

`evidenceContracts.ts` is the single append-only registry for versioned evidence-contract validators such as `address-inventory-v1`. Every catalog reference must resolve. Producer validation, assembly, and ingestion call the same pure validator. These validators establish the required structure for a claimed status—they do not establish that an evaluator classified reality correctly. A `PASS` or `FAIL` must carry its required observation fields; `ERROR` must carry a bounded execution/evidence category. Included controls cannot use `NOT_APPLICABLE`; applicability is represented only by a profile's empty section. Changing a validator's meaning requires a new evidence-contract ID and catalog version, while released validators remain unchanged indefinitely.

### 6.2 Catalog shape

The catalog should contain:

```json
{
  "catalogSchema": "MoFaCTSSecurityAuditControlCatalogV1",
  "catalogId": "mofacts-security-audit-controls",
  "catalogVersion": 1,
  "controls": [
    {
      "controlId": "external.dns-addresses",
      "sectionId": "external",
      "title": "Resolve every public address",
      "failureSeverity": "HIGH",
      "producerId": "external",
      "evidenceContract": "address-inventory-v1",
      "standardsReferences": []
    }
  ],
  "profiles": {
    "exposure": {
      "external": [],
      "authentication": [],
      "internal": [],
      "repository": []
    },
    "full": {
      "external": [],
      "authentication": [],
      "internal": [],
      "repository": []
    }
  }
}
```

The profile arrays contain ordered control IDs. Every referenced ID must exist exactly once in `controls`, and every control must be owned by exactly one producer. `failureSeverity` is catalog-owned and stable; producers cannot downgrade it. If a future check genuinely contains findings with materially different impacts, those are distinct controls rather than runtime severity mutation.

The catalog digest is SHA-256 over canonical JSON of the complete validated catalog. Catalog version and digest are different concepts:

- The integer version is a human-reviewable immutable identity.
- The digest proves exact validated canonical content and catches a semantic catalog edit whose version was not bumped; whitespace and object-key order are intentionally irrelevant.
- A version can correspond to only one approved digest.
- Any membership, title, section, severity, ownership, or evidence-contract change requires a new version.

### 6.3 Report schema

`SecurityAuditReportV2` should retain the useful bounded V1 fields and add:

```text
catalogId
catalogVersion
catalogDigestSha256
scannerSourceRevision
deployedApplicationRevision
deployedImageDigest
```

The catalog coordinates and all three identity observations are included in the report digest. V2 replaces the ambiguous V1 `sourceRevision`/`productionImage` interpretation:

- `scannerSourceRevision` is the actual checked-out scanner commit, resolved from that checkout. It equals `GITHUB_SHA` only when the workflow uses its event revision; an explicitly pinned scanner checkout must not be mislabeled with the workflow event SHA.
- `deployedApplicationRevision` is the build revision reported by the receiver and sealed surface inventory.
- `deployedImageDigest` is the repository-qualified OCI platform-manifest digest confirmed by the release record and host evidence, not a mutable tag or Docker config image ID.

Keep distinct identities distinct; reuse existing names where they already have the right meaning:

| Identity | Owning evidence | Must not be interpreted as |
| --- | --- | --- |
| Source revision | Existing `baseCommit`, passed through `MOFACTS_SOURCE_REVISION`/OCI label and translated to the report's application revision | Complete dirty-source identity or image equivalence by itself |
| Docker config image ID | Exact local built image and running container `.Image` | OCI repository or platform-manifest digest |
| OCI platform-manifest digest | Registry-resolved immutable image manifest for the deployed platform, linked to its config digest | Source revision or another platform's manifest |
| OCI multi-platform index digest, if present | Registry index resolving to the selected platform manifest | The selected platform manifest itself |
| Surface-registry digest | Canonical serialized deployed descriptors and registration coverage | Any image identity |

Record the index-to-platform-to-config mapping only when applicable, in the bounded release/host evidence contract, not as parallel free-form identity fields. A tag is an operator-facing locator; qualification resolves it to immutable evidence without banning the operator's tag-based command. Dirty source is supported: preserve `baseCommit` and `includedUncommittedLocalChanges`, and add bounded build-context binding only through the versioned existing release/proof contract after tracing its readers. Unknown labels, unbound inputs and unresolved mappings cannot establish exact-source qualification. Dirty source is not inherently unqualifiable; it requires evidence for its actual snapshot, not a clean-base CI result.

These revisions are not generally required to equal each other: an approved scanner-only change may run against an older application image. Each must agree with its own independent evidence. Equality is required only for a coordinated contract/receiver/registry cutover whose gate explicitly says the scanner and application come from the same revision. The report schema version and catalog version remain independent: ordinary catalog evolution should not require `SecurityAuditReportV3` unless the report envelope itself changes.

Phase 1 introduces `BuildIdentityV1`, a bounded read-only identity carried by images produced through the integrated qualification tooling. Its source revision reuses `MOFACTS_SOURCE_REVISION`/existing `baseCommit`; do not create a second revision setting or revive `autobuild.sh` metadata files. Carry the existing dirty-source distinction with its validated snapshot binding, not a claim that HEAD contains uncommitted changes. The receiver loads this metadata once for audit comparison. Qualification binds the actual build context (including required non-secret inputs); setting a label alone is not sufficient. The host records the running config image ID and OCI revision label and joins them to the existing release record's extended evidence. Section 7.2 specifies the build-once sequence.

Identity fields must represent either a validated observed value or an explicit bounded unavailable/conflicting observation; define this discriminated shape once in the shared contract during Phase 0. Never substitute `unknown`, a tag, a config image ID, or the scanner revision as a successful application identity. Controls requiring absent/conflicting identity become `ERROR`, and a structurally valid error report remains recordable. Ingestion rejects a claimed successful identity that contradicts independently known receiver/evidence values. It does not invent missing evidence or reject all error reports merely because provenance could not be established.

Existing self-hosted source builds, native localhost, and CI test processes remain operational without an embedded identity. Their owning test/qualification harness can supply explicitly marked test identity, never production proof. Missing or malformed build metadata invalidates audit qualification only; it does not add build/startup/health/login failure conditions. A requirement to block an ordinary build or deployment on this metadata is outside the approved redesign.

Every final V2 control stores this signed wire shape:

```text
controlId
title
failureSeverity
status
evidence
```

Assembly copies `title` and `failureSeverity` from the selected catalog; ingestion rejects any mismatch. `failureSeverity` is the impact if the control is `FAIL`, not a claim that a `PASS` or `ERROR` control is an active vulnerability. Overall status and highest failed severity are derived from statuses; an `ERROR` remains independently visible and can never be hidden by severity aggregation.

For an `exposure` report, sections that are not scheduled contain zero controls and have section status `NOT_APPLICABLE` because the profile expects an empty set. Do not manufacture `authentication.not-applicable` or `repository.not-applicable` pseudo-controls.

The report parser must validate:

- Exact top-level keys and bounded field types.
- Known report schema and exactly one active ingestion catalog for new reports.
- A retained catalog/evidence-contract pair for historical reads and a locally recomputed catalog digest, never only the digest claimed by the report.
- Exact control membership and order for report type and section.
- Unique IDs and canonical catalog metadata.
- Evidence keys, lengths, metric types, and sanitization.
- Section status and counts derived from controls.
- Canonical revision/digest observation shapes; any claimed verified application revision must agree with known receiver evidence and any claimed verified platform digest must match the bounded host/release mapping. Unavailable/conflicting evidence forces dependent controls to `ERROR` without preventing a valid error report from being stored.
- ISO timestamp ordering with named shared constants: `0 <= completedAt - startedAt <= 180 minutes`; `completedAt` is no more than 5 minutes after the authenticated request timestamp; and upload occurs no more than 15 minutes after `completedAt`.
- Exact canonical report digest.
- Exact target origin matching the receiver's `ROOT_URL`.

### 6.4 Producer artifact contract

Each control producer has acquisition adapters and a pure evaluator. Acquisition returns bounded observations; the evaluated producer emits one artifact containing only its catalog IDs, outcomes, and bounded evidence. More than one producer may contribute controls to the same final report section.

```json
{
  "artifactSchema": "MoFaCTSSecurityAuditProducerArtifactV1",
  "producerId": "external",
  "sectionId": "external",
  "controls": [
    {
      "controlId": "external.dns-addresses",
      "status": "PASS",
      "evidence": {
        "summary": "...",
        "metrics": {}
      }
    }
  ]
}
```

They do not emit title, section metadata, failure severity, profile membership, report counts, or final section status. The artifact's exact expected control set is derived by `(catalog profile, producerId)`. Producer output is validated before it is written.

The artifact schema version defines its wire shape, the catalog identifies expected controls/evidence contracts, and the report `scannerSourceRevision` identifies Node producer code. Do not add a free-form producer version. The separately installed host observation envelope needs its own explicit contract version because it is deployed independently.

The separately installed host producer is an acquisition adapter, not an evaluated section producer. It emits a versioned, bounded observation envelope without titles, severities, profile membership, or final report statuses. The Node internal evaluator validates that observation-contract version, classifies the measurements, and emits the catalog result IDs. A host version mismatch or malformed observation becomes a complete internal-section `ERROR`; it must never be treated as current host evidence.

Controls that require more than one acquisition source have a named composite producer such as `composite-exposure`. External and host acquisition emit bounded transient inputs for that producer and must not also emit the final control. The pure composite evaluator validates both inputs and emits its own producer artifact; missing or conflicting inputs become `ERROR`. Generic assembly only checks and joins already evaluated producer artifacts, so control-specific policy never leaks into the assembler.

### 6.5 Assembly behavior

Assembly must:

1. Load and validate the catalog once.
2. Select exactly one report profile.
3. Derive the exact producer-artifact set for the selected profile and parse each artifact without first collapsing IDs into a map.
4. Detect duplicate, unknown, wrong-section, wrong-producer, and wrong-profile results and invalidate the affected producer artifact before any join.
5. Require exactly one result for every applicable catalog control.
6. Merge valid/recovered producer artifacts into catalog section and control order.
7. Use catalog titles and severities.
8. Derive section statuses and counts centrally.
9. Canonicalize the final report once and compute its digest once.

The assembler owns explicit recovery for missing or malformed raw scanner output. It may create the complete expected producer-owned subset with every applicable control set to `ERROR` and add a bounded execution error. This is observable, named recovery and does not mask a broken invariant.

For duplicate, unknown, or contradictory raw output, the entire affected producer-owned subset becomes catalog-complete `ERROR`; valid artifacts from other producers in the same section remain intact. The unexpected evidence is not retained. The final server does not perform this recovery. It accepts a valid complete report or rejects it.

The assembler and uploader must use the same required `AUDIT_TARGET`. Missing, non-HTTPS, credential-bearing, or unapproved targets fail before report creation. Target approval is owned by the selected protected GitHub environment: it supplies one fixed environment variable, the workflow exposes no caller-supplied target input, and the receiver independently requires exact equality with its `ROOT_URL` origin. Remove the current production-target constant from assembly so staging and production use the same code path with separately protected configuration.

### 6.6 Ingestion, storage, and presentation

Introduce `/internal/security-audits/v2` and remove V1 new-report ingestion at cutover. Preserve the current HMAC, timestamp, nonce, body-size, report-ID, report-digest, and target-origin protections.

Use the existing report collection with `schema` as the discriminator unless rollback qualification demonstrates that a V2 record is incompatible with the prior application image. Avoid creating permanent parallel collections solely for schema versions.

Add indexes supporting actual queries:

```text
{ schema: 1, completedAt: -1 }
{ schema: 1, catalogId: 1, catalogVersion: 1, catalogDigestSha256: 1, reportType: 1, completedAt: -1 }
```

Keep the stored document shape simple: the flat canonical report envelope plus server-owned `_id`, `ingestNonce`, `ingestedAt`, and `expiresAt`. Do not persist a second materialized summary. Summary methods use Mongo projections over signed report fields—schema/catalog coordinates, IDs, report type, timestamps, target, revisions, digest, counts, bounded execution-error categories, and each section status—then derive the summary DTO. They never load control evidence for the 200-report list. The active latest query filters by the exact active schema, catalog ID, version, and digest, so a prior catalog cannot become current after cutover.

Fetch full evidence only for a specifically authorized single-report view or download. Strip server-owned storage fields, re-parse the exact report envelope with its retained catalog/evidence-contract pair, and compare its stored report digest before rendering. Corrupt or unknown records fail visibly. Broader at-rest integrity scanning remains a separately scoped follow-on control.

Per the controlling 2026-11-02 decision in Section 0, retire old-format report access at V2 cutover; do not implement a V1 historical reader, old-report UI/download support or archive. Existing V1 records must not become current exposure/full reports and must not be reinterpreted as V2. This does not authorize deleting records, rewriting their digests or changing existing TTL policy. Keep new-report parsing, authorized downloads and integrity checks intact.

Choose the simplest storage model that passes the previous-production-image rollback qualification. Prefer the existing schema-discriminated collection if it is safe; choose version-separated storage if the evidence requires it. This choice is delegated within the approved scope and must be documented with its compatibility evidence before cutover. No destructive migration, dual current ingestion or historical-access feature is implied.

Previous-image list/latest/download checks must establish safe operation or explicit rejection of unsupported schemas with retained records present. They do not require the new application to expose old-format history or the previous image to interpret V2 as V1. Record the expected supported-schema behavior and rollback evidence for the selected storage model.

## 7. Exact Authorization Evidence — P0 Item 2

### 7.1 Decompose the runner

`production-auth-audit.mjs` should become a thin coordinator. Move owned behavior into modules such as:

```text
mofacts/scripts/security-audit/authentication/
  fixtureBindings.mjs
  browserSessions.mjs
  outcomeEvaluator.mjs
  authorizationScenarioRunner.mjs
  transports/
    meteorMethod.mjs
    publication.mjs
    route.mjs
    download.mjs
  scenarios/
    enumerationTiming.mjs
    resetAndSessions.mjs
    passwordlessContainment.mjs
    throttling.mjs
```

I/O adapters return discriminated observations. Pure evaluators map observations and expected policy to report status. Inject clock, browser/session creation, fetch, Meteor calls, mailbox access, and command execution so tests do not require a live production system.

### 7.2 Verification catalog and protected fixture bindings

Create a source-controlled `verificationCatalog.ts` as the only owner of non-secret verification intent. Every entry has a stable verification ID, surface ID, one of the kinds `authorizationScenario`, `integrationTest`, `protocolQualification`, or `publicPositiveProbe`, an execution owner/lane, required proof-artifact shape, and any protected binding aliases. Every descriptor reference must resolve to exactly one entry, and every required entry must produce bounded executed evidence in the appropriate CI, staging, or production lane.

Build-lane entries name a required capability, not GitHub as the only possible executor. CI remains the supported Meteor integration environment for this project; any equivalent qualification lane for another maintainer must implement the same proof contract and be explicitly supported, not silently substitute a native Windows run. Each `authorizationScenario` entry additionally defines:

- Scenario ID and referenced surface ID.
- Transport/probe family.
- Expected policy outcome.
- Required allowed baseline scenario when the case expects denial.
- Exact policy-denial category or successful observation that proves the result.
- Required actor, resource, canary, mailbox, session, and timing binding aliases.
- Whether it mutates state and, if so, explicit preconditions, setup, postconditions, idempotent cleanup, and interrupted-run recovery ownership.

`integrationTest` entries name the stable suite/test ID and expected result; `protocolQualification` entries name the protocol case and qualification environment; `publicPositiveProbe` entries name the exact reachability/rate-limit observation. Arbitrary nonempty strings are invalid verification. Phase 2 uses the authorization entries to repair and completely cover the currently selected authorization controls; it does not claim all runtime surfaces are known yet. Phase 3 makes every runtime descriptor reference one or more verification IDs and verifies closure between the sealed registry, catalog, embedded build bundle, and environment-run manifests. Expected outcomes never move into protected configuration.

#### Workstation-owned build and qualification interface

Use one shared proof contract, independent of the process that calls it. `VerificationBundleV1` contains application source identity, declared environment/profile, expected registry digest, verification-catalog digest, executed verification IDs, outcome categories, execution-lane references, and bounded evidence digests. No credentials or raw responses enter it. Extend existing CI to export structured source-test evidence for its actual revision; this export is planned, not currently present. A workstation-owned helper validates/composes that evidence. CI does not push the production image, acquire workstation registry credentials, or certify an independently rebuilt or dirty-source image by base SHA alone.

Integration extends the production app section of config repo `deploy and build.txt` at the boundaries below. Preserve existing clean/dirty image naming, configured registry credentials, `--no-cache` build, base-versus-runtime-overlay selection, SSH/SCP invocation, Compose `--no-build --wait`, environment-update timing, CSP checks and operator control. Add a documented repository-owned helper under `deploy/` for qualification, called from that command sheet; pure contracts/evaluators stay in `mofacts/common/securityAudit/` and `mofacts/scripts/security-audit/verification/`. It must check outcomes for commands it owns and distinguish qualification failure from the existing deployment-success record. Do not create a replacement monolithic deploy wrapper, duplicate assertions in PowerShell/Bash/YAML, or add a dependency.

The [Phase 0 capture design](security-audit-phase0-contracts.md#22-proposed-capture-mechanism-and-the-one-workflow-adjustment) specifies Docker-owned filtered capture, a sealed local candidate, separately bound supplemental test inputs, and a build-only ephemeral Compose context override. The user approved implementation of this targeted adjustment. The [opt-in capture helper](../deploy/security-audit/source-capture.md), shared Docker source stage, bounded extractor and synthetic tests are now implemented; actual Docker equivalence, stronger sealing, test-input acquisition and final in-image binding remain unverified/unimplemented as recorded in status. No production command-sheet hook is installed before those gates. Ordinary builds retain their current context and commands; their Dockerfile now consumes the shared source-copy owner without adding qualification checks. The production context excludes standalone tests and omits root lint/typecheck inputs, so a test target containing only production copies cannot satisfy the source-verification contract. No app build/deploy/startup restriction is introduced by missing qualification.

The Phase 3 qualification sequence extends the existing build/push/deploy boundaries:

1. **Before command-sheet line 241:** reuse the captured base commit/dirty flag and bind the actual reviewed build inputs. Obtain applicable executed lint/typecheck/source/Meteor CI evidence; clean-base CI is insufficient for modified source. Defining a supported exact-snapshot source-test lane is a Phase 0 task, not permission to run local Meteor CI or upload private inputs. Generate `BuildIdentityV1` using the existing revision arg. Compose the expected registry projection from descriptors and a declared non-secret profile; preserve runtime-only Change Streams/proxy configuration in its existing overlay. Conditional registrations must be declared and checked against the actual runtime profile, not guessed from a generic `production` string.
2. **Prepare source proof:** generate the canonical `VerificationBundleV1` in an ignored/ephemeral build location and embed it with the build identity before image construction. The declared test fixture variant is explicitly test-only. This embedded bundle proves source-lane results only; it cannot contain the future digest of its own image or claim a smoke test not yet executed. An explicitly requested qualification operation fails to qualify on missing proof, while ordinary build/startup semantics remain unchanged.
3. **Build once at line 242:** let the existing base Compose/root Dockerfile perform its `--no-cache` app build. Capture its actual native-command result and resulting Docker config ID/source label for qualification; do not accidentally inspect an old same-tag image after a failed build. Do not rebuild in CI, on staging, or on production and call it the same candidate.
4. **Between successful build and line 243 push:** run explicitly authorized exact-image smoke/contract qualification in an isolated Docker-compatible lane with synthetic data. This is not a second localhost watcher, native Meteor release substitute, or use of the frozen staging server. Record actual registry/bundle digests, source snapshot identity, platform and health/contract outcomes against the config ID. Post-build proof stays external; appending it to the image would invalidate the exact-image test.
5. **Use lines 243–246:** push the same tested image with current registry credentials/naming. Extend the existing Buildx manifest inspection to resolve media type and platform/config mapping against the tested local ID. Attach outcomes and the embedded bundle digest to the existing release record's qualification extension. Retain the current post-publication private-environment tag update; do not introduce a second authoritative image setting. Any rebuild or content mutation requires new qualification.
6. **Use lines 260–300:** retain runtime input transfer, base+overlay preflight, tag-based pull, `up -d --no-build --wait`, running tag/revision checks and Apache/CSP validation. Add bounded actual running config/platform association after the existing startup check; do not replace this stronger current hosted route with the generic running-state helper. Preserve Apache rollback without claiming it rolls back the app image. Digest-only inputs or new automatic rollout gates need separate approval.
7. **Join audit evidence:** the runner joins the receiver's bounded identity/inventory/bundle, host-observed running image, protected release receipt, and current environment-run evidence. Recompute digests and reject mismatched proof claims. Missing, malformed or unbound proof becomes dependent-control `ERROR`; ordinary application routes remain unaffected.

The **release receipt** means a bounded qualification projection of the existing `ProdReleaseRecordPath` record, not another authoritative release file or manually maintained catalog. Integrate its final write with the existing combined deployment verification at lines 302–322; preserve `baseCommit`, dirty flag, image/tag/digest and deployment timestamp meanings. Qualification status is separate from deployment success: an operational unqualified build can still have its truthful deployment record, never a fabricated successful proof. Do not overwrite the previous accepted rollback record without an explicit retained-history contract; the current single-file write alone does not provide that retention.

Phase 0 must finish the versioned extension schema, existing-reader compatibility and bounded pre-build/test references, and implement/qualify the approved protected delivery/read/rollback retention design in Section 0. Use the existing forced-command host-evidence channel for the owner-installed bounded projection with install/read tooling and access-control tests. Do not assume the channel already distributes receipts, create a second control plane, put registry-write credentials on scanners or silently grant production access to CI artifacts. A digest is an integrity coordinate, not a cryptographic publisher attestation; stronger signing remains separately scoped.

Existing source builds without qualification stay operational and explicitly lack that proof. The application must not require GitHub access, a CI-produced bundle, a release receipt, or a new local mode flag to start. The inventory loader reports bounded qualification errors; it does not redefine `/health` or deployment readiness. Test fixtures and source-only CI results cannot become exact-image production evidence. Keep current startup/security checks intact.

Remote `authorizationScenario` and `publicPositiveProbe` entries execute on every applicable audit. Protocol cases execute in the declared supported lane; staging-only outcomes never become recurring production `PASS`. The encrypted audit artifact retains the bounded bundle, release receipt and environment-run manifests for historical interpretation. Rollback restores the prior image, scanner and applicable receipt/host contract together; an older image without a bundle returns to its prior audit contract, not a new application startup restriction.

Ownership: the common contract parses/hashes proof; supported CI/test runners emit executed source evidence; the workstation helper composes the bundle and the existing release-record extension; the immutable image carries pre-build proof; `server/securitySurfaces/verificationBundle.ts` exposes bounded loaded evidence; the protected host channel supplies the release-record projection; and audit artifacts retain historical evidence. Missing/invalid evidence fails qualification at its owning boundary, never silently disabling existing application behavior.

Replace permissive nonempty-array checks with an exact, versioned protected fixture-binding schema. The protected fixture provides only sensitive or environment-specific values:

- An explicit fixture schema version.
- Credentials and environment identities for the source-owned synthetic actor aliases.
- Values for required resource/canary aliases rather than identifiers embedded in diagnostics.
- Reset, expiry, lockout, passwordless, mailbox, and throttle identities.
- A value for every alias required by active verification entries, with no unreferenced credential blocks.

Section 0, decision 4 is now settled by Phil's explicit 2026-11-02 approval: AWS Secrets Manager is the selected authoritative recovery store and Phil is accountable for recovery. The [recovery design and operational gates](#aws-secrets-manager-recovery-design-approved-2026-11-02) below replace the earlier unresolved-store wording. Documented DPAPI staging credentials are a local mechanism, not evidence that the new recovery gate has passed. GitHub environment secrets remain deployment copies; no secret values enter source control, reports, artifacts, logs or this plan.

#### AWS Secrets Manager recovery design (approved 2026-11-02)

**Cold restore, approved 2026-11-05:** implement and perform the isolated read-only
fresh-runner check in the [restore review](../deploy/security-audit/recovery-transfer/restore-rehearsal-review.md).
The approved scope is steps 1�2 only, with no deployment-secret copies or provider
logins and with access/workflow/environment cleanup. Phil authorized one fresh
Meteor invocation plus up to ten additional project invocations if needed;
reserve/count each in the status ledger. Accepted rollback labels, candidate
versions and staging2 operational recovery still require later approval.

**Provider boundary, subsequently approved:** AWS is Phil's selected optional
operator recovery store, not a MoFaCTS application requirement. Preserve the
portable `MoFactsRecoveryBundleV1` document and shared validation. Put AWS
identity/storage operations and their two proposed SDK dependencies in a
separately installed, private tool package under
`deploy/security-audit/recovery-transfer/aws/`; do not add them to the application
manifest, lockfile, ordinary CI dependency installation or runtime. Keep AWS
coordinates/version labels out of the portable bundle and document equivalent
protected storage/retention/restore obligations for other operators. Existing
optional S3 asset storage is unrelated. The
[separation and verification plan](../deploy/security-audit/recovery-transfer/transport-decision.md)
supersedes the earlier application-development-dependency proposal. Phil has
subsequently approved the two SDK clients only in that tool, one fresh Meteor
integration invocation and one protected transfer after verification. Track each
reservation and outcome in the status ledger; neither execution has an automatic retry.

Phil's explicit option-A answer selects this design and recovery ownership; it does not authorize creation, permission changes, credential upload or spending. This later decision supersedes the earlier Q4 investigation/pending-owner wording. Design is selected; the operational recovery gate remains pending.

On 2026-11-04 Phil confirmed independent AWS account recovery is not yet
available and requested setup. Follow the [account-readiness procedure](../deploy/security-audit/account-recovery.md)
before provisioning: verify the actual account and available separate MFA device,
preserve existing access, and require an independent successful sign-in. This
answer does not select a device, authorize a purchase or establish recovery.

Later on 2026-11-04, after physical-key enrollment was verified in AWS, Phil
reported a successful fresh USB-key sign-in and confirmed independent AWS
password/root-email access and separate key custody. A fresh authenticated
console in the expected account was observed. The account-access prerequisite
is accepted with those operator/UI evidence bounds. Complete source-document
provenance, size, provisioning and two-version restoration remain separate gates;
see the [recovery-store review](../deploy/security-audit/recovery-store-preflight.md).

Phil subsequently approved using the current protected GitHub configuration as
the starting point and preparing the transfer for review. The originals and
historical accepted copy remain unavailable; this is a **new unqualified
baseline**, not historical rollback recovery. The
[concrete transfer draft](../deploy/security-audit/recovery-transfer/README.md)
keeps its workflow inactive and proposes one empty secret plus temporary,
expiring OIDC access, exact-byte read-back and access removal. Paid provisioning,
IAM changes and real credential transfer remain approval gates. The source
contains production-audit access: review credential isolation before any staging2
restore, rather than injecting the full bundle or running production-target
probes there. Qualify the baseline before retaining it as accepted rollback;
the original current/accepted-rollback restoration requirement remains open.

- **Complete current and rollback documents:** use one encrypted AWS Secrets Manager secret with versions containing the complete test fixture/provider configuration. Keep current and the last accepted rollback document, their non-secret schema/version/digest metadata and exact version references. Attach a dedicated retained rollback staging label to the last accepted rollback version; do not rely solely on moving `AWSPREVIOUS` or on unlabelled version history. Preserve that accepted rollback reference through candidate writes and interrupted updates; advance it only under the documented acceptance/restore procedure. AWS documents that labeled versions are retained and unlabelled versions may be removed; see [secret version semantics](https://docs.aws.amazon.com/secretsmanager/latest/userguide/whats-in-a-secret.html).
- **Account suitability and independent recovery:** before setup, confirm the intended AWS account/region, appropriate ownership and service/encryption access, and Phil's recovery responsibility. Verify that AWS account and MFA recovery remain possible after loss of the workstation or primary MFA device; recovery must not depend solely on credentials held on that same workstation or inside the secret being recovered. Do not claim workstation-independent recovery from cloud storage alone.
- **Document-size fit:** measure each complete serialized current/rollback configuration against the documented 65,536-byte secret-value quota before upload, without emitting its contents. Confirm the service's input rules. Do not truncate, silently omit bindings or split the approved one-secret design if it does not fit; report the conflict with a recommendation. See [AWS Secrets Manager quotas](https://docs.aws.amazon.com/secretsmanager/latest/userguide/reference_limits.html).
- **Authentication and permissions:** prefer existing approved operator authentication and least-privilege access to the selected secret and necessary encryption operations. This decision assumes no new static AWS credentials, new app/runtime AWS integration or automatic rotation. Any needed provisioning, policy changes, credential upload and setup approvals are pending; no access or secret has been created by recording the design. GitHub environment secrets remain deployment copies, not the recovery authority.
- **Restore acceptance:** before declaring this gate satisfied or replacing production fixture bindings, perform an authorized staging2 restore of both the complete current version and the dedicated retained rollback version. Validate their versions/digests, binding coverage and operational recovery procedure without logging values; restore the intended accepted state afterward. Record bounded evidence and demonstrate the retained label survives intermediate candidate updates. Preserve all fresh per-run `npm run test:ci` and other applicable operational permissions; do not execute the rehearsal under this documentation task.
- **Cost and setup permission:** the verified baseline is $0.40 per secret per month (about $4.80/year) plus $0.05 per 10,000 API calls; creating secret versions adds no version fee. Confirm the selected region and any additional service costs before setup. [AWS pricing](https://aws.amazon.com/secrets-manager/pricing/) was checked on 2026-11-02. This estimate and design selection do not constitute spending approval, and no billable resource is provisioned here.

Fixture validation occurs once. The validated object is passed narrowly to the probes. Repository/image scanners must not inherit the complete fixture or synthetic credentials when they need only bounded canary values.

The runner must verify exact verification-to-binding coverage, not merely that each probe array is nonempty or that each actor appears somewhere. After Phase 3, it also fetches the deployed sealed surface inventory described in Section 8.2. If the verification catalog, deployed registry, required declarations, build bundle/release receipt, and environment-run manifests do not close exactly, it records affected controls as `ERROR` and does not run unsafe or unbound probes. It still stores a valid bounded error report when transport permits; unaffected observations remain separately classified.

Stateful probes run under an environment-scoped concurrency lock and unique run namespace. Preflight proves the synthetic fixture is in the declared starting state; cleanup runs in a `finally` path and is safe to retry. An interrupted run or failed cleanup records `ERROR`, prevents later runs from treating contaminated state as evidence, and invokes the named synthetic-fixture recovery procedure. Cleanup never deletes production or learner data.

### 7.3 Probe-family rules

#### Meteor methods

- A denied probe passes only for the exact approved policy error categories declared by the surface.
- An arbitrary Meteor exception is `DOMAIN_REJECTION` or `TRANSPORT_OR_RUNNER_ERROR`, never proof of denial.
- Every denied case has a proven allowed baseline for the same surface and compatible synthetic resource.
- A supposedly allowed operation must establish the intended success condition, not merely avoid an exception.

#### Publications

- Observe ready, policy error, timeout, transport failure, expected owned canary, and forbidden other-user canary separately.
- Inspect only the named collection/data contract for that publication.
- Use isolated browser contexts or cleared scoped state so pre-existing stores cannot satisfy a probe.
- An unreadable store, missing expected canary, timeout, unknown publication, or unrelated error is `ERROR`.
- A denied-ready-empty publication and a denied-with-error publication are distinct declared policies.

#### Client routes

- Route tests verify presentation behavior only.
- The requested route must be known and positively reachable by an allowed actor before a redirect can prove the denied presentation policy.
- A 404, 500, timeout, missing template, or auth-readiness failure is `ERROR`.
- Route results never substitute for method/publication/HTTP authorization tests.

#### Downloads and exports

- Test token mint, authorized fetch, expected content type/digest, unauthorized mint denial, and replay separately.
- A static nonexistent path or bare 404 never proves denial.
- Capability-token and authenticated-session requirements are explicit in the owning surface descriptor.
- Evidence contains only status categories and digest comparisons, never tokens or response bodies.

#### Reset tokens and session revocation

- Prove both independent sessions can call a protected sentinel before reset.
- Reset with the current token, prove replay fails, prove both prior sessions receive the exact policy denial, prove the old password fails, and prove the new password works.
- Expiration uses a separately preserved, demonstrably old, unused token. A token already consumed by another test cannot prove expiration.
- Missing appropriately aged evidence is `ERROR` with bounded inconclusive metadata.

#### Session lifetime

- Require successful login and a parseable expiration.
- Require `0 < lifetimeDays <= 30.05`.
- A missing, invalid, or already-expired value is `ERROR`, not `PASS` or an inferred vulnerability.

### 7.4 Behavioral tests

Replace source-text assertions for probe correctness with imported behavioral tests. Each transport and evaluator needs tests for:

- Expected allow.
- Expected policy denial.
- Unexpected allow.
- Unexpected policy denial.
- Domain rejection.
- Timeout/transport failure.
- Inconclusive or missing evidence.
- Malformed protected fixture binding.
- Missing positive baseline.
- Redaction and evidence bounds.

Retain one end-to-end contract test proving the coordinator emits exactly the catalog's authentication controls, but do not use one monolithic source-test file as the only evidence.

## 8. Runtime-Coupled Security Surfaces — P0 Item 1

### 8.1 Descriptor model

Create common types and server-owned registration adapters under:

```text
mofacts/server/securitySurfaces/
  accessPolicies.ts
  securitySurfaceTypes.ts
  securitySurfaceRegistry.ts
  registerMeteorMethods.ts
  registerPublications.ts
  registerHttpRoutes.ts
  registerCollectionPolicies.ts
  registerFrameworkSurfaces.ts
  finalizeSecuritySurfaceComposition.ts
  surfaceInventoryMethod.ts
  securitySurfaceRegistry.test.ts
```

A descriptor couples stable identity, an executable policy object, handler, egress characteristics, environment, and verification requirements. The policy object owns both serializable metadata and the existing authorization operation that the registration adapter invokes at its characterized point. For framework-owned surfaces, a declaration binds to the actual package/hook owner instead of re-registering that surface. Conceptually, after verifying the example's current roles and behavior:

```ts
defineSecurityMethod({
  surfaceId: 'method:addCourse',
  name: 'addCourse',
  policy: rolePolicy(['admin', 'teacher']),
  handler,
  dataEgress: { kind: 'none' },
  verification: [
    { kind: 'authorizationScenario', scenarioId: 'method.add-course.teacher-allowed' },
    { kind: 'authorizationScenario', scenarioId: 'method.add-course.learner-denied' },
  ],
});
```

Standard policies such as `rolePolicy` use one shared evaluator only when equivalent to the current surface's behavior. Resource-specific policies use a tagged `resourcePolicy({ policyId, authorize })` object whose declared identity and authorizer cannot be registered separately. The adapter invokes the existing decision at its established point and can pass authorized resource context onward without duplicating a lookup. Do not move every guard ahead of all validation: that can alter allowed inputs, error precedence, enumeration timing, or resource semantics.

Registration adapters preserve a tagged, per-surface lifecycle rather than assuming every surface is a simple role check. A common shape is:

```text
bounded request acquisition
  -> required authentication/signature/protocol validation
  -> required authorization/resource resolution
  -> domain handler
```

Only applicable steps are present; their order is characterized and fixed for that surface, not imposed globally. Signed-body ingestion and SAML ACS retain their bounded parsing/signature/protocol contracts, exact raw-body handling and pre-domain validation. A successful enforcement step may return a validated request or authorized resource context only after equivalence is proven.

Every migration has explicit before/after characterization tests for current allowed and denied actors, resource ownership/sharing, malformed inputs, logged-out behavior, errors and side effects. Preserve Meteor invocation `this`, positional arguments/defaults, `userId`, `connection` and `clientAddress`, `unblock()`, synchronous versus asynchronous behavior, return values, thrown codes/reasons and rate-limit identity. Publications also preserve cursor/manual-event behavior, `ready()` versus throw, collection names, canary visibility, `onStop` cleanup and reactive lifecycle. For example, the logged-out `ready()` in `server/publications.ts` must not become a new exception, and `server/methods/backupMethods.ts` must retain its authorization/validation/unblock order.

Collection `allow`/`deny` rules are an existing synchronous authorization boundary (`common/Collections.ts`), not an untracked method alias. Declare their owning collection/mutation policy and preserve current direct-write eligibility and synchronous return behavior. Do not turn them into async method policies or disable direct mutations incidentally.

Do not retain a generic `role-checked` label when the actual roles or resource policy can be stated. Policy definitions should be a tagged union, for example:

- Public with its existing rate-limit contract or explicitly recorded absence; adding a missing limit is a separately approved remediation.
- Authenticated identity.
- Authenticated self.
- Named role set.
- Named resource/ownership policy.
- Signed service request.
- Single-use capability token, optionally combined with a session.
- Protocol endpoint with a named protocol validation contract, such as SAML metadata/login/ACS.

Resource authorizers should return the authorized resource context needed by the handler when practical, preventing a second database lookup and reducing the risk that authorization and execution load different records.

Surface IDs are immutable and follow one grammar:

- `method:<meteor-name>`.
- `publication:<publication-name>` or `publication:default:<stable-purpose>` for unnamed defaults.
- `http:<lowercase-method>:<normalized-path>` for every concrete HTTP endpoint, including each protocol endpoint.
- `middleware:<stable-purpose>` for an ordered middleware registration, with stack, mount prefix and dispatch metadata; endpoint descriptors reference this owner rather than duplicating its registration.
- `collection-mutation:<collection>:<operation>` for operative collection access rules, with the owning synchronous rule contract.
- `framework:<package-or-protocol>:<stable-purpose>` for package-owned methods/protocols/hooks that must not be registered a second time.
- `client-route:<route-name>` for presentation-policy records kept outside the server authorization count.

Changing a registered name, method/path, or security meaning creates a new surface ID and removes the old descriptor in the same coherent migration. IDs are never aliased or reused.

Verification is a nonempty discriminated union: `authorizationScenario`, `integrationTest`, `protocolQualification`, or `publicPositiveProbe`, each referencing a stable ID in `verificationCatalog.ts`. Policy constructors impose minimum evidence, not new access policy: protected role/resource policies require both allowed and denied cases, while public endpoints require positive reachability and checks of any existing declared limit. Descriptors cannot suppress the evidence minimum. An empty/unresolved reference invalidates coverage qualification; it does not grant authority to change the surface's current permissions. A surface that cannot be exercised remotely must reference its integration or protocol qualification.

HTTP adapters preserve the actual stack (`rawConnectHandlers`, `connectHandlers`, or `handlers`), mounted-prefix stripping, request URL/query/body bytes, registration order, method dispatch, `next()`/`next(error)`, streaming and response ownership. The mounted asset handlers in `runtime/dynamicAssetsRoute.ts`, fallthrough in `http/health.ts`, `WebApp.handlers.use` in `http/pwa.ts` and `http/socialPreview.ts`, and explicit SAML 405 behavior are distinct contracts. Do not flatten them into an exact-path router or change unmatched requests to new denials. Legitimate ordered middleware overlaps are not duplicate concrete endpoint ownership.

Framework/package-owned accounts, OAuth, login validation and user-creation hooks require declarations tied to their installed owner/version and actual integration point. Trace `packages/mofacts-microsoft-oauth/server/microsoft.js`, `server/lib/memphisSaml.ts`, and `server/startup/serverStartup.ts`; preserve enabled providers and existing framework methods/publications. Use the supported service/hook registration to bind owned metadata and verify package-owned surfaces with positive/negative protocol tests. Do not monkey-patch third-party internals or duplicate framework registration to satisfy an app-adapter rule. These declarations remain facets of the same registry, not another hand-maintained surface inventory.

### 8.2 Registry invariants

The registry must:

- Reject duplicate descriptor IDs and unintended duplicate concrete ownership in coverage validation; retain valid ordered middleware overlaps and multiple framework-owned variants explicitly.
- Preserve distinct IDs for multiple default publications instead of collapsing them to one display name.
- Require exact policy and verification metadata.
- Preserve every applicable lifecycle step and its characterized position.
- Seal only at the explicit final composition lifecycle described below; late/untracked registration invalidates the seal and qualification.
- Produce a deterministic in-memory inventory and digest for tests and the repository audit.
- Treat data egress as a facet of the owning surface; do not maintain a second export/download inventory.
- Mark environment-specific development routes explicitly and exclude them from production assertions only through a named environment contract.

`server/main.ts` is the current application entry point: it imports `serverComposition.ts` before separate publications/HTTP modules, and additional security hooks register in startup. Ending `serverComposition.ts` or adding an import last is not a sufficient seal barrier. Phase 3 must implement a named final composition coordinator, explicitly account for all static modules and required asynchronous startup registration owners, and seal only after their registration completion signals. Preserve existing initialization/dependency order; do not reorder unrelated migrations or application startup to simplify the registry. Test the actual composition sequence and conditional package/protocol registrations, not only an isolated registry instance.

The registry does not add a universal startup kill switch. Definition errors fail source/contract qualification; incomplete or late deployed coverage yields an invalid/unsealed audit inventory and `ERROR`, with bounded diagnostics, while existing handler/framework behavior and existing registration error semantics are preserved. A release containing such a defect cannot be accepted as completing Phase 3. Do not silently certify incomplete coverage or add permissive authorization recovery.

Expose the serializable inventory plus its seal/qualification state, registry digest when valid, application identity observation, declared environment profile, and bounded embedded bundle observation through the planned admin-only audit method. It returns no handler source, credentials, request data, or fixture values. The runner recomputes valid bundle/registry digests and compares the verification catalog, release receipt and independent host image evidence. A mismatch, missing descriptor, unresolved verification ID, absent proof, or unexpected surface makes the registry control `ERROR`; it does not change health/login behavior. Source checkout alone never certifies the deployed runtime.

Client management-route policies may be checked separately as presentation policy. They must not be counted as proof of server enforcement. Each protected client route should reference the server surfaces that enforce its data/actions.

### 8.3 Migration order

Migrate by owning boundary, with no partial switch inside a boundary:

1. HTTP and raw HTTP handlers, including dynamic assets, audit ingestion/download, SAML endpoints, and other constant-dispatched routes.
2. Publications, including separately identified default publications.
3. Meteor method factories, one owning module at a time, followed by the final `Meteor.methods` composition; synchronous collection rules and framework/package-owned declaration bindings remain explicit owning boundaries.
4. Egress facets, required authorization scenarios, and final composition completion/sealing.
5. Client presentation-policy cross-references.
6. Static bypass detection.
7. Deletion of `mofacts/security-surface-contract.json` and the inference-based checker.

During migration, do not add a compatibility registration path. A boundary is converted atomically and its old registration is removed in the same change.

For each migrated surface, identify every handler-local authentication/authorization guard and prove the adapter can preserve its call position and semantics before moving it. Extract the same authoritative decision into the descriptor and remove the superseded guard in that coherent change. If equivalence is not established, leave the current boundary unconverted and report the missing proof; do not force a stricter generic policy. A second check may remain only as an explicitly named defense-in-depth invariant with the same policy owner and an equivalence test. Do not leave independently maintained authorization rules.

### 8.4 Static checker's final role

Static analysis remains useful as a bypass detector, not a policy inference engine. It must fail direct uses of:

- `Meteor.methods` outside the approved method-registration adapter.
- `Meteor.publish` outside the approved publication-registration adapter.
- `connectHandlers.use`, `rawConnectHandlers.use`, and `handlers.use` outside the approved HTTP adapter.
- Application-owned collection `allow`/`deny`, OAuth service and account-hook registrations outside their declared owning bindings.
- Equivalent registrations in active `.js` or environment-specific source roots that lack an explicit owner.

Use the existing TypeScript compiler dependency for syntax analysis. Retain unintended duplicates and unresolved dynamic registrations as coverage errors. Recognize explicitly declared framework/package owners without requiring vendor internals to import application adapters. Do not infer access policy by scanning for guard-function names or treat a package allowlist alone as verification evidence.

Every access-policy classification requires traceable policy review and characterization evidence. Under Section 0, decision 8, clear mappings that preserve established behavior may proceed without individual questions; consolidate genuinely ambiguous classifications and proposed permission changes for Phil. Generated coverage proves that a descriptor exists and its authorizer runs; resource-level correctness still requires the actor/resource scenarios from item 2. Do not waive the review requirement or automatically classify ambiguous surfaces.

## 9. Target Source Organization

The target layout is:

```text
mofacts/common/securityAudit/
  catalogs/
    control-catalog.v1.json
  catalogRegistry.ts
  evidenceContracts.ts
  buildIdentity.ts
  proofFields.ts
  releaseQualification.ts
  canonicalReport.ts
  reportV2.ts
  authorizationOutcomes.ts
  verificationCatalog.ts
  verificationBundle.ts

mofacts/scripts/security-audit/
  README.md
  core/
    controlResult.mjs
    producerArtifactContract.mjs
    assembleReport.mjs
    commandRunner.mjs
  external/
    acquireExternalEvidence.mjs
    evaluateExternalControls.mjs
  authentication/
    fixtureBindings.mjs
    browserSessions.mjs
    outcomeEvaluator.mjs
    authorizationScenarioRunner.mjs
    transports/
    scenarios/
  internal/
    hostObservationContract.mjs
    evaluateInternalControls.mjs
  composite/
    evaluateCompositeExposure.mjs
  verification/
    buildVerificationBundle.mjs
    releaseQualification.mjs
  repository/
    dependencyPosture.mjs
    imageAudit.mjs
    secretAudit.mjs
    sourceAudit.mjs
  report/
    reportCrypto.mjs
    uploadReport.mjs
    assertExecutionComplete.mjs
  tests/
    catalog.test.mjs
    evidenceContracts.test.mjs
    verificationCatalog.test.mjs
    assembly.test.mjs
    authorizationOutcomes.test.mjs
    externalEvaluators.test.mjs
    internalEvaluators.test.mjs
    compositeEvaluators.test.mjs
    repositoryEvaluators.test.mjs
    reportCrypto.test.mjs
    surfaceBypass.test.mjs
    endToEndContract.test.mjs

mofacts/server/securitySurfaces/
  accessPolicies.ts
  securitySurfaceTypes.ts
  securitySurfaceRegistry.ts
  registerMeteorMethods.ts
  registerPublications.ts
  registerHttpRoutes.ts
  registerCollectionPolicies.ts
  registerFrameworkSurfaces.ts
  finalizeSecuritySurfaceComposition.ts
  surfaceInventoryMethod.ts
  verificationBundle.ts
  securitySurfaceRegistry.test.ts

mofacts/server/securityAudit/
  buildIdentity.ts
  securityAuditIngestion.ts
  securityAuditStorage.ts
  securityAuditPresentation.ts
  securityAuditDownloadTokens.ts
```

This is a target, not permission to mix file moves with unreviewed behavior changes. Within each phase:

1. Introduce and test the new owner.
2. Move one coherent behavior family.
3. Update all imports.
4. Delete the old owner in the same phase.
5. Run the required checks before moving the next family.

Do not leave re-export facades solely to preserve old internal paths. The final structure must have one active owner.

`verification/releaseQualification.mjs` owns pure qualification/identity-join logic, not a replacement deploy command. A documented helper under `deploy/` is called at the inspected production command-sheet boundaries; the private command sheet retains operator values and must not become the only implementation of qualification. Use one versioned contract to extend the existing release record and produce its bounded host projection. Do not duplicate image-selection, push, Compose rollout or rollback code in the scanner.

## 10. Coding and Review Conventions

- Name modules for the behavior they own; do not create generic `utils`, `helpers`, or `common2` modules.
- Keep side effects in acquisition, transport, workflow, and storage adapters. Keep classification, catalog validation, canonicalization, and digest calculation pure.
- Parse environment variables and protected fixtures once at a named boundary.
- Pass narrow validated objects rather than `process.env` through the module graph.
- Child processes receive only the environment values they require. Repository scanners do not inherit authentication credentials.
- Inject clocks, command runners, browser contexts, fetch adapters, and storage interfaces for deterministic tests.
- Use exact discriminated unions rather than `ok`, `passed`, or loosely related booleans.
- Comments explain policy rationale, trust boundaries, sanitization, or a non-obvious external contract. They do not restate syntax.
- Diagnostic strings are bounded and value-independent. Detailed structured facts use approved metrics and observations.
- Keep imports one-directional: producers depend on core contracts; core contracts never import producers.
- Workflow YAML orchestrates steps and secrets. It does not define controls, security outcomes, or report membership.
- Build qualification artifacts are generated only in ignored/ephemeral locations and never committed. Pre-build source proof may be embedded; exact-image smoke/push proof stays external to the tested image. Invalid evidence fails the requested qualification operation, not ordinary build/startup.
- Bash/AWK host code owns acquisition only. Catalog metadata is attached by the trusted assembler.
- Tests assert behavior and rejected mutations. Source-regex tests may guard forbidden APIs but do not prove runtime correctness.
- Every temporary historical path has an owner, invariant, removal date/condition, and test.

## 11. Ownership Map

| Concern | Canonical owner | Must not own |
| --- | --- | --- |
| Control metadata, report profiles, and active/historical catalog selection | `mofacts/common/securityAudit/catalogs/` and `catalogRegistry.ts` | Network, browser, process, or database I/O |
| Evidence shapes and status-specific proof requirements | `mofacts/common/securityAudit/evidenceContracts.ts` | Evidence acquisition or environment values |
| Build-identity contract/loading | `mofacts/common/securityAudit/buildIdentity.ts` and `mofacts/server/securityAudit/buildIdentity.ts` | Scanner revision or mutable runtime guesses |
| Report parsing/canonicalization/digests | `mofacts/common/securityAudit/` | Scanner-specific measurements |
| Producer acquisition/evaluation | Owning producer folder under `mofacts/scripts/security-audit/` | Titles, failure severity, or report membership |
| Cross-source control evaluation | `mofacts/scripts/security-audit/composite/` | Generic assembly or source acquisition |
| Verification intent, expected outcomes, and proof-artifact contracts | `mofacts/common/securityAudit/verificationCatalog.ts` | Credentials or environment bindings |
| Build verification-bundle schema/digest | `mofacts/common/securityAudit/verificationBundle.ts` | Test execution or runtime authorization |
| Source verification execution | Existing supported CI/test lanes | Publishing the workstation's production image or claiming its image was tested |
| Build verification-bundle generation/carriage | Workstation qualification helper under `deploy/`, shared proof composer, and immutable application image | Production secrets, remote-probe outcomes, or post-build proof embedded into an already-tested image |
| Exact-image release receipt | Qualification extension of existing `ProdReleaseRecordPath`; shared contract/evaluator; protected host projection | A competing release record/catalog, registry-write credentials on audit runners, or application startup policy |
| Verification-bundle loading/exposure | `mofacts/server/securitySurfaces/verificationBundle.ts` | Reclassifying executed outcomes, accepting unbound proof, or redefining health/login |
| Protected fixture-binding source and rollback copy | Selected AWS Secrets Manager secret; Phil accountable for recovery; dedicated retained rollback version; GitHub environment secrets are deployment copies; setup/restore gates pending | Source control, logs, reports, CI artifacts, or an assumed DPAPI-only recovery path |
| Authorization observations/evaluation | `mofacts/scripts/security-audit/authentication/` | Runtime authorization enforcement |
| Runtime authorization | Colocated descriptor/adapter or explicit framework/collection owner | Separate manual inventory or unapproved policy tightening |
| Final registry seal | Explicit final composition coordinator after declared registration completion | Assuming end of `serverComposition.ts` or last static import means complete startup |
| Build/push/rollout orchestration | Confirmed workstation script and existing `deploy/` Compose/remote helpers | CI-only replacement pipeline or duplicated scanner-side deployment code |
| Report assembly | `mofacts/scripts/security-audit/core/` | Control-specific measurement policy |
| Signed ingestion/storage/download | `mofacts/server/securityAudit/` and the HTTP owner | Control definitions |
| Admin presentation | `mofacts/client/views/adminSecurityAudits*` | Authorization enforcement or raw evidence |
| Workflow orchestration | `.github/workflows/production-security-audit.yml` | Result semantics or catalog definitions |
| Host evidence | `deploy/security-audit/` | Application report schema metadata |
| Operator instructions | `docs/deployment/security-audit.md` | Implementation status or exploratory decisions |
| Architecture and implementation status | `docs-developer/` | Claims about current production state |

Responsibility roles are used until the repository has enough maintainers for meaningful path-level `CODEOWNERS`. Adding names to ownership configuration is an organizational decision, not an implementation shortcut.

## 12. Phased Implementation Plan

At the 2026-09-06 foundation checkpoint, Phase 0 has pure draft contracts and locally executed characterization tests; application/scanner activation in Phases 1–4 has not started. Execution status belongs in the companion evidence document. This does not claim Phase 0's runtime/ownership exit gate is complete.

| Phase | Scope | Estimated effort | Production effect |
| --- | --- | ---: | --- |
| 0 | Decisions, V1 characterization, IDs, and guard tests | 1–2 days | None |
| 1 | P0 item 3: catalog and V2 report integrity | 8–12 days | One coordinated receiver/producer/host cutover |
| 2 | P0 item 2: exact authorization evidence | 8–12 days | Primarily scanner/workflow; app deploy only if server fixture support changes |
| 3 | P0 item 1: runtime-coupled surface registry | 10–16 days | Application deploy after full migration |
| 4 | Remove obsolete paths, finish organization, and close documentation | 2–4 days, largely overlapping phases 1–3 | No separate deploy if included coherently |

Use approximately 30 engineer-days as the baseline because Phase 0 and most Phase 4 work are included in or overlap the three implementation phases. Reserve about 35 days for ordinary uncertainty. The independent high estimates for Phases 0–3 approach 42 days; if characterization shows multiple difficult registration variants or protected-fixture repairs, reforecast before implementation rather than treating 35 days as a hard cap. This durable estimate is higher than a narrow item-3 patch because it includes the host observation redesign, historical catalogs/evidence validators, staging qualification, and rollback proof. It excludes remediation of application vulnerabilities found during reclassification.

### Phase 0 — Decisions and characterization

Deliverables:

- Keep the verified binding to config repo `deploy and build.txt` current: preserve clean/dirty naming, no-cache/base build, runtime overlay, post-push environment update, Compose wait, source/CSP checks and release-record ownership. This static trace is complete; helper execution/contract tests remain to be implemented and authorized.
- Define shared qualification integration points before build, after build, after push and at host identity observation; keep pre-build source proof separate from post-build exact-image proof.
- Define the compatible versioned qualification extension of the existing release record, its bounded host projection and retained rollback history; do not create a competing record. Settle exact-snapshot proof for dirty source, native-command result capture, OCI index/platform/config mapping and protected install/read tooling without changing normal deploy defaults.
- Record zero-access-drift and no-new-operational-lockout acceptance cases for source builds, missing proof, methods, publications, collection rules, HTTP stacks and framework-owned authentication.
- Apply the approved active-scanner isolation strategy and conditional immutable selection in Section 0 before incompatible producer/contract edits reach the default branch; verify Section 15.1 update/rollback tooling.
- Freeze the current top-level control IDs that items 1 and 2 will continue to implement.
- Inventory every repeated control definition and identify its deletion phase.
- Record exact current V1 exposure/full control membership in test fixtures.
- Apply Section 0: no old-format historical reader or archive; preserve existing records and prove safe application rollback.
- Define the one-collection backward-compatibility test using the previous production image; if that model fails Phase 1 qualification, stop and choose version-separated storage before cutover.
- Define the catalog registry, evidence-contract registry, metadata fields, canonical digest algorithm, and append-only release rules.
- Define and, when separately authorized, smoke-test `BuildIdentityV1` and missing/conflicting identity observations across native local, supported CI, ordinary self-hosted source builds and qualified workstation images; missing proof must not create a startup failure.
- Define the authorization observation union, decision table, and source-controlled verification-catalog ownership.
- Apply the selected AWS Secrets Manager design with Phil accountable for recovery. Verify account/MFA recovery, complete-document size fit, least-privilege setup and staging2 restoration of current plus dedicated retained rollback versions before closing the recovery gate; obtain outstanding concrete setup/operation approvals.
- Identify every direct runtime registration API and environment-specific source root.
- Prove the shared TypeScript/JSON imports under the exact pinned Node command and supported Meteor server build.
- Record the installed production host script hash/version and a recoverable previous version without copying protected configuration.
- Maintain `docs-developer/security-audit-durable-redesign-status.md` with separate source, local, CI, staging, production, and evidence columns; the initial documentation-only record is not runtime verification.
- Capture each confirmed false-green defect with a locally demonstrated red reproducer and the intended green assertion. Do not leave a required test failing in a completed revision; land the regression assertion with its owning fix.

Exit gate: the confirmed release entry point has a specified/testable qualification interface, proof-carriage and non-production-target decisions are resolved, compatibility contracts and active-scanner isolation are explicit, and every P0 defect has a recorded red reproducer and planned green regression assertion paired with its owning fix (or a documented reason it can only be established in a remote lane). No completed revision carries a knowingly failing required check. Static script inspection alone does not satisfy this gate.

### Phase 1 — Catalog and V2 report integrity

Deliverables:

- Canonical JSON catalog and shared runtime-neutral TypeScript contracts consumed directly by the pinned Node scanner and Meteor.
- Active and append-only historical catalog/evidence-contract registries.
- `SecurityAuditReportV2` with independent schema and catalog versioning.
- Workstation-integrated build identity, bounded host/release image mapping and receiver comparison, including recordable missing-proof `ERROR` with unchanged application operation. Phase 1 needs the image identity/receipt subset; Phase 3 adds registry/source-verification proof, not a second release mechanism.
- Producer artifact contract and validation.
- Versioned host observation envelope, Node internal evaluator, and composite-control evaluator.
- Exact assembly and server validation.
- V2-only new ingestion endpoint.
- Summary projections, supporting indexes, and read-time integrity validation.
- Retire old-format report access at cutover without adding a historical reader/archive or deleting existing records.
- Temporary update of `security-surface-contract.json` from the V1 ingestion route to the V2 route so existing surface checks remain truthful until Phase 3 deletes the manifest.
- Deletion of duplicated control tables and V1 new-ingestion route.
- Split catalog, assembly, ingestion, storage, and presentation tests.
- Focused staging2 ingestion harness, existing-record exclusion/rollback cases using synthetic records where needed, and non-production Linux forced-command qualification.
- Exact host-script install/rollback procedure with reviewed file hash and previous installed version.
- Previous-production-image qualification against a database containing V2 records, including list, latest, and download behavior.
- Updated operator documentation.

Exit gates:

- Missing/malformed/duplicate/unknown producer-artifact cases become complete catalog-shaped `ERROR` results for that producer-owned subset without silent drops.
- Any missing, duplicate, unknown, wrong-section, wrong-profile, metadata, catalog, or digest mutation of an assembled V2 report is rejected by ingestion.
- The pinned Node scanner and supported Meteor runtime load the shared contract and match the fixed catalog digest.
- Exposure and full reports contain their exact profiles.
- Stored and downloaded report/catalog digests match.
- V1 new ingestion and old-format access are unavailable after cutover; existing records are not rewritten/deleted and rollback remains safe.
- The exact host observation producer passes non-production forced-command qualification and its production install/rollback hashes are recorded.
- The chosen storage model has passed the previous-image rollback qualification.
- Local checks, authorized CI, staging, and production cutover gates pass.
- Existing source build, startup, health, login and learner behavior remain unchanged when audit identity/proof is absent; normal build/deploy commands retain their established options and defaults.

Phase 1 may deploy independently. It proves report completeness and evidence shape, not that the current surface checker or authorization probes classify reality correctly. Phase 0 should freeze evidence shapes broad enough for the planned Phase 2/3 observations. If either later phase changes a control's claimed property, profile membership, or evidence-contract shape, it requires a new catalog/evidence-contract version and another coordinated receiver/workflow cutover; a scanner-only deploy is allowed only when those contracts remain unchanged. Admin and operator language must preserve these distinctions until phases 2 and 3 finish.

### Phase 2 — Authorization evidence

Deliverables:

- Source-controlled authorization entries in the verification catalog with explicit outcomes and baselines.
- Versioned exact protected fixture-binding contract containing values only.
- Decomposed transport, scenario, and evaluator modules.
- Positive baselines paired with denials.
- Exact policy-denial categories.
- Scoped publication canaries and store isolation.
- Token-mint/fetch/content/replay download scenarios.
- Correct reset/session preconditions and an unused aged-token expiration scenario.
- Environment lock, unique run namespace, idempotent cleanup, and interrupted-run recovery for every stateful scenario.
- Positive lower and upper session-lifetime bounds.
- Exact coverage of the Phase 2 authorization controls, linked to stable surface IDs without claiming whole-runtime completeness.
- Behavioral tests for every outcome class.
- Minimal child-process environment exposure.

Exit gates:

- No domain error, timeout, missing route, 404, unreadable store, or missing canary can pass a denial probe.
- Every required actor/surface/resource case has one validated scenario binding.
- The staging-only synthetic tenant, mailbox, and provider bindings complete every Phase 2 authorization scenario and produce a catalog-complete authentication artifact without fixture execution errors.
- One staged authentication-section qualification and one explicitly authorized manual full production audit validate the new runner; the staged section is not mislabeled as a complete four-section report.

### Phase 3 — Runtime-coupled surface registry

Deliverables:

- Typed policy descriptors and behavior-preserving registration adapters with explicit equivalence tests.
- HTTP, publication, and method migration.
- Removal of superseded handler-local guards, with any retained defense-in-depth check explicitly owned and equivalence-tested.
- Explicit SAML/protocol, raw/normal/handlers-stack, synchronous collection-rule and framework/package-owned bindings.
- Data-egress facets instead of a duplicate export inventory.
- Presentation-policy references separated from server authorization.
- Deterministic registry inventory and digest.
- Deterministic environment-profile registry projection, final composition completion/seal tests, explicit test proof and exact workstation-image runtime qualification.
- Bounded deployed-registry inventory method and source-revision/digest comparison.
- Exact closure between descriptor-required verification, the verification catalog, embedded source-proof bundle, external exact-image receipt/environment-run evidence, and protected bindings.
- A workstation-composed `VerificationBundleV1` using supported executed source evidence, carried in the image; post-build receipt and environment-run manifests joined to distinct scanner/application/image identities and registry digest.
- Static bypass detection covering active TypeScript and JavaScript roots.
- Deletion of `security-surface-contract.json` and the inference-based policy checker.

Exit gates:

- No application-owned security registration bypasses its adapter/binding, and all framework-owned surfaces resolve to an explicit verified owner without duplicate registration.
- No migrated surface has a second independently maintained authorization rule.
- Unintended duplicates, unresolved, late and unclassified registrations fail coverage qualification/tests. Deployed incomplete coverage is observable `ERROR`, not a new application startup/access lockout.
- Before/after characterization proves allow/deny, invocation context, synchronous collection rules, publication readiness/lifecycle, middleware order/fallthrough and enabled login/provider behavior are preserved.
- Every protected surface has documented policy review and required verification scenarios; Phil reviews the consolidated ambiguous/proposed-change list, while clear behavior-preserving mappings follow Section 0.
- The remote runner proves it is testing the sealed registry from the deployed application revision rather than source checkout alone.
- Full app typecheck, lint, authorized Meteor CI, staging, and a manual full production audit pass without registry or fixture `ERROR` results.

### Phase 4 — Closure and organization

Deliverables:

- Remove obsolete modules, compatibility scaffolding, temporary migration fixtures, and source-regex correctness assertions.
- Complete the target folder structure without re-export facades.
- Add `mofacts/scripts/security-audit/README.md` containing the data flow, module ownership, local commands, and extension checklists.
- Update `docs/deployment/security-audit.md` only for actual operational changes.
- Close `docs-developer/security-audit-durable-redesign-status.md` with final evidence; keep progress there rather than rewriting this normative plan into a diary.
- Record any deferred findings with owner, priority, and acceptance condition.

Exit gate: a new maintainer can locate the catalog, add a test-only example control, identify the owning producer, run the documented checks, and explain the receiver/producer cutover without searching for another source of truth.

## 13. Verification Matrix

| Changed boundary | Required evidence |
| --- | --- |
| Catalog registry | Valid active and historical catalogs; duplicate/unknown/reference/version mutation tests; fixed golden digests; append-only immutability tests; shared-contract execution in pinned Node and Meteor |
| Evidence contracts | Every catalog reference resolves; PASS/FAIL/ERROR proof-shape tests; included-control `NOT_APPLICABLE` rejection; append-only historical validators; redaction/bounds |
| Build identity | Exact source/build-context binding; qualified workstation metadata; typed missing/conflicting observations; OCI platform/config mapping; receiver contradictory-claim rejection; recordable `ERROR` and unchanged operation without proof |
| Release qualification | Same tested local image pushed; resolved registry/platform/config mapping and source bundle digest; protected post-build receipt; no image mutation after testing; existing script flags/defaults and source-build path preserved |
| Producer | PASS, FAIL, ERROR, missing, malformed, duplicate, unknown, and wrong-section tests where applicable |
| Host/composite evidence | Observation-envelope version/shape tests; non-production forced command; missing/conflicting cross-source inputs become `ERROR`; exact installed hashes |
| Assembler | Exact exposure/full profiles; no silent drops; derived metadata/counts/status; deterministic report digest |
| Authorization evaluator | Every expected/observed decision-table pair; positive baselines; redaction/bounds |
| Verification catalog and fixture bindings | Unique source-owned entries/outcomes/proof contracts; exact required aliases and values; no unused credential blocks; complete Phase 2 authorization coverage; no diagnostic secrets |
| Surface registry | Unintended duplicate ownership versus valid middleware overlap; actual final composition completion; missing/late coverage; framework bindings; all owned raw APIs; inventory revision/digest; exact scenario closure; incomplete proof cannot change startup/health/access |
| Authorization compatibility | Before/after actor/resource/error/side-effect equality; Meteor `this`/arguments/connection/IP/unblock; synchronous collection rules; publication ready/throw/reactivity; HTTP stack/prefix/order/fallthrough; framework/provider login paths |
| Signed ingestion | Valid HMAC V2 acceptance; stale/bad HMAC; report-duration/completion/upload bounds; nonce/report/digest replay; catalog/report mutations rejected |
| Storage | Unique and TTL indexes; active-catalog query indexes; corrupt-record behavior; bounded projections; previous-image behavior with stored V2 records |
| Presentation/download | Admin authorization; V1 excluded from current/old-format access; V2 current selection; exact new-report JSON/HTML bytes and digests; no evidence in summaries; no historical-access/archive feature |
| Workflow | Minimal secret scope; exact expected producer artifacts; storage before execution assertion; encrypted artifact retained; active scanner isolation; actual checkout SHA distinct from workflow event SHA when pinned |
| Staging contract | Immutable image digest/revision; HTTPS target/HMAC; existing-record exclusion and safe rollback; valid synthetic-`ERROR` V2 uploads; rejection tests; Mongo/admin/download/artifact agreement |
| Staging authentication/runtime | Staging-only accounts/mailbox/providers; real allow/deny probes; sealed deployed registry comparison; no production data/secrets |
| Production | Exact receiver/workflow/host revisions, one exposure and one full report, matching application/artifact digests, zero pipeline `ERROR` |

Required local commands from `mofacts/` after implementation changes:

```powershell
npm run security:surfaces
npm run security:test:source
npm run typecheck
npm run lint
```

The security test command should be updated to execute the decomposed behavioral suites through one stable entry point. Do not substitute narrow per-file TypeScript checks for the full app typecheck.

Meteor integration requires the supported CI environment. Every invocation of `npm run test:ci` requires fresh, explicit, single-use authorization, including retries. Commit/push, Docker build/push, workflow dispatch or disable/enable, protected-host installation, production deployment and production audit runs retain their concrete authorization requirements. Apply the explicit staging2 offline/reset/rebuild permission in Section 0 for this security work; it does not authorize original staging/production, irreversible deletion, new persistent access/security-sensitive permissions, new spending or bypassing verification gates.

Documentation-only changes require at least:

```powershell
git diff --check
```

and manual link/path review.

## 14. Staging and Non-Production Qualification

Local testing can prove catalog mechanics, assembly, pure evaluation, signed-parser behavior, storage helpers, and presentation logic. It cannot establish the supported upload path end to end because the canonical local server uses `http://localhost:3200`, while the uploader and report contract require HTTPS and ingestion binds the report target origin to `ROOT_URL`.

Do not weaken HTTPS/origin validation or create a second local application path for convenience.

Original staging remains frozen. Under Section 0, decision 5, staging2 is the default isolated qualification environment with synthetic accounts/resources and may be taken offline, reset and rebuilt as needed for this security work. Keep report-contract, Linux host and authentication/runtime lanes distinct. Validate actual HTTPS origin, host/fixture suitability and exact candidate identity; a selected environment does not prove any lane passed. New environments, paid services, expanded persistent access, security-sensitive permission changes and irreversible data deletion remain separately scoped/authorized. Never substitute production for missing non-production evidence or copy production data/credentials.

### 14.1 Report-contract harness

Add a protected, manual-only staging report-contract harness rather than copying the full production scanner. It uses:

- A staging-only GitHub environment and HMAC secret.
- A fixed allowlisted staging HTTPS target.
- The exact workstation-built/pushed candidate, identified by its resolved immutable platform digest and matching config/source evidence. Existing tag-based tooling may select it, but qualification verifies the actual digest; staging never rebuilds or relies on a mutable tag alone.
- Synthetic existing-record cases needed to prove exclusion and safe application rollback; no V1 historical-access harness or report archive is required.
- Synthetic catalog-generated exposure and full sections whose controls are explicitly `ERROR` with bounded `synthetic-contract-qualification` evidence; they must never claim security `PASS`.
- The production assembler, uploader, encryption, and artifact code.
- No production SSH key, Tailscale credential, mailbox, user fixture, or learner data.
- Valid signed V2 uploads and signed negative mutations.
- Unique report IDs/nonces for every run.

Contract acceptance requires:

1. The selected tag or digest resolves to the exact reviewed candidate: verify the running platform/config mapping, OCI base-revision label and any dirty-source snapshot binding against the qualification record. Existing tag-based deployment remains supported.
2. Valid catalog-complete `ERROR` exposure and full reports return HTTP 201 and appear in staging admin history as qualification failures, not green security evidence.
3. Missing, duplicate, unexpected, wrong-section, wrong-profile, wrong-catalog, and replay submissions are rejected.
4. Stored report, JSON/HTML download, and decrypted artifact digests agree.
5. No raw evidence or secrets appear in workflow/application logs.
6. New V1 ingestion and old-format access are rejected; existing records are excluded from current selection and retained without rewriting/deletion; the selected storage supports the proven application rollback.

This lane is report-contract qualification only. It does not claim that staging reproduces production network exposure, host state, authentication fixtures, or provider configuration.

### 14.2 Host forced-command qualification

Before the Phase 1 production cutover, install the exact reviewed host script on a protected non-production Linux host or disposable equivalent environment. Verify root ownership/mode, protected configuration parsing, forced-command rejection, observation-envelope version and bounds, missing-tool/error behavior, and the external Node evaluator. Record the candidate and previous installed script hashes. Do not use production credentials, database contents, or learner data.

### 14.3 Authentication and runtime-surface qualification

Phase 2 adds a separate protected staging authentication environment with staging-only synthetic users, tenant/resources, mailbox, provider bindings, credentials, and fixture-binding document. It supplies an environment-scoped run lock and documented synthetic-fixture reset procedure, and it runs the real allow/deny transports against the staging HTTPS application; synthetic section submission cannot substitute for it. Paths that cannot safely run remotely require the named integration or protocol qualification declared by their surface.

Phase 3 extends this lane by fetching the sealed deployed surface inventory and proving its application identity, registry/bundle digests, policies, and required verification IDs close against the catalog, external release receipt, environment-run evidence, fixture bindings and independent host image mapping. Include ordinary login/learner behavior, all enabled authentication providers, middleware fallthrough and operation without qualification metadata in compatibility tests. A staging qualification describes only staging behavior and is never evidence about production exposure or production data.

## 15. Production Cutover and Rollback

### 15.1 Deployability while work proceeds

During development, production remains on the last reviewed implementation. Unrelated deployments can continue through the existing workstation script from reviewed source that excludes incomplete redesign wiring. Do not change its normal tag/flag/default behavior or add automated release locks. For a redesign candidate to be accepted, bind its actual build inputs to reviewed source and qualify the exact image; an incomplete item-3 working tree cannot be represented as a completed phase.

Application-image isolation alone is insufficient: `.github/workflows/production-security-audit.yml` currently has scheduled triggers and no checkout `ref`, so active scanner changes on `main` may execute immediately against the older receiver. Before active producer edits, choose and record one explicit strategy:

- Keep active V1 orchestration/producers and all their imported contracts unchanged while developing inert, uninvoked V2 modules; replace the active path atomically at the coordinated cutover. This is development isolation, not simultaneous V1/V2 ingestion or a runtime recovery path. Remove superseded active code at cutover.
- If work must touch active imported modules before cutover, the Section 0 conditional immutable scanner-release design is already approved. Implement a reviewed immutable checkout in the existing workflow with tested selection/update/rollback tooling; do not assume `workflow_dispatch` ref alone controls later scheduled runs. Trace current configuration ownership before adding a setting, and retain separate publication/activation/workflow-action permissions.

The first strategy requires no new workflow setting and is preferred when feasible. Neither strategy requires an automatic branch switch, a new deployment system, weeks of disabled audits, or dual-schema ingestion. Publication/activation and any workflow-state change still need authorization. Record the actual scanner checkout commit in the report; the workflow definition/event revision is not a substitute when checkout is pinned.

Each P0 phase deploys only after the phase is complete:

- Item 3 deploys first through a coordinated receiver/workflow/host-producer cutover.
- Item 2 may deploy as scanner/workflow and protected-fixture changes only if catalog membership, claimed properties, and evidence-contract shapes remain stable; otherwise it repeats the coordinated catalog/receiver cutover.
- Item 1 changes runtime registration and requires an application image deployment.

Do not combine all three solely to reduce deployment count. That would enlarge the review and rollback domain and leave known false-green behavior in place longer.

### 15.2 No-fallback V2 cutover

The current production workflow reads default-branch source independently from the deployed application image unless the explicit scanner-release selection in Section 15.1 has been implemented and verified. A V2 producer and V1 receiver, or a V1 producer and V2-only receiver, will fail ingestion. Use a short authorized mismatch window after existing runs have completed, away from the next configured trigger. The checked-in schedules currently use 06:00 UTC; verify actual workflow/run state at cutover rather than treating a timestamp as proof that no job is active. Disabling the workflow affects manual and scheduled runs together.

1. Apply Section 0's settled receipt/history, staging2, scanner-isolation and storage decisions; finish the helper interface, exact-source proof and remaining technical verification. Secret recovery design/owner are selected; complete the AWS setup/account-recovery/size-fit and two-version restore gates in Section 7.2 before claiming operational recovery. Obtain the concrete permissions still required for publication/CI, workstation build/push, protected-host install, workflow state/dispatch and production actions. Do not re-request the bounded staging2 offline/reset/rebuild permission already granted; retain all explicit per-run integration and other excluded-action requirements.
2. Review the complete candidate and rollback unit (receiver, scanner, catalog, host script and applicable receipt). Run required source checks; publish source only with the active scanner preserved by Section 15.1, or disable the production audit workflow before publishing any incompatible active change. Confirm no run is active/queued before a mismatch. Obtain fresh authorization for `npm run test:ci` before a publication that triggers it.
3. Verify supported source outcomes for the exact candidate inputs, preserving base-commit/dirty-snapshot distinctions. Through the confirmed workstation procedure, build once, qualify that exact image and push it using Section 7.2's interface. CI does not supply a substitute image. Bind proof to the existing release-record identity and its qualification extension.
4. Deploy that same image through existing tooling to staging; pass the applicable report, host, authorization and runtime qualification lanes and previous-image storage rollback tests. Do not rebuild after qualification. If the source/image changes, repeat the affected gates.
5. Before production mutation, record and confirm pullability of the previous image's immutable identity, active scanner/workflow selection, installed host-script hash, applicable receipt, workflow enabled state, and required private binding rollback availability. A stored mutable tag alone is not rollback proof.
6. Disable the production audit workflow if it was not already disabled; confirm no active/queued runs. Verify the candidate's resolved image identity and intended HMAC alignment without exposing configuration values.
7. Install the qualified host producer and approved receipt-carriage tooling/data, verify hashes and retain the previous versions. Activate the reviewed scanner selection/code while dispatch remains disabled.
8. Use the command sheet's established SSH/Compose route, preserving base+overlay, `--no-build --wait`, tag/revision checks and Apache/CSP verification. Tag selection and dirty builds remain supported, but acceptance must establish the actual running platform/config/source-snapshot mapping equals the qualified candidate. Do not substitute the generic running-state helper or assume automatic app-image rollback exists. Keep the existing release-record write coherent with deployment validation and the separate truthful qualification result.
9. Validate ordinary health, readiness where explicitly selected, login/logout and enabled providers, learner practice, admin route, logs, application/image identity, new-report access and safe existing-record exclusion/rollback; no V1 historical-access feature is required.
10. Re-enable the workflow and immediately dispatch `exposure` using the reviewed scanner selection. Check the actual checkout revision, catalog and receiver contract, not only the dispatch event's `GITHUB_SHA`.
11. Verify HTTP 201 ingestion, exact catalog/report coordinates, current-card selection, downloads and encrypted artifact.
12. Dispatch `full` from the same reviewed scanner selection and repeat the identity/evidence checks.
13. Decrypt one artifact in an approved off-server environment and compare catalog/report digests with the application copy; do not retain plaintext in the repository or logs.
14. Confirm zero pipeline/execution `ERROR` for cutover acceptance and verify the next configured scheduled run uses the approved scanner selection. Re-enabling restored both trigger types; there is no separate schedule-resume operation.

A security `FAIL` does not mean the observation-only pipeline malfunctioned. It is a finding that must be assigned and triaged. Any pipeline `ERROR` blocks acceptance of this redesign cutover because authoritative evidence is missing; it does not by itself stop the running app or authorize a new deploy-script blocker.

### 15.3 Rollback

Receiver, workflow producer, catalog, and installed host producer roll back as one unit. Never leave the V2 producer targeting a V1 receiver, restore a V1 workflow while only V2 ingestion is active, or leave the V2 host observation contract paired with the V1 evaluator.

Restore the applicable retained release-record qualification projection and scanner selection with that unit. Pre-bundle images retain their original operational behavior; bundle absence is not a newly introduced startup failure. These are operator procedures under deployment authorization: the current command sheet has Apache config rollback, not an app-image rollback routine, and it does not call `server-deploy-validate.sh`. Any new automatic app rollback is separately scoped.

| Failure point | Required response |
| --- | --- |
| Before application deployment | Restore the prior installed host script and workflow state; no report data action |
| Candidate container fails running or health validation | Disable dispatch, explicitly redeploy the recorded previous immutable image through the existing Compose route, restore prior host script/scanner selection/receipt, and verify identities/readiness; do not assume app rollback is automatic |
| Readiness fails after startup | Disable dispatch, manually redeploy the previous image, restore the prior host script/workflow revision, and re-run readiness |
| V2 upload is rejected before storage | Disable dispatch, retain the encrypted diagnostic artifact, and roll back receiver/workflow/host together |
| V2 report stores but pipeline assertions fail | Preserve the immutable report, keep the workflow disabled, correct the owning boundary, and rerun |
| Application fault after a valid V2 record stores | Disable dispatch and roll back application/workflow/host together; retain the V2 record and rely only on the storage model already proven against the previous image |
| Secret mismatch or compromise | Freeze dispatch, rotate environment-specific keys under separate authorization, redeploy configuration, and rerun both report types |

Do not delete or rewrite reports to simplify rollback. Any production record removal or secret rotation is a separately authorized operation.

### 15.4 Phase 2 and Phase 3 cutovers

Later phases use the same exact-revision, authorized-CI, staging-first discipline:

- **Phase 2:** if the protected fixture schema or values change, obtain applicable operational permissions and disable the production audit workflow. Verify the selected AWS Secrets Manager source contains complete current/candidate documents, their non-secret versions/digests, and a last accepted rollback version pinned by the dedicated retained label; moving `AWSPREVIOUS` alone is insufficient. Confirm account/MFA recovery and staging2-tested restoration of current and retained rollback versions. Publish and pass CI on the exact runner revision, apply the matching candidate as the GitHub environment-secret deployment copy, deploy any required server fixture support, then re-enable and run one authorized manual `full` audit from that revision. Phil remains accountable for recovery. Roll back runner, full binding document and any server support as one unit. If the report/evidence contract changed, repeat the Phase 1 catalog/receiver cutover. No new runtime integration, static credential or automatic rotation is implied.
- **Phase 3:** retain active-scanner isolation while preparing/publishing the exact registry/runner revision, passing supported source CI, and using the workstation build-once qualification/push path. Keep dispatch disabled only during the incompatible activation window. Deploy the fully migrated image through the existing script; re-enable to fetch the sealed inventory/bundle and join it to the release receipt, actual scanner checkout, host image mapping and environment evidence in the manual `full` report. Rollback restores the previous matched image/runner/host/receipt contract, including a pre-bundle Phase 2 image when applicable. There is no bundle-based startup enforcement to add or remove. Never mix partial registration wiring or proof from another image.

Neither phase may rely on a production run to discover basic fixture, import, registry, or contract incompatibility; those belong in the non-production lanes first.

## 16. Future-Maintainer Checklists

### Adding or changing a control

1. Search the catalog and adjacent checks to prove the concept is not already represented.
2. Identify the security requirement, threat, report section, producer owner, and bounded evidence needed.
3. Define or reuse one versioned evidence contract with status-specific proof requirements.
4. Add the metadata once to a new immutable catalog version and register it as active only for the coordinated cutover.
5. Add the control ID to the exact applicable profiles.
6. Implement acquisition separately from pure evaluation.
7. Emit only the ID, status, and bounded evidence.
8. Add PASS, FAIL, ERROR, missing/malformed, redaction, and applicability tests.
9. Prove the producer emits exactly one result when applicable.
10. Prove assembly/server reject the previous catalog for new ingestion after cutover while historical reads still validate it.
11. Coordinate receiver, workflow, and any host producer rollout for the new catalog.
12. Retain every released catalog/evidence validator indefinitely as append-only source so exported artifacts remain verifiable.
13. Update operator documentation only if setup, interpretation, or response procedure changed.

Changing only implementation behind an unchanged semantic control does not require a new ID. Any catalog metadata, applicability, evidence-contract, or severity change requires a catalog version bump. A material change to what security property the control claims always requires a new control ID; IDs are never reused for a new meaning.

### Adding a runtime security surface

1. Use the app-owned adapter/binding for that surface kind; for a framework-owned surface bind its actual package/service owner without registering it a second time.
2. Assign one stable surface ID and exact environment.
3. Select a precise policy; do not use an ambiguous generic role label.
4. Preserve the characterized lifecycle and invocation semantics in the executable descriptor, synchronous collection binding, or verified framework declaration as appropriate; new access policy needs separate approval.
5. Mark data egress as a descriptor facet.
6. Declare a nonempty verification union; protected policies include required allow/deny actor and resource scenarios.
7. Add source-owned scenario intent first, then only concrete environment values to the protected fixture bindings.
8. Add duplicate, bypass, policy, and behavioral tests.
9. Prove the sealed deployed inventory, embedded source-proof bundle, release-record qualification projection, verification catalog, environment-run evidence, and bindings close exactly, preserving base-commit versus dirty-snapshot identity.
10. Run surface, source-security, typecheck, lint, and authorized integration checks.
11. Review the deterministic registry diff before deployment.

### Adding an authorization scenario

1. Reference an existing surface and explicit expected policy outcome.
2. Give the scenario a stable non-sensitive ID independent of credentials and raw arguments.
3. Provide an allowed positive baseline for a denied case.
4. Use resource/canary aliases resolved from protected fixture bindings; never put expected outcomes or route definitions in the fixture.
5. Define the exact observation that proves success or policy denial.
6. Treat every unrelated outcome as `ERROR`.
7. Add evaluator and transport tests before changing the protected fixture.
8. Run the staged authentication-section qualification before the production full audit.

## 17. Post-P0 Roadmap

Closing P0 makes reports structurally trustworthy; it does not make the scanner comprehensive. Maintain these as separately scoped follow-on priorities:

1. Scan the exact deployed immutable application image digest and every deployed supporting image; correlate each image digest/revision while keeping `scannerSourceRevision` and `deployedApplicationRevision` distinct.
2. Add finding identity, first/last seen, owner, disposition, remediation target, expiring risk acceptance, regression link, and alerting.
3. Add systematic first-party SAST and safe authenticated/unauthenticated DAST, followed by periodic manual threat-model and penetration review.
4. Add SBOM, KEV, EOL, provenance/signature, container-configuration, and IaC/CI analysis.
5. Correct external CSP/header/DNS multi-address semantics and effective firewall/proxy validation.
6. Add report-access audit events, request-resource controls, freshness alerting beyond the P0 ingest bounds, periodic whole-collection integrity scanning, and an explicit backup-retention policy.
7. Split independent workflow producers into least-privilege parallel jobs only after the catalog boundary is stable. Each job receives only its required secrets and returns a bounded producer artifact; final assembly remains the single report owner.

Parallelization is an efficiency improvement, not an excuse to duplicate catalog logic or broaden secret access.

## 18. Documentation, Compatibility, and Impact

- No TDF/config fields, content formats, learning histories, course assignments, or learner model state change in this plan.
- No TDF/content changes are expected in `C:\dev\mofacts_config`. Later implementation must update its private `deploy and build.txt` to invoke the shared qualification interface and extend the existing release record coherently; this documentation revision does not edit that file, the production overlay, or private environment/settings inputs.
- Preserve the command sheet's clean/dirty build paths, no-cache build, base/runtime-overlay distinction, post-push environment update, Compose wait, Apache/CSP checks, existing release-record fields and separate sidecar tasks. Receipt carriage/versioning and exact native-command result handling must be specified before implementing helper calls; a deploy-script refactor or new blocker requires separate approval.
- Keep generic self-hosted source builds and the native hotfix watcher supported. Missing qualification evidence is reported with existing `ERROR` semantics and never becomes a new startup, health, sign-in or learner restriction.
- Public build/deployment docs must describe the reusable qualification helper when implemented; do not make the private command sheet the sole way another maintainer can use it. Keep private operator paths/hosts/settings out of public command examples.
- `docs/deployment/security-audit.md` must be updated in the same implementation phase whenever endpoint version, catalog interpretation, staging/production setup, report history, or cutover procedure changes.
- The wiki needs review only if user/operator behavior changes beyond the concise public deployment documentation.
- No V1 historical UI/archive is required. Any approved new-report catalog metadata or other visible string must use the existing interface localization system and preserve keyboard operation, announcements, contrast and screen-reader labeling.
- Reports and logs remain sanitized and must never contain protected fixture values, learner data, credentials, nonces, HMACs, download tokens, raw scanner responses, or decrypted artifacts.
- Existing V1 data is never reinterpreted as V2 evidence.

## 19. Decision register and remaining implementation gates

Section 0 is the controlling 2026-11-02 decision register. Do not ask again for its settled choices. The architecture defaults below remain requirements for implementation and verification, not a list of new user questions. Secret recovery design and owner are selected, with setup and demonstrated recovery still pending; genuinely new scope/trust/ownership/cost/retention/behavior conflicts still require a recommendation and decision. Technical facts must be investigated and evidenced rather than presented as user preferences:

| Decision | Recommended choice |
| --- | --- |
| Canonical catalog format | Checked-in JSON metadata with one runtime-neutral TypeScript contract imported directly by pinned Node and Meteor |
| Production release owner (confirmed) | Workstation production app section of config repo `deploy and build.txt`; retain build/push/SSH-Compose route, dirty builds and existing checks; CI is evidence only |
| Qualification integration | Repository-owned helper invoked at the inspected pre-build, post-build/pre-push, post-push and post-start boundaries; no replacement deploy route or default gate |
| Release record (approved design) | Existing workstation authority plus bounded server projection through the existing restricted channel; retain all small accepted metadata records without automatic deletion and the previous usable rollback image/evidence; validate implementation/access contracts |
| Source/image identity | Preserve base commit and dirty flag; qualify actual snapshot and local config ID, then resolve published index/platform/config mapping and compare running identity; do not ban dirty builds |
| Native command results | Shared qualification helper records the actual result of every operation it owns; broader pasteable-command failure/rollback redesign requires explicit scope, not assumptions about the operator's shell |
| Missing qualification | Structurally valid bounded error evidence remains recordable; no new app build/startup/health/login/deploy lockout |
| Runtime compatibility | Zero unapproved access/transport drift; synchronous collection and framework ownership explicit; final seal after all declared registration completion |
| Active scanner isolation | Active V1 unchanged where feasible; reviewed immutable scanner selection with tested update/rollback is an approved conditional design if required; operational activation permissions remain |
| Versioning and history | Separate immutable report-schema and catalog versions; one active ingestion catalog plus append-only read-only historical catalogs/evidence validators |
| Evidence proof shapes | One versioned runtime-neutral evidence-contract registry used at producer, assembly, and ingestion boundaries |
| Public inconclusive status | Do not add one; map internal inconclusive evidence to `ERROR` |
| Unscheduled sections | Empty control set with section `NOT_APPLICABLE`, as required by the profile |
| Severity | Fixed catalog-owned failure severity |
| New-report ingestion | V2 only after cutover; no dual-ingestion compatibility path |
| V1 history | Later 2026-11-02 answer removes historical UI/download/archive work; retire old-format access at cutover without deleting/rewriting existing records |
| Storage | Choose simplest new-report storage with evidence-backed safe application rollback; schema-discriminated collection if safe, version separation if needed; no historical-access feature or destructive migration implied |
| Item 1/2 IDs | Preserve stable top-level IDs unless the claimed security property changes |
| Verification intent | Source-controlled verification catalog owns outcomes, proof requirements, and baselines; protected fixture owns only environment values |
| Protected fixture storage | AWS Secrets Manager selected; Phil accountable; complete current and dedicated-labeled last accepted rollback versions; GitHub deployment copies only; verify account/MFA recovery, size and staging2 restores; provisioning/access/upload/spending approvals pending (Section 7.2 [recovery design](#aws-secrets-manager-recovery-design-approved-2026-11-02)) |
| Staging | Use staging2 with synthetic fixtures; offline/reset/rebuild permitted for this security work within Section 0; original staging/production and excluded operations remain outside that permission |
| Host migration | Mandatory observation-contract qualification, exact install hash, and paired rollback in Phase 1 |
| Implementation status | Separate companion status/evidence document created in Phase 0 and maintained throughout |

Execution permission is distinct from settled design: apply Section 0's bounded standing staging2 permission, but keep fresh explicit single-use authorization for each `npm run test:ci` and retain the applicable commit/push, workflow dispatch/state, production build/push/deploy, protected-host installation and other excluded-action approvals. This documentation update executes/authorizes none of them and does not waive failed checks. Routine engineering within the approved boundaries proceeds without another design question.

## 20. Definition of Complete

The durable P0 redesign is complete only when:

- One catalog registry owns the active and retained historical control metadata and report profiles.
- Every catalog evidence-contract reference resolves to one retained, status-aware proof validator.
- No duplicated control table remains in producers, assembly, server code, workflow, or host metadata.
- Exact membership is enforced independently at producer, assembly, and ingestion boundaries.
- Every known authorization false-pass case has a behavioral regression test and correct `FAIL`/`ERROR` result.
- Every app-owned security surface uses a typed behavior-preserving descriptor/binding; framework-owned surfaces have verified owner declarations; every surface has nonempty reviewed verification.
- The sealed deployed registry, embedded source-proof bundle and release-record qualification projection close exactly against actual scanner checkout, base/dirty-source identity, platform/config mapping, verification catalog, environment-run evidence and protected bindings.
- Existing workstation clean/dirty build/push/Compose deployment, self-hosted source builds, native watcher and ordinary authorization/functionality are preserved; no audit metadata creates an unapproved startup/access/deploy lockout.
- The manual JSON surface contract and inference-based access checker are deleted.
- V1 new ingestion and old-format access are gone; no historical reader/archive is required; existing records remain untouched and the chosen storage has evidence-backed safe application rollback.
- Local checks, authorized full CI, all three non-production qualification lanes, and production exposure/full verification have passed.
- Receiver, workflow, catalog, and host producer have an evidence-backed paired rollback path.
- Stored, downloaded, and encrypted-artifact digests agree.
- No pipeline `ERROR` remains at closeout.
- Operator docs and code-local maintainer guidance match the implemented system.
- A completion report distinguishes source implementation, local checks, CI, staging, production, and any remaining security findings.

## 21. Current Source Reference Map

| Current path | Current responsibility | Planned treatment |
| --- | --- | --- |
| `mofacts/common/securityAuditReport.ts` | V1 types, parsing, canonicalization, counts, sanitization | Split into catalog-aware common contract modules; no V1 historical reader/archive; preserve existing records and safe rollback |
| `mofacts/scripts/security-audit/audit-lib.mjs` | Control construction, sanitization, canonicalization, commands | Split pure report behavior from command acquisition; remove duplicated contract definitions |
| `mofacts/scripts/security-audit/assemble-report.mjs` | Hand-maintained control inventory and report assembly | Replace with catalog-driven exact assembly |
| `mofacts/scripts/security-audit/production-auth-audit.mjs` | Authentication acquisition, evaluation, and orchestration | Decompose by transport and scenario; leave a thin coordinator |
| `mofacts/scripts/security-audit/authentication-probes.mjs` | Probe IDs and selected result helpers | Replace with explicit scenario schema and outcome evaluator |
| `mofacts/scripts/security-audit/check-security-surfaces.mjs` | Syntactic discovery and manual manifest comparison | Reduce to raw-registration bypass detection, then rename for that purpose |
| `mofacts/security-surface-contract.json` | Manual surface/access inventory | Update the ingestion route during Phase 1, then delete after runtime descriptor migration |
| `mofacts/server/securityAudit/` | Ingestion helpers, storage, presentation, tokens | Retain ownership; consume catalog-aware common contracts and add read-time validation/projections |
| `mofacts/server/http/securityAudits.ts` | V1 signed ingestion and download routes | Cut over to V2 ingestion; preserve hardened download behavior |
| `mofacts/server/methods/securityAuditMethods.ts` | Admin list/get/download-token methods | Add projections, schema-aware current/history selection, and bounded inputs |
| `mofacts/client/views/adminSecurityAudits*` | Admin summaries/history/download UI | Keep bounded new-report summaries/downloads; exclude V1 without building historical UI/archive; localize any approved catalog context |
| `deploy/security-audit/` | Restricted host evidence acquisition | Keep acquisition-only role and add an explicit observation-contract version |
| Config repo `deploy and build.txt`, production app section | Actual workstation build/push, SSH/Compose wait, runtime/CSP validation and existing release-record write | Preserve sequence, clean/dirty source paths and fields; call shared qualification helpers at the inspected boundaries in a separately authorized implementation |
| Config repo `docker-compose.production-change-streams.yml` | Hosted runtime overlay used by command-sheet preflight/deployment | Preserve runtime-only ownership; no change to topology, proxy settings or image-build selection |
| `deploy/docker-compose.yml` and `Dockerfile` | Existing image build, source revision arg/label and runtime service contract | Reuse naming/revision contract; add optional proof carriage without requiring it for source builds/startup |
| `deploy/` qualification helper (planned) | No implementation yet | Shared interface for existing command sheet and documented self-hosted use; no duplicate deploy/push/rollback owner |
| `.github/workflows/ci.yml` | Source tests and separate unpublished runner-local smoke image | Export bounded executed source proof when implemented; never relabel it as exact workstation-image proof |
| `.github/workflows/production-security-audit.yml` | Scheduled/manual orchestration | Keep orchestration-only role; minimize secret scope and coordinate catalog cutovers |
| `docs/deployment/security-audit.md` | Operator source of truth | Update only when implementation changes operations |
