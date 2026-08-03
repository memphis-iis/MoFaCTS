# Upgrade Guide

Supported self-hosted upgrades are release-to-release. Operators should use semantic release tags starting at `v0.1.0-alpha.1`.

Before upgrading:

1. Read release notes for settings, storage, Redis, worker, schema, and migration changes.
2. Back up MongoDB data and database-scoped users/roles, settings, `.env`, the replica-set keyfile, dynamic assets, and integration key material.
3. Record the current source tag, image tag, settings template version, and release notes URL.

Upgrade paths:

- Prebuilt image: update `IMAGE_TAG` to the release tag.
- Local source build: check out the matching source tag and build with the documented Compose workflow.

Database migrations are forward-only unless a release explicitly says otherwise. Any Mongo collection shape, index, migration, or persistence-contract change requires migration notes and explicit approval before implementation.

Schema and settings changes:

- If a release changes TDF or stimulus field registries, run `npm run generate:schemas` from `mofacts/` and inspect the generated schema diff before release notes are finalized.
- If a release changes required settings, public settings, storage settings, Redis settings, or authentication settings, update `deploy/settings.self-hosted.example.json`, `deploy/.env.self-hosted.example`, and `docs/deployment/settings-reference.md` in the same change.
- Generated schema diffs and settings-template changes must be called out in release notes with operator action required, if any.

After upgrading, run `/admin/tests`, sign in as admin, confirm content listing, launch one learner flow, verify dynamic assets, and check the visible License / Source link points to the running source tag or archive.

When an upgrade changes the application host operating system or the configured
local dynamic-assets directory, startup reconciles FilesCollection's absolute
`path`, `versions.original.path`, and `_storagePath` fields to the configured
local storage root. The migration verifies each canonical
`<asset-id>.<extension>` file before updating its record, checkpoints bounded
batches, reruns when the configured root changes, and leaves missing or invalid
assets unchanged with an explicit startup error report. Treat any unresolved
asset as an upgrade blocker; do not continue learner launch verification until
the corresponding file is restored.
