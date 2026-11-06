#!/usr/bin/env bash
# Operator-owned, isolated Linux integration lane. No release or deployment.
set -euo pipefail
umask 077
action=${1:?prepare or run}
job=${2:?absolute existing job directory}
commit=${3:?exact source commit}
[[ "$action" == prepare || "$action" == run ]]
[[ "$job" =~ ^(/home/ubuntu|/var/tmp)/mofacts-integration\.[A-Za-z0-9]+$ ]]
[[ "$commit" =~ ^[0-9a-f]{40}$ ]]
[[ -d "$job" && ! -L "$job" && "$(realpath "$job")" == "$job" ]]
[[ "$(cat "$job/owner")" == "$commit" ]]
# The private parent protects source at rest; checkout modes must match an
# ordinary Linux CI checkout and remain readable after dropping all capabilities.
[[ "$(stat -c %a "$job/source")" == 755 && "$(stat -c %a "$job/source/mofacts/.meteor/release")" == 644 ]]
[[ "$(git -c "safe.directory=$job/source" -C "$job/source" rev-parse HEAD)" == "$commit" ]]
[[ -z "$(git -c "safe.directory=$job/source" -C "$job/source" status --porcelain)" ]]
name="mofacts-ci-$(basename "$job" | tr '[:upper:].' '[:lower:]-')"
image="mofacts-local/integration:${commit:0:12}"
label="org.mofacts.integration=$name"
export TMPDIR="$job/tmp"
mkdir -p "$TMPDIR" "$job/results"

# Only the trusted coordinator sees the Docker socket. Test processes never do.
coordinator() {
  docker run --rm --label "$label" --network none \
    --mount "type=bind,src=$job,dst=$job" \
    --mount "type=bind,src=$job/source,dst=$job/source,readonly" \
    --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
    --env "TMPDIR=$TMPDIR" --workdir "$job/source" "$image" "$@"
}
capture="$job/source/mofacts/scripts/security-audit/qualification/captureBuildSource.mjs"

if [[ "$action" == prepare ]]; then
  [[ ! -e "$job/prepared" && ! -e "$job/results/capture.json" ]]
  mkdir "$job/build"
  cp "$job/control/Dockerfile" "$job/build/Dockerfile"
  cp "$job/source/mofacts/.meteor/release" "$job/build/release"
  cp "$job/source/mofacts/.meteor/packages" "$job/build/packages"
  cp "$job/source/mofacts/.meteor/versions" "$job/build/versions"
  cp "$job/source/mofacts/package.json" "$job/source/mofacts/package-lock.json" "$job/build/"
  docker build --progress plain --label "$label" --tag "$image" "$job/build" > "$job/results/tool-image-build.log" 2>&1
  coordinator node "$job/source/mofacts/scripts/ciMongoReadiness.cjs" host
  coordinator node "$capture" prepare-tests --builder default --base-commit "$commit" --dirty false > "$job/results/capture.json"
  coordinator node -e 'const fs = require("node:fs"); const result = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); if (result.state !== "test-inputs-captured-unqualified" || typeof result.workspace !== "string") throw Error("Incomplete source capture"); console.log(result.workspace);' \
    "$job/results/capture.json" > "$job/workspace"
  workspace=$(cat "$job/workspace")
  [[ "$workspace" == "$TMPDIR"/mofacts-qualified-build-* && -d "$workspace/test-context/mofacts" ]]
  # Ownership is outside the source byte/mode digest. The worker owns only this
  # new capture/results tree; read-only mounts still protect retained inputs.
  chown -Rh 2000:2000 "$workspace"
  chown 2000:2000 "$job/results"
  # Package downloads/build caches belong to this job, never the deployed app.
  docker volume create --label "$label" "$name-tools" > /dev/null
  docker run --init --name "$name-setup" --label "$label" --memory 2048m --memory-swap 2048m --cpus 1.5 \
    --user 2000:2000 --env HOME=/home/mofacts-test \
    --security-opt no-new-privileges --cap-drop ALL \
    --mount "type=bind,src=$job/source,dst=/source,readonly" \
    --mount "type=bind,src=$workspace,dst=/capture,readonly" \
    --mount "type=bind,src=$workspace/test-context,dst=/capture/test-context" \
    --mount "type=volume,src=$name-tools,dst=/home/mofacts-test/.meteor" \
    --workdir /capture/test-context/mofacts "$image" bash -euc \
    'test "$(node --version)" = v24.22.1; test "$(npm --version)" = 11.19.1; npm ci; meteor update --npm' > "$job/results/dependency-setup.log" 2>&1
  coordinator node "$capture" verify-tests --builder default --workspace "$workspace" > "$job/results/source-before.json"
  docker pull mongo:8.0.34 > "$job/results/mongo-pull.log" 2>&1
  docker image inspect "$image" --format '{{.Id}}' > "$job/results/tool-image-id"
  docker image inspect mongo:8.0.34 --format '{{.Id}}' > "$job/results/mongo-image-id"
  sha256sum "$job/control/"* > "$job/results/tool-source-sha256"
  touch "$job/prepared"
  printf 'Integration worker prepared; no Meteor tests invoked.\n'
  exit 0
fi

