#!/usr/bin/env bash
# Temporary staging2 root-operator stdio session. No installed service/SSH grant.
set -euo pipefail
umask 077
export LC_ALL=C
job=${1:?owned job}; packet=${2:?public archive sha256}; expected_container=${3:?container id}
[[ $# == 3 && $(id -u) == 0 && $job =~ ^/var/tmp/mofacts-authentication\.[a-f0-9]{12}$
   && $packet =~ ^[a-f0-9]{64}$ && $expected_container =~ ^[a-f0-9]{64}$ ]]
[[ -d $job && ! -L $job && $(realpath "$job") == "$job" && $(stat -c '%u:%g:%a' "$job") == 0:0:700 ]]
[[ $(sha256sum "$job/source.tar" | cut -d' ' -f1) == "$packet" ]]
for command in jq flock docker timeout stat; do command -v "$command" >/dev/null; done
namespace=$(jq -er '.namespace|select(test("^mofacts_audit_fixture_[a-f0-9]{12}$"))' "$job/profile.json")
[[ ${namespace##*_} == ${job##*.} ]]
jq -e 'keys==["expectedRuntime","namespace"] and .expectedRuntime.rootOrigin=="https://staging2.optimallearning.org"' "$job/profile.json" >/dev/null
lockdir=/run/mofacts-security-audit
if [[ ! -e $lockdir && ! -L $lockdir ]]; then mkdir -m 0700 "$lockdir"; fi
[[ -d $lockdir && ! -L $lockdir && $(stat -c '%u:%g:%a' "$lockdir") == 0:0:700 ]]
if [[ -e $lockdir/qualification.lock || -L $lockdir/qualification.lock ]]; then
  [[ -f $lockdir/qualification.lock && ! -L $lockdir/qualification.lock && $(stat -c '%u:%g:%a:%h' "$lockdir/qualification.lock") == 0:0:600:1 ]]
fi
exec 9>> "$lockdir/qualification.lock"; flock -n 9
lease=$lockdir/authentication-lease.json
[[ ! -e $lease && ! -L $lease ]]
(set -o noclobber; jq -cn --arg job "$job" --arg namespace "$namespace" --arg source "$packet" \
  '{job:$job,namespace:$namespace,packetSha256:$source}' > "$lease")
finished=0
tool="/tmp/mofacts-authentication-${namespace##*_}"
on_exit() {
  code=$?
  if [[ $finished == 1 ]]; then
    printf '{"state":"authentication-window-complete"}\n' > "$job/window-state.json"
  else
    printf '{"state":"authentication-window-recovery-required"}\n' > "$job/window-state.json"
  fi
  exit "$code"
}
trap on_exit EXIT
check_container() {
  actual=$(docker inspect mofacts --format '{{json .Id}} {{json .State.Running}} {{json (index .Config.Labels "com.docker.compose.project")}} {{json .State.Health.Status}}')
  [[ $actual == "\"$expected_container\" true \"staging2\" \"healthy\"" ]]
}
check_container
docker exec --user 0 mofacts test ! -e "$tool"
docker exec --user 0 mofacts mkdir -m 700 "$tool"
docker cp "$job/source/." "mofacts:$tool/" >/dev/null
invoke() {
  local action=$1 payload=$2 raw output
  raw=$(printf '%s' "$payload" | base64 -d | timeout --signal TERM --kill-after 5s 40 \
    docker exec --user 0 -i mofacts /docker/entrypoint.sh node "$tool/deploy/security-audit/launch-staging2-fixture.mjs" "$action" 2>/dev/null)
  [[ ${#raw} -lt 65536 ]]
  output=$(printf '%s\n' "$raw" | tail -n 1)
  printf '%s' "$output" | jq -e '.state|type=="string" and startswith("fixture-")' >/dev/null
  check_container
  printf '%s\n' "$output"
}
deadline=$(( $(date +%s) + 7200 ))
printf '{"state":"authentication-window-ready"}\n'
while true; do
  remaining=$(( deadline - $(date +%s) )); (( remaining > 45 ))
  IFS= read -r -t "$remaining" request
  [[ ${#request} -lt 100000 ]]
  action=$(printf '%s' "$request" | jq -er '.action')
  payload=$(printf '%s' "$request" | jq -er '.payloadBase64|select(test("^[A-Za-z0-9+/=]+$"))')
  printf '%s' "$request" | jq -e 'keys==["action","payloadBase64"]' >/dev/null
  printf '%s' "$payload" | base64 -d | jq -e --arg namespace "$namespace" '.namespace==$namespace' >/dev/null
  check_container
  if [[ $action == complete ]]; then
    expected_profile=$(jq -Sc . "$job/profile.json")
    [[ $(printf '%s' "$payload" | base64 -d | jq -Sc .) == "$expected_profile" ]]
    result=$(invoke protocol-empty "$payload")
    [[ $(printf '%s' "$result" | jq -er .state) == fixture-protocol-namespace-empty ]]
    [[ $(jq -er .job "$lease") == "$job" && $(jq -er .namespace "$lease") == "$namespace" ]]
    docker exec --user 0 mofacts rm -r -- "$tool"
    rm -- "$lease"
    finished=1
    printf '{"state":"authentication-window-complete"}\n'
    break
  fi
  case "$action" in
    operator|preflight|inspect|passwordless-preflight|passwordless-seed|passwordless-inspect|passwordless-cleanup|protocol-empty) ;;
    *) exit 2 ;;
  esac
  invoke "$action" "$payload"
done
