#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail

APP_DIR=/workspace/mofacts
: "${LOCAL_HOTFIX_BUNDLE_DIR:?LOCAL_HOTFIX_BUNDLE_DIR is required}"
OUTPUT_ROOT="$LOCAL_HOTFIX_BUNDLE_DIR"
OUTPUT_DIR="$OUTPUT_ROOT/build-output"
NODE_MODULES_DIR="$APP_DIR/node_modules"
LOCKFILE="$APP_DIR/package-lock.json"
LOCK_HASH_FILE="$NODE_MODULES_DIR/.mofacts-hotfix-package-lock.sha256"

if [ ! -f "$LOCKFILE" ]; then
  echo "Missing package-lock.json at $LOCKFILE" >&2
  exit 1
fi

cd "$APP_DIR"

CURRENT_LOCK_HASH="$(sha256sum "$LOCKFILE" | awk '{print $1}')"
INSTALLED_LOCK_HASH=""
if [ -f "$LOCK_HASH_FILE" ]; then
  INSTALLED_LOCK_HASH="$(cat "$LOCK_HASH_FILE")"
fi

if [ "$CURRENT_LOCK_HASH" != "$INSTALLED_LOCK_HASH" ] || [ ! -d "$NODE_MODULES_DIR/.bin" ]; then
  echo "[hotfix] Installing Linux Meteor npm dependencies..."
  METEOR_ALLOW_SUPERUSER=1 meteor npm ci
  echo "$CURRENT_LOCK_HASH" > "$LOCK_HASH_FILE"
else
  echo "[hotfix] Reusing cached Linux Meteor npm dependencies."
fi

echo "[hotfix] Building Meteor bundle into $OUTPUT_DIR..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

NODE_PATH="$APP_DIR/node_modules:/root/.meteor/packages/node_modules" \
  TOOL_NODE_FLAGS=--max-old-space-size=8000 \
  meteor build --allow-incompatible-update --allow-superuser --directory "$OUTPUT_DIR" --server-only

if [ ! -f "$OUTPUT_DIR/bundle/main.js" ]; then
  echo "Meteor build completed without producing $OUTPUT_DIR/bundle/main.js" >&2
  exit 1
fi

rm -rf "$OUTPUT_ROOT/bundle"
mv "$OUTPUT_DIR/bundle" "$OUTPUT_ROOT/bundle"
rm -rf "$OUTPUT_DIR"
chmod -R u+rwX,go+rX "$OUTPUT_ROOT/bundle"

date -u +"%Y-%m-%dT%H:%M:%SZ" > "$OUTPUT_ROOT/bundle/.hotfix-built-at"
git -C /workspace rev-parse HEAD > "$OUTPUT_ROOT/bundle/.hotfix-git-sha"

echo "[hotfix] Bundle ready at $OUTPUT_ROOT/bundle"
