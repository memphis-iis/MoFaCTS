# Server Image Deployment Runbook

This runbook describes the generic image-based deployment pattern for MoFaCTS. Environment-specific hostnames, credentials, keys, and institutional settings should be maintained outside the public repository.

## Scope

- Runtime: Docker Compose.
- Services: MoFaCTS app container and MongoDB container.
- Edge: HTTPS reverse proxy managed by the deployment owner.
- Settings: environment variables plus a private Meteor settings file.

## Preconditions

- A reviewed image has been built and pushed by a maintainer.
- The target host has Docker and Docker Compose available.
- The target host has private environment files and settings prepared.
- MongoDB credentials and application secrets are stored outside version control.
- HTTPS termination is configured before exposing the deployment to learners or research participants.

## Runtime Files

The deployment host should have:

- `docker-compose.yaml`
- `.env`
- private settings file or mounted settings path
- any required identity-provider certificates or keys
- optional deployment validation script

Do not commit private deployment files to this repository.

## Deployment Shape

On the deployment host:

```bash
cd /path/to/mofacts/deploy
docker compose --env-file .env -f docker-compose.yaml pull
docker compose --env-file .env -f docker-compose.yaml up -d
docker compose --env-file .env -f docker-compose.yaml ps
```

Review app logs after startup:

```bash
docker logs --tail 120 mofacts
```

## Validation

Validate:

- the app container is running,
- MongoDB is reachable only inside the deployment network,
- the configured root URL is correct,
- login and logout work,
- a known TDF can be loaded,
- a short practice flow can be completed,
- HTTPS and websocket traffic are routed correctly,
- no secrets are present in logs, source files, or release artifacts.

## Rollback

Before deploying a new image, record the currently running image tag. If validation fails, redeploy the previous image tag and re-run the validation checks.

## Notes

- Build, lint, TypeScript, and test verification should happen before image publication.
- This runbook documents runtime deployment shape; it is not a substitute for release review.
