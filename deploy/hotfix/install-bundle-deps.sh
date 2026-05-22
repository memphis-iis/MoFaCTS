#!/bin/sh

set -eu

: "${LOCAL_HOTFIX_BUNDLE_DIR:?LOCAL_HOTFIX_BUNDLE_DIR is required}"
OUTPUT_ROOT="$LOCAL_HOTFIX_BUNDLE_DIR"
SERVER_DIR="$OUTPUT_ROOT/bundle/programs/server"

if [ ! -f "$OUTPUT_ROOT/bundle/main.js" ]; then
  echo "Missing hotfix bundle at $OUTPUT_ROOT/bundle. Run hotfix-builder first." >&2
  exit 1
fi

if [ ! -f "$SERVER_DIR/package.json" ]; then
  echo "Missing Meteor server package.json at $SERVER_DIR/package.json" >&2
  exit 1
fi

cd "$SERVER_DIR"

chmod -R u+rwX "$OUTPUT_ROOT/bundle"

echo "[hotfix] Installing native build dependencies for Meteor server packages..."
apk add --no-cache bash g++ make python3

echo "[hotfix] Pinning runtime transitive dependencies..."
npm pkg set "dependencies.@mapbox/node-pre-gyp=2.0.3"
npm pkg set "dependencies.node-gyp=12.2.0"
npm pkg set "dependencies.underscore=1.13.8"

echo "[hotfix] Installing Meteor bundle server npm dependencies..."
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "[hotfix] Auditing installed runtime dependencies..."
npm audit --audit-level=high

date -u +"%Y-%m-%dT%H:%M:%SZ" > "$OUTPUT_ROOT/bundle/.hotfix-deps-installed-at"
echo "[hotfix] Bundle dependencies ready."
