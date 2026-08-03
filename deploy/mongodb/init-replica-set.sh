#!/usr/bin/env bash
set -Eeuo pipefail

required=(
  MONGO_INITDB_ROOT_USERNAME
  MONGO_INITDB_ROOT_PASSWORD
  MOFACTS_MONGO_REPLICA_SET_NAME
  MOFACTS_MONGO_REPLICA_SET_MEMBER
)

for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo >&2 "${name} is required for replica-set initialization."
    exit 1
  fi
done

for _ in {1..60}; do
  if mongosh --quiet \
    --host mongodb:27017 \
    --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval 'quit(db.adminCommand({ping:1}).ok === 1 ? 0 : 1)' >/dev/null 2>&1; then
    exec mongosh --quiet \
      --host mongodb:27017 \
      --username "$MONGO_INITDB_ROOT_USERNAME" \
      --password "$MONGO_INITDB_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      /opt/mofacts-mongodb/init-replica-set.js
  fi
  sleep 2
done

echo >&2 'MongoDB did not accept an authenticated connection before replica-set initialization timed out.'
exit 1
