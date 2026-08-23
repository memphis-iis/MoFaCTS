#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail

SERVER_NPM_ROOT="$APP_BUNDLE_FOLDER/bundle/programs/server/npm/node_modules/meteor"
ACCOUNTS_NPM_ROOT="$SERVER_NPM_ROOT/accounts-password/node_modules"
EMAIL_NPM_ROOT="$SERVER_NPM_ROOT/email/node_modules"
HARDENING_WORKDIR="$(mktemp -d)"

cleanup() {
  rm -rf "$HARDENING_WORKDIR"
}
trap cleanup EXIT

assert_package_version() {
  local package_json="$1"
  local expected_version="$2"
  node -e '
    const packageJson = require(process.argv[1]);
    if (packageJson.version !== process.argv[2]) {
      throw new Error(`Expected ${packageJson.name}@${process.argv[2]}, found ${packageJson.name}@${packageJson.version}`);
    }
  ' "$package_json" "$expected_version"
}

echo '[Function] Replace Meteor accounts-password native dependencies with pinned runtime releases'
assert_package_version "$ACCOUNTS_NPM_ROOT/bcrypt/package.json" '5.0.1'
npm install --prefix "$HARDENING_WORKDIR/accounts-password" \
  --omit=dev --no-save --package-lock=false \
  bcrypt@6.0.0 argon2@0.41.1 node-gyp-build@4.8.4
rm -rf "$ACCOUNTS_NPM_ROOT"
mv "$HARDENING_WORKDIR/accounts-password/node_modules" "$ACCOUNTS_NPM_ROOT"
node -e '
  const bcrypt = require(process.argv[1]);
  const argon2 = require(process.argv[2]);
  Promise.all([bcrypt.hash("runtime-load-check", 4), argon2.hash("runtime-load-check")])
    .catch((error) => { console.error(error); process.exit(1); });
' "$ACCOUNTS_NPM_ROOT/bcrypt" "$ACCOUNTS_NPM_ROOT/argon2"

echo '[Function] Replace vulnerable OpenPGP runtime with the upstream patched release'
assert_package_version "$EMAIL_NPM_ROOT/openpgp/package.json" '5.11.1'
npm install --prefix "$HARDENING_WORKDIR/email" \
  --omit=dev --no-save --package-lock=false \
  openpgp@5.11.3
rm -rf "$EMAIL_NPM_ROOT/openpgp"
mv "$HARDENING_WORKDIR/email/node_modules/openpgp" "$EMAIL_NPM_ROOT/openpgp"
assert_package_version "$EMAIL_NPM_ROOT/openpgp/package.json" '5.11.3'
