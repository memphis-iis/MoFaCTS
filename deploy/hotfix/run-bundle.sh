#!/bin/sh

set -eu

: "${APP_BUNDLE_FOLDER:?APP_BUNDLE_FOLDER is required}"
: "${METEOR_SETTINGS_WORKAROUND:?METEOR_SETTINGS_WORKAROUND is required}"
: "${EXPECTED_MONGO_DB_NAME:?EXPECTED_MONGO_DB_NAME is required}"

APP_BUNDLE_ROOT="$APP_BUNDLE_FOLDER"
BUNDLE_DIR="$APP_BUNDLE_ROOT/bundle"
SETTINGS_PATH="$METEOR_SETTINGS_WORKAROUND"
EXPECTED_DB="$EXPECTED_MONGO_DB_NAME"

if [ ! -f "$BUNDLE_DIR/main.js" ]; then
  echo "Missing hotfix bundle main.js at $BUNDLE_DIR/main.js. Rebuild the hotfix bundle before starting the app." >&2
  exit 1
fi

if [ ! -f "$BUNDLE_DIR/programs/server/node_modules/.package-lock.json" ] && [ ! -d "$BUNDLE_DIR/programs/server/node_modules" ]; then
  echo "Missing bundle server node_modules. Run hotfix-deps after building the bundle." >&2
  exit 1
fi

if [ ! -f "$SETTINGS_PATH" ]; then
  echo "Missing Meteor settings file at $SETTINGS_PATH" >&2
  exit 1
fi

if [ -z "${MONGO_URL:-}" ]; then
  echo "MONGO_URL is required." >&2
  exit 1
fi

MONGO_DB="$(printf '%s' "$MONGO_URL" | sed -E 's#^[^/]+//[^/]+/([^?]+).*#\1#')"
if [ "$MONGO_DB" != "$EXPECTED_DB" ]; then
  echo "MONGO_URL database '$MONGO_DB' does not match EXPECTED_MONGO_DB_NAME '$EXPECTED_DB'." >&2
  exit 1
fi

echo "[hotfix] Installing runtime OS dependencies..."
apk add --no-cache ca-certificates font-dejavu imagemagick

echo "[hotfix] Waiting for MongoDB..."
until node -e "
const net = require('net');
const url = new URL(process.env.MONGO_URL);
const socket = net.createConnection({ host: url.hostname, port: Number(url.port || 27017) });
socket.setTimeout(1000);
socket.on('connect', () => { socket.destroy(); process.exit(0); });
socket.on('timeout', () => { socket.destroy(); process.exit(1); });
socket.on('error', () => process.exit(1));
"; do
  sleep 1
done

export METEOR_SETTINGS_WORKAROUND="$SETTINGS_PATH"
cd "$BUNDLE_DIR"

echo "[hotfix] Starting local hotfix bundle..."
exec "$@"
