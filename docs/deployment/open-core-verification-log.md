# Open-Core Verification Log

This log records concrete local verification evidence for Self-Hosted MoFaCTS readiness. It is not a substitute for the full clean self-hosted stack proof in `../../docs-developer/open-core-implementation-plan.md`.

## 2026-05-26 Local Static Pass

Completed:

- `node scripts/release/open-core-readiness-scan.cjs`
  - Result: passed.
  - Coverage: required source-availability artifacts, required release checklist topics, self-hosted settings example/reference alignment, common committed secrets, and private local path scan across tracked files plus required release artifacts.
- `http://localhost:3200`
  - Result: loaded through Playwright MCP with page title `MoFaCTS`.
  - Footer evidence: visible `License / Source` link points to `https://github.com/memphis-iis/mofacts/tree/v0.1.0-alpha.1`.
- `npm run typecheck`
  - Result: passed after extracting route access policy coverage.
  - Coverage: TypeScript verifies the admin-tests route uses the shared `RouteAccessPolicy` contract.
- `npm run lint`
  - Result: passed after extracting route access policy coverage.
  - Coverage: lint covers `mofacts/client/lib/routeAccessPolicies.ts` and `mofacts/client/lib/routeAccessPolicies.test.ts`.

Admin readiness access evidence:

- `mofacts/server/methods/deploymentReadinessMethods.test.ts` covers anonymous and non-admin rejection for the `deploymentReadiness` Meteor method.
- `mofacts/client/lib/routeAccessPolicies.test.ts` covers that `client.adminTests`, the `/admin/tests` readiness diagnostics route, requires auth and `admin` role.

Environment-heavy checks not run in this pass:

- Canonical Docker image build.
- Clean self-hosted Docker Compose stack startup.
- First-admin bootstrap on a clean database.
- World countries content import and learner smoke flow.
- Backup and clean-volume or clean-host restore rehearsal.
- Upgrade rehearsal from a previous supported version.

Reason: these are release-confidence/runtime proof steps that require deliberate operator values, Docker runtime work, or a clean state rehearsal. They remain open in the implementation plan until run directly.

## 2026-05-26 AutoTutor Modularity Boundary Pass

Completed:

- `npm run typecheck`
  - Result: passed after extracting the AutoTutor end-state contract into `learning-components/units/autotutor/AutoTutorEndState.ts`.
  - Coverage: TypeScript verifies the AutoTutor client runtime, component-owned end-state helper, and compressed-history action types agree.
- `npm run lint`
  - Result: passed.
  - Coverage: lint covers the updated AutoTutor client runtime and new common test file.
- `node scripts/release/open-core-readiness-scan.cjs`
  - Result: passed.
  - Coverage: the public-readiness static gate still passes after the modularity-boundary changes.
- `http://localhost:3200`
  - Result: loaded through Playwright MCP with page title `MoFaCTS`.

Modularity evidence added:

- AutoTutor end reasons are explicit component-owned semantics: `in_progress`, `mastery`, `max_turns`, and `cost_cap`.
- `mofacts/common/autoTutorEndState.test.ts` covers end-reason flag mapping, compressed-history action mapping, invalid completed-state rejection, and end-reason validation.
- `docs-developer/modularity-readiness-audit.md`, `docs-developer/modularity-start-plan.md`, and `learning-components/units/autotutor/README.md` now name the AutoTutor end-state boundary as current modularity evidence.

Environment-heavy checks not run in this pass:

- Canonical Docker image build.
- Clean self-hosted Docker Compose stack startup.
- First-admin bootstrap on a clean database.
- Backup and restore rehearsal.

Reason: these remain the same release-confidence/runtime proof steps listed in the implementation plan and were not requested for this local modularity-boundary pass.

## 2026-05-26 AutoTutor Generation Config Pass

Completed:

- `npm run generate:schemas`
  - Result: passed.
  - Coverage: regenerated `mofacts/public/tdfSchema.json` after adding `autotutorsession.utteranceTemperature` to the AutoTutor field registry.
