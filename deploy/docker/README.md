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