[[ "${4:-}" == --authorize-one-meteor-run && -f "$job/prepared" && ! -e "$job/invoked" ]]
workspace=$(cat "$job/workspace")
[[ "$workspace" == "$TMPDIR"/mofacts-qualified-build-* && -d "$workspace/test-context/mofacts" ]]
[[ "$(docker image inspect "$image" --format '{{.Id}}')" == "$(cat "$job/results/tool-image-id")" ]]
# Leave a host-memory reserve; compilation failure is a failure, never a reason
# to lift the cap, add swap, restart the live application or retry implicitly.
available_kib=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
(( available_kib >= 6144 * 1024 ))

owned() { [[ "$(docker inspect "$1" --format '{{index .Config.Labels "org.mofacts.integration"}}')" == "$name" ]]; }
cleanup() {
  result=$?
  trap - EXIT
  for container in "$name-test" "$name-mongodb" "$name-setup"; do
    if docker container inspect "$container" > /dev/null 2>&1; then
      owned "$container" || { printf 'Container ownership mismatch\n' >&2; exit 1; }
      docker inspect "$container" --format '{{json .State}}' > "$job/results/$container-state.json"
      docker rm -f -v "$container" > /dev/null
    fi
  done
  if docker network inspect "$name" > /dev/null 2>&1; then
    [[ "$(docker network inspect "$name" --format '{{index .Labels "org.mofacts.integration"}}')" == "$name" ]]
    docker network rm "$name" > /dev/null
  fi
  # Only the per-job Meteor cache is discarded; source/results stay for review.
  if docker volume inspect "$name-tools" > /dev/null 2>&1; then
    [[ "$(docker volume inspect "$name-tools" --format '{{index .Labels "org.mofacts.integration"}}')" == "$name" ]]
    docker volume rm "$name-tools" > /dev/null
  fi
  printf '%s\n' "$result" > "$job/results/lane-exit-status"
  exit "$result"
}
trap cleanup EXIT
docker network create --label "$label" "$name" > /dev/null
docker run -d --name "$name-mongodb" --label "$label" --network "$name" --network-alias mongodb \
  --memory 384m --memory-swap 384m --cpus 0.25 \
  mongo:8.0.34 --replSet mofacts-ci-rs --bind_ip_all --wiredTigerCacheSizeGB 0.25 > /dev/null
coordinator node "$job/source/mofacts/scripts/ciMongoReadiness.cjs" wait "$name-mongodb" ping
docker exec "$name-mongodb" mongosh --quiet --eval \
  'rs.initiate({_id:"mofacts-ci-rs",members:[{_id:0,host:"mongodb:27017"}]})' > "$job/results/mongo-init.json"
coordinator node "$job/source/mofacts/scripts/ciMongoReadiness.cjs" wait "$name-mongodb" primary mofacts-ci-rs
date -u +%FT%TZ > "$job/results/started-at"
# This exclusive marker is the single-use authorization boundary. Neither setup
# nor a failure before this point consumes a Meteor invocation.
(set -o noclobber; printf '%s\n' "$commit" > "$job/invoked")
sha256sum "$job/control/"* > "$job/results/tool-source-run-sha256"
docker create --init --name "$name-test" --label "$label" --network "$name" \
  --user 2000:2000 --env HOME=/home/mofacts-test \
  --memory 4096m --memory-swap 4096m --cpus 2 --shm-size 256m \
  --security-opt no-new-privileges --cap-drop ALL \
  --mount "type=bind,src=$job/source,dst=/source,readonly" \
  --mount "type=bind,src=$workspace,dst=/capture,readonly" \
  --mount "type=bind,src=$workspace/test-context,dst=/capture/test-context" \
  --mount "type=bind,src=$job/results,dst=/evidence" \
  --mount "type=bind,src=$job/control,dst=/control,readonly" \
  --mount "type=volume,src=$name-tools,dst=/home/mofacts-test/.meteor" \
  --workdir /capture/test-context/mofacts \
  --env CI=1 --env TEST_SETTINGS_FILE=settings.ci.json \
  --env MOFACTS_TEST_EVIDENCE_FILE=/evidence/meteor-run.json \
  --env TEST_RUN_TIMEOUT_MS=1200000 \
  --env 'MONGO_URL=mongodb://mongodb:27017/meteor?replicaSet=mofacts-ci-rs&directConnection=true' \
  --env MOFACTS_MONGO_REPLICA_SET_NAME=mofacts-ci-rs \
  "$image" bash -euc 'node /control/probe-readonly.cjs "$1" "$2"; npm run test:ci' \
  integration /source /capture > /dev/null
set +e
timeout --signal TERM --kill-after 30s 25m docker start -a "$name-test" > "$job/results/meteor.log" 2>&1
test_status=$?
set -e
docker inspect "$name-test" --format '{{json .State}}' > "$job/results/test-state.json"
date -u +%FT%TZ > "$job/results/finished-at"
[[ "$test_status" == 0 ]]
coordinator node "$capture" verify-tests --builder default --workspace "$workspace" > "$job/results/source-after.json"
coordinator node "$job/control/record-native.cjs" "$job/results" "$job/source/mofacts" "$commit"
printf 'Native integration verified; no GitHub or release qualification claimed.\n'
