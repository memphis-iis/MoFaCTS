#!/usr/bin/env bash
# Existing root forced-command owner: acquire measurements and the shared
# protected receipt. Neither child grants another caller-selected command.
set -euo pipefail
export LC_ALL=C
collector=/usr/local/libexec/mofacts-security-audit/host-observations.sh
receipt_tool=/usr/local/libexec/mofacts-security-audit/release-receipt.sh
fail() { printf '{"error":"host-acquisition-unavailable"}\n'; exit 69; }
[[ $# == 0 && -z ${SSH_ORIGINAL_COMMAND:-} ]] || exit 64
[[ $(id -u) == 0 ]] || exit 77
safe() {
  local file=$1 directory mode
  [[ -f $file && ! -L $file && $(stat -c '%u:%g:%a:%h' "$file") == 0:0:755:1 ]] || return 1
  directory=$(dirname "$file")
  while :; do
    [[ -d $directory && ! -L $directory && $(stat -c '%u:%g' "$directory") == 0:0 ]] || return 1
    mode=$(stat -c %a "$directory")
    (( (8#$mode & 0022) == 0 || (8#$mode & 01000) != 0 )) || return 1
    [[ $directory != / ]] || break
    directory=$(dirname "$directory")
  done
}
for command in jq timeout head stat dirname; do command -v "$command" >/dev/null || fail; done
safe "$collector" && safe "$receipt_tool" || fail
measurements=$(timeout --kill-after=5s 180s "$collector" 2>/dev/null | head -c 49153) || fail
[[ ${#measurements} -le 49152 ]] || fail
receipt=$(timeout --kill-after=5s 150s "$receipt_tool" read-v2 2>/dev/null | head -c 8193) || fail
[[ ${#receipt} -le 8192 ]] || fail
# The Node owner validates the frozen nested measurement and receipt contracts.
# Unavailable receipt observations stay explicit and never become MATCH.
jq -cnS --argjson host "$measurements" --argjson receipt "$receipt" \
  '{schema:"MoFaCTSHostAuditAcquisitionV2",hostObservations:$host,releaseReceipt:$receipt}' || fail
