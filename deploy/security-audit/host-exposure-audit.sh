#!/usr/bin/env bash
# Root-owned forced SSH command for the MoFaCTS observation-only host audit.
# It accepts no arguments and emits sanitized JSON only. It never changes host state.
set -u

CONFIG_FILE=/etc/mofacts/security-audit.conf
controls='[]'

add_control() {
  local id="$1" title="$2" status="$3" severity="$4" summary="$5"
  controls="$(jq -cn --argjson existing "$controls" --arg id "$id" --arg title "$title" \
    --arg status "$status" --arg severity "$severity" --arg summary "$summary" \
    '$existing + [{controlId:$id,title:$title,status:$status,severity:$severity,evidence:{summary:$summary}}]')"
}

error_control() {
  add_control "$1" "$2" ERROR HIGH "$3"
}

if [[ $# -ne 0 ]] || [[ -n "${SSH_ORIGINAL_COMMAND:-}" ]]; then
  printf '%s\n' '{"error":"arguments-are-not-accepted"}'
  exit 64
fi

if [[ "$(id -u)" -ne 0 ]]; then
  printf '%s\n' '{"error":"root-is-required"}'
  exit 77
fi

if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' '{"error":"jq-is-required"}'
  exit 69
fi

if [[ ! -f "$CONFIG_FILE" ]] || [[ "$(stat -c '%U:%G:%a' "$CONFIG_FILE" 2>/dev/null)" != "root:root:600" ]]; then
  error_control internal.audit-config 'Audit configuration is root-only and complete' 'The root-owned mode-0600 audit configuration is missing or has invalid ownership or permissions.'
  printf '%s\n' "$(jq -cn --argjson controls "$controls" '{sectionId:"internal",status:"ERROR",controls:$controls}')"
  exit 0
fi

# shellcheck disable=SC1090
source "$CONFIG_FILE"

required_vars=(
  MOFACTS_APP_CONTAINER MOFACTS_MONGO_CONTAINER MOFACTS_REDIS_CONTAINER
  MOFACTS_MONGO_DB MOFACTS_MONGO_REPLICA_SET MOFACTS_MONGO_ADMIN_USER MOFACTS_MONGO_ADMIN_PASSWORD
  MOFACTS_MONGO_APP_USER MOFACTS_MONGO_APP_PASSWORD MOFACTS_MONGO_SIDECAR_USER MOFACTS_MONGO_SIDECAR_PASSWORD
  MOFACTS_MONGO_APP_ROLE MOFACTS_MONGO_SIDECAR_ROLE
  MOFACTS_REDIS_PASSWORD
  MOFACTS_MANAGEMENT_CIDRS CADDY_CONFIG_FILE
)
missing=0
for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then missing=$((missing + 1)); fi
done
if [[ "$missing" -eq 0 ]] && { [[ ! "$MOFACTS_MONGO_APP_ROLE" =~ ^[A-Za-z0-9_-]+$ ]] || [[ ! "$MOFACTS_MONGO_SIDECAR_ROLE" =~ ^[A-Za-z0-9_-]+$ ]]; }; then
  missing=$((missing + 1))
fi
if [[ "$missing" -eq 0 ]]; then
  add_control internal.audit-config 'Audit configuration is root-only and complete' PASS INFO 'Every required audit setting is present in the protected host configuration.'
else
  error_control internal.audit-config 'Audit configuration is root-only and complete' "$missing required or valid protected audit settings are missing."
  error_control internal.listening-sockets 'Host listening sockets match the approved exposure' 'Protected audit configuration is incomplete.'
  error_control internal.app-loopback 'Application listens on loopback port 3000' 'Protected audit configuration is incomplete.'
  error_control internal.sidecar-loopback 'Sidecar ports are absent or loopback-only' 'Protected audit configuration is incomplete.'
  error_control internal.docker-ports 'Docker publishes only approved loopback ports' 'Protected audit configuration is incomplete.'
  error_control internal.firewall 'UFW is default-deny with scoped SSH and public web only' 'Protected audit configuration is incomplete.'
  error_control internal.caddy-routes 'Caddy routes only the production host to the loopback app' 'Protected audit configuration is incomplete.'
  error_control internal.mongodb-auth 'MongoDB authentication, replica set, and scoped roles are enforced' 'Protected audit configuration is incomplete.'
  error_control internal.redis-auth 'Redis requires authentication and remains private' 'Protected audit configuration is incomplete.'
  printf '%s\n' "$(jq -cn --argjson controls "$controls" \
    '{sectionId:"internal",status:"ERROR",controls:$controls,productionImage:"unknown",toolVersions:{}}')"
  exit 0
fi

if command -v ss >/dev/null 2>&1; then
  sockets="$(ss -H -lntup 2>/dev/null || true)"
  public_unexpected="$(awk '$1=="tcp" || $1=="udp" {local=$5; sub(/^.*:/,"",local); addr=$5; sub(/:[^:]*$/,"",addr); if (addr!="127.0.0.1" && addr!="[::1]" && addr!="::1" && addr!="localhost" && addr!="127.0.0.53%lo") {if (!(($1=="tcp") && (local=="80" || local=="443" || local=="22"))) count++}} END{print count+0}' <<<"$sockets")"
  app_count="$(grep -Ec '127\.0\.0\.1:3000\b' <<<"$sockets" || true)"
  sidecar_bad="$(awk '$5 ~ /:(8931|8932)$/ && $5 !~ /^127\.0\.0\.1:/ {count++} END{print count+0}' <<<"$sockets")"
  sidecar_count="$(grep -Ec '127\.0\.0\.1:(8931|8932)\b' <<<"$sockets" || true)"
  if [[ "$public_unexpected" -eq 0 ]]; then
    add_control internal.listening-sockets 'Host listening sockets match the approved exposure' PASS CRITICAL 'No unexpected non-loopback listener was found; SSH is evaluated with firewall scope separately.'
  else
    add_control internal.listening-sockets 'Host listening sockets match the approved exposure' FAIL CRITICAL "$public_unexpected unexpected non-loopback listeners were found."
  fi
  if [[ "$app_count" -ge 1 ]]; then
    add_control internal.app-loopback 'Application listens on loopback port 3000' PASS HIGH 'The application listener is present on 127.0.0.1:3000.'
  else
    add_control internal.app-loopback 'Application listens on loopback port 3000' FAIL HIGH 'The required 127.0.0.1:3000 listener is absent.'
  fi
  if [[ "$sidecar_bad" -eq 0 && ( "$sidecar_count" -eq 0 || "$sidecar_count" -eq 2 ) ]]; then
    add_control internal.sidecar-loopback 'Sidecar ports are absent or loopback-only' PASS CRITICAL 'Sidecar ports are absent or both bound only to 127.0.0.1.'
  else
    add_control internal.sidecar-loopback 'Sidecar ports are absent or loopback-only' FAIL CRITICAL 'Sidecar port bindings do not match the absent-or-two-loopback-only contract.'
  fi
else
  error_control internal.listening-sockets 'Host listening sockets match the approved exposure' 'ss is unavailable.'
  error_control internal.app-loopback 'Application listens on loopback port 3000' 'ss is unavailable.'
  error_control internal.sidecar-loopback 'Sidecar ports are absent or loopback-only' 'ss is unavailable.'
fi

if command -v docker >/dev/null 2>&1 && [[ -n "${MOFACTS_APP_CONTAINER:-}" ]]; then
  docker_ports='[]'
  inspect_error=0
  for container in "$MOFACTS_APP_CONTAINER" "$MOFACTS_MONGO_CONTAINER" "$MOFACTS_REDIS_CONTAINER"; do
    value="$(docker inspect --format '{{json .NetworkSettings.Ports}}' "$container" 2>/dev/null)" || inspect_error=1
    network_mode="$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$container" 2>/dev/null)" || inspect_error=1
    docker_ports="$(jq -cn --argjson values "$docker_ports" --arg container "$container" --arg networkMode "$network_mode" --argjson ports "${value:-null}" '$values + [{container:$container,ports:$ports,networkMode:$networkMode}]')"
  done
  if [[ "$inspect_error" -ne 0 ]]; then
    error_control internal.docker-ports 'Docker publishes only approved loopback ports' 'A configured container could not be inspected.'
  else
    invalid="$(jq --arg app "$MOFACTS_APP_CONTAINER" --arg mongo "$MOFACTS_MONGO_CONTAINER" --arg redis "$MOFACTS_REDIS_CONTAINER" \
      '[.[] | .container as $container | .ports // {} | to_entries[] | .key as $containerPort | .value[]? | select((.HostIp != "127.0.0.1") or $container == $mongo or $container == $redis or ($container == $app and ($containerPort != "3000/tcp" or .HostPort != "3000")))] | length' <<<"$docker_ports")"
    app_bind_count="$(jq --arg app "$MOFACTS_APP_CONTAINER" '[.[] | select(.container == $app) | .ports["3000/tcp"][]? | select(.HostIp == "127.0.0.1" and .HostPort == "3000")] | length' <<<"$docker_ports")"
    invalid_networks="$(jq '[.[] | select(.networkMode == "host" or .networkMode == "none" or .networkMode == "default" or .networkMode == "bridge")] | length' <<<"$docker_ports")"
    if [[ "$invalid" -eq 0 && "$invalid_networks" -eq 0 && "$app_bind_count" -eq 1 ]]; then
      add_control internal.docker-ports 'Docker publishes only approved loopback ports' PASS CRITICAL 'MongoDB and Redis have no host publication, and all other inspected publications are loopback-only.'
    else
      add_control internal.docker-ports 'Docker publishes only approved loopback ports' FAIL CRITICAL 'Docker host publications or private network modes do not match policy.'
    fi
  fi
else
  error_control internal.docker-ports 'Docker publishes only approved loopback ports' 'Docker or required container configuration is unavailable.'
fi

if command -v ufw >/dev/null 2>&1; then
  ufw_status="$(ufw status verbose 2>/dev/null || true)"
  default_deny="$(grep -Eic 'Default: deny \(incoming\)' <<<"$ufw_status" || true)"
  broad_ssh="$(grep -Eic '^22(/tcp)?([[:space:]]+\(v6\))?[[:space:]]+ALLOW IN[[:space:]]+Anywhere' <<<"$ufw_status" || true)"
  ssh_allow_rules="$(grep -E '^22(/tcp)?([[:space:]]+\(v6\))?[[:space:]]+ALLOW IN' <<<"$ufw_status" || true)"
  cidr_missing=0
  unauthorized_ssh=0
  IFS=',' read -r -a management_cidrs <<<"${MOFACTS_MANAGEMENT_CIDRS:-}"
  for cidr in "${management_cidrs[@]}"; do
    if ! grep -Fq "$cidr" <<<"$ssh_allow_rules"; then cidr_missing=$((cidr_missing + 1)); fi
  done
  while IFS= read -r rule; do
    [[ -z "$rule" ]] && continue
    matched=0
    for cidr in "${management_cidrs[@]}"; do
      if [[ "$rule" == *"$cidr"* ]]; then matched=1; break; fi
    done
    if [[ "$matched" -eq 0 ]]; then unauthorized_ssh=$((unauthorized_ssh + 1)); fi
  done <<<"$ssh_allow_rules"
  web_rules="$(grep -Ec '^(80|443)(/tcp)?([[:space:]]+\(v6\))?[[:space:]]+ALLOW IN[[:space:]]+Anywhere' <<<"$ufw_status" || true)"
  unexpected_allow_rules="$(awk '$0 ~ /ALLOW IN/ && $1 !~ /^(22|80|443)(\/tcp)?$/ {count++} END{print count+0}' <<<"$ufw_status")"
  if [[ "$default_deny" -ge 1 && "$broad_ssh" -eq 0 && "$cidr_missing" -eq 0 && "$unauthorized_ssh" -eq 0 && "$web_rules" -ge 2 && "$unexpected_allow_rules" -eq 0 ]]; then
    add_control internal.firewall 'UFW is default-deny with scoped SSH and public web only' PASS CRITICAL 'UFW has default-deny inbound, web allow rules, and only configured management CIDRs for SSH.'
  else
    add_control internal.firewall 'UFW is default-deny with scoped SSH and public web only' FAIL CRITICAL 'UFW default policy, web rules, or SSH management-CIDR scope does not match policy.'
  fi
else
  error_control internal.firewall 'UFW is default-deny with scoped SSH and public web only' 'ufw is unavailable.'
fi

if command -v caddy >/dev/null 2>&1 && [[ -f "${CADDY_CONFIG_FILE:-}" ]]; then
  caddy_json="$(caddy adapt --config "$CADDY_CONFIG_FILE" 2>/dev/null)" || caddy_json=''
  if jq -e . >/dev/null 2>&1 <<<"$caddy_json"; then
    route_hosts="$(jq '[.. | objects | .host? // empty | arrays | .[] | select(. == "mofacts.optimallearning.org")] | length' <<<"$caddy_json")"
    invalid_hosts="$(jq '[.. | objects | .host? // empty | arrays | .[] | select(. != "mofacts.optimallearning.org")] | length' <<<"$caddy_json")"
    upstreams="$(jq -c '[.. | objects | .upstreams? // empty | arrays | .[] | .dial? // empty]' <<<"$caddy_json")"
    invalid_upstreams="$(jq '[.[] | select(. != "127.0.0.1:3000")] | length' <<<"$upstreams")"
    upstream_count="$(jq 'length' <<<"$upstreams")"
    if [[ "$route_hosts" -ge 1 && "$invalid_hosts" -eq 0 && "$upstream_count" -ge 1 && "$invalid_upstreams" -eq 0 ]]; then
      add_control internal.caddy-routes 'Caddy routes only the production host to the loopback app' PASS CRITICAL 'All adapted reverse-proxy upstreams target 127.0.0.1:3000 and the production host matcher is present.'
    else
      add_control internal.caddy-routes 'Caddy routes only the production host to the loopback app' FAIL CRITICAL 'The adapted Caddy host or upstream routes do not match the single approved production route.'
    fi
  else
    error_control internal.caddy-routes 'Caddy routes only the production host to the loopback app' 'Caddy configuration could not be adapted to valid JSON.'
  fi
else
  error_control internal.caddy-routes 'Caddy routes only the production host to the loopback app' 'Caddy or its configured file is unavailable.'
fi

mongo_exec=(docker exec "$MOFACTS_MONGO_CONTAINER" mongosh --quiet --host 127.0.0.1 --port 27017)
if command -v docker >/dev/null 2>&1 && [[ "$missing" -eq 0 ]]; then
  unauth_mongo="$(${mongo_exec[@]} --eval "quit(db.getSiblingDB('$MOFACTS_MONGO_DB').runCommand({find:'tdfs',filter:{},limit:1}).ok ? 0 : 1)" >/dev/null 2>&1; echo $?)"
  auth_mongo="$(docker exec "$MOFACTS_MONGO_CONTAINER" mongosh --quiet --host 127.0.0.1 --port 27017 \
    --username "$MOFACTS_MONGO_ADMIN_USER" --password "$MOFACTS_MONGO_ADMIN_PASSWORD" --authenticationDatabase admin \
    --eval "const h=db.hello(); quit(h.setName === '$MOFACTS_MONGO_REPLICA_SET' ? 0 : 2)" >/dev/null 2>&1; echo $?)"
  role_mongo="$(docker exec "$MOFACTS_MONGO_CONTAINER" mongosh --quiet --host 127.0.0.1 --port 27017 \
    --username "$MOFACTS_MONGO_ADMIN_USER" --password "$MOFACTS_MONGO_ADMIN_PASSWORD" --authenticationDatabase admin \
    --eval "const a=db.getSiblingDB('$MOFACTS_MONGO_DB'); const app=a.getUser('$MOFACTS_MONGO_APP_USER'); const sidecar=a.getUser('$MOFACTS_MONGO_SIDECAR_USER'); const exact=(u,role)=>u && u.roles.length===1 && u.roles[0].db==='$MOFACTS_MONGO_DB' && u.roles[0].role===role; quit(exact(app,'$MOFACTS_MONGO_APP_ROLE') && exact(sidecar,'$MOFACTS_MONGO_SIDECAR_ROLE') ? 0 : 3)" >/dev/null 2>&1; echo $?)"
  app_mongo="$(docker exec "$MOFACTS_MONGO_CONTAINER" mongosh --quiet --host 127.0.0.1 --port 27017 \
    --username "$MOFACTS_MONGO_APP_USER" --password "$MOFACTS_MONGO_APP_PASSWORD" --authenticationDatabase "$MOFACTS_MONGO_DB" \
    --eval "quit(db.getSiblingDB('$MOFACTS_MONGO_DB').runCommand({find:'tdfs',filter:{},limit:1}).ok ? 0 : 4)" >/dev/null 2>&1; echo $?)"
  sidecar_mongo="$(docker exec "$MOFACTS_MONGO_CONTAINER" mongosh --quiet --host 127.0.0.1 --port 27017 \
    --username "$MOFACTS_MONGO_SIDECAR_USER" --password "$MOFACTS_MONGO_SIDECAR_PASSWORD" --authenticationDatabase "$MOFACTS_MONGO_DB" \
    --eval "quit(db.getSiblingDB('$MOFACTS_MONGO_DB').runCommand({find:'tdfs',filter:{},limit:1}).ok ? 0 : 5)" >/dev/null 2>&1; echo $?)"
  if [[ "$unauth_mongo" -ne 0 && "$auth_mongo" -eq 0 && "$role_mongo" -eq 0 && "$app_mongo" -eq 0 && "$sidecar_mongo" -eq 0 ]]; then
    add_control internal.mongodb-auth 'MongoDB authentication, replica set, and scoped roles are enforced' PASS CRITICAL 'Unauthenticated access was denied; authenticated replica-set and scoped-role probes succeeded.'
  else
    add_control internal.mongodb-auth 'MongoDB authentication, replica set, and scoped roles are enforced' FAIL CRITICAL 'One or more MongoDB authentication, replica-set, or role-scope probes failed policy.'
  fi
else
  error_control internal.mongodb-auth 'MongoDB authentication, replica set, and scoped roles are enforced' 'Docker or protected MongoDB audit configuration is unavailable.'
fi

if command -v docker >/dev/null 2>&1 && [[ "$missing" -eq 0 ]]; then
  unauth_redis="$(docker exec "$MOFACTS_REDIS_CONTAINER" redis-cli --no-auth-warning PING >/dev/null 2>&1; echo $?)"
  auth_redis="$(docker exec -e REDISCLI_AUTH="$MOFACTS_REDIS_PASSWORD" "$MOFACTS_REDIS_CONTAINER" redis-cli --no-auth-warning PING >/dev/null 2>&1; echo $?)"
  redis_publication="$(docker inspect --format '{{json .NetworkSettings.Ports}}' "$MOFACTS_REDIS_CONTAINER" 2>/dev/null | jq '[to_entries[] | .value[]?] | length' 2>/dev/null || echo 1)"
  app_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$MOFACTS_APP_CONTAINER" 2>/dev/null || true)"
  if [[ "$unauth_redis" -ne 0 && "$auth_redis" -eq 0 && "$redis_publication" -eq 0 && "$app_health" == healthy ]]; then
    add_control internal.redis-auth 'Redis requires authentication and remains private' PASS CRITICAL 'Unauthenticated Redis was denied, authenticated connectivity succeeded, and no host publication exists.'
  else
    add_control internal.redis-auth 'Redis requires authentication and remains private' FAIL CRITICAL 'Redis authentication, authenticated connectivity, or private publication policy failed.'
  fi
else
  error_control internal.redis-auth 'Redis requires authentication and remains private' 'Docker or protected Redis audit configuration is unavailable.'
fi

status="$(jq -r 'if any(.[]; .status=="ERROR") then "ERROR" elif any(.[]; .status=="FAIL") then "FAIL" elif any(.[]; .status=="PASS") then "PASS" else "NOT_APPLICABLE" end' <<<"$controls")"
production_image="$(docker inspect --format '{{.Image}}' "${MOFACTS_APP_CONTAINER:-}" 2>/dev/null || true)"
tool_versions="$(jq -cn \
  --arg docker "$(docker --version 2>/dev/null | head -n1 || echo unavailable)" \
  --arg caddy "$(caddy version 2>/dev/null | head -n1 || echo unavailable)" \
  --arg mongosh "$(docker exec "${MOFACTS_MONGO_CONTAINER:-}" mongosh --version 2>/dev/null | head -n1 || echo unavailable)" \
  --arg redisCli "$(docker exec "${MOFACTS_REDIS_CONTAINER:-}" redis-cli --version 2>/dev/null | head -n1 || echo unavailable)" \
  '{docker:$docker,caddy:$caddy,mongosh:$mongosh,"redis-cli":$redisCli}')"
printf '%s\n' "$(jq -cn --arg status "$status" --argjson controls "$controls" \
  --arg productionImage "${production_image:-unknown}" --argjson toolVersions "$tool_versions" \
  '{sectionId:"internal",status:$status,controls:$controls,productionImage:$productionImage,toolVersions:$toolVersions}')"
