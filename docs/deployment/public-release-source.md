# Public Release and Source Availability

Each public self-hosted release must be traceable across:

- Source tag or source archive.
- Docker image tag when an image is published.
- Settings example version.
- `.env` example version.
- Release notes.
- Upgrade notes.
- License text and third-party notices.
- Dependency lockfiles and build scripts.

Release checklist:

- Run secret and institution-specific data scans.
- Run `node scripts/release/open-core-readiness-scan.cjs` and resolve or document every finding.
- Audit redistributable sample content and attribution.
- Run dependency license audit and refresh notices when needed.
- For schema-affecting changes, run `npm run generate:schemas` from `mofacts/` and inspect generated schema diffs.
- For settings-affecting changes, verify the self-hosted settings example, `.env` example, and settings reference changed together.
- Verify AGPL text, third-party notices, build scripts, and lockfiles are present or linked.
- Validate Compose config.
- Run typecheck and lint for changed code.
- Verify the app footer License / Source link points to the exact public source tag/archive for the deployed version.
- Document deployment-impacting settings, storage, Redis, worker, migration, backup, and restore changes.

Use `docs/deployment/release-checklist.md` as the per-release evidence template. The static readiness scan verifies that this checklist continues to name the required source, settings, license, migration, backup, restore, and post-upgrade smoke-test evidence.
