#!/usr/bin/env bash
# Staging2 operator only: verify the optional receipt mount, then restore V1.
# Never installed in sudo policy or used as the audit account's forced command.
set -euo pipefail
umask 077
export LC_ALL=C
CONFIG_DIRECTORY=/etc/mofacts
LIBRARY_DIRECTORY=/usr/local/libexec/mofacts-security-audit
PROJECT_DIRECTORY=/opt/mofacts/deploy
LOCK_DIRECTORY=/run/mofacts-security-audit
action=${1:?run or restore}; job=${2:?private job}; packet_hash=${3:?packet hash}; baseline_hash=${4:?baseline hash}; controller_hash=${5:?controller hash}
[[ $# == 5 && $(id -u) == 0 && ( $action == run || $action == restore ) ]]
[[ $job =~ ^/var/tmp/mofacts-receiver-release\.[A-Za-z0-9]{12}$ && ! -L $job && $(realpath "$job") == "$job" ]]
for value in "$packet_hash" "$baseline_hash" "$controller_hash"; do [[ $value =~ ^[a-f0-9]{64}$ ]]; done
hash() { sha256sum "$1" | cut -d' ' -f1; }
safe() { [[ -f $1 && ! -L $1 && $(stat -c '%u:%g:%a:%h' "$1") == "0:0:$2:1" ]]; }
manifest=$job/packet.json; baseline=$job/baseline.json
[[ $(hash "$manifest") == "$packet_hash" && $(hash "$baseline") == "$baseline_hash" && $(hash "$job/operator-controller.sh") == "$controller_hash" ]]
[[ -z $(find "$job" -xdev -type l -print -quit) && -z $(find "$job" -xdev ! -type f ! -type d -print -quit) ]]
if [[ $action == run ]]; then chown -Rh 0:0 "$job"; chmod 0700 "$job"; fi
[[ $(stat -c '%u:%g:%a' "$job") == 0:0:700 ]]
config=$CONFIG_DIRECTORY/security-audit.conf
safe "$config" 600
unset MOFACTS_PUBLIC_HOSTNAME
source "$config" >/dev/null 2>&1
[[ ${MOFACTS_PUBLIC_HOSTNAME:-} == staging2.optimallearning.org ]]
[[ -d $LOCK_DIRECTORY && ! -L $LOCK_DIRECTORY && $(stat -c '%u:%g:%a' "$LOCK_DIRECTORY") == 0:0:700 ]]
if [[ -e $LOCK_DIRECTORY/qualification.lock || -L $LOCK_DIRECTORY/qualification.lock ]]; then safe "$LOCK_DIRECTORY/qualification.lock" 600; fi
exec 9>> "$LOCK_DIRECTORY/qualification.lock"; flock -n 9
jq -e 'keys==["files","nativeReceiptSha256","receiptTransferSha256","sourceCommit","state"] and .state=="prepared-not-installed" and (.sourceCommit|test("^[a-f0-9]{40}$")) and (.nativeReceiptSha256|test("^[a-f0-9]{64}$"))
  and (.files|length)==8 and all(.files[]; keys==["sha256","source"] and (.sha256|test("^[a-f0-9]{64}$")))' "$manifest" >/dev/null
expected=$(printf '%s\n' deploy/security-audit/release-receipt.sh deploy/security-audit/receiver-release.compose.yml \
  mofacts/common/securityAudit/releaseReceipt.mjs mofacts/common/securityAudit/buildIdentity.ts mofacts/common/securityAudit/proofFields.ts \
  mofacts/common/securityAudit/reportIdentity.ts mofacts/server/securityAudit/securityAuditReceiverRelease.ts mofacts/server/securityAudit/securityAuditReceiverIdentity.ts | sort)
[[ $(jq -r '.files[].source' "$manifest" | sort) == "$expected" ]]
while IFS= read -r row; do file=$job/public-source/$(jq -r .source <<<"$row"); safe "$file" 644; [[ $(hash "$file") == $(jq -r .sha256 <<<"$row") ]]; done < <(jq -c '.files[]' "$manifest")
safe "$job/native-verification.json" 600
[[ $(hash "$job/native-verification.json") == $(jq -r .nativeReceiptSha256 "$manifest") ]]
jq -e --arg source "$(jq -r .sourceCommit "$manifest")" '.schema=="NativeMeteorVerificationV1" and .sourceObservation.identity.baseCommit==$source
  and .sourceObservation.identity.includedUncommittedLocalChanges==false and .limits.workerMemoryMiB==6144
  and ([.environments[].side]|sort)==["client","server"] and all(.environments[];.counts.failed==0 and .hookFailures==0)' "$job/native-verification.json" >/dev/null
safe "$job/release-receipt-transfer.json" 600
[[ $(hash "$job/release-receipt-transfer.json") == $(jq -r .receiptTransferSha256 "$manifest") ]]
jq -e '.state=="staging2-receiver-window-baseline" and .v2OriginallyAbsent==true and (.files|length)==8' "$baseline" >/dev/null
old_receipt=$CONFIG_DIRECTORY/release-receipt.json
release_directory=$CONFIG_DIRECTORY/release
v2_receipt=$release_directory/release-receipt.json
tool=$LIBRARY_DIRECTORY/release-receipt.sh
parser=$LIBRARY_DIRECTORY/releaseReceipt.mjs
tool_source=$job/public-source/deploy/security-audit/release-receipt.sh
parser_source=$job/public-source/mofacts/common/securityAudit/releaseReceipt.mjs
overlay=$job/public-source/deploy/security-audit/receiver-release.compose.yml
image=$(jq -r .app.imageId "$baseline")
[[ $image =~ ^sha256:[a-f0-9]{64}$ ]]
proof_name="receiver-proof-$(basename "$job" | tr '[:upper:].' '[:lower:]-')"
compose=(docker compose --project-name staging2 --project-directory "$PROJECT_DIRECTORY" --env-file "$CONFIG_DIRECTORY/.env.self-hosted"
  -f "$PROJECT_DIRECTORY/docker-compose.yml" -f "$PROJECT_DIRECTORY/docker-compose.staging2-runtime.yml")
app_id() { local ids; ids=$(docker ps -q --filter label=com.docker.compose.project=staging2 --filter label=com.docker.compose.service=mofacts); [[ $ids =~ ^[a-f0-9]{12,64}$ ]]; printf '%s\n' "$ids"; }
healthy() { local id status; for ((attempt=0;attempt<120;attempt++)); do id=$(app_id) || return 1; status=$(docker inspect "$id" --format '{{.State.Running}} {{.State.Health.Status}}'); [[ $status != 'false '* ]] || return 1; [[ $status != 'true unhealthy' ]] || return 1; [[ $status != 'true healthy' ]] || return 0; sleep 1; done; return 1; }
config_unchanged() {
  local row file
  while IFS= read -r row; do file=$(jq -r .path <<<"$row"); [[ -f $file && ! -L $file && $(hash "$file") == $(jq -r .sha256 <<<"$row")
    && $(stat -c '%u:%g:%a:%h' "$file") == $(jq -r .ownerModeLinks <<<"$row") ]] || return 1; done < <(jq -c --arg receipt "$old_receipt" --arg tool "$tool" --arg parser "$parser" '.files[]|select(.path!=$receipt and .path!=$tool and .path!=$parser)' "$baseline")
}
replace() { local source=$1 target=$2 mode=$3 temporary=$2.receiver-window-$(basename "$job"); [[ ! -e $temporary && ! -L $temporary ]]; install -o root -g root -m "$mode" "$source" "$temporary"; mv -T "$temporary" "$target"; }
original_file() { local path=$1; jq -er --arg path "$path" '.files[]|select(.path==$path)|.sha256' "$baseline"; }
restore_file() {
  local target=$1 saved=$2 candidate=$3 mode=$4 actual
  if [[ -e $target || -L $target ]]; then safe "$target" "$mode" || return 1; actual=$(hash "$target"); [[ $actual == "$candidate" || $actual == "$(original_file "$target")" ]] || return 1; fi
  replace "$job/rollback/$saved" "$target" "$mode"; [[ $(hash "$target") == "$(original_file "$target")" ]];
}
check_other_containers() { local id; while IFS= read -r id; do [[ $(docker inspect "$id" --format '{{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Running}}') == "$(cat "$job/rollback/container-$id")" ]] || return 1; done < "$job/rollback/other-container-ids"; }
restore() {
  local result=0 id
  local proof_ids
  proof_ids=$(docker container ls -aq --filter "name=^/$proof_name$") || return 1
  if [[ -n $proof_ids ]]; then
    [[ $proof_ids =~ ^[a-f0-9]{12,64}$ && $(docker inspect "$proof_ids" --format '{{index .Config.Labels "org.mofacts.receiver-release"}}') == "$(basename "$job")" ]] || return 1
    docker rm -f "$proof_ids" >/dev/null || result=1
  fi
  config_unchanged || return 1
  if [[ -f $job/app-switch-attempted ]]; then timeout --signal TERM --kill-after 15s 120s "${compose[@]}" up -d --no-deps --no-build --pull never mofacts > "$job/compose-restore.log" 2>&1 || result=1; healthy || result=1; fi
  if [[ -e $v2_receipt || -L $v2_receipt ]]; then
    if safe "$v2_receipt" 600 && [[ $(hash "$v2_receipt") == $(hash "$job/release-receipt-transfer.json") ]]; then rm -- "$v2_receipt"; else result=1; fi
  fi
  if [[ -d $release_directory && ! -L $release_directory ]]; then rmdir -- "$release_directory" || result=1; elif [[ -e $release_directory || -L $release_directory ]]; then result=1; fi
  restore_file "$tool" tool.sh "$(hash "$tool_source")" 755 || result=1
  restore_file "$parser" parser.mjs "$(hash "$parser_source")" 644 || result=1
  if [[ ! -e $v2_receipt && ! -L $v2_receipt ]]; then restore_file "$old_receipt" receipt.json "$(original_file "$old_receipt")" 600 || result=1; else result=1; fi
  id=$(app_id) || return 1
  [[ $(docker inspect "$id" --format '{{.Image}}') == "$image" && $(docker inspect "$id" --format '{{index .Config.Labels "com.docker.compose.config-hash"}}') == $(jq -r .app.serviceHash "$baseline") ]] || result=1
  [[ $(docker inspect "$id" --format '{{range .Mounts}}{{if eq .Destination "/run/mofacts/release"}}{{.Destination}}{{end}}{{end}}') == '' ]] || result=1
  check_other_containers || result=1
  [[ $result == 0 ]]
}
if [[ $action == restore ]]; then [[ -f $job/invoked && -d $job/rollback ]]; restore; printf '{"state":"receiver-window-restored","restorationExit":0}\n' > "$job/recovery-result.json"; cat "$job/recovery-result.json"; exit 0; fi
[[ ! -e $job/invoked && ! -e $release_directory && ! -L $release_directory ]]
config_unchanged
while IFS= read -r row; do file=$(jq -r .path <<<"$row"); [[ $(hash "$file") == $(jq -r .sha256 <<<"$row") && $(stat -c '%u:%g:%a:%h' "$file") == $(jq -r .ownerModeLinks <<<"$row") ]]; done < <(jq -c '.files[]' "$baseline")
id=$(app_id); [[ $(docker inspect "$id" --format '{{.Id}}') == $(jq -r .app.id "$baseline") && $(docker inspect "$id" --format '{{.Image}}') == "$image" ]]
service_hash=$("${compose[@]}" config --hash mofacts 2>/dev/null); [[ $service_hash == "mofacts $(jq -r .app.serviceHash "$baseline")" ]]
mkdir -m 0700 "$job/rollback"
cp --preserve=mode,ownership,timestamps "$old_receipt" "$job/rollback/receipt.json"
cp --preserve=mode,ownership,timestamps "$tool" "$job/rollback/tool.sh"
cp --preserve=mode,ownership,timestamps "$parser" "$job/rollback/parser.mjs"
docker ps -q --filter label=com.docker.compose.project=staging2 | while IFS= read -r candidate; do full=$(docker inspect "$candidate" --format '{{.Id}}'); [[ $full == "$(jq -r .app.id "$baseline")" ]] || printf '%s\n' "$full"; done > "$job/rollback/other-container-ids"
while IFS= read -r other; do docker inspect "$other" --format '{{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Running}}' > "$job/rollback/container-$other"; done < "$job/rollback/other-container-ids"
printf '%s\n' "$(jq -r .sourceCommit "$manifest")" > "$job/invoked"
finish() { local operation=$? restoration=0; trap - EXIT HUP TERM INT; restore || restoration=1; jq -cn --argjson operation "$operation" --argjson restoration "$restoration" '{state:"receiver-window-finished",operationExit:$operation,restorationExit:$restoration}' > "$job/result.json"; cat "$job/result.json"; if [[ $operation == 0 && $restoration == 0 ]]; then exit 0; else exit 1; fi; }
trap finish EXIT
trap 'exit 143' HUP TERM
trap 'exit 130' INT
replace "$parser_source" "$parser" 644
replace "$tool_source" "$tool" 755
[[ $(hash "$old_receipt") == $(original_file "$old_receipt") ]]
rm -- "$old_receipt"
mkdir -m 0700 "$release_directory"
timeout --signal TERM --kill-after 15s 150s "$tool" install-v2 < "$job/release-receipt-transfer.json" > "$job/host-installation.json"
[[ $(hash "$v2_receipt") == $(hash "$job/release-receipt-transfer.json") ]]
timeout --signal TERM --kill-after 15s 150s "$tool" read-v2 > "$job/host-receipt.json"
jq -e '.state=="observed" and .result=="MATCH" and .receipt.schema=="MoFaCTSReleaseReceiptV2"' "$job/host-receipt.json" >/dev/null
touch "$job/app-switch-attempted"
timeout --signal TERM --kill-after 15s 120s "${compose[@]}" -f "$overlay" up -d --no-deps --no-build --pull never mofacts > "$job/compose-activate.log" 2>&1
healthy
id=$(app_id)
[[ $(docker inspect "$id" --format '{{.Image}}') == "$image" ]]
mount=$(docker inspect "$id" --format '{{range .Mounts}}{{if eq .Destination "/run/mofacts/release"}}{{.Type}} {{.Source}} {{.RW}}{{end}}{{end}}')
[[ $mount == "bind $release_directory false" ]]
parser_bytes=$(cat "$parser")
read_program=$'\nimport fs from "node:fs"; import assert from "node:assert/strict"; const p="/run/mofacts/release/release-receipt.json"; const s=fs.lstatSync(p); assert(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&s.gid===0&&(s.mode&511)===384); const r=parseReleaseReceiptV2(JSON.parse(fs.readFileSync(p,"utf8"))); for(const op of [()=>fs.closeSync(fs.openSync(p,"a")),()=>fs.chmodSync(p,384)])assert.throws(op,e=>e.code==="EROFS"); console.log(JSON.stringify({state:"app-receipt-read-only",inode:s.ino,platformImage:receiptPlatformImage(r)}));'
timeout --signal TERM --kill-after 15s 45s docker exec "$id" node --input-type=module -e "$parser_bytes$read_program" > "$job/app-receipt-before.json"
timeout --signal TERM --kill-after 15s 150s "$tool" install-v2 < "$job/release-receipt-transfer.json" > "$job/host-replacement.json"
timeout --signal TERM --kill-after 15s 45s docker exec "$id" node --input-type=module -e "$parser_bytes$read_program" > "$job/app-receipt-after.json"
jq -en --slurpfile before "$job/app-receipt-before.json" --slurpfile after "$job/app-receipt-after.json" '$before[0].inode!=$after[0].inode and $before[0].platformImage==$after[0].platformImage' >/dev/null
[[ $(app_id) == "$id" ]]
verify_program='import assert from "node:assert/strict"; import {createAuditReceiverIdentityLoader} from "/qualification/mofacts/server/securityAudit/securityAuditReceiverIdentity.ts"; import {createAuditReceiverPlatformIdentity} from "/qualification/mofacts/server/securityAudit/securityAuditReceiverRelease.ts"; assert.equal(process.version,"v24.22.1"); const b=createAuditReceiverIdentityLoader(); const image=await createAuditReceiverPlatformIdentity(b)(); assert.equal(image.state,"observed"); assert.equal(image.value,process.argv[1]); console.log(JSON.stringify({state:"receiver-adapter-verified",platformImage:image.value}));'
platform_image=$(jq -r .platformImage "$job/app-receipt-after.json")
timeout --signal TERM --kill-after 15s 45s docker run --rm --name "$proof_name" --label "org.mofacts.receiver-release=$(basename "$job")" --pull never --network none --read-only --user 0:0 --cap-drop ALL --security-opt no-new-privileges --memory 256m --memory-swap 256m --cpus 0.5 \
  --mount "type=bind,src=$job/public-source,dst=/qualification,readonly" --mount "type=bind,src=$release_directory,dst=/run/mofacts/release,readonly" \
  --entrypoint node "$image" --input-type=module -e "$verify_program" "$platform_image" > "$job/receiver-adapter.json"
check_other_containers
printf '{"state":"receiver-window-acceptance","hostReaderMatch":true,"sameAppImage":true,"actualAppMountReadOnly":true,"atomicReplacementVisible":true,"independentAdapterVerified":true}\n' > "$job/acceptance.json"
