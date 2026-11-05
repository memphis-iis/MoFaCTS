# Security Audit Phase 0 Contracts and Characterization

Status reconciled 2026-11-05: the contract/characterization foundation, protected
source/Compose CI, staging2 source/image/evidence joining, protected receipt and
metadata history, browser/restricted-host acceptance and two-version AWS storage
recovery have executed results. The release remains explicitly unqualified for
complete audit coverage. Use the [current checklist](security-audit-durable-redesign-status.md#reconciled-phase-0-checklist-2026-11-05)
for completed boundaries and specific unverified/future gates; architecture and
permissions remain in the [plan](security-audit-durable-redesign-plan.md).

Dated prototype statements below record earlier development stages. Statements
that capture, image comparison, shared Node/Meteor imports, staging2 installation
or evidence joining have never run are superseded by the current checklist.
Do not turn them back into implementation tasks.

## Controlling decisions and worker entry point (2026-11-02)

Before any work, read and follow repository [AGENTS.md](../AGENTS.md) and applicable deeper AGENTS.md instructions, then the plan's [controlling decision register](security-audit-durable-redesign-plan.md#0-controlling-decisions-and-worker-entry-point-2026-11-02) and the status [current execution entry point](security-audit-durable-redesign-status.md#reconciled-phase-0-checklist-2026-11-05). Those later explicit user decisions supersede older pending-design recommendations below, without turning prototype contracts or local tests into executed release proof.

Workstation release authority, restricted credential-free host projection, all-small-metadata retention with no automatic deletion, previous usable rollback image/evidence, staging2 offline/reset/rebuild permission for this security work, conditional scanner pinning, Phil's consolidated ambiguous/proposed-policy review and bounded routine engineering discretion are settled. No old-format historical-report UI/download/archive work is required; choose simplest new-report storage with proven safe application rollback and do not delete/rewrite existing records. Release metadata/rollback evidence is distinct from report history.

Secret recovery design/owner remain AWS Secrets Manager/Phil, with AWS confined
to the optional tool. Account/MFA readiness, transfer/size fit and isolated
fresh-runner two-version recovery are recorded as completed, alongside the
separate accepted staging2 access test. The source remains an unqualified
operational baseline; provider validity and changed-configuration rollback are
not inferred. The additional staging2 AWS-backup proposal was withdrawn. Follow
the current checklist rather than earlier pending-setup wording. The current
Meteor allowance has eight conditional invocations left; none is used by this
documentation reconciliation. Existing production/original-staging, irreversible
deletion, new-access and spending exclusions remain in force.

## 1. What is implemented

The shared contract modules have no filesystem, network, environment, database, registration or deployment side effects. No production application entry point imports them. The separate opt-in capture helper owns filesystem/Docker operations only when explicitly invoked. Synthetic tests and authorized real Docker checkpoint results are recorded separately in the status document. Schema names are **unreleased drafts** until Phase 1 review; no stored release/report data has been migrated.

| Owner | Contract |
| --- | --- |
| `mofacts/common/securityAudit/buildIdentity.ts` | `BuildIdentityV1`, strict parsing, and explicit observed/unavailable identity observations |
| `mofacts/common/securityAudit/releaseQualification.ts` | Existing six-field workstation release record with an optional versioned `qualification` extension; strict bounded proof parsing and pure identity-consistency evaluation |
| `mofacts/common/securityAudit/proofFields.ts` | Shared exact-key/scalar proof validation, with value-independent errors |
| `mofacts/common/securityAudit/fixtures/release-record.fixture.json` | Synthetic clean-build example, shared by Node and Meteor server parity tests (executed in CI); not an actual deployment record |
| `mofacts/scripts/security-audit/tests/` | V1 membership fixture, current-defect witnesses, proof mutation tests and selected runtime behavior characterization |
| `mofacts/scripts/security-audit/qualification/` and `deploy/capture-build-source.ps1` | Implemented bounded source-acquisition prototype, local integrity/round-trip checks, explicit cleanup and context-only Compose build action; emits unqualified outcomes only |

`parseWorkstationReleaseRecord` retains `deployedAtUtc`, `baseCommit`, `includedUncommittedLocalChanges`, `image`, `tag` and `digest`. It also preserves the current `deploy production.txt` writer's paired `imageId` and fixed operator `acceptance` note; historical six-field records remain readable. A partial pair or unknown acceptance text is rejected, and a supplied `imageId` must agree with qualification's running config ID. The operator note cannot substitute for missing source/command/host proof. This is reader compatibility, not a persisted-record rewrite or production hook. In particular, the parser preserves the seven-digit fractional UTC timestamp produced by PowerShell; it does not silently rewrite it as a JavaScript timestamp. Existing records without `qualification` remain readable and unqualified. Searches of app/deploy/config sources found the command-sheet writer and no other source-owned readers; private/external readers still need confirmation before integration.

The optional `ReleaseQualificationV1` extension references the build identity, source-test snapshot, built/published/running image observations and named command outcomes. Its source-test result is a **summary of acquired evidence**, not a substitute for the future verification catalog, exact executed IDs or bundle authentication. The schema parser validates shapes; `evaluateReleaseIdentity` validates consistency. Neither proves that a caller told the truth or that security tests cover the whole system.

The evaluator returns `PASS` only for this narrow identity-consistency property. Missing, malformed, failed, unverified or mismatched proof returns a bounded `ERROR` reason. This is not a public new report/control or permission to deploy. No caller connects it to startup, health, login, an existing scanner control or the operator's command sheet.

## 2. Source snapshot binding

The dated October prototype narrative in this section is historical. Its
capture/protection/image-comparison implementation and Linux execution are now
recorded in the current checklist; a prototype's old "next gate" is not a new
request to repeat those completed operations.

October 13 continuation: image-side comparison is implemented but awaits Docker
execution. The single shared input stage owns recipe/ignore bytes; the source-only
export inherits it, while an observation stage copies and hashes those inputs
before compilation when an expected digest is requested. Compiler copies come
from that observed tree, and generated runtime metadata remains outside the
source hash. The already used pinned Node image provides the observer; no new
application/system dependency was added. Ordinary builds record missing comparison
without requiring a source proof. Optional Compose arguments and the capture
override carry the existing identity's digest and explicit dirty flag; all other
resolved inputs must remain unchanged. CI supplies its successful post-test
observation to the existing single image build, then reads back the embedded
identity. This is a byte-binding observation, not authenticated qualified evidence.
Stronger pre-test sealing, full evidence/catalog validation and final protected
Compose release/host checks remain pending. Earlier context-only override notes
describe the prior prototype; its narrowly scoped override now also sets these
two provenance arguments. Fresh capture is required after the recipe change.

`baseCommit` keeps its current meaning: HEAD at build time, including when local changes are included. The existing dirty flag is preserved, not inferred from the tag. `sourceSnapshotDigestSha256` identifies the actual reviewed source inputs; a successful clean-base CI run is not evidence for a different dirty snapshot.

The future capture contract is:

1. Capture the exact build-relevant source inputs before generating proof metadata. Include the root Dockerfile, effective ignore rules, dependency/toolchain manifests and every source/script copied into the image. Preserve actual bytes, including line endings and executable mode. Do not hash only tracked Git files or HEAD.
2. Compute SHA-256 over canonical JSON of a sorted list of tuples `(repository-relative POSIX path, entry type, file mode, SHA-256 of exact bytes or null for a directory)`. Include directories so empty directories and their modes cannot silently disappear. Sort by UTF-8 path bytes, reject duplicate/case-colliding paths and traversal, and make symlink handling explicit before permitting them in a qualified snapshot. File capture and digest computation must have bounded counts/sizes and detect concurrent changes; never silently omit a file that contributes to the image. This tuple format remains a draft until acquisition and cross-platform fixtures are verified; it is not a change to an already emitted source digest.
3. Match the real Docker build context/ignore semantics. Do not invent a second approximate `.dockerignore` interpreter. The implemented prototype delegates filtering to Docker and checks bounded exports; actual context equivalence and deployed capacity remain unverified. If input equivalence cannot be established, report missing source proof rather than claim a commit-bound image.
4. Generated build identity and source-proof bundle are derived outputs, not inputs to their own source hash. Exclude only the explicitly designated generated proof paths, not arbitrary directories. Their bytes are subsequently bound by the immutable image/config digest and their own validated proof digests. Phase 1 must name/test these paths and Docker copy wiring together.
5. Never read or upload production settings, credentials, learner data or unrelated private files to create this snapshot. A context that cannot be safely captured is unqualified; do not silently drop sensitive inputs and certify different build bytes. Retained audit evidence contains the snapshot digest, not file contents or a raw source inventory.

This step defines the digest meaning used by the collector prototype. Authorized real snapshot digests are recorded in the status document; synthetic fixture digests are not real source provenance.

For dirty-source verification, use an explicitly authorized isolated Linux Docker test lane containing the same sealed source inputs and non-production test configuration. Reuse the supported Meteor test harness and exact toolchain. Any `npm run test:ci` invocation needs fresh authorization. The source-test evidence and built image must share the snapshot digest; the runtime overlay remains separately identified non-secret environment-profile input. Ordinary dirty builds remain available if that lane/proof is unavailable, but their missing source assurance cannot pass qualification. This lane still needs implementation and runtime verification before Phase 0 closes.

### 2.1 Verified input boundaries (2026-09-06)

The command sheet's line 241 validates base Compose plus the production overlay. Line 242 builds with **base Compose only**, `--no-cache mofacts`; line 243 pushes that service. Base Compose selects repository-root context and root `Dockerfile`. The following is a source trace, not a Docker execution result:

| Input owner | Actual use | Consequence for capture |
| --- | --- | --- |
| Root `Dockerfile` and `.dockerignore` | Build recipe and context filtering | Bind their exact bytes; detect a future Dockerfile-specific ignore file before selecting the filter |
| `deploy/docker/` | Copied to the base image's scripts directory, then shell scripts undergo CRLF removal and executable-mode changes | Hash original inputs before these existing transformations; preserve the transformations |
| `mofacts/` | Copied to `/opt/mofacts/` | Capture Docker-visible files, not just tracked files; include manifests and any included generated assets |
| `learning-components/`, root `packages/` | Copied to sibling `/opt/` roots for relative imports | Preserve layout; neither root may be omitted from image source identity |
| `mofacts/.dockerignore` | A nested file inside the selected root context | Do not treat it as a second recursively applied ignore policy |
| `mofacts/tests/` | Root ignore excludes most entries, with two explicit exceptions | The production source snapshot alone cannot reproduce all standalone Meteor tests |
| Root `eslint.config.mjs`, `examples/` | Used by full app lint/typecheck but not copied by the production recipe | Supply and bind these as test inputs; do not shrink checks to fit the image |
| Root deployment/workflow/security-policy files | Referenced by existing source-security tests outside the image's copied roots | Test-input closure must include the referenced files without copying private deploy state |
| Private production settings, environment files, runtime overlay and mounted assets | Runtime/operator inputs, not the app build source | Do not copy the config repo or private settings into a qualification context |

Docker applies the context-root ignore policy; a Dockerfile-specific ignore file takes precedence when present. Ignore rules, including negation, must be interpreted by Docker rather than a new JavaScript approximation. [Docker build-context documentation](https://docs.docker.com/build/concepts/context/).

The current `RUN` instructions install dependencies, clean the Meteor cache, build the bundle and harden runtime dependencies. The source digest describes inputs **before** those operations, not the resulting bundle or all network-resolved dependencies. Existing pinned base images, toolchain/lock checks and runtime dependency auditing remain intact. Image/config identity and built-image qualification still own the resulting bytes; a source digest is not a reproducible-build guarantee.

### 2.2 Proposed capture mechanism and the one workflow adjustment

**Approved design; partial implementation and runtime qualification:** the canonical Dockerfile owns a reusable source-only capture target. The [capture helper](../deploy/security-audit/source-capture.md) implements bounded tar acquisition and explicit context-only build invocation. Its CLI binds capture and Compose to one verified local engine-backed builder; unsupported builder families fail rather than select a substitute. Supplemental source-test acquisition, strong sealing and final in-image proof remain pending. BuildKit supports exporting a selected stage's filesystem without publishing an application image. This is an acquisition operation, not a second production app compilation. [Docker local/tar exporters](https://docs.docker.com/build/exporters/local-tar/).

The proposed integration has these ownership constraints:

1. Factor the existing four context-copy roots into one shared input stage. The production builder and capture target consume that same owner; do not maintain a hand-written second list of image inputs in a standalone capture Dockerfile. Keep the final runtime stage as the default and preserve its entrypoint, commands and dependency chain. A capture target must depend only on source acquisition, not npm installation, Meteor compilation or runtime tests. BuildKit only builds dependencies of the selected target. [Docker multi-stage documentation](https://docs.docker.com/build/building/multi-stage/).
2. Carry the exact canonical Dockerfile and selected ignore policy as recipe metadata outside Meteor's app source path. They must describe the recipe actually executed, not a subsequently reread live file. No private configuration, registry credentials, Git directory or whole-context `COPY .` is introduced. Do not put a generated proof file inside the inputs it hashes.
3. Export to a uniquely owned, access-controlled temporary qualification workspace outside the watched checkout. Retain the filtered repository-relative layout and native metadata. The helper owns the workspace, not another saved project or substitute config repository. Source copying, archive handling and cleanup must enforce explicit path/type/size bounds. No public artifact upload is part of capture.
4. Seal the candidate input tree and exact recipe bytes before testing. Keep it separate from writable test workspaces. Do not reread the live checkout for the subsequent candidate app build. Pre/post hashing of an editable checkout alone cannot exclude a change-and-change-back race. A declared frozen candidate means the bytes actually captured; it does not claim an atomic snapshot of unrelated ongoing editor activity.
5. For an explicitly requested **qualified build**, the repository-owned helper supplies an ephemeral Compose override changing only `services.mofacts.build.context` to this captured candidate. Keep the canonical base file first, its project-directory basis unchanged, and use an absolute context path. Keep the original image/tag, build arguments, `--no-cache`, service and Dockerfile recipe. Do not apply this override to push, runtime preflight or remote deploy. Compose relative paths are resolved against the base file, so this must be asserted through a bounded configuration comparison, not assumed. [Docker Compose merge documentation](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/).
6. Recompute the source digest inside the canonical Docker input stage for the final app build. It must equal the sealed candidate's digest, including modes and exact bytes after any export/import round trip. Assert the executed recipe/ignore bytes and qualified source-test reference agree as well. A mismatch invalidates qualification; it cannot be relabeled by using HEAD, the tag, or a newly calculated digest without rerunning the affected checks.
7. Preserve the ordinary command-sheet build when qualification is not requested. Its absence of proof remains observable; no new build mode is required merely to compile, deploy, start, sign in or learn. Do not silently select a different build route after a qualification failure. The caller receives failure to qualify, and the operator retains the existing separately invoked ordinary deployment procedure.

The context override is a **real, narrowly scoped workflow adjustment**, not a promise of zero command changes. The user approved implementing it. The helper creates the temporary override only when explicitly invoked; the command sheet is still unchanged pending runtime equivalence testing. Captured bytes are owned by the helper and checked before/after use; the prototype does not yet provide OS-enforced immutable storage against other same-user processes. Its fresh source-target export is not the final in-image recomputation specified above. It therefore emits only explicitly unqualified states, never source-test or release PASS.

Default-path compatibility is an acceptance requirement for the Dockerfile refactor itself: only the shared copies belong in the ordinary build dependency chain. Test execution, archive export, proof validation and qualification-only bounds may not become mandatory default-build steps. If embedding source observations requires code in both paths, unavailable/invalid proof must remain explicit qualification data, never a newly fatal ordinary-build/startup condition. Preserve all currently fatal build/security checks; this distinction does not authorize ignoring their failures.

A successful prototype must demonstrate that filtering the exported candidate again does not lose or introduce build inputs, that the recipe used for capture and app construction is identical, and that Dockerfile/ignore changes or a newly introduced input family cannot escape the shared capture owner. Do not interpret a Windows directory export as proven Linux mode preservation. The bounded Linux/Windows round-trip qualification is an exit gate, not an assumed property.

### 2.3 Supported source-test lane and evidence binding

There are two deliberately different input sets, not two names for the same source:

- **Build inputs:** the canonical filtered app/script inputs and recipe metadata, identified by the existing `sourceSnapshotDigestSha256` field. Production construction consumes these sealed bytes.
- **Test inputs:** the build inputs plus the exact additional tests, root lint/config/example files, source-security fixtures and referenced public deployment/workflow files needed by the supported checks. Bind this supplemental set and the runner recipe through the planned verification catalog and bundle's evidence digests. Do not add a competing release identity or infer test coverage from the build digest alone.

The test-input collector must reject any attempt to overwrite a build-input path with different bytes/mode. Capture intentionally excluded tests through a reviewed, bounded test-only input contract, never by weakening production `.dockerignore` or copying the whole private config/deploy tree. Do not change production test exclusions just to make qualification easier. Trace actual file readers to finish this test-input closure before calling the lane complete; the examples in Section 2.1 are not yet an exhaustive machine-checked inventory.

**October 9 efficiency revision, approved by the user:** reuse the existing GitHub Linux CI as the primary automated test lane for committed releases. Do not implement a second routine full Meteor runner on the workstation or staging2. CI already owns the pinned Meteor 3.5 / Node 24.15.0 / npm 11.12.1 contract, existing `runMeteorCiTest.cjs`, Playwright Chromium and its disposable MongoDB replica set. Preserve its test database/Change Streams/SockJS settings. The separate Security workflow supplies the source-security suite and independent secret/dependency scans for the same actual checkout revision; do not duplicate that suite in CI merely to assemble evidence. CI now also schedules the Phase 0 and capture contract suites. This workflow change has not yet been executed on GitHub.

Staging2 owns acceptance of the actual deployed candidate: image identity/readiness, HTTPS/proxy/headers/CSP/cookies, supported upload/download ownership, representative learner reload/resume, and browser media behavior where relevant to the change. Reuse recorded acceptance when its image/configuration and affected behavior remain unchanged; do not repeat the complete Meteor suite on staging2 by default. Retain the manually dispatched Change Streams fault/recovery qualification for changes affecting that contract; ordinary passing CI does not establish those injected-fault outcomes.

This revision chooses the existing runner; it does not waive source qualification. CI must still acquire and protect the reviewed build/test inputs, test a writable derivative, and produce source/evidence digests that can be matched to the final canonical Compose image. Use the actual checked-out commit (including a pull-request merge revision where applicable), not just a branch or pull-request head name. The current smoke job builds a separate Docker image; its health result is not proof of the staging2 image or a replacement for the supported Compose release build. Capture/proof integration and complete server/client outcome validation remain unfinished.

Do not connect fixed CI test ports to the localhost watcher, reuse production Mongo/Redis/settings, or infer that setting `CI=1` makes native Windows testing supported. An opt-in dirty-source lane remains a separate future capability only when explicitly needed and authorized; it is not a prerequisite for ordinary committed releases. Dirty source cannot borrow a passing committed CI result. No additional environment provisioning, dependency installation, workflow dispatch or Meteor invocation is authorized by this document revision.

Run the full lint, typecheck, vendor-declaration check, surface check and both security source suites in that captured test workspace, then the separately authorized Meteor CI invocation. Record actual command outcomes, exact verification IDs, test counts and evidence digests. Require the declared server/client discovery sets; a reduced suite that happens to pass is not equivalent. Existing default-branch CI remains useful evidence only when its **actual input digests and test contract** match; its base SHA alone is insufficient, including for a clean checkout with different bytes/modes.

Tests receive a writable derivative workspace, never the sealed build candidate. Verify source and manifests before/after the run. Existing harness cleanup owns transient `meteortesting:*` resolutions; do not normalize away arbitrary dependency or source changes to make the digest match. Declared test caches/output directories are bounded disposable artifacts, not new exclusions from the app-input hash. A timeout, failed restoration, changed source, missing client/server outcome or incomplete discovery invalidates source qualification. Cleanup is owned by the lane and must remove only its exact containers/network/volumes/workspace, including after interruption.

Generate the source-only proof bundle after successful source verification and before app construction. Post-build smoke results remain outside the image, joined through the existing release-record extension and actual config ID. This avoids rebuilding the tested app merely to append later evidence. Do not put app-image smoke tests inside the Dockerfile's normal runtime dependency chain: doing so would turn qualification into an unapproved mandatory build gate.

### 2.4 Bounds, efficiency and implementation acceptance

October 9 implementation continuation: the existing CI job now calls combined
`prepare-tests` acquisition before dependency installation and uses the returned
writable derivative for its source checks and single Meteor invocation.
`verify-tests` compares the reviewed supplemental digest and freshly
Docker-filtered build digest after dependency synchronization and after testing,
including recipe/ignore integrity and original candidate rechecks. A final
metadata-only artifact is associated with the GitHub run/attempt for 14 days;
it is temporary acquisition evidence, not protected authoritative release
storage or a qualified source-test bundle. Cleanup owns installed test cache
links and never follows them to external targets. The output is explicitly
unqualified. Real Linux execution of this revised path, stronger sealing,
complete outcome/discovery evidence and final canonical image binding remain
pending; ordinary builds and source-proof schemas are unchanged.

Proposed initial safety ceilings are 100,000 filesystem entries, 2 GiB total input bytes, 256 MiB per regular file, depth 64 and 1,024 UTF-8 bytes per relative path. These are conservative design limits, **not measured production capacity**; validate them against an authorized minimized context inventory before release and revise the single owning contract deliberately if necessary. Count directories and bytes during acquisition, not after unbounded extraction. Apply the bounds independently to build and supplemental test inputs.

Stream file hashing with fixed concurrency (initially four); sort only bounded metadata, not file contents. Reject traversal, duplicate or case-colliding paths, unsupported file types and ambiguous Unicode/path encoding. Initially require regular files/directories only; symlinks, junctions and hard-link preservation need an explicit supported contract and fixtures before qualification accepts them. Never silently dereference or omit them. Cleanup may only target the helper's validated temporary root. Retain digests/bounded outcomes in audit evidence, not raw inventories, source contents or native-command logs.

Keep the existing no-cache application build. Reuse the one immutable capture for test derivatives and final construction; do not compile or push a second production image for CI. Source-target acquisition should not install dependencies or repeat Meteor compilation. Performance tuning must not silently change `--no-cache`, share mutable test databases, or reuse test results with mismatched source/test/catalog/toolchain identities.

Required prototype cases before activating this integration:

1. Existing clean and dirty inputs; untracked included source; excluded settings/cache changes; included generated-asset changes; nested ignore file versus the actual root/specific policy; negated ignore rules.
2. Exact Dockerfile, copied shell scripts, lockfiles and source-root changes; unsupported new `COPY`/`ADD`/named-context inputs rejected until their owning capture contract is extended.
3. Windows CRLF and Linux mode preservation; unsupported links, path collisions/traversal, entry/byte limits and interrupted acquisition; no private paths or values emitted in failures.
4. Live checkout edits after capture cannot alter the candidate; tampering with the sealed candidate, recipe or source proof invalidates qualification; acquisition failure cannot reuse a previous candidate.
5. Full source-test closure and known failing server/client fixtures; failed/timeout test cleanup and manifest changes cannot yield PASS; supplemental inputs cannot replace build source.
6. Source-only target dependency inspection and observed timings; Compose comparison permits only the approved context adjustment; ordinary default build and runtime profile stay equivalent.
7. Canonical app build recomputes the same snapshot; source proof is embedded before construction; exact config ID is smoke-tested and pushed; later host mapping remains independently required.

The collector/validator and helper sequencing now have 44 passing synthetic tests, including failed export/build, tampering, round-trip mode mismatch, path/type/size rejection and context-only Compose comparison. These tests do not execute Docker filtering or production compilation. The seven runtime acceptance cases above remain **not run**. Implementation uses bounded serial streaming rather than four concurrent readers; prototype timing will determine whether concurrency is needed. The helper explicitly rejects Dockerfile-specific ignore files until that acquisition variant has fixtures. The next gate is an explicitly authorized local Docker capture/round-trip prototype; production command-sheet edits wait for its results. Supplemental test-input acquisition and final in-image source proof are not implemented. Runtime/host ownership and V1 migration decisions remain separate Phase 0 gates.

## 3. Hook contracts for the existing workstation procedure

These describe future integration into the production app section of config repo `deploy production.txt` (the older `deploy and build.txt` is historical). No qualification hook or invocation was added there in Phase 0. Private paths/hosts remain operator inputs; reusable behavior belongs under `deploy/`, not solely in the private command sheet.

| Boundary | Inputs and outcome required by the future helper | Existing behavior preserved |
| --- | --- | --- |
| Before base+overlay preflight/build | Base commit, existing dirty flag, exact source snapshot, applicable executed source evidence; emit bounded build identity/source-proof metadata | Clean/dirty tagging and `MOFACTS_SOURCE_REVISION`; no forced commit or new image-name setting |
| After base Compose build, before push | Real build exit result, newly built config ID/platform and source metadata; run separately authorized exact-image smoke/contract tests | Base-only `--no-cache` construction; no CI/remote replacement build |
| After push and Buildx inspection | Real push/inspect outcomes; published media type; index-to-platform-manifest-to-config association; comparison to tested local config ID | Existing post-publication private environment tag update; no competing authoritative image selection |
| After SSH/Compose startup and existing validation | Real transfer/preflight/start/check outcomes; running config/platform/base revision; tag/revision and Apache/CSP checks | Runtime overlay, `--no-build --wait`, current settings/topology/proxy behavior and Apache-only rollback |
| Existing release-record write | Existing deployment fields plus a truthful optional proof extension; complete validation before the write | One existing record owner; unqualified operation is not relabeled as a failed app deployment |

The draft proof has five named command groups: `build`, `smoke`, `push`, `deploy`, `verify`. Each is either completed with its actual integer exit code or explicitly unavailable (`not-run`, `spawn-failed`, `timed-out`). A group can succeed only if **every required command it owns** completed successfully; the last successful command does not erase a prior failure. No raw shell command, stdout/stderr, environment values or exception text enters the proof.

Capture native outcomes at each invocation boundary; do not assume ambient PowerShell exception preferences. Missing observation never becomes zero. A failed build followed by an old same-tag image must remain unqualified. Broader command-sheet fail-fast behavior and automatic app rollback are not implemented or authorized by these pure contracts.

## 4. Image identity and proof carriage

The old record's `digest` keeps its observed registry meaning. `publishedImage.kind` distinguishes a manifest from a multi-platform index. Index proof additionally names the selected platform manifest; its config digest is compared to the tested local config digest and the running config digest, with platform agreement. The base-commit label and dirty/source snapshot evidence are checked independently. No source SHA, tag, index digest or config ID is substituted for another coordinate.

Acquisition from inspected manifest bytes and independent running-host
observation was executed for staging2 `65875553`; its retained joined candidate
records matching built/published/running identity and real command outcomes.
Synthetic parser/evaluator tests alone cannot authenticate such a mapping.
The completed staging2 acquisition is distinct from future catalog/evidence
closure and complete audit qualification, which remain unqualified.

The existing release record remains authoritative. The user approved its bounded host projection at `/etc/mofacts/release-receipt.json`, root:root mode 0600, through the existing protected forced-command channel. Opt-in projection/install/read tooling is implemented; staging2 installation and restricted-reader acceptance were executed. Production installation is not claimed by those results. It is not a second editable release authority or a new service. It uses the existing protected container-selection setting, with no new config key. See the [public storage and recovery contract](../deploy/security-audit/release-records.md).

Retention preserves the exact prior record bytes and new record in the approved sibling `<record>.history` directory before atomic latest replacement. The opt-in helper implements exclusive hash-named history publication, read-only archives, file sync/read-back, explicit lock recovery and no automatic pruning. Linux additionally syncs directories; Windows ACL and cloud-durability limits are explicit. Historical six-field and current eight-field records remain readable; supplied qualification must be internally consistent but that does not authenticate it. The staging2 history/receipt was published and read back. No production-writer hook or executed previous-image/new-report rollback is claimed. This does not create automatic app-image rollback or a distributed workstation/host transaction. The 2026-11-02 retention decision keeps all small accepted release-metadata records without automatic deletion and the previous usable rollback image with its matching evidence; it does not require retaining every Docker image indefinitely. This release history is distinct from the declined old-security-report access/archive feature.

## 5. Characterization and regression ownership

`npm run security:test:phase0` is separate from the active production scanner's `security:test:source` entry point. It uses synthetic data, the current assembler in bounded temporary directories, pure imports, and exact source-expression/callback evaluation with fake dependencies. It does not launch the production auth runner, contact a target or install a registration adapter.

Tests whose names include **WITNESS** deliberately confirm existing flawed behavior. Passing them is evidence of a defect, not a fixed scanner or green security audit. Replace each witness with its desired regression assertion when the owning phase fixes the behavior; do not keep an assertion requiring the defect after migration. This permits a reproducible red-case record without leaving a knowingly failing test in a completed source change.

| Witness | Current behavior established | Desired owning-phase assertion |
| --- | --- | --- |
| Duplicate producer control | A later PASS overwrites an earlier FAIL | Phase 1: invalidate the producer subset to complete `ERROR` |
| Unknown producer control | Disappears without execution error | Phase 1: reject/invalidate unexpected membership visibly |
| Missing/wrong-section report membership | V1 parser accepts otherwise valid shape/counts/digest | Phase 1: V2 receiver rejects the mutation against the active catalog |
| Method domain error | Satisfies expected-denial boolean | Phase 2: unrelated error is `ERROR`, with a proven allowed baseline required |
| Publication absent data/unrelated error | Can satisfy current denial expression | Phase 2: require exact ready/error/canary/positive-baseline evidence |
| Download 404 | Satisfies expected denial | Phase 2: nonexistent resource cannot prove authorization |
| Negative session lifetime | Passes the upper-bound-only expression | Phase 2: positively establish `0 < lifetimeDays <= 30.05` |
| Handlers-stack route/default publications | Route omitted; multiple defaults collapsed | Phase 3: actual owning registrations represented distinctly |

V1 fixture membership is 11 external, 22 authentication, 9 internal and 10 repository controls (52 full). Exposure retains 20 scheduled controls plus the two current NOT_APPLICABLE placeholders. The fixture contains IDs only, no duplicated titles/severities, and is not a new runtime catalog. Its canonical digest is checked using both existing V1 implementations; Phase 1 removes duplicated production owners and creates the actual immutable catalog.

Selected behavior guards cover publication `ready()` versus query, backup authorization/validation/unblock/context order, synchronous collection rules, intentional public/shared/owner distinctions, health method fallthrough, PWA early fallthrough, mounted asset URL handling and SAML 405 versus fallthrough. Exact source fragments are executed with synthetic dependencies, not copied into a new policy implementation. These tests **do not** prove the full Meteor invocation/reactivity lifecycle, middleware mounting by Connect, provider integration or final registry composition. Those remain runtime qualification gates.

The shared JSON/erasable-TypeScript fixture imports and golden digest have
pinned-Node and Meteor server parity coverage. Retained evidence for CI
42048015246 includes `common/securityAudit/releaseQualification.test.ts` in the
server discovery, with no server test or hook failures. This is supported CI
execution, not an inference from local typecheck or a claim of browser discovery
for that module.

## 6. Remaining Phase 0 closure gates

The [reconciled current checklist](security-audit-durable-redesign-status.md#reconciled-phase-0-checklist-2026-11-05)
is the single task-status owner. It replaces this section's obsolete list calling
source capture, recovery setup and protected installation unimplemented.

Keep these distinctions when reading the contracts:

- Completed V1 characterization/compatibility and staging2 acceptance remain
  evidence for their exact source/configuration. They do not fix the P0 witnesses.
- Previous-image testing with future-format reports has a bounded specification
  in the plan. Execute it against the Phase 1 candidate before cutover; do not
  label it an already failed or already executed test.
- The successful AWS restore and separate staging2 access test are accepted within
  their boundaries. They do not establish production-provider authentication,
  real report-private-key custody or acceptance of an operational rollback copy.
- The failed mutation verifier stays failed and needs its visibility contract
  repaired before reuse. No retry/new protected access is implied.
- Finish the Phase 0 exit-clause/evidence review and retain the separate Phase 1-3
  scopes; passing local fixtures do not authorize V2 activation or production work.

This reconciliation changes no application contract, permission or acceptance
result, consumes no integration invocation and does not close Phase 0.
