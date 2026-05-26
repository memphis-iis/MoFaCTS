# Open-Core Release Checklist

Use this checklist for each public self-hosted MoFaCTS release. Replace every bracketed value in the release issue or release notes before tagging.

## Release Identity

- Source tag or archive: `[vX.Y.Z]`
- Docker image tag, if published: `[registry/image:vX.Y.Z]`
- Settings template version: `[vX.Y.Z]`
- `.env` example version: `[vX.Y.Z]`
- Release notes URL: `[link]`
- Upgrade notes URL: `[link]`

## Required Evidence

- Static public-readiness scan: `node scripts/release/open-core-readiness-scan.cjs`
- TypeScript check: `npm run typecheck` from `mofacts/`
- Lint check: `npm run lint` from `mofacts/`
- Dependency license audit: `npm run license:audit` from `mofacts/`
- AGPL license text, third-party notices, dependency license artifacts, build scripts, and lockfiles are present.
- Footer License / Source link points to the exact public source tag or archive.
- Redistributable sample content and attribution/provenance metadata were reviewed.

## Change Impact

- Settings changes are documented in `deploy/settings.self-hosted.example.json`, `deploy/.env.self-hosted.example`, and `docs/deployment/settings-reference.md`.
- Schema changes were regenerated with `npm run generate:schemas` from `mofacts/`, and generated schema diffs were inspected.
- Storage, Redis, worker, migration, backup, restore, and deployment-impacting changes are called out in release notes.
- Worker status is explicit: this milestone ships no separate worker service unless release notes name a concrete worker entrypoint and readiness behavior.

## Runtime Proof

- Canonical Docker image build completed, when release-confidence validation is being performed.
- Clean self-hosted stack started from tracked examples plus private operator-provided settings.
- Readiness validation passed from `/admin/tests`.
- First-admin bootstrap was verified from a clean database.
- World countries sample content was loaded and a learner smoke flow completed.
- Dynamic asset serving and the default local filesystem storage backend were verified.
- H5P content serving was verified when the release or deployment includes H5P content.
- Backup completed and restore to a clean volume or clean host was verified.
- Restored app behavior was verified, including login, content listing, dynamic assets, and H5P serving where applicable.
- Post-upgrade smoke test completed from the previous supported version when an upgrade path exists.
