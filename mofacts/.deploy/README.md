# MoFaCTS Deployment Workflow

This folder contains the canonical Docker Compose deployment workflow for the MoFaCTS application.

## Contents

- `docker-compose.yml`: production-shaped app and MongoDB runtime.
- `docker-compose.local.yml`: local override file for development or staging-style checks.
- `.env.local`, `.env.staging`, `.env.production`: environment variable examples for supported targets.
- `settings.json`, `settings.local.json`: application settings sources used by the container runtime.
- `docker/`: scripts copied into the app image.
- `SERVER_IMAGE_DEPLOY_RUNBOOK.md`: server deployment runbook.
- `server-deploy-validate.sh`: remote rollout validation helper.
- `start-lan-https.ps1`, `stop-lan-https.ps1`, `Caddyfile.local`: local LAN HTTPS helpers.
- `build-timed.ps1`: optional timing wrapper around Docker Compose builds.

## Build Context

Run Docker Compose from this folder.

`docker-compose.yml` sets the build context to `../../`, which resolves to the repository root that contains the application Dockerfile.

## Local Settings

Keep private settings and secrets out of commits. Use local environment files and local settings files for deployment-specific values.

## Typical Local Validation

Only run Docker commands when you intend to validate the container workflow:

```bash
cd mofacts/.deploy
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml config
```

Build, push, and deploy commands should be run only by maintainers or release owners with the appropriate environment access.

## Security Notes

- Do not commit private keys, SAML certificates, database credentials, or production settings.
- Keep MongoDB private to the deployment network.
- Use HTTPS for exposed deployments.
- Review `SECURITY.md` before exposing a deployment to learners, instructors, or research participants.
