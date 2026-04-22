# MoFaCTS Deploy Folder

This folder is the single source of truth for the live MoFaCTS deploy configuration used by the `svelte-app` application.

## What Is Live

- `docker-compose.yml`: production-shaped runtime for the app and MongoDB
- `docker-compose.local.yml`: local overrides for repo-local mounts and settings
- `.env.production`, `.env.staging`, `.env.local`: environment values for each target
- `settings.json`, `settings.local.json`: settings sources consumed by the Docker build or local override
- `docker/`: repo-owned shell scripts copied into the app image at build time
- `SERVER_IMAGE_DEPLOY_RUNBOOK.md`: production server setup and deploy runbook
- `server-deploy-validate.sh`: remote image rollout helper
- `start-lan-https.ps1`, `stop-lan-https.ps1`, `Caddyfile.local`: local LAN HTTPS workflow
- `build-timed.ps1`: optional timing wrapper around `docker compose build`

## How The Build Resolves

Run Docker Compose from this folder.

- `docker-compose.yml` sets `context: ../../`
- from this directory that resolves to `svelte-app/`
- `dockerfile: Dockerfile` therefore resolves to `svelte-app/Dockerfile`

That Dockerfile builds the application image and copies the repo-owned scripts from `.deploy/docker/` into the container runtime.

## Settings Paths

- The source production settings file in the repo is `.deploy/settings.json`
- the Docker build copies it into the image at `/app/settings.json`
- local development overrides that with `.deploy/settings.local.json` mounted to `/run/local-settings/settings.local.json`

The repo file stays in `.deploy`. The `/app/...` and `/run/...` paths are container-internal runtime paths.

## Memphis SAML Files

Production Memphis SAML signing files are not baked into the image.

- Keep the PEM files on the server host under `/mofactsAssets_override/`
- the app reads them from:
  - `/mofactsAssets_override/memphis-saml-public-cert.pem`
  - `/mofactsAssets_override/memphis-saml-private-key.pem`
- `.deploy/settings.json` already points to those runtime paths

This keeps the private key out of the Docker image and out of the registry layers.

## Production Deploy

Typical deploy flow from this folder:

```powershell
docker compose --env-file .\.env.production build --no-cache
docker compose --env-file .\.env.production push
scp -i "C:\Users\ppavl\OneDrive\Desktop\prodkey.pem" .\docker-compose.yml ubuntu@52.89.109.53:/var/www/mofacts/docker-compose.yaml
scp -i "C:\Users\ppavl\OneDrive\Desktop\prodkey.pem" .\.env.production ubuntu@52.89.109.53:/var/www/mofacts/.env
scp -i "C:\Users\ppavl\OneDrive\Desktop\prodkey.pem" C:\Users\ppavl\OneDrive\Active projects\mofacts-saml\memphis-saml-public-cert.pem ubuntu@52.89.109.53:/tmp/memphis-saml-public-cert.pem
scp -i "C:\Users\ppavl\OneDrive\Desktop\prodkey.pem" C:\Users\ppavl\OneDrive\Active projects\mofacts-saml\memphis-saml-private-key.pem ubuntu@52.89.109.53:/tmp/memphis-saml-private-key.pem
ssh -i "C:\Users\ppavl\OneDrive\Desktop\prodkey.pem" ubuntu@52.89.109.53 "sudo mkdir -p /mofactsAssets_override && sudo mv /tmp/memphis-saml-public-cert.pem /mofactsAssets_override/memphis-saml-public-cert.pem && sudo mv /tmp/memphis-saml-private-key.pem /mofactsAssets_override/memphis-saml-private-key.pem && sudo chown root:root /mofactsAssets_override/memphis-saml-*.pem && sudo chmod 644 /mofactsAssets_override/memphis-saml-public-cert.pem && sudo chmod 600 /mofactsAssets_override/memphis-saml-private-key.pem"
ssh -i "C:\Users\ppavl\OneDrive\Desktop\prodkey.pem" ubuntu@52.89.109.53 "cd /var/www/mofacts && sudo docker compose --env-file .env -f docker-compose.yaml pull && sudo docker compose --env-file .env -f docker-compose.yaml up -d"
```

Before running the deploy, set `"saml.memphis.enabled": true` in `.deploy/settings.json` once the PEM files are ready and you intend to expose the Memphis button in production.

For full server bootstrap and rollback details, see `SERVER_IMAGE_DEPLOY_RUNBOOK.md`.
