#!/usr/bin/env bash
# Inert V2 acquisition entry point. Install/activate only through reviewed tooling.
# No caller arguments, control metadata, verdicts, settings or raw records emitted.
set -u
set -o pipefail
export LC_ALL=C
CONFIG_FILE=/etc/mofacts/security-audit.conf
DESCRIPTOR_FILE=/usr/local/libexec/mofacts-security-audit/host-measurements.v1.json
LISTENER_POLICY_FILE=/usr/local/libexec/mofacts-security-audit/host-listener-policy.awk
FIREWALL_POLICY_FILE=/usr/local/libexec/mofacts-security-audit/host-firewall-policy.awk
APACHE_POLICY_FILE=/usr/local/libexec/mofacts-security-audit/host-apache-policy.awk
SIDECAR_POLICY_FILE=/usr/local/libexec/mofacts-security-audit/host-sidecar-policy.jq
MONGO_ROLE_PROBE_FILE=/usr/local/libexec/mofacts-security-audit/host-mongo-roles.js
MONGO_CONNECTIVITY_FILE=/usr/local/libexec/mofacts-security-audit/host-mongo-connectivity.js
READ_CONCERN_ROLE_FILE=/usr/local/libexec/mofacts-security-audit/read-default-concern-role.json

reject() { printf '{"error":"%s"}\n' "$1"; exit "$2"; }
[[ $# == 0 && -z "${SSH_ORIGINAL_COMMAND:-}" ]] || reject arguments-are-not-accepted 64
[[ "$(id -u)" == 0 ]] || reject root-is-required 77
for tool in jq timeout head base64 stat sha256sum awk date; do
  command -v "$tool" >/dev/null 2>&1 || reject acquisition-tool-unavailable 69
done
protected_file_safe() {
  local file=$1 mode=$2 directory permissions
  [[ -f "$file" && ! -L "$file" && "$(stat -c '%u:%g:%a:%h' "$file" 2>/dev/null)" == "0:0:$mode:1" ]] || return 1
  directory=$(dirname "$file")
  while [[ "$directory" != / ]]; do
    [[ -d "$directory" && ! -L "$directory" && "$(stat -c '%u:%g' "$directory" 2>/dev/null)" == 0:0 ]] || return 1
    permissions=$(stat -c %a "$directory" 2>/dev/null)
    [[ "$permissions" =~ ^[0-7]{3,4}$ ]] && (( (8#$permissions & 0022) == 0 )) || return 1
    directory=$(dirname "$directory")
  done
}
protected_file_safe "$DESCRIPTOR_FILE" 644 || reject observation-contract-permissions 69
[[ $(stat -c %s "$DESCRIPTOR_FILE") -le 16384 ]] || reject observation-contract-size 69
descriptor=$(jq -ecS . "$DESCRIPTOR_FILE" 2>/dev/null) || reject observation-contract-json 69
contract_digest=$(printf %s "$descriptor" | sha256sum); contract_digest=${contract_digest%% *}
observations=$(jq -cn --argjson d "$descriptor" '
  $d.groups | with_entries(.value as $contract | .value =
    (($d.evidence[$contract] // $d[$contract]) | with_entries(.value={state:"unavailable",reason:"configuration"})))') || reject observation-contract-unavailable 69
fact() {
  local group=$1 key=$2 value=$3
  observations=$(jq -ec --arg g "$group" --arg k "$key" --argjson v "$value" --argjson d "$descriptor" '
    ($d.groups[$g]) as $c | (($d.evidence[$c] // $d[$c])[$k]) as $kind |
    if ($kind=="boolean" and ($v|type)=="boolean") or
      ($kind=="count" and ($v|type)=="number" and $v>=0 and $v<=9007199254740991 and $v==($v|floor))
    then .[$g][$k]={state:"observed",value:$v} else error("invalid-measurement") end' <<<"$observations") || reject observation-serialization-failed 70
}
unavailable() {
  observations=$(jq -c --arg g "$1" --arg reason "$2" '.[$g] |= with_entries(.value={state:"unavailable",reason:$reason})' <<<"$observations") || reject observation-serialization-failed 70
}
missing_fact() {
  observations=$(jq -c --arg g "$1" --arg k "$2" --arg reason "$3" '.[$g][$k]={state:"unavailable",reason:$reason}' <<<"$observations") || reject observation-serialization-failed 70
}
finish() {
  local output
  output=$(jq -cnS --argjson d "$descriptor" --arg digest "$contract_digest" --arg time "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" --argjson o "$observations" \
    '{observationSchema:$d.observationSchema,contractDigestSha256:$digest,observedAt:$time,observations:$o}') || reject observation-serialization-failed 70
  [[ ${#output} -lt $(jq -r .maximumBytes <<<"$descriptor") ]] || reject observation-size-exceeded 70
  printf '%s\n' "$output"
  exit 0
}
# Bound raw command output before decoding. Neither raw data nor stderr is emitted.
# Retain the command exit separately: exit 3 can carry a proven role mismatch.
capture() {
  local limit=$1 packet encoded
  shift
  packet=$(timeout --kill-after=1s 15s "$@" 2>/dev/null | head -c "$((limit + 1))" | base64 -w0; printf '\n%d' "$?")
  capture_exit=${packet##*$'\n'}; encoded=${packet%$'\n'*}
  capture_reason=transport
  [[ "$capture_exit" != 124 && "$capture_exit" != 137 ]] || capture_reason=timeout
  captured=''
  if ! printf %s "$encoded" | base64 -d | jq -Rse --argjson limit "$limit" 'utf8bytelength<=$limit and (contains("\u0000")|not)' >/dev/null 2>&1; then
    capture_reason=evidence-incomplete; return 1
  fi
  captured=$(printf %s "$encoded" | base64 -d)
  [[ "$capture_exit" == 0 ]]
}
count_lines() { awk 'NF {n++} END {print n+0}'; }
boolean() { if "$@"; then printf true; else printf false; fi; }

required_vars=(MOFACTS_APP_CONTAINER MOFACTS_MONGO_CONTAINER MOFACTS_REDIS_CONTAINER
  MOFACTS_MONGO_DB MOFACTS_MONGO_REPLICA_SET MOFACTS_MONGO_ADMIN_USER MOFACTS_MONGO_ADMIN_PASSWORD
  MOFACTS_MONGO_APP_USER MOFACTS_MONGO_APP_PASSWORD MOFACTS_MONGO_SIDECAR_USER MOFACTS_MONGO_APP_ROLE
  MOFACTS_SIDECAR_EXPECTED_STATE MOFACTS_REDIS_PASSWORD MOFACTS_MANAGEMENT_CIDRS
  MOFACTS_SSH_MANAGEMENT_INTERFACE APACHE_HTTPS_SITE_FILE MOFACTS_PUBLIC_HOSTNAME)
for name in "${required_vars[@]}" MOFACTS_MONGO_SIDECAR_PASSWORD MOFACTS_MONGO_SIDECAR_ROLE; do unset "$name"; done
if [[ -f "$CONFIG_FILE" && ! -L "$CONFIG_FILE" ]]; then
  fact configuration rootOwned "$(boolean test "$(stat -c %u:%g "$CONFIG_FILE")" = 0:0)"
  fact configuration rootOnly "$(boolean protected_file_safe "$CONFIG_FILE" 600)"
fi
protected_file_safe "$CONFIG_FILE" 600 || finish
[[ $(stat -c %s "$CONFIG_FILE") -le 16384 ]] || finish
# This existing root-owned Bash-assignment configuration is trusted executable
# input, as in V1. Suppress its stdout/stderr and never source caller input.
source "$CONFIG_FILE" >/dev/null 2>&1 || finish
if [[ "${MOFACTS_SIDECAR_EXPECTED_STATE:-}" == configured ]]; then
  required_vars+=(MOFACTS_MONGO_SIDECAR_PASSWORD MOFACTS_MONGO_SIDECAR_ROLE)
fi
present=0
for name in "${required_vars[@]}"; do [[ -z "${!name:-}" ]] || present=$((present + 1)); done
fact configuration requiredSettingCount "${#required_vars[@]}"
fact configuration presentSettingCount "$present"
[[ $present == ${#required_vars[@]} ]] || finish
config_valid=true
for name in "${required_vars[@]}"; do setting=${!name}; [[ ${#setting} -le 4096 ]] || config_valid=false; done
[[ "$MOFACTS_MONGO_APP_ROLE" =~ ^[A-Za-z0-9_-]{1,128}$ && "$MOFACTS_MONGO_APP_USER" != "$MOFACTS_MONGO_ADMIN_USER" \
  && "$MOFACTS_MONGO_SIDECAR_USER" != "$MOFACTS_MONGO_APP_USER" && "$MOFACTS_MONGO_SIDECAR_USER" != "$MOFACTS_MONGO_ADMIN_USER" \
  && "$MOFACTS_APP_CONTAINER" != "$MOFACTS_MONGO_CONTAINER" && "$MOFACTS_APP_CONTAINER" != "$MOFACTS_REDIS_CONTAINER" \
  && "$MOFACTS_MONGO_CONTAINER" != "$MOFACTS_REDIS_CONTAINER" ]] || config_valid=false
case "$MOFACTS_SIDECAR_EXPECTED_STATE" in
  absent) [[ -z "${MOFACTS_MONGO_SIDECAR_PASSWORD:-}" && -z "${MOFACTS_MONGO_SIDECAR_ROLE:-}" ]] || config_valid=false ;;
  configured) [[ "$MOFACTS_MONGO_SIDECAR_ROLE" =~ ^[A-Za-z0-9_-]{1,128}$ ]] || config_valid=false ;;
  *) config_valid=false ;;
esac
export MOFACTS_PUBLIC_HOSTNAME APACHE_HTTPS_SITE_FILE
protected_file_safe "$APACHE_POLICY_FILE" 644 && awk -v mode=validate -f "$APACHE_POLICY_FILE" </dev/null >/dev/null 2>&1 || config_valid=false
if [[ $config_valid != true ]]; then
  unavailable configuration configuration
  fact configuration rootOwned true; fact configuration rootOnly true
  fact configuration requiredSettingCount "${#required_vars[@]}"
  finish
fi
for group in listeners application sidecar docker firewall proxy mongoUnauthenticated mongoRoles redis; do unavailable "$group" tool-unavailable; done
fact sidecar absenceRequired "$(boolean test "$MOFACTS_SIDECAR_EXPECTED_STATE" = absent)"

if command -v ss >/dev/null 2>&1; then
  if capture 1048576 ss -H -lntup; then
    sockets=$captured
    if awk 'NF && ($1!="tcp" && $1!="udp" || NF<6) {exit 1}' <<<"$sockets"; then
      fact application expectedListenerPresent "$(boolean grep -Eq '^tcp .* 127\.0\.0\.1:3000 ' <<<"$sockets")"
      fact sidecar listenerCount "$(awk '$5 ~ /:(8931|8932)$/ {n++} END{print n+0}' <<<"$sockets")"
      fact sidecar loopbackOnly "$(boolean awk '$5 ~ /:(8931|8932)$/ && $5 !~ /^127\.0\.0\.1:/ {exit 1}' <<<"$sockets")"
      if protected_file_safe "$LISTENER_POLICY_FILE" 644 && capture 1048576 awk -f "$LISTENER_POLICY_FILE" <<<"$sockets"; then
        violations=$captured
        fact listeners inspectedListenerCount "$(printf '%s\n' "$sockets" | count_lines)"
        for tier in Standard Sensitive; do
          pattern=':(3000|27017|6379|8931|8932)([,[:space:]]|$)'
          selected=$(awk -v sensitive="$([[ $tier == Sensitive ]] && echo 1 || echo 0)" -v pattern="$pattern" 'NF && (($0 ~ pattern)==sensitive)' <<<"$violations")
          fact listeners "unexpected${tier}ListenerCount" "$(printf '%s\n' "$selected" | count_lines)"
          fact listeners "unexpected${tier}UdpListenerCount" "$(awk '/^listener\.udp:/ {n++} END{print n+0}' <<<"$selected")"
        done
      else unavailable listeners evidence-incomplete; fi
    else unavailable listeners evidence-incomplete; unavailable application evidence-incomplete; fi
  else unavailable listeners "$capture_reason"; unavailable application "$capture_reason"; unavailable sidecar "$capture_reason"; fi
fi

if command -v docker >/dev/null 2>&1; then
  # Full stopped/running inventory is required for helper absence; exact raw ID
  # and allowlisted metadata validation reuse the installed V1 policy helper.
  if protected_file_safe "$SIDECAR_POLICY_FILE" 644 && capture 16706 docker container ls --all --quiet --no-trunc --last 257; then
    ids=$(jq -Rsc 'split("\n")|map(select(length>0))|select(length<=256 and all(.[];test("^[0-9a-f]{64}$")) and (unique|length)==length)' <<<"$captured")
    if [[ -n "$ids" ]]; then
      mapfile -t inventory_ids < <(jq -r '.[]' <<<"$ids")
      inventory='[]'; inventory_ok=true
      if [[ ${#inventory_ids[@]} -gt 0 ]]; then
        format='{"id":{{json .Id}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"imageTitle":{{json (index .Config.Labels "org.opencontainers.image.title")}},"exposedPorts":{{json .Config.ExposedPorts}},"bindings":{{json .HostConfig.PortBindings}},"networkPorts":{{json .NetworkSettings.Ports}}}'
        if capture 1048576 docker container inspect --format "$format" "${inventory_ids[@]}"; then
          inventory=$(jq -sce --argjson ids "$ids" 'select((map(.id)|sort)==($ids|sort))' <<<"$captured") || inventory_ok=false
        else inventory_ok=false; fi
      fi
      if [[ $inventory_ok == true ]] && capture 4096 jq -ec -f "$SIDECAR_POLICY_FILE" <<<"$inventory"; then
        for mapping in 'helperContainerCount helperContainerCount' 'endpointDeclarationCount endpointDeclarationCount' 'publicationCount endpointPublicationCount'; do
          read -r target source <<<"$mapping"; fact sidecar "$target" "$(jq -r ".$source" <<<"$captured")"
        done
      fi
    fi
  fi
  inspected=0; invalid=0; udp=0; networks=0; docker_complete=true; redis_ports=''
  for container in "$MOFACTS_APP_CONTAINER" "$MOFACTS_MONGO_CONTAINER" "$MOFACTS_REDIS_CONTAINER"; do
    if capture 65536 docker inspect --format '{"ports":{{json .NetworkSettings.Ports}},"networkMode":{{json .HostConfig.NetworkMode}}}' "$container" \
      && jq -e 'type=="object" and keys==["networkMode","ports"] and (.networkMode|type)=="string" and
        (.ports==null or (.ports|type)=="object") and all((.ports//{}|to_entries)[];
          (.key|test("^[1-9][0-9]{0,4}/(tcp|udp|sctp)$")) and (.value==null or
          ((.value|type)=="array" and all(.value[];type=="object" and keys==["HostIp","HostPort"] and
            (.HostIp|type)=="string" and (.HostPort|type)=="string"))))' <<<"$captured" >/dev/null 2>&1; then
      inspected=$((inspected + 1))
      [[ $container != "$MOFACTS_REDIS_CONTAINER" ]] || redis_ports=$(jq -c .ports <<<"$captured")
      if [[ $container == "$MOFACTS_APP_CONTAINER" ]]; then
        fact docker expectedApplicationPublicationCount "$(jq '[.ports["3000/tcp"][]? | select(.HostIp=="127.0.0.1" and .HostPort=="3000")]|length' <<<"$captured")"
      fi
      delta=$(jq --argjson app "$(boolean test "$container" = "$MOFACTS_APP_CONTAINER")" '[.ports//{}|to_entries[]|.key as $port|.value[]?|
        select(.HostIp!="127.0.0.1" or ($app|not) or $port!="3000/tcp" or .HostPort!="3000")]|length' <<<"$captured")
      invalid=$((invalid + delta))
      delta=$(jq '[.ports//{}|to_entries[]|select(.key|endswith("/udp"))|.value[]?]|length' <<<"$captured"); udp=$((udp + delta))
      mode=$(jq -r .networkMode <<<"$captured")
      [[ $mode != host && $mode != none && $mode != default && $mode != bridge ]] || networks=$((networks + 1))
    else docker_complete=false; fi
  done
  fact docker inspectedContainerCount "$inspected"
  if [[ $docker_complete == true ]]; then
    fact docker unexpectedPublicationCount "$invalid"; fact docker unexpectedUdpPublicationCount "$udp"; fact docker privateNetworkModeCount "$networks"
  else
    # Positive violations survive incomplete inspection; zero never means safe.
    [[ $invalid == 0 ]] || fact docker unexpectedPublicationCount "$invalid"
    [[ $udp == 0 ]] || fact docker unexpectedUdpPublicationCount "$udp"
    [[ $networks == 0 ]] || fact docker privateNetworkModeCount "$networks"
  fi
  [[ -z $redis_ports ]] || fact redis hostPublicationCount "$(jq '[.//{}|to_entries[]|.value[]?]|length' <<<"$redis_ports")"
fi

if command -v ufw >/dev/null 2>&1; then
  if capture 65536 ufw status verbose; then
    if grep -Eq '^Status: (active|inactive)$' <<<"$captured"; then fact firewall firewallActive "$(boolean grep -Eq '^Status: active$' <<<"$captured")"; fi
    if grep -Eq 'Default: (deny|allow|reject) \(incoming\)' <<<"$captured"; then fact firewall defaultDenyInbound "$(boolean grep -Eq 'Default: deny \(incoming\)' <<<"$captured")"; fi
  fi
  if protected_file_safe "$FIREWALL_POLICY_FILE" 644 && capture 65536 ufw show added; then
    rules=$captured
    if capture 65536 awk -v management_interface="$MOFACTS_SSH_MANAGEMENT_INTERFACE" -v management_cidrs="$MOFACTS_MANAGEMENT_CIDRS" -f "$FIREWALL_POLICY_FILE" <<<"$rules"; then
      violations=$captured
      fact firewall publicWebAllowed "$(boolean test "$(grep -c '^firewall.web-rule-count:' <<<"$violations")" = 0)"
      fact firewall scopedSshOnly "$(boolean test "$(grep -Ec '^firewall.ssh-rule-count:|^firewall.unapproved-rule:.*(port 22|22/tcp)' <<<"$violations")" = 0)"
      fact firewall unexpectedAllowRuleCount "$(awk '/^firewall.unapproved-rule:/ {n++} END{print n+0}' <<<"$violations")"
      fact firewall unexpectedUdpAllowRuleCount "$(awk '/^firewall.unapproved-rule:/ && $0 !~ /\/tcp([[:space:]]|$)/ && $0 !~ /proto[[:space:]]+tcp([[:space:]]|$)/ {n++} END{print n+0}' <<<"$violations")"
    fi
  fi
fi

if command -v systemctl >/dev/null 2>&1; then
  capture 4096 systemctl is-active apache2 || true
  if [[ $capture_exit == 0 && $captured == active ]]; then fact proxy apacheActive true
  elif [[ $capture_exit == 3 && ( $captured == inactive || $captured == failed ) ]]; then fact proxy apacheActive false
  else missing_fact proxy apacheActive "$capture_reason"; fi
fi
if command -v apache2ctl >/dev/null 2>&1; then
  capture 4096 sh -c 'exec apache2ctl "$@" 2>&1' audit-apache configtest || true
  if [[ $capture_exit == 0 && $captured == 'Syntax OK' ]]; then fact proxy apacheConfigValid true
  elif [[ $capture_exit == 1 ]] && grep -Eq '(^|[[:space:]])(AH00526: )?Syntax error' <<<"$captured"; then fact proxy apacheConfigValid false
  else missing_fact proxy apacheConfigValid "$capture_reason"; fi
fi
if command -v apache2ctl >/dev/null 2>&1 && protected_file_safe "$APACHE_POLICY_FILE" 644 && [[ -f "$APACHE_HTTPS_SITE_FILE" ]]; then
  if capture 65536 cat "$APACHE_HTTPS_SITE_FILE"; then
    site=$captured
    targets=$(awk 'tolower($1)~/^(proxypass|proxypassmatch|proxypassreverse)$/ {for(i=2;i<=NF;i++) if($i~/^(http|ws)s?:\/\//) print $i}' <<<"$site")
    fact proxy inspectedUpstreamCount "$(printf '%s\n' "$targets" | count_lines)"
    for protocol in http ws; do
      if [[ $protocol == http ]]; then key=httpLoopbackOnly; else key=websocketLoopbackOnly; fi
      fact proxy "$key" "$(boolean awk -v p="$protocol" '$0 ~ "^"p"s?://" && $0 !~ "^"p"://127[.]0[.]0[.]1:3000(/|$)" {exit 1}' <<<"$targets")"
    done
    if capture 65536 awk -v mode=configured-hosts -f "$APACHE_POLICY_FILE" <<<"$site"; then
      invalid_hosts=$captured
      if capture 65536 sh -c 'exec apache2ctl "$@" 2>&1' audit-apache -S; then
        vhosts=$captured
        if capture 4096 awk -v mode=active-vhosts -f "$APACHE_POLICY_FILE" <<<"$vhosts"; then
          active_vhosts=$captured
          fact proxy configuredHostMatched "$(boolean test "$invalid_hosts:$active_vhosts:$(grep -Ec '^<VirtualHost[[:space:]]+\*:443>$' <<<"$site")" = 0:1:1)"
        fi
      fi
    fi
  fi
fi

if command -v docker >/dev/null 2>&1; then
  mongo_probe() {
    local operation=$1 user=$2 password=$3 auth_db=$4
    local input
    input=$(jq -cn --arg database "$MOFACTS_MONGO_DB" --arg replicaSet "$MOFACTS_MONGO_REPLICA_SET" \
      --arg operation "$operation" --arg username "$user" --arg password "$password" --arg authenticationDatabase "$auth_db" \
      '{database:$database,replicaSet:$replicaSet,operation:$operation,username:$username,password:$password,authenticationDatabase:$authenticationDatabase}')
    capture 256 docker exec -i -e MOFACTS_AUDIT_MONGO_CONNECTIVITY="$input" "$MOFACTS_MONGO_CONTAINER" \
      mongosh --quiet --host 127.0.0.1 --port 27017 --file /dev/stdin < "$MONGO_CONNECTIVITY_FILE"
  }
  if protected_file_safe "$MONGO_CONNECTIVITY_FILE" 644; then
    if mongo_probe unauthenticated '' '' ''; then
      if jq -e 'keys==["state","value"] and .state=="observed" and (.value|type)=="boolean"' <<<"$captured" >/dev/null 2>&1; then
        fact mongoUnauthenticated unauthenticatedReadAccepted "$(jq -r .value <<<"$captured")"
      fi
    else missing_fact mongoUnauthenticated unauthenticatedReadAccepted "$capture_reason"; fi
    connected=true
    if mongo_probe replica "$MOFACTS_MONGO_ADMIN_USER" "$MOFACTS_MONGO_ADMIN_PASSWORD" admin; then
      if jq -e 'keys==["state","value"] and .state=="observed" and (.value|type)=="boolean"' <<<"$captured" >/dev/null 2>&1; then
        fact mongoRoles replicaSetMatched "$(jq -r .value <<<"$captured")"
      else connected=false; fi
    else connected=false; fi
    if ! mongo_probe authenticated "$MOFACTS_MONGO_APP_USER" "$MOFACTS_MONGO_APP_PASSWORD" "$MOFACTS_MONGO_DB" \
      || ! jq -e 'keys==["state","value"] and .state=="observed" and .value==true' <<<"$captured" >/dev/null 2>&1; then connected=false; fi
    if [[ $MOFACTS_SIDECAR_EXPECTED_STATE == configured ]]; then
      if ! mongo_probe authenticated "$MOFACTS_MONGO_SIDECAR_USER" "$MOFACTS_MONGO_SIDECAR_PASSWORD" "$MOFACTS_MONGO_DB" \
        || ! jq -e 'keys==["state","value"] and .state=="observed" and .value==true' <<<"$captured" >/dev/null 2>&1; then connected=false; fi
    fi
    # False connectivity means unavailable assurance in the shared evaluator.
    fact mongoRoles authenticatedConnectivity "$connected"
  fi
  if protected_file_safe "$MONGO_ROLE_PROBE_FILE" 644 && protected_file_safe "$READ_CONCERN_ROLE_FILE" 644 \
    && [[ $(stat -c %s "$MONGO_ROLE_PROBE_FILE") -le 32768 && $(stat -c %s "$READ_CONCERN_ROLE_FILE") -le 4096 ]]; then
    role_input=$(jq -cn --arg database "$MOFACTS_MONGO_DB" --arg appUser "$MOFACTS_MONGO_APP_USER" --arg appRole "$MOFACTS_MONGO_APP_ROLE" \
      --arg sidecarUser "$MOFACTS_MONGO_SIDECAR_USER" --arg sidecarExpectedState "$MOFACTS_SIDECAR_EXPECTED_STATE" --arg sidecarRole "${MOFACTS_MONGO_SIDECAR_ROLE:-}" \
      '{database:$database,appUser:$appUser,appRole:$appRole,sidecarUser:$sidecarUser,sidecarExpectedState:$sidecarExpectedState}+
        (if $sidecarExpectedState=="configured" then {sidecarRole:$sidecarRole} else {} end)')
    role_auth=$(jq -cn --arg username "$MOFACTS_MONGO_ADMIN_USER" --arg password "$MOFACTS_MONGO_ADMIN_PASSWORD" '{username:$username,password:$password}')
    role_definition=$(cat "$READ_CONCERN_ROLE_FILE")
    # Authentication stays in the existing exec environment/stdin path. No
    # credential-bearing command output or mongosh argument is retained.
    role_program=$(printf '%s\n' 'try { const c=JSON.parse(process.env.MOFACTS_AUDIT_MONGO_AUTH); if (!db.getSiblingDB("admin").auth(c.username,c.password).ok) quit(70); } catch { quit(70); }'; cat "$MONGO_ROLE_PROBE_FILE")
    capture 256 docker exec -i -e MOFACTS_AUDIT_MONGO_INPUT="$role_input" -e MOFACTS_AUDIT_MONGO_AUTH="$role_auth" \
      -e MOFACTS_AUDIT_READ_CONCERN_ROLE="$role_definition" "$MOFACTS_MONGO_CONTAINER" mongosh --quiet --host 127.0.0.1 --port 27017 --file /dev/stdin <<<"$role_program" || true
    if jq -e --arg mode "$MOFACTS_SIDECAR_EXPECTED_STATE" --argjson code "$capture_exit" '
      (if $mode=="absent" then "sidecarUserAbsent" else "sidecarRolesExact" end) as $key |
      keys==(["state","appRolesExact","readConcernRoleExact",$key]|sort) and .state=="observed" and
      ([.appRolesExact,.readConcernRoleExact,.[$key]]|all(type=="boolean")) and
      (([.appRolesExact,.readConcernRoleExact,.[$key]]|all(.==true)) as $all | ($code==0 and $all) or ($code==3 and ($all|not)))' <<<"$captured" >/dev/null 2>&1 \
      && [[ "$captured" == "$(jq -c . <<<"$captured")" ]]; then
      fact mongoRoles applicationGrantsMatched "$(jq -r .appRolesExact <<<"$captured")"
      fact mongoRoles readConcernRoleMatched "$(jq -r .readConcernRoleExact <<<"$captured")"
      if [[ $MOFACTS_SIDECAR_EXPECTED_STATE == absent ]]; then key=sidecarUserAbsent; else key=sidecarRolesExact; fi
      fact mongoRoles sidecarAccountStateMatched "$(jq -r ".$key" <<<"$captured")"
    fi
  fi
  if capture 256 docker exec "$MOFACTS_REDIS_CONTAINER" redis-cli --no-auth-warning --raw PING; then
    if [[ $captured == PONG ]]; then fact redis unauthenticatedCommandAccepted true
    elif [[ $captured =~ ^NOAUTH([[:space:]]|$) ]]; then fact redis unauthenticatedCommandAccepted false; fi
  else missing_fact redis unauthenticatedCommandAccepted "$capture_reason"; fi
  if capture 256 docker exec -e REDISCLI_AUTH="$MOFACTS_REDIS_PASSWORD" "$MOFACTS_REDIS_CONTAINER" redis-cli --no-auth-warning --raw PING && [[ $captured == PONG ]]; then
    fact redis auditConnectivity true
  else missing_fact redis auditConnectivity "$capture_reason"; fi
  if capture 256 docker exec "$MOFACTS_APP_CONTAINER" node -e '
    const net=require("net");
    try {
      const u=new URL(process.env.REDIS_URL);
      if(u.protocol!=="redis:" || !u.password) process.exit(70);
      const password=decodeURIComponent(u.password), username=decodeURIComponent(u.username);
      const auth=username?["AUTH",username,password]:["AUTH",password];
      const encode=parts=>Buffer.from(`*${parts.length}\r\n${parts.map(p=>`$${Buffer.byteLength(p)}\r\n${p}\r\n`).join("")}`);
      const socket=net.connect({host:u.hostname,port:Number(u.port||6379)});
      let response=""; const timer=setTimeout(()=>process.exit(70),5000);
      socket.on("error",()=>process.exit(70));
      socket.on("connect",()=>socket.write(Buffer.concat([encode(auth),encode(["PING"])])));
      socket.on("data",chunk=>{
        response+=chunk.toString("utf8"); if(response.length>256) process.exit(70);
        if(response==="+OK\r\n+PONG\r\n") {clearTimeout(timer);socket.destroy();process.stdout.write("connected");}
      });
    } catch {process.exit(70);}' && [[ $captured == connected ]]; then fact redis applicationConnectivity true
  else missing_fact redis applicationConnectivity "$capture_reason"; fi
fi
finish
