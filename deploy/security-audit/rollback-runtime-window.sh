#!/usr/bin/env bash
# Root operator, staging2 only, disposable candidate/previous/candidate test.
set -euo pipefail
umask 077
export LC_ALL=C
job=${1:?private qualification job}
manifest_digest=${2:?reviewed packet digest}
[[ $# == 2 && $(id -u) == 0 ]]
[[ $job =~ ^/var/tmp/mofacts-audit-rollback\.[a-f0-9]{12}$ && ! -L $job && $(realpath "$job") == "$job" ]]
[[ $(stat -c '%u:%g:%a' "$job") == 0:0:700 && $manifest_digest =~ ^[a-f0-9]{64}$ ]]
[[ $(sha256sum "$job/manifest.json" | cut -d' ' -f1) == "$manifest_digest" ]]
[[ ! -e $job/invoked ]]
while IFS=$'\t' read -r file hash; do
  [[ $file =~ ^(compose.yml|environment|parameters.json|synthetic.json|settings.json|redis.password|seed.mongo.js|baseline.mjs|imageArchiveIdentity.mjs)$ ]]
  [[ -f $job/$file && ! -L $job/$file && $(stat -c '%u:%g:%a:%h' "$job/$file") == 0:0:600:1 ]]
  [[ $(sha256sum "$job/$file" | cut -d' ' -f1) == "$hash" ]]
done < <(jq -er '.files|to_entries[]|[.key,.value]|@tsv' "$job/manifest.json")
[[ $(jq '.files|length' "$job/manifest.json") == 9 ]]
namespace=$(jq -er '.namespace' "$job/parameters.json")
[[ $namespace =~ ^mofacts_audit_rollback_[a-f0-9]{12}$ && $namespace == mofacts_audit_rollback_${job##*.} ]]
previous_image=$(jq -er '.previousImage' "$job/parameters.json")
[[ $previous_image == ppavlikmemphis/mofacts-mini@sha256:f8784b4afe9a4875fd62c5ccb153bab26796381548d47ded54d9a65d5148cc05 ]]
[[ $(jq -er '.previousConfig' "$job/parameters.json") == sha256:214793c9cf7534eb4568934fc83843328b202a23b99d108fc323ead2ceafb697 ]]
candidate_image=$(jq -er '.candidateImage' "$job/parameters.json")
candidate_config=$(jq -er '.candidateConfig' "$job/parameters.json")
candidate_revision=$(jq -er '.candidateRevision' "$job/parameters.json")
[[ $candidate_image =~ ^ppavlikmemphis/mofacts-staging2@sha256:[a-f0-9]{64}$
  && $candidate_config =~ ^sha256:[a-f0-9]{64}$ && $candidate_revision =~ ^[a-f0-9]{40}$ ]]
# Explicit hostname identity is checked through the already protected config;
# no configuration values are copied or supplied to the disposable services.
[[ $(stat -c '%u:%g:%a:%h' /etc/mofacts/security-audit.conf) == 0:0:600:1 ]]
unset MOFACTS_PUBLIC_HOSTNAME
source /etc/mofacts/security-audit.conf >/dev/null 2>&1
[[ ${MOFACTS_PUBLIC_HOSTNAME:-} == staging2.optimallearning.org ]]
inventory() {
  docker inspect mofacts staging2-mongodb-1 staging2-redis-1 --format \
    '{"id":{{json .Id}},"image":{{json .Image}},"startedAt":{{json .State.StartedAt}},"running":{{json .State.Running}},"health":{{json .State.Health.Status}}}' | jq -cs .
}
before=$(inventory)
jq -e 'length==3 and all(.[];.running==true and .health=="healthy")' <<<"$before" >/dev/null
available=$(awk '/MemAvailable:/{print $2}' /proc/meminfo)
free_disk=$(df -Pk /var/lib/docker | awk 'NR==2{print $4}')
job_disk=$(df -Pk "$job" | awk 'NR==2{print $4}')
[[ $available -ge 2359296 && $free_disk -ge 5242880 && $job_disk -ge 5242880 ]]
[[ ! -e $job/mongo-data && ! -L $job/mongo-data ]]
compose=(docker compose --project-name "$namespace" --env-file "$job/environment" -f "$job/compose.yml")
[[ -z $(docker ps -aq --filter "label=com.docker.compose.project=$namespace") ]]
[[ -z $(docker network ls -q --filter "label=com.docker.compose.project=$namespace") ]]
"${compose[@]}" config --quiet
touch "$job/invoked"
stage=prepared
cleanup() {
  result=$?
  # A controller ending cleanly before its acceptance stage is incomplete.
  # In particular, interactive child tools must never turn stdin EOF into PASS.
  if [[ $result == 0 && $stage != accepted-roundtrip ]]; then result=1; fi
  trap - EXIT HUP INT TERM
  set +e
  if [[ $result != 0 && ( $stage == *-application || $stage == *-readback ) ]]; then
    app_id=$("${compose[@]}" ps -a -q app)
    if [[ $app_id =~ ^[a-f0-9]{64}$ ]]; then
      docker container inspect "$app_id" --format '{"status":{{json .State.Status}},"exitCode":{{json .State.ExitCode}},"oomKilled":{{json .State.OOMKilled}}}' > "$job/application-state.json"
      # Raw logs remain transient. Only fixed signatures and public package stack
      # coordinates may leave the failed disposable process, never message text.
      docker logs --tail 80 "$app_id" 2>&1 | head -c 65536 | \
        timeout --kill-after=3s 20s docker run --rm -i --name "$namespace-diagnostic" --label "com.docker.compose.project=$namespace" \
          --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m --memory-swap 128m --cpus 0.25 --pids-limit 64 \
          --entrypoint node "$previous_image" --input-type=module -e \
          'let text="";for await(const chunk of process.stdin){text+=chunk;if(text.length>65536)process.exit(1);} const signatures=["Successfully validated the MongoDB connection","Starting app...","Cannot find module","EACCES","ENOENT","ENOMEM","ECONNREFUSED","ENOTFOUND","ETIMEDOUT","ReferenceError","TypeError","SyntaxError","MongoServerSelectionError","Redis PING did not return PONG","Meteor login method handler is unavailable","Meteor accounts-password verifier is unavailable","space left","equivalent index","different options","quota","IndexOptionsConflict","IndexKeySpecsConflict","CannotCreateIndex","BadValue","DuplicateKey","InvalidIndexSpecificationOption","IndexBuildAborted"];process.stdout.write(JSON.stringify({signatures:signatures.filter(value=>text.toLowerCase().includes(value.toLowerCase())),numericCodes:[...new Set([...text.matchAll(/\bcode:\s*(\d{1,5})\b/g)].map(match=>Number(match[1])))].slice(0,8),packageFrames:[...new Set([...text.matchAll(/packages\/[A-Za-z0-9_.:/-]+:[0-9]+:[0-9]+/g)].map(match=>match[0]))].slice(0,12)})+"\n");' \
          > "$job/startup-diagnostic.json" 2> /dev/null
    fi
    "${compose[@]}" exec -T mongo df -Pk /data/db </dev/null 2>/dev/null | awk 'NR==2{printf "{\"totalKiB\":%d,\"usedKiB\":%d,\"availableKiB\":%d}\n",$2,$3,$4}' > "$job/database-disk.json"
  fi
  "${compose[@]}" down --volumes --timeout 15 > "$job/cleanup.log" 2>&1
  cleanup_exit=$?
  for reader in "$namespace-identity" "$namespace-diagnostic"; do
    if docker container inspect "$reader" >/dev/null 2>&1; then
      if [[ $(docker container inspect "$reader" --format '{{index .Config.Labels "com.docker.compose.project"}}') == "$namespace" ]]; then
        docker rm -f "$reader" >> "$job/cleanup.log" 2>&1 || cleanup_exit=1
      else cleanup_exit=1; fi
    fi
  done
  [[ -z $(docker ps -aq --filter "label=com.docker.compose.project=$namespace") ]] || cleanup_exit=1
  [[ -z $(docker network ls -q --filter "label=com.docker.compose.project=$namespace") ]] || cleanup_exit=1
  if [[ -e $job/mongo-data || -L $job/mongo-data ]]; then
    if [[ $cleanup_exit == 0 && -d $job/mongo-data && ! -L $job/mongo-data
      && $(realpath "$job/mongo-data") == "$job/mongo-data" && $(stat -c '%u:%g' "$job/mongo-data") == 999:999 ]]; then
      rm -r -- "$job/mongo-data" || cleanup_exit=1
    else cleanup_exit=1; fi
  fi
  after=$(inventory)
  unchanged=false
  if [[ $before == "$after" ]]; then unchanged=true; else cleanup_exit=1; fi
  jq -cn --arg stage "$stage" --argjson operation "$result" --argjson cleanup "$cleanup_exit" --argjson unchanged "$unchanged" \
    '{state:"rollback-window-finished",stage:$stage,operationExit:$operation,cleanupExit:$cleanup,originalContainersUnchanged:$unchanged}' > "$job/result.json"
  cat "$job/result.json"
  [[ $cleanup_exit == 0 ]] || exit 1
  exit "$result"
}
trap cleanup EXIT
trap 'exit 143' HUP TERM
trap 'exit 130' INT
stage=image-acquisition
verify_image() {
  local label=$1 image=$2 config=$3 revision=$4 inspection
timeout --kill-after=10s 180s docker pull --platform linux/amd64 "$image" > "$job/$label-image-pull.log" 2>&1
docker image inspect "$image" --format \
  '{"id":{{json .Id}},"os":{{json .Os}},"architecture":{{json .Architecture}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}},"digests":{{json .RepoDigests}}}' > "$job/$label-image.json"
jq -e --arg image "$image" --arg revision "$revision" '.os=="linux" and .architecture=="amd64"
  and .revision==$revision and (.digests|index($image))!=null' "$job/$label-image.json" >/dev/null
inspection=$(docker image inspect "$image" --format '{"nativeId":{{json .Id}},"platform":"{{.Os}}/{{.Architecture}}","descriptor":{{json (index . "Descriptor")}}}')
timeout --kill-after=10s 120s docker image save "$image" | \
  timeout --kill-after=10s 120s docker run --rm -i --name "$namespace-identity" --label "com.docker.compose.project=$namespace" \
    --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 256m --memory-swap 256m --cpus 0.25 --pids-limit 64 \
    --mount "type=bind,source=$job/imageArchiveIdentity.mjs,target=/qualification/imageArchiveIdentity.mjs,readonly" \
    --entrypoint node "$image" --input-type=module -e \
    'import {readDockerArchiveIdentity} from "/qualification/imageArchiveIdentity.mjs"; try { process.stdout.write(JSON.stringify(await readDockerArchiveIdentity(process.stdin,JSON.parse(process.argv[1])))+"\n"); } catch { process.exitCode=1; }' \
    "$inspection" > "$job/$label-config-identity.json" 2> "$job/$label-config-identity-error.log"
jq -e --arg config "$config" '.platform=="linux/amd64" and .configDigest==$config' "$job/$label-config-identity.json" >/dev/null
}
printf '%s\n' 'Verifying immutable previous and candidate images'
verify_image previous "$previous_image" sha256:214793c9cf7534eb4568934fc83843328b202a23b99d108fc323ead2ceafb697 18677291993b66b890a090e55d65f703b45ff653
verify_image candidate "$candidate_image" "$candidate_config" "$candidate_revision"
stage=private-database
printf '%s\n' 'Starting owned private synthetic database'
mkdir -m 0700 "$job/mongo-data"
chown 999:999 "$job/mongo-data"
"${compose[@]}" up -d --no-build --pull never mongo redis > "$job/start-data.log" 2>&1
ready=false
for ((i=0;i<30;i++)); do
  if "${compose[@]}" exec -T mongo mongosh --quiet --eval 'if(db.adminCommand({ping:1}).ok!==1)quit(1)' </dev/null >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ $ready == true ]]
"${compose[@]}" exec -T mongo mongosh --quiet --eval 'rs.initiate({_id:"rollback-rs",members:[{_id:0,host:"mongo:27017"}]})' </dev/null > "$job/replica-init.log" 2>&1
ready=false
for ((i=0;i<30;i++)); do
  if "${compose[@]}" exec -T mongo mongosh --quiet --eval 'if(db.hello().isWritablePrimary!==true)quit(1)' </dev/null >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ $ready == true ]]
"${compose[@]}" exec -T mongo mongosh --quiet --file /dev/stdin < "$job/seed.mongo.js" > "$job/seed.log" 2>&1
"${compose[@]}" exec -T mongo df -Pk /data/db </dev/null | awk 'NR==2{printf "{\"totalKiB\":%d,\"usedKiB\":%d,\"availableKiB\":%d}\n",$2,$3,$4}' > "$job/database-disk-before-app.json"
# Preserve MongoDB's ordinary index-build safety floor; require disk headroom.
jq -e '.availableKiB>=1048576' "$job/database-disk-before-app.json" >/dev/null
for phase in candidate previous candidate-restored; do
  if [[ $phase == previous ]]; then app_image=$previous_image; else app_image=$candidate_image; fi
  export ROLLBACK_APPLICATION_IMAGE=$app_image
  stage=$phase-application
  printf '%s\n' "Starting isolated $phase application"
"${compose[@]}" up -d --no-deps --force-recreate --no-build --pull never app > "$job/$phase-start-app.log" 2>&1
ready=false
for ((i=0;i<45;i++)); do
  [[ -z $("${compose[@]}" ps -a --status exited -q app) ]] || break
  if "${compose[@]}" exec -T app node -e 'fetch("http://127.0.0.1:3000/health",{signal:AbortSignal.timeout(1000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' </dev/null >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ $ready == true ]]
app_id=$("${compose[@]}" ps -q app)
[[ $app_id =~ ^[a-f0-9]{64}$ ]]
[[ $(docker inspect "$app_id" --format '{{.Image}}') == $(docker image inspect "$app_image" --format '{{.Id}}') ]]
stage=$phase-readback
timeout --kill-after=5s 90s "${compose[@]}" exec -T app node /qualification/baseline.mjs /qualification/synthetic.json "$phase" </dev/null > "$job/$phase-result.json" 2> "$job/$phase-error.log"
jq -e --arg phase "$phase" '.state=="rollback-generation-verified" and .phase==$phase and .v1Preserved==true
  and .v2Preserved==true and .otherGenerationExcluded==true' "$job/$phase-result.json" >/dev/null
done
jq -en --slurpfile before "$job/candidate-result.json" --slurpfile after "$job/candidate-restored-result.json" '
  ($before[0]|{schema,digestSha256,jsonSha256,htmlSha256})==($after[0]|{schema,digestSha256,jsonSha256,htmlSha256})' >/dev/null
stage=accepted-roundtrip
