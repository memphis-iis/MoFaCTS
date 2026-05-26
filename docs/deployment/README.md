# Deployment Docs

Human-facing deployment documentation belongs here.

Belongs here:

- Docker Compose workflow guides.
- Environment setup notes.
- Local hotfix loop documentation.
- Server rollout runbooks that are not scripts.

The canonical deployment workflow lives under `deploy/`.

## Self-Hosted MoFaCTS

- `self-hosted-guide.md`: end-to-end operator guide.
- `settings-reference.md`: required and optional settings.
- `settings-inventory.md`: release-readiness settings and environment classification.
- `reverse-proxy.md`: Caddy-first HTTPS guidance.
- `backup-restore.md`: complete backup and guarded restore procedures.
- `first-admin-content.md`: first-admin and beginner content workflow.
- `upgrade-guide.md`: release-to-release upgrade expectations.
- `public-release-source.md`: public release and source-availability checklist.
- `release-checklist.md`: per-release evidence checklist.
- `troubleshooting.md`: common deployment failures.
- `open-core-verification-log.md`: recorded local verification evidence and known unrun release-confidence checks.

## Developer Planning

Implementation plans, audits, and architecture vetting notes belong in `../../docs-developer/`.
