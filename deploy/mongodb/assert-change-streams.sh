#!/usr/bin/env bash
set -euo pipefail

mongosh \
  --quiet \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  /opt/mofacts-mongodb/assert-change-streams.js
