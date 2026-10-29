#!/usr/bin/env bash
set -euo pipefail
cd /workspace/mofacts

# The bootstrap image supplies the CLI; the application selects the release.
test "$(tr -d '\r' < .meteor/release)" = 'METEOR@3.5.4'
test "$(meteor --version)" = 'Meteor 3.5.4'
test "$(meteor node --version)" = 'v24.22.1'
test "$(meteor npm --version)" = '11.19.1'
test "$(meteor node -p 'process.versions.undici')" = '7.30.1'
node_bin="$(meteor node -p 'process.execPath')"
ln -sf "$node_bin" /usr/local/bin/node

# npm ci owns the Linux dependencies. Reuse them only for the same lockfile
# and runtime; never import a host node_modules directory into this volume.
expected="$(sha256sum package-lock.json | cut -d ' ' -f 1):$(node --version)"
stamp=node_modules/.mofacts-linux-install
if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$expected" ]; then
  meteor npm ci
  printf '%s' "$expected" > "$stamp"
else
  meteor npm run postinstall
fi

# Generated Meteor bundles are CommonJS under the app's ESM package boundary.
printf '{"type":"commonjs"}\n' > .meteor/local/package.json
exec meteor run --port 3200 --settings /run/mofacts/settings.json
