#!/usr/bin/env bash
# Owner-operated installation; observation-only reading from the existing forced
# command. The running application's Node executes the one shared wire parser.
set -euo pipefail
export LC_ALL=C
CONFIG_FILE=/etc/mofacts/security-audit.conf
RECEIPT_FILE=/etc/mofacts/release-receipt.json
MODULE_FILE=/usr/local/libexec/mofacts-security-audit/releaseReceipt.mjs

action="${1:-}"
fail() {
  printf '{"state":"unavailable","reason":"%s"}\n' "$1"
  if [[ "$action" == read ]]; then exit 0; else exit 1; fi
}
secure_file() {
  [[ -f "$1" && ! -L "$1" && "$(stat -c '%u:%g:%a:%h' -- "$1")" == "0:0:$2:1" ]]
}
secure_directory() {
  local target="$1" mode
  while :; do
    [[ -d "$target" && ! -L "$target" && "$(stat -c '%u:%g' -- "$target")" == 0:0 ]] || return 1
    mode="$(stat -c '%a' -- "$target")"
    [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
    # A root-owned child in a root-owned sticky /tmp is also safe from rename
    # by another uid. Every child component is checked independently.
    (( (8#$mode & 0022) == 0 || (8#$mode & 01000) != 0 )) || return 1
    [[ "$target" != / ]] || break
    target="$(dirname -- "$target")"
  done
}
[[ $# -eq 1 && ( "$1" == read || "$1" == install ) ]] || fail invalid-action
[[ "$(id -u)" == 0 ]] || fail root-required
secure_directory /etc || fail unsafe-directory
secure_directory "$(dirname -- "$CONFIG_FILE")" || fail unsafe-directory
secure_directory "$(dirname -- "$MODULE_FILE")" || fail unsafe-directory
secure_file "$CONFIG_FILE" 600 || fail protected-config-unavailable
secure_file "$MODULE_FILE" 644 || fail protected-parser-unavailable
[[ "$(stat -c '%s' -- "$MODULE_FILE")" -le 16384 ]] || fail protected-parser-unavailable
command -v jq >/dev/null || fail jq-required
# This existing root-only file owns the selected application container. No
# credentials or other configuration values are passed to Node or its output.
# shellcheck disable=SC1090
source "$CONFIG_FILE"
[[ "${MOFACTS_APP_CONTAINER:-}" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]] || fail invalid-container
identity="$(docker inspect --format '{{.Id}} {{.State.Running}} {{.Image}}' "$MOFACTS_APP_CONTAINER" 2>/dev/null)" || fail running-image-unavailable
read -r container_id running image_id extra <<<"$identity"
[[ "$container_id" =~ ^[a-f0-9]{64}$ && "$running" == true && "$image_id" =~ ^sha256:[a-f0-9]{64}$ && -z "$extra" ]] || fail running-image-unavailable
revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_id" 2>/dev/null)" || fail running-image-unavailable
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || fail running-image-unavailable
module_source="$(cat -- "$MODULE_FILE")"
observe() {
  local result
  result="$(docker exec -i "$container_id" node --input-type=module \
    -e "$module_source"$'\nawait runReceiptCli(process.argv.slice(1));' \
    "$image_id" "$revision" < "$1" 2>/dev/null)" || return 1
  [[ "$(docker inspect --format '{{.Id}}' "$MOFACTS_APP_CONTAINER" 2>/dev/null)" == "$container_id" ]] || return 1
  printf '%s\n' "$result"
}
if [[ "$1" == read ]]; then
  [[ -e "$RECEIPT_FILE" || -L "$RECEIPT_FILE" ]] || fail not-installed
  secure_file "$RECEIPT_FILE" 600 || fail unsafe-receipt
  [[ "$(stat -c '%s' -- "$RECEIPT_FILE")" -le 8192 ]] || fail invalid-receipt
  observe "$RECEIPT_FILE" || fail receipt-observation-failed
  exit 0
fi

umask 077
parent="$(dirname -- "$RECEIPT_FILE")"
lock="$RECEIPT_FILE.lock"
mkdir -- "$lock" 2>/dev/null || fail receipt-writer-busy
temporary=''
cleanup() {
  if [[ -n "$temporary" ]]; then rm -f -- "$temporary"; fi
  rmdir -- "$lock"
}
trap cleanup EXIT
if [[ -e "$RECEIPT_FILE" || -L "$RECEIPT_FILE" ]]; then
  secure_file "$RECEIPT_FILE" 600 || fail unsafe-receipt
  [[ "$(stat -c '%s' -- "$RECEIPT_FILE")" -le 8192 ]] || fail invalid-receipt
  previous="$(observe "$RECEIPT_FILE")" || fail invalid-receipt
  jq -e '.state == "observed"' <<<"$previous" >/dev/null || fail invalid-receipt
fi
temporary="$(mktemp "$parent/.release-receipt.XXXXXXXX")" || fail receipt-write-failed
head -c 8193 > "$temporary"
[[ "$(stat -c '%s' -- "$temporary")" -le 8192 ]] || fail invalid-receipt
observation="$(observe "$temporary")" || fail receipt-observation-failed
jq -e '.state == "observed" and .result == "MATCH"' <<<"$observation" >/dev/null || fail receipt-image-mismatch
# Only parser-projected fields reach the protected file; arbitrary input never
# becomes host evidence. This MATCH is identity comparison, not qualification.
jq -c '.receipt' <<<"$observation" > "$temporary"
chmod 600 -- "$temporary"
sync -f "$temporary"
mv -T -- "$temporary" "$RECEIPT_FILE"
temporary=''
sync -f "$parent"
secure_file "$RECEIPT_FILE" 600 || fail receipt-readback-failed
readback="$(observe "$RECEIPT_FILE")" || fail receipt-readback-failed
jq -e '.state == "observed" and .result == "MATCH"' <<<"$readback" >/dev/null || fail receipt-readback-failed
printf '%s\n' '{"state":"receipt-installed-unqualified"}'
