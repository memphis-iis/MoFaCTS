#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail

SERVER_NPM_ROOT="$APP_BUNDLE_FOLDER/bundle/programs/server/npm/node_modules/meteor"
ACCOUNTS_NPM_ROOT="$SERVER_NPM_ROOT/accounts-password/node_modules"
EMAIL_NPM_ROOT="$SERVER_NPM_ROOT/email/node_modules"
FILES_NPM_ROOT="$SERVER_NPM_ROOT/ostrio_files/node_modules"
MINIFIER_CSS_NPM_ROOT="$SERVER_NPM_ROOT/minifier-css/node_modules"
WEBAPP_NPM_ROOT="$SERVER_NPM_ROOT/webapp/node_modules"
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

echo '[Function] Replace vulnerable Meteor bundle dependencies with patched releases'
assert_package_version "$WEBAPP_NPM_ROOT/tmp/package.json" '0.2.3'
assert_package_version "$FILES_NPM_ROOT/lodash/package.json" '4.17.21'
assert_package_version "$MINIFIER_CSS_NPM_ROOT/postcss/package.json" '8.5.1'
assert_package_version "$MINIFIER_CSS_NPM_ROOT/nanoid/package.json" '3.3.15'
assert_package_version "$MINIFIER_CSS_NPM_ROOT/svgo/package.json" '2.8.2'
assert_package_version "$EMAIL_NPM_ROOT/nodemailer/package.json" '8.0.3'
npm install --prefix "$HARDENING_WORKDIR/patched-runtime" \
  --omit=dev --no-save --package-lock=false \
  tmp@0.2.7 lodash@4.18.1 postcss@8.5.18 nanoid@3.3.18 svgo@2.8.3 nodemailer@9.0.1
for replacement in \
  "$WEBAPP_NPM_ROOT/tmp:$HARDENING_WORKDIR/patched-runtime/node_modules/tmp" \
  "$FILES_NPM_ROOT/lodash:$HARDENING_WORKDIR/patched-runtime/node_modules/lodash" \
  "$MINIFIER_CSS_NPM_ROOT/postcss:$HARDENING_WORKDIR/patched-runtime/node_modules/postcss" \
  "$MINIFIER_CSS_NPM_ROOT/nanoid:$HARDENING_WORKDIR/patched-runtime/node_modules/nanoid" \
  "$MINIFIER_CSS_NPM_ROOT/svgo:$HARDENING_WORKDIR/patched-runtime/node_modules/svgo" \
  "$EMAIL_NPM_ROOT/nodemailer:$HARDENING_WORKDIR/patched-runtime/node_modules/nodemailer"
do
  destination="${replacement%%:*}"
  source="${replacement#*:}"
  rm -rf "$destination"
  mv "$source" "$destination"
done
assert_package_version "$WEBAPP_NPM_ROOT/tmp/package.json" '0.2.7'
assert_package_version "$FILES_NPM_ROOT/lodash/package.json" '4.18.1'
assert_package_version "$MINIFIER_CSS_NPM_ROOT/postcss/package.json" '8.5.18'
assert_package_version "$MINIFIER_CSS_NPM_ROOT/nanoid/package.json" '3.3.18'
assert_package_version "$MINIFIER_CSS_NPM_ROOT/svgo/package.json" '2.8.3'
assert_package_version "$EMAIL_NPM_ROOT/nodemailer/package.json" '9.0.1'
node - "$WEBAPP_NPM_ROOT" "$FILES_NPM_ROOT" "$MINIFIER_CSS_NPM_ROOT" "$EMAIL_NPM_ROOT" <<'NODE'
const [webappRoot, filesRoot, minifierRoot, emailRoot] = process.argv.slice(2);
const tmp = require(`${webappRoot}/tmp`);
const lodash = require(`${filesRoot}/lodash`);
const postcss = require(`${minifierRoot}/postcss`);
const { nanoid } = require(`${minifierRoot}/nanoid`);
const { optimize } = require(`${minifierRoot}/svgo`);
const nodemailer = require(`${emailRoot}/nodemailer`);
const temporaryFile = tmp.fileSync();
temporaryFile.removeCallback();
if (lodash.chunk([1, 2], 1).length !== 2) throw new Error('Patched lodash failed its runtime load check');
if (postcss.parse('a{color:red}').nodes.length !== 1) throw new Error('Patched postcss failed its runtime load check');
if (nanoid(8).length !== 8) throw new Error('Patched nanoid failed its runtime load check');
if (!optimize('<svg xmlns="http://www.w3.org/2000/svg"/>').data) throw new Error('Patched svgo failed its runtime load check');
if (typeof nodemailer.createTransport !== 'function') throw new Error('Patched nodemailer failed its runtime load check');
NODE
