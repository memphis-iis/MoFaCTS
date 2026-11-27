#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail

SERVER_NPM_ROOT="$APP_BUNDLE_FOLDER/bundle/programs/server/npm/node_modules/meteor"
ACCOUNTS_NPM_ROOT="$SERVER_NPM_ROOT/accounts-password/node_modules"
EMAIL_NPM_ROOT="$SERVER_NPM_ROOT/email/node_modules"
MINIFIER_CSS_NPM_ROOT="$SERVER_NPM_ROOT/minifier-css/node_modules"
WEBAPP_NPM_ROOT="$SERVER_NPM_ROOT/webapp/node_modules"
REPLACEMENT_MANIFEST="$(dirname -- "${BASH_SOURCE[0]}")/runtime-npm"
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
      throw new Error("Expected " + packageJson.name + "@" + process.argv[2] + ", found " + packageJson.version);
    }
  ' "$package_json" "$expected_version"
}

replace_package() {
  local root="$1"
  local name="$2"
  local source="$HARDENING_WORKDIR/node_modules/$name"
  local destination="$root/$name"
  local version
  version="$(node -e 'process.stdout.write(require(process.argv[1]).dependencies[process.argv[2]])' \
    "$HARDENING_WORKDIR/package.json" "$name")"
  assert_package_version "$source/package.json" "$version"
  test -f "$destination/package.json"
  rm -rf -- "$destination"
  mv -- "$source" "$destination"
  assert_package_version "$destination/package.json" "$version"
}

echo '[Function] Verify the upstream Meteor accounts-password native dependencies'
assert_package_version "$ACCOUNTS_NPM_ROOT/bcrypt/package.json" '6.0.0'
assert_package_version "$ACCOUNTS_NPM_ROOT/argon2/package.json" '0.44.0'
assert_package_version "$ACCOUNTS_NPM_ROOT/node-gyp-build/package.json" '4.8.4'
node -e '
  const bcrypt = require(process.argv[1]);
  const argon2 = require(process.argv[2]);
  Promise.all([bcrypt.hash("runtime-load-check", 4), argon2.hash("runtime-load-check")])
    .catch((error) => { console.error(error); process.exit(1); });
' "$ACCOUNTS_NPM_ROOT/bcrypt" "$ACCOUNTS_NPM_ROOT/argon2"

echo '[Function] Verify Meteor bundle versions before replacing runtime packages'
assert_package_version "$EMAIL_NPM_ROOT/openpgp/package.json" '5.11.1'
assert_package_version "$EMAIL_NPM_ROOT/nodemailer/package.json" '8.0.3'
assert_package_version "$WEBAPP_NPM_ROOT/tmp/package.json" '0.2.3'
assert_package_version "$MINIFIER_CSS_NPM_ROOT/postcss/package.json" '8.5.1'
assert_package_version "$MINIFIER_CSS_NPM_ROOT/nanoid/package.json" '3.3.15'
assert_package_version "$MINIFIER_CSS_NPM_ROOT/source-map-js/package.json" '1.2.1'
assert_package_version "$MINIFIER_CSS_NPM_ROOT/svgo/package.json" '2.8.2'
assert_package_version "$MINIFIER_CSS_NPM_ROOT/browserslist/package.json" '4.28.4'

echo '[Function] Install the locked runtime replacements with their own dependencies'
cp -- "$REPLACEMENT_MANIFEST/package.json" "$REPLACEMENT_MANIFEST/package-lock.json" "$HARDENING_WORKDIR/"
npm ci --prefix "$HARDENING_WORKDIR" --install-strategy=nested --omit=dev \
  --ignore-scripts --no-audit --no-fund

replace_package "$EMAIL_NPM_ROOT" openpgp
replace_package "$EMAIL_NPM_ROOT" nodemailer
replace_package "$WEBAPP_NPM_ROOT" tmp
for package in postcss nanoid source-map-js svgo browserslist baseline-browser-mapping \
  caniuse-lite electron-to-chromium node-releases update-browserslist-db
do
  replace_package "$MINIFIER_CSS_NPM_ROOT" "$package"
done

node - "$WEBAPP_NPM_ROOT" "$MINIFIER_CSS_NPM_ROOT" "$EMAIL_NPM_ROOT" <<'NODE'
const [webappRoot, minifierRoot, emailRoot] = process.argv.slice(2);
const tmp = require(webappRoot + '/tmp');
const postcss = require(minifierRoot + '/postcss');
const { nanoid } = require(minifierRoot + '/nanoid');
const { optimize } = require(minifierRoot + '/svgo');
const browserslist = require(minifierRoot + '/browserslist');
const nodemailer = require(emailRoot + '/nodemailer');
const temporaryFile = tmp.fileSync();
temporaryFile.removeCallback();
const css = postcss.parse('a{color:red}', { from: 'input.css' }).toResult({ map: { inline: false } });
if (css.root.nodes.length !== 1 || css.map.toJSON().sources.length !== 1) throw new Error('Patched PostCSS source map check failed');
if (nanoid(8).length !== 8) throw new Error('Patched nanoid failed its runtime load check');
if (!optimize('<svg xmlns="http://www.w3.org/2000/svg"/>').data) throw new Error('Patched SVGO failed its runtime load check');
if (!Array.isArray(browserslist('defaults')) || browserslist('defaults').length === 0) throw new Error('Patched browserslist failed its runtime load check');
const transport = nodemailer.createTransport({ jsonTransport: true });
transport.sendMail({ from: 'sender@example.invalid', to: 'recipient@example.invalid',
  subject: 'Runtime mail composition check', text: 'MoFaCTS runtime' }).then(result => {
  if (JSON.parse(result.message).text !== 'MoFaCTS runtime') throw new Error('Patched Nodemailer message check failed');
}).catch(error => { console.error(error); process.exitCode = 1; });
NODE
