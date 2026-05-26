#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:-}"
ENV_FILE="${ENV_FILE:-.env.self-hosted}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
CONFIRM="${CONFIRM_DESTRUCTIVE_RESTORE:-}"

if [ -z "$BACKUP_DIR" ]; then
  echo "Usage: CONFIRM_DESTRUCTIVE_RESTORE=restore-overwrite ENV_FILE=.env.self-hosted ./restore-self-hosted.sh ./backups/mofacts-YYYYMMDD-HHMMSS" >&2
  exit 2
fi

if [ "$CONFIRM" != "restore-overwrite" ]; then
  echo "Refusing destructive restore. Set CONFIRM_DESTRUCTIVE_RESTORE=restore-overwrite to overwrite current MongoDB state." >&2
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

ARCHIVE="$BACKUP_DIR/mongo/${MOFACTS_MONGO_APP_DATABASE}.archive"
if [ ! -f "$ARCHIVE" ]; then
  echo "Mongo archive not found: $ARCHIVE" >&2
  exit 2
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T mongodb \
  mongorestore \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --drop \
  --archive < "$ARCHIVE"

for archive_path in \
  "$BACKUP_DIR/assets/dynamic-assets.tar:/dynamic-assets" \
  "$BACKUP_DIR/h5p-content/h5p-content.tar:/h5p-content" \
  "$BACKUP_DIR/h5p-libraries/h5p-libraries.tar:/h5p-libraries"; do
  source_archive="${archive_path%%:*}"
  target_dir="${archive_path##*:}"
  if [ ! -f "$source_archive" ]; then
    echo "State archive not found: $source_archive" >&2
    exit 2
  fi
  mkdir -p "$target_dir"
  tar -C / -xf "$source_archive"
done

echo "Restore completed from $BACKUP_DIR"
