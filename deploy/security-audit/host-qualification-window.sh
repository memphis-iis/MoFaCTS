#!/usr/bin/env bash
# Root operator only. A bounded staging2 test window with mandatory restoration.
# This is never added to the audit account's sudo policy or forced SSH command.
set -euo pipefail
umask 077
export LC_ALL=C
COMMAND_FILE=/usr/local/sbin/mofacts-host-exposure-audit
LIBRARY_DIR=/usr/local/libexec/mofacts-security-audit
CONFIG_FILE=/etc/mofacts/security-audit.conf
LOCK_DIRECTORY=/run/mofacts-security-audit
MAX_WINDOW_SECONDS=300
action=${1:?run or restore}
job=${2:?private staged qualification directory}
packet_digest=${3:?operator-verified packet digest}
baseline_digest=${4:?operator-verified baseline digest}
controller_digest=${5:?operator-verified controller digest}
[[ $# == 5 && $(id -u) == 0 && ( $action == run || $action == restore ) ]]
[[ $job =~ ^/var/tmp/mofacts-host-qualification\.[A-Za-z0-9]{12}$ && ! -L $job && $(realpath "$job") == "$job" ]]
[[ $packet_digest =~ ^[0-9a-f]{64}$ && $baseline_digest =~ ^[0-9a-f]{64}$ && $controller_digest =~ ^[0-9a-f]{64}$ ]]
for tool in jq sha256sum stat install mv cp timeout flock; do command -v "$tool" >/dev/null; done

safe_file() {
  local file=$1 mode=$2 directory permissions
  [[ -f $file && ! -L $file && $(stat -c '%u:%g:%a:%h' "$file") == "0:0:$mode:1" ]] || return 1
  directory=$(dirname "$file")
  while [[ $directory != / ]]; do
    [[ -d $directory && ! -L $directory && $(stat -c '%u:%g' "$directory") == 0:0 ]] || return 1
    permissions=$(stat -c %a "$directory"); (( (8#$permissions & 0022) == 0 )) || return 1
    directory=$(dirname "$directory")
  done
}
digest() { sha256sum "$1" | cut -d' ' -f1; }
[[ $(digest "$job/packet-manifest.json") == "$packet_digest" && $(digest "$job/preflight.json") == "$baseline_digest"
  && $(digest "$job/operator-controller.sh") == "$controller_digest" ]]
if [[ $action == run ]]; then
  [[ -z $(find "$job" -xdev -type l -print -quit) ]]
  [[ -z $(find "$job" -xdev ! -type f ! -type d -print -quit) ]]
  [[ $(find "$job" -xdev -type f | wc -l) == 12 ]]
  while IFS= read -r file; do [[ $(stat -c %h "$file") == 1 && $(stat -c %s "$file") -le 65536 ]]; done < <(find "$job" -xdev -type f)
  chown -Rh 0:0 "$job"
  chmod 0700 "$job"
  chmod 0600 "$job/operator-controller.sh"
else
  [[ $(stat -c '%u:%g:%a' "$job") == 0:0:700 && -f $job/invoked ]]
fi
[[ $(digest "$job/packet-manifest.json") == "$packet_digest" && $(digest "$job/preflight.json") == "$baseline_digest"
  && $(digest "$job/operator-controller.sh") == "$controller_digest" ]]
if [[ $action == run ]]; then [[ ! -e $job/invoked ]]; fi
safe_file "$CONFIG_FILE" 600
unset MOFACTS_PUBLIC_HOSTNAME
source "$CONFIG_FILE" >/dev/null 2>&1
[[ ${MOFACTS_PUBLIC_HOSTNAME:-} == staging2.optimallearning.org ]]
if [[ ! -e $LOCK_DIRECTORY ]]; then mkdir -m 0700 "$LOCK_DIRECTORY"; fi
[[ -d $LOCK_DIRECTORY && ! -L $LOCK_DIRECTORY && $(stat -c '%u:%g:%a' "$LOCK_DIRECTORY") == 0:0:700 ]]
if [[ -e $LOCK_DIRECTORY/qualification.lock || -L $LOCK_DIRECTORY/qualification.lock ]]; then safe_file "$LOCK_DIRECTORY/qualification.lock" 600; fi
exec 9> "$LOCK_DIRECTORY/qualification.lock"
flock -n 9

manifest=$job/packet-manifest.json
baseline=$job/preflight.json
expected=$(jq -cn --arg command "$COMMAND_FILE" --arg library "$LIBRARY_DIR/" '[
 {source:"deploy/security-audit/host-observations.sh",destination:$command,mode:"0755",owner:"root:root"},
 {source:"mofacts/common/securityAudit/catalogs/host-measurements.v1.json",destination:($library+"host-measurements.v1.json"),mode:"0644",owner:"root:root"},
 (["host-mongo-connectivity.js","host-listener-policy.awk","host-firewall-policy.awk","host-apache-policy.awk","host-sidecar-policy.jq","host-mongo-roles.js"][] |
   {source:("deploy/security-audit/"+.),destination:($library+.),mode:"0644",owner:"root:root"}),
 {source:"deploy/mongodb/read-default-concern-role.json",destination:($library+"read-default-concern-role.json"),mode:"0644",owner:"root:root"}]')
jq -e --argjson expected "$expected" 'keys==["files","nativeReceiptSha256","sourceCommit","state"] and .state=="prepared-not-installed"
  and (.sourceCommit|test("^[0-9a-f]{40}$")) and (.nativeReceiptSha256|test("^[0-9a-f]{64}$"))
  and (.files|length)==9 and ([.files[]|del(.sha256)]==$expected)
  and all(.files[]; keys==["destination","mode","owner","sha256","source"] and (.sha256|test("^[0-9a-f]{64}$")))' "$manifest" >/dev/null
expected_members=$(jq -r '.files[].source|"public-source/"+.' "$manifest"; printf '%s\n' packet-manifest.json preflight.json operator-controller.sh)
if [[ $action == run ]]; then [[ $(find "$job" -xdev -type f -printf '%P\n' | sort) == $(sort <<<"$expected_members") ]]; fi
jq -e --argjson expected "$expected" '.state=="staging2-host-preflight" and .configurationTargetMatched==true and .configurationRootOnly==true
  and (.files|length)==9 and ([.files[].path]==[$expected[].destination]) and (.containers|length)==3' "$baseline" >/dev/null
rows=$(jq -c '.files[]' "$manifest")
verify_baseline() {
  local row destination present owner hash uid gid mode links
  while IFS= read -r row; do
    destination=$(jq -r .path <<<"$row"); present=$(jq -r .present <<<"$row")
    if [[ $present == true ]]; then
      [[ -f $destination && ! -L $destination ]]
      owner=$(jq -r .ownerModeLinks <<<"$row"); hash=$(jq -r .sha256 <<<"$row")
      [[ $(stat -c '%u:%g:%a:%h' "$destination") == "$owner" && $(digest "$destination") == "$hash" ]] || return 1
      IFS=: read -r uid gid mode links <<<"$owner"
      safe_file "$destination" "$mode" || return 1
    else [[ ! -e $destination && ! -L $destination ]] || return 1; fi
  done < <(jq -c '.files[]' "$baseline")
}
verify_policies() {
  local row policy
  while IFS= read -r row; do
    policy=$(jq -r .path <<<"$row")
    [[ -f $policy && ! -L $policy && $(digest "$policy") == "$(jq -r .sha256 <<<"$row")"
      && $(stat -c '%u:%g:%a:%h' "$policy") == "$(jq -r .ownerModeLinks <<<"$row")" ]] || return 1
  done < <(jq -c '.policyFingerprints[]' "$baseline")
}
while IFS= read -r row; do
  source=$(jq -r .source <<<"$row"); destination=$(jq -r .destination <<<"$row"); mode=$(jq -r .mode <<<"$row"); hash=$(jq -r .sha256 <<<"$row")
  [[ -f $job/public-source/$source && ! -L $job/public-source/$source && $(digest "$job/public-source/$source") == "$hash" ]]
  # The existing six shared helpers must already match. Their upgrade is not
  # part of this window; only the entry point and two added V2 files may change.
  if [[ $destination != "$COMMAND_FILE" && $destination != "$LIBRARY_DIR/host-measurements.v1.json" && $destination != "$LIBRARY_DIR/host-mongo-connectivity.js" ]]; then
    [[ $(digest "$destination") == "$hash" ]]
  fi
done <<<"$rows"
installation_started=false
temporary=''
replace_file() {
  local source=$1 destination=$2 mode=$3
  temporary=$(mktemp "$(dirname "$destination")/.mofacts-audit-qualification.XXXXXXXXXXXX")
  install -o root -g root -m "$mode" -- "$source" "$temporary"
  mv -T -- "$temporary" "$destination"
  temporary=''
}
restore_one() {
  local destination=$1 before candidate present expected_hash actual mode
  before=$(jq -c --arg destination "$destination" '.files[]|select(.path==$destination)' "$baseline")
  candidate=$(jq -c --arg destination "$destination" '.files[]|select(.destination==$destination)' "$manifest")
  present=$(jq -r .present <<<"$before"); expected_hash=$(jq -r .sha256 <<<"$candidate")
  if [[ -e $destination || -L $destination ]]; then
    [[ -f $destination && ! -L $destination ]] || return 1
    actual=$(digest "$destination")
    if [[ $present == true && $actual == "$(jq -r .sha256 <<<"$before")" ]]; then
      [[ $(stat -c '%u:%g:%a:%h' "$destination") == "$(jq -r .ownerModeLinks <<<"$before")" ]] || return 1
      return 0
    fi
    [[ $actual == "$expected_hash" ]] || return 1
    mode=$(jq -r .mode <<<"$candidate")
    safe_file "$destination" "${mode#0}" || return 1
    if [[ $present == true ]]; then
      [[ -f $job/rollback/$(basename "$destination") && ! -L $job/rollback/$(basename "$destination")
        && $(digest "$job/rollback/$(basename "$destination")") == "$(jq -r .sha256 <<<"$before")" ]] || return 1
      replace_file "$job/rollback/$(basename "$destination")" "$destination" "$(jq -r .mode <<<"$candidate")" || return 1
    else rm -- "$destination" || return 1; fi
  elif [[ $present == true ]]; then return 1; fi
}
perform_restoration() {
  local containers
  restoration=0
    restore_one "$COMMAND_FILE" || restoration=1
    restore_one "$LIBRARY_DIR/host-measurements.v1.json" || restoration=1
    restore_one "$LIBRARY_DIR/host-mongo-connectivity.js" || restoration=1
    verify_baseline || restoration=1
    verify_policies || restoration=1
    containers=$(docker inspect mofacts staging2-mongodb-1 staging2-redis-1 --format \
      '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"startedAt":{{json .State.StartedAt}},"running":{{json .State.Running}},"health":{{json .State.Health.Status}}}' | jq -s .)
    jq -e --argjson containers "$containers" '.containers==$containers and all($containers[];.running==true and .health=="healthy")' "$baseline" >/dev/null || restoration=1
  if [[ -n $temporary && $temporary == */.mofacts-audit-qualification.* && -f $temporary && ! -L $temporary ]]; then rm -- "$temporary"; fi
  return "$restoration"
}
cleanup() {
  local result=$? restoration=0
  trap - EXIT HUP INT TERM
  set +e
  if [[ $installation_started == true ]]; then perform_restoration || restoration=1; fi
  jq -cn --argjson result "$result" --argjson restoration "$restoration" --arg source "$(jq -r .sourceCommit "$manifest")" \
    '{state:"host-window-finished",sourceCommit:$source,operationExit:$result,restorationExit:$restoration}' > "$job/result.json"
  cat "$job/result.json"
  [[ $restoration == 0 ]] || exit 1
  exit "$result"
}
if [[ $action == restore ]]; then
  [[ $(cat "$job/invoked") == "$(jq -r .sourceCommit "$manifest")" && $(stat -c '%u:%g:%a' "$job/rollback") == 0:0:700 ]]
  restoration=0
  perform_restoration || restoration=1
  jq -cn --argjson restoration "$restoration" --arg source "$(jq -r .sourceCommit "$manifest")" \
    '{state:"host-window-recovered",sourceCommit:$source,operationExit:null,restorationExit:$restoration}' > "$job/recovery-result.json"
  cat "$job/recovery-result.json"
  exit "$restoration"
fi
verify_baseline
verify_policies
mkdir -m 0700 "$job/rollback"
while IFS= read -r row; do
  destination=$(jq -r .destination <<<"$row"); mode=$(jq -r .mode <<<"$row")
  if [[ -e $destination ]]; then
    safe_file "$destination" "${mode#0}"
    cp --preserve=mode,ownership,timestamps -- "$destination" "$job/rollback/$(basename "$destination")"
    [[ $(digest "$job/rollback/$(basename "$destination")") == "$(jq -r --arg destination "$destination" '.files[]|select(.path==$destination)|.sha256' "$baseline")" ]]
  fi
done <<<"$rows"
verify_baseline
printf '%s\n' "$(jq -r .sourceCommit "$manifest")" > "$job/invoked"
trap cleanup EXIT
trap 'exit 143' HUP TERM
trap 'exit 130' INT
installation_started=true
for destination in "$LIBRARY_DIR/host-measurements.v1.json" "$LIBRARY_DIR/host-mongo-connectivity.js" "$COMMAND_FILE"; do
  row=$(jq -c --arg destination "$destination" '.files[]|select(.destination==$destination)' "$manifest")
  replace_file "$job/public-source/$(jq -r .source <<<"$row")" "$destination" "$(jq -r .mode <<<"$row")"
done
while IFS= read -r row; do
  destination=$(jq -r .destination <<<"$row"); mode=$(jq -r .mode <<<"$row")
  safe_file "$destination" "${mode#0}"
  [[ $(digest "$destination") == "$(jq -r .sha256 <<<"$row")" ]]
done <<<"$rows"
jq -cn --arg source "$(jq -r .sourceCommit "$manifest")" --argjson pid "$$" --argjson seconds "$MAX_WINDOW_SECONDS" \
  --arg packet "$packet_digest" --arg baseline "$baseline_digest" --arg controller "$controller_digest" \
  '{state:"candidate-active",sourceCommit:$source,controllerPid:$pid,maximumWindowSeconds:$seconds,
    packetDigestSha256:$packet,baselineDigestSha256:$baseline,controllerDigestSha256:$controller}' > "$job/ready.json"
for ((elapsed=0;elapsed<MAX_WINDOW_SECONDS;elapsed++)); do
  [[ ! -f $job/finish ]] || exit 0
  sleep 1
done
exit 124
