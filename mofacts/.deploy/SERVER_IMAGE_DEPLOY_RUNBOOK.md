# Server Image Deploy Runbook

This runbook is for image-based deployment where the server pulls a prebuilt image and does not build Meteor source in place.

## Scope

- Host OS: Ubuntu Linux.
- Runtime path: `/var/www/mofacts`.
- App runtime: Docker Compose (`mofacts` + `mongodb`).
- Edge runtime: Apache reverse proxy + Let's Encrypt TLS.
- Domain cutover: Elastic IP reassociation after host validation.

## Critical Sequencing (Do Not Skip)

1. Build/push image first.
2. Bootstrap new host fully (Docker + Apache + TLS + app up).
3. Validate host locally and via domain.
4. Reassociate Elastic IP last.

Do not move the Elastic IP before step 2 is complete, or production will point to a non-serving host.

## Preconditions

1. Image already pushed, for example `ppavlikmemphis/mofacts-mini:<tag>`.
2. New host is reachable via SSH.
3. DNS name to serve: `mofacts.optimallearning.org`.
4. Security group allows inbound `22` (admin IP), `80`, `443`.

## Host Bootstrap (One-Time Per New Server)

### 1) Install Docker + Compose

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo apt-get update
sudo apt-get install -y docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
```

### 2) Prepare Runtime Directory

```bash
sudo mkdir -p /var/www/mofacts
sudo chown ubuntu:ubuntu /var/www/mofacts
```

### 3) Copy Runtime Assets

On server, ensure these exist:

- `/var/www/mofacts/docker-compose.yaml`
- `/var/www/mofacts/.env`
- `/var/www/mofacts/server-deploy-validate.sh`
- `/mofactsAssets_override/memphis-saml-public-cert.pem` when Memphis SAML is enabled
- `/mofactsAssets_override/memphis-saml-private-key.pem` when Memphis SAML is enabled

Minimal `.env` example:

```dotenv
DOCKER_REGISTRY=ppavlikmemphis
IMAGE_NAME=mofacts-mini
IMAGE_TAG=upgrades
ROOT_URL=https://mofacts.optimallearning.org
PORT=3000
MONGO_URL=mongodb://mongodb:27017/MoFACT-meteor3
EXPECTED_MONGO_DB_NAME=MoFACT-meteor3
METEOR_SETTINGS_PATH=/app/settings.json
```

The runtime validates `MONGO_URL` on startup and exits if it targets any database other than `MoFACT-meteor3`. This prevents stale `.env` files from silently creating an extra Mongo database during deploy.

### 3a) Memphis SAML PEM Files

When University of Memphis SAML is enabled, keep the SAML signing files on the host and mount them into the app container through the existing `/mofactsAssets_override` bind mount.

Expected host paths:

- `/mofactsAssets_override/memphis-saml-public-cert.pem`
- `/mofactsAssets_override/memphis-saml-private-key.pem`

Recommended permissions:

```bash
sudo mkdir -p /mofactsAssets_override
sudo chown root:root /mofactsAssets_override
sudo chmod 755 /mofactsAssets_override
sudo chmod 644 /mofactsAssets_override/memphis-saml-public-cert.pem
sudo chmod 600 /mofactsAssets_override/memphis-saml-private-key.pem
```

Do not bake the private key into the Docker image or publish it in registry layers.

### 4) Bring Up Containers

```bash
cd /var/www/mofacts
sudo docker compose --env-file .env -f docker-compose.yaml pull
sudo docker compose --env-file .env -f docker-compose.yaml up -d
```

### 5) Verify App Container (Local)

```bash
cd /var/www/mofacts
sudo docker compose --env-file .env -f docker-compose.yaml ps
sudo docker logs --tail 120 mofacts
curl -I http://localhost:3000
```

## Edge Setup (Match Staging Pattern: Apache)

Staging pattern is Apache (not Nginx/Caddy). Match this on production host.

### 1) Install Apache + Certbot

```bash
sudo apt-get update
sudo apt-get install -y apache2 certbot python3-certbot-apache
sudo a2enmod proxy proxy_http proxy_wstunnel ssl rewrite headers
```

### 2) Configure HTTP Virtual Host

`/etc/apache2/sites-available/000-default.conf`:

```apache
<VirtualHost *:80>
  ServerName mofacts.optimallearning.org
  ServerAlias mofacts.optimallearning.org

  ProxyPass / http://127.0.0.1:3000/
  ProxyPassReverse / http://127.0.0.1:3000/
  ProxyPreserveHost on

  RewriteEngine on
  RewriteCond %{SERVER_NAME} =mofacts.optimallearning.org
  RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
</VirtualHost>
```

Then:

```bash
sudo apache2ctl configtest
sudo systemctl restart apache2
```

### 3) Issue TLS Cert and Enable HTTPS VHost

```bash
sudo certbot --apache -d mofacts.optimallearning.org \
  --non-interactive --agree-tos --register-unsafely-without-email --redirect
```

Expected cert paths:

- `/etc/letsencrypt/live/mofacts.optimallearning.org/fullchain.pem`
- `/etc/letsencrypt/live/mofacts.optimallearning.org/privkey.pem`

After certbot, ensure HTTPS vhost includes the Meteor proxy directives used on staging:

```apache
RequestHeader set X-Forwarded-Proto "https"
RequestHeader set X-Forwarded-Port "443"

ProxyPass /websocket ws://localhost:3000/websocket
ProxyPassMatch ^/sockjs/(.*)/websocket ws://localhost:3000/sockjs/$1/websocket

ProxyPass / http://127.0.0.1:3000/
ProxyPassReverse / http://127.0.0.1:3000/
ProxyPreserveHost on

SetEnv proxy-initial-not-pooled 1
SetEnv proxy-nokeepalive 1
```

Then reload Apache:

```bash
sudo apache2ctl configtest
sudo systemctl reload apache2
```

### 4) Verify Edge Layer

```bash
sudo ss -ltnp | egrep ':80|:443|:3000'
curl -I http://localhost:80
curl -I https://localhost --insecure
curl -I https://mofacts.optimallearning.org
```

## Image Deploy (Ongoing)

From server:

```bash
cd /var/www/mofacts
bash ./server-deploy-validate.sh --image ppavlikmemphis/mofacts-mini:<tag>
```

If `--image` is omitted, script redeploys image already referenced by compose.

### What `server-deploy-validate.sh` Does

1. Preflight checks (`docker`, `docker compose`, compose file).
2. Captures currently running image for rollback.
3. Pulls target image.
4. Applies temporary compose override.
5. Runs `docker compose up -d --no-deps mofacts`.
6. Verifies container reaches `running`.
7. Prints recent logs.
8. Rolls back automatically if deployment fails.

## Cutover and Rollback

### Cutover

1. Confirm new host passes all local and domain checks.
2. Reassociate Elastic IP from old instance to new instance.
3. Re-test `https://mofacts.optimallearning.org` and key login flow.

### Fast Rollback

If production fails after cutover:

1. Reassociate Elastic IP back to previous instance immediately.
2. Keep old host running until new host is stable.
3. Fix and repeat cutover.

## Post-Cutover

1. Monitor app logs and error rate for at least 24 hours.
2. Stop old instance first (do not terminate immediately).
3. Terminate old instance only after stability window and resource audit.

## Notes

- This workflow validates runtime deployment, not source compilation.
- Build/test/TS verification should happen before image publish.
