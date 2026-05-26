# Open-Core Verification Log

This log records concrete local verification evidence for Self-Hosted MoFaCTS readiness. It is not a substitute for the full clean self-hosted stack proof in `open-core-implementation-plan.md`.

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
