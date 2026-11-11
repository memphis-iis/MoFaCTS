#!/usr/bin/env bash
# Explicit optional-tool preparation. Running this downloads/installs software
# only in a private temporary workspace and requires separate execution approval.
set -euo pipefail
umask 077
if [[ $# -ne 1 || ! "$1" =~ ^[a-f0-9]{40}$ ]]; then
  echo 'Operator preparation requires one reviewed source commit.' >&2
  exit 1
fi
expected_commit="$1"
source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
if [[ "$(git -C "$source_root" rev-parse HEAD)" != "$expected_commit" || -n "$(git -C "$source_root" status --porcelain=v1 --untracked-files=all)" ]]; then
  echo 'Operator preparation requires the clean reviewed checkout.' >&2
  exit 1
fi
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'Operator preparation supports the verified Linux x86_64 lane only.' >&2
  exit 1
fi
for executable in node curl tar sha256sum git env mktemp awk timeout; do command -v "$executable" >/dev/null; done
tool_package="$source_root/deploy/security-audit/recovery-transfer/aws"
node_pin="$(env -i PATH="$PATH" node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).engines.node' "$tool_package/package.json")"
npm_pin="$(env -i PATH="$PATH" node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).engines.npm' "$tool_package/package.json")"
[[ "$node_pin" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$npm_pin" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
workspace="$(mktemp -d /tmp/mofacts-recovery-operator.XXXXXXXX)"
trap 'echo "Operator preparation stopped; preserve the owned workspace: $workspace" >&2' ERR
mkdir -m 700 "$workspace/npm-home" "$workspace/npm-cache" "$workspace/downloads"
# npm rejects one file being loaded as both user and global configuration.
# Keep both scopes empty and distinct inside the owned private workspace.
: > "$workspace/npm-user.conf"
: > "$workspace/npm-global.conf"
archive="node-v${node_pin}-linux-x64.tar.xz"
vendor="https://nodejs.org/dist/v${node_pin}"
env -i PATH="$PATH" curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 120 "$vendor/$archive" -o "$workspace/downloads/$archive"
env -i PATH="$PATH" curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 60 "$vendor/SHASUMS256.txt" -o "$workspace/downloads/SHASUMS256.txt"
(
  cd "$workspace/downloads"
  # Exact filename and exactly one vendor checksum; no guessed archive/version.
  awk -v file="$archive" '$2 == file { print; found++ } END { if (found != 1) exit 1 }' SHASUMS256.txt > selected.sha256
  sha256sum --check --status selected.sha256
)
tar -xJf "$workspace/downloads/$archive" -C "$workspace"
runtime_path="$workspace/node-v${node_pin}-linux-x64/bin:$PATH"
[[ "$(env -i PATH="$runtime_path" node --version)" == "v$node_pin" ]]
lock_before="$(sha256sum "$tool_package/package-lock.json")"
app_package="$source_root/mofacts"
app_lock_before="$(sha256sum "$app_package/package-lock.json")"
# The verified vendor archive carries the matching pinned npm. Check both pins
# before any dependency install. Credentials never reach npm or tests.
[[ "$(env -i PATH="$runtime_path" HOME="$workspace/npm-home" NPM_CONFIG_USERCONFIG="$workspace/npm-user.conf" NPM_CONFIG_GLOBALCONFIG="$workspace/npm-global.conf" npm --version)" == "$npm_pin" ]]
(
  # Shared recovery/strict-JSON code resolves the existing app-owned acorn
  # dependency. Prepare its owning lockfile rather than relying on a developer
  # checkout's node_modules or a separate parser implementation.
  cd "$app_package"
  timeout 300 env -i PATH="$runtime_path" HOME="$workspace/npm-home" NPM_CONFIG_USERCONFIG="$workspace/npm-user.conf" NPM_CONFIG_GLOBALCONFIG="$workspace/npm-global.conf" NPM_CONFIG_CACHE="$workspace/npm-cache" \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund > "$workspace/shared-runtime-install.log" 2>&1
)
(
  cd "$tool_package"
  timeout 300 env -i PATH="$runtime_path" HOME="$workspace/npm-home" NPM_CONFIG_USERCONFIG="$workspace/npm-user.conf" NPM_CONFIG_GLOBALCONFIG="$workspace/npm-global.conf" NPM_CONFIG_CACHE="$workspace/npm-cache" \
    npm ci --ignore-scripts --no-audit --no-fund > "$workspace/sdk-install.log" 2>&1
  timeout 120 env -i PATH="$runtime_path" HOME="$workspace/npm-home" NPM_CONFIG_USERCONFIG="$workspace/npm-user.conf" NPM_CONFIG_GLOBALCONFIG="$workspace/npm-global.conf" NODE_OPTIONS='' npm test > "$workspace/sdk-tests.log" 2>&1
)
[[ "$(sha256sum "$tool_package/package-lock.json")" == "$lock_before" ]]
[[ "$(sha256sum "$app_package/package-lock.json")" == "$app_lock_before" ]]
[[ "$(git -C "$source_root" rev-parse HEAD)" == "$expected_commit" && -z "$(git -C "$source_root" status --porcelain=v1 --untracked-files=all)" ]]
trap - ERR
printf 'Operator runtime prepared. Private workspace: %s\nRuntime PATH prefix: %s\n' "$workspace" "$runtime_path"
