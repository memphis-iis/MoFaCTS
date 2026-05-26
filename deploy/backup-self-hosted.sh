#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:-}"
ENV_FILE="${ENV_FILE:-.env.self-hosted}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

if [ -z "$BACKUP_DIR" ]; then
  echo "Usage: ENV_FILE=.env.self-hosted ./backup-self-hosted.sh ./backups/mofacts-YYYYMMDD-HHMMSS" >&2
  exit 2
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${MONGO_INITDB_ROOT_USERNAME:?MONGO_INITDB_ROOT_USERNAME is required}"
: "${MONGO_INITDB_ROOT_PASSWORD:?MONGO_INITDB_ROOT_PASSWORD is required}"
: "${MOFACTS_MONGO_APP_DATABASE:?MOFACTS_MONGO_APP_DATABASE is required}"
: "${METEOR_SETTINGS_HOST_PATH:?METEOR_SETTINGS_HOST_PATH is required}"

mkdir -p "$BACKUP_DIR"/{mongo,assets,h5p-content,h5p-libraries,config}

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T mongodb \
  mongodump \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --db "$MOFACTS_MONGO_APP_DATABASE" \
  --archive > "$BACKUP_DIR/mongo/${MOFACTS_MONGO_APP_DATABASE}.archive"

cp "$ENV_FILE" "$BACKUP_DIR/config/$(basename "$ENV_FILE")"
cp "$METEOR_SETTINGS_HOST_PATH" "$BACKUP_DIR/config/settings.json"

for state_dir in /dynamic-assets /h5p-content /h5p-libraries; do
  if [ ! -d "$state_dir" ]; then
    echo "Required state directory not found: $state_dir" >&2
    exit 1
  fi
done

tar -C / -cf "$BACKUP_DIR/assets/dynamic-assets.tar" dynamic-assets
tar -C / -cf "$BACKUP_DIR/h5p-content/h5p-content.tar" h5p-content
tar -C / -cf "$BACKUP_DIR/h5p-libraries/h5p-libraries.tar" h5p-libraries

cat > "$BACKUP_DIR/manifest.txt" <<EOF
MoFaCTS self-hosted backup
created_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
database=$MOFACTS_MONGO_APP_DATABASE
settings_file=$(basename "$METEOR_SETTINGS_HOST_PATH")
compose_file=$COMPOSE_FILE
EOF

echo "Backup written to $BACKUP_DIR"
