# Deploy Docker Helpers

Scripts in this folder are copied into or used by the Docker-based MoFaCTS runtime.

Belongs here:

- Container entrypoint scripts.
- MongoDB connection and validation helpers.
- Build-time scripts used by the Dockerfile.

Does not belong here:

- Local-only developer convenience scripts. Put those under `deploy/` or `scripts/dev/`.
- Application source code.
- Secrets or environment-specific settings.

These scripts support the canonical root `deploy/` workflow. They should fail clearly when required environment variables or files are missing.

`harden-runtime-npm-dependencies.sh` owns the reviewed dependency replacements
in the pinned Meteor server bundle. It checks expected upstream versions,
installs pinned replacements, and verifies that they load before the bundle
audit runs. Keep these targets aligned with the selected Meteor packages.
`ostrio:files@3.0.1` depends only on `eventemitter3` through npm; its obsolete
`lodash` replacement was removed. Do not recreate that dependency or skip
required checks conditionally to accommodate a changed bundle.
