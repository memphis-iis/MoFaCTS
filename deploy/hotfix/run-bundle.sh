#!/bin/sh

set -eu

: "${APP_BUNDLE_FOLDER:?APP_BUNDLE_FOLDER is required}"
: "${METEOR_SETTINGS_FILE:?METEOR_SETTINGS_FILE is required}"
: "${EXPECTED_MONGO_DB_NAME:?EXPECTED_MONGO_DB_NAME is required}"

APP_BUNDLE_ROOT="$APP_BUNDLE_FOLDER"
BUNDLE_DIR="$APP_BUNDLE_ROOT/bundle"
SETTINGS_PATH="$METEOR_SETTINGS_FILE"

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

test "$(cat "$BUNDLE_DIR/.node_version.txt")" = "v24.15.0"
test "$(node --version)" = "v24.15.0"
test "$(npm --version)" = "11.12.1"

if [ -z "${MONGO_URL:-}" ]; then
  echo "MONGO_URL is required." >&2
  exit 1
fi

echo "[hotfix] Installing runtime OS dependencies..."
apk add --no-cache ca-certificates font-dejavu imagemagick

export METEOR_SETTINGS="$(cat "$SETTINGS_PATH")"
cd "$BUNDLE_DIR"

echo "[hotfix] Starting local hotfix bundle..."
exec "$@"