- `npm run typecheck`
  - Result: passed.
  - Coverage: TypeScript verifies the AutoTutor runtime uses the package-owned generation config contract and that the new tests compile.
- `npm run lint`
  - Result: passed.
- `node scripts/release/open-core-readiness-scan.cjs`
  - Result: passed.
- `http://localhost:3200`
  - Result: after one transient Meteor restart 503, reloading through Playwright MCP returned the normal `MoFaCTS` page and visible `License / Source` link.

Modularity evidence added:

- `learning-components/units/autotutor/AutoTutorGenerationConfig.ts` owns scoring temperature, default tutor-utterance temperature, and fail-clear authored temperature validation.
- `mofacts/common/autoTutorGenerationConfig.test.ts` covers the generation-config contract.
- `mofacts/common/lib/autoTutorContract.test.ts` covers invalid authored `autotutorsession.utteranceTemperature` rejection.

## 2026-05-26 Self-Hosted Email Sender Settings Pass

Completed:

- `npm run typecheck`
  - Result: passed.
  - Coverage: TypeScript verifies the explicit `emailFrom` and optional `emailReplyTo` dependencies across startup, auth methods, and server utility wiring.
- `npm run lint`
  - Result: passed.
- `node scripts/release/open-core-readiness-scan.cjs`
  - Result: passed.
  - Coverage: the static release scan now requires `emailFrom` in `deploy/settings.self-hosted.example.json` and `docs/deployment/settings-reference.md`.
- `http://localhost:3200`
  - Result: after fixing a local disabled-email boot crash caused by validating the sender before email-send gating, Playwright MCP loaded the normal `MoFaCTS` page with the visible `License / Source` link.

Readiness evidence added:

- Self-hosted production settings validation now requires `emailFrom` when `enableEmail` or `prod` enables mail, accepts display-name sender syntax, and validates optional `emailReplyTo`.
- The self-hosted and local settings examples now include `emailFrom` and `emailReplyTo`.
- Operator docs now call out sender-domain deliverability expectations for verification and system mail.

## 2026-05-26 Modularity Starter Checklist Pass

Completed:

- `npm run typecheck`
  - Result: passed.
- `npm run lint`
  - Result: passed.
- `node scripts/release/open-core-readiness-scan.cjs`
  - Result: passed.
- `http://localhost:3200`
  - Result: loaded through Playwright MCP with page title `MoFaCTS` and visible `License / Source` link.

Modularity evidence added:

- `learning-components/README.md` now contains a component package checklist for new unit engines, trial-display adapters, H5P-style widgets, and future external-widget components.
- `docs-developer/modularity-start-plan.md` now includes a concrete starter path: begin from the echo sample and AutoTutor boundary, choose unit versus trial-display, write manifest/capability tests first, compose through the catalog, and preserve compatibility facades while app callers migrate.
- `learning-components/samples/echo-unit/README.md` now states what a production package README must name before a sample-shape package becomes a real component.

## 2026-05-26 Field Registry Readiness Scan Pass

Completed:

- `npm run audit:fields`
  - Result: passed.
  - Coverage: verifies generated public schemas are fresh relative to registry generation, closed against supported registry keys, and aligned with tooltip, validator, runtime-inventory, alias, and import-default coverage.
- `node scripts/release/open-core-readiness-scan.cjs`
  - Result: passed.
  - Coverage: the open-core readiness scan now invokes the field registry audit directly, so stale generated TDF/stimulus schema artifacts fail the same release-readiness check as missing settings/docs artifacts.
- `npm run typecheck`
  - Result: passed.
- `npm run lint`
  - Result: passed.

Readiness evidence added:

- `scripts/release/open-core-readiness-scan.cjs` now runs `mofacts/scripts/auditFields.ts` through Node from the app workspace.
- `mofacts/scripts/auditFields.ts` now treats `autotutorsession` as an intentional nested `tutor.unit[]` schema section, matching the AutoTutor registry section added for modular unit configuration.
