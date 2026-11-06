#!/usr/bin/env bash
# Explicit staging2-only offline window, within plan Section 0 decision 5.
# Preserve original containers, configuration, images and data volumes.
set -euo pipefail
umask 077
job=${1:?owned integration job}
commit=${2:?exact source commit}
[[ "$job" =~ ^/home/ubuntu/mofacts-integration\.[a-z0-9]+$ && "$commit" =~ ^[0-9a-f]{40}$ ]]
[[ "$(cat "$job/owner")" == "$commit" && -f "$job/prepared" && ! -e "$job/invoked" ]]
[[ ! -e "$job/results/staging2-before.json" ]]
format='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"running":{{json .State.Running}},"health":{{json .State.Health.Status}}}'
docker inspect mofacts staging2-mongodb-1 staging2-redis-1 --format "$format" | jq -s . > "$job/results/staging2-before.json"
jq -e 'length == 3 and all(.[]; .project == "staging2" and .running == true and .health == "healthy")' "$job/results/staging2-before.json" > /dev/null
container_id() { jq -er --arg name "/$1" '.[] | select(.name == $name) | .id' "$job/results/staging2-before.json"; }
healthy() {
  local id=$1
  for ((attempt=0; attempt<120; attempt++)); do
    [[ "$(docker inspect "$id" --format '{{.State.Health.Status}}')" == healthy ]] && return 0
    sleep 1
  done
  return 1
}
name="mofacts-ci-$(basename "$job" | tr . -)"
restore() {
  result=$?
  trap - EXIT HUP INT TERM
  # Release test memory before restoring existing services, even on connection loss.
  for suffix in test mongodb setup; do
    c="$name-$suffix"
    if docker container inspect "$c" > /dev/null 2>&1; then
      [[ "$(docker inspect "$c" --format '{{index .Config.Labels "org.mofacts.integration"}}')" == "$name" ]] || exit 1
      docker rm -f -v "$c" > /dev/null
    fi
  done
  restore_result=0
  for original in staging2-mongodb-1 staging2-redis-1; do
    id=$(container_id "$original")
    docker start "$id" > /dev/null || restore_result=1
  done
  for original in staging2-mongodb-1 staging2-redis-1; do
    healthy "$(container_id "$original")" || restore_result=1
  done
  if [[ "$restore_result" == 0 ]]; then
    docker start "$(container_id mofacts)" > /dev/null || restore_result=1
    healthy "$(container_id mofacts)" || restore_result=1
  fi
  docker inspect mofacts staging2-mongodb-1 staging2-redis-1 --format "$format" | jq -s . > "$job/results/staging2-after.json"
  jq -e --slurpfile before "$job/results/staging2-before.json" \
    'all(.[]; .running == true and .health == "healthy") and (map({id,image,name}) == ($before[0] | map({id,image,name})))' \
    "$job/results/staging2-after.json" > /dev/null || restore_result=1
  date -u +%FT%TZ > "$job/results/staging2-restored-at"
  printf '%s\n' "$restore_result" > "$job/results/staging2-restore-status"
  [[ "$restore_result" == 0 ]] || { printf 'Staging2 restoration requires operator attention\n' >&2; exit 1; }
  printf 'Original staging2 containers restored with identical images and healthy liveness.\n'
  exit "$result"
}
trap restore EXIT
trap 'exit 143' HUP TERM
trap 'exit 130' INT
docker stop --time 30 "$(container_id mofacts)" > /dev/null
docker stop --time 30 "$(container_id staging2-mongodb-1)" "$(container_id staging2-redis-1)" > /dev/null
date -u +%FT%TZ > "$job/results/staging2-paused-at"
bash "$job/control/worker.sh" run "$job" "$commit" --authorize-one-meteor-run
