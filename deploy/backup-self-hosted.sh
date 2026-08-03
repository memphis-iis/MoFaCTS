#!/usr/bin/env bash
set -euo pipefail
umask 077

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
: "${MONGO_REPLICA_SET_KEYFILE_HOST_PATH:?MONGO_REPLICA_SET_KEYFILE_HOST_PATH is required}"

if [ ! -s "$MONGO_REPLICA_SET_KEYFILE_HOST_PATH" ]; then
  echo "Replica-set keyfile not found or empty: $MONGO_REPLICA_SET_KEYFILE_HOST_PATH" >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"/{mongo,assets,config}

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T mongodb \
  mongodump \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --db "$MOFACTS_MONGO_APP_DATABASE" \
  --dumpDbUsersAndRoles \
  --archive > "$BACKUP_DIR/mongo/${MOFACTS_MONGO_APP_DATABASE}.archive"

cp "$ENV_FILE" "$BACKUP_DIR/config/$(basename "$ENV_FILE")"
cp "$METEOR_SETTINGS_HOST_PATH" "$BACKUP_DIR/config/settings.json"
cp "$MONGO_REPLICA_SET_KEYFILE_HOST_PATH" "$BACKUP_DIR/config/mongodb-keyfile"

for state_dir in /dynamic-assets; do
  if [ ! -d "$state_dir" ]; then
    echo "Required state directory not found: $state_dir" >&2
    exit 1
  fi
done

tar -C / -cf "$BACKUP_DIR/assets/dynamic-assets.tar" dynamic-assets

cat > "$BACKUP_DIR/manifest.txt" <<EOF
MoFaCTS self-hosted backup
created_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
database=$MOFACTS_MONGO_APP_DATABASE
settings_file=$(basename "$METEOR_SETTINGS_HOST_PATH")
includes_database_users_and_roles=true
includes_replica_set_keyfile=true
compose_file=$COMPOSE_FILE
EOF

echo "Backup written to $BACKUP_DIR"
