#!/usr/bin/env bash
# Root-owned forced SSH command for the MoFaCTS observation-only host audit.
# It accepts no arguments and emits sanitized JSON only. It never changes host state.
set -u
set -o pipefail
export LC_ALL=C

CONFIG_FILE=/etc/mofacts/security-audit.conf
LISTENER_POLICY_FILE=/usr/local/libexec/mofacts-security-audit/host-listener-policy.awk
FIREWALL_POLICY_FILE=/usr/local/libexec/mofacts-security-audit/host-firewall-policy.awk
APACHE_POLICY_FILE=/usr/local/libexec/mofacts-security-audit/host-apache-policy.awk
SIDECAR_POLICY_FILE=/usr/local/libexec/mofacts-security-audit/host-sidecar-policy.jq
MONGO_ROLE_PROBE_FILE=/usr/local/libexec/mofacts-security-audit/host-mongo-roles.js
READ_CONCERN_ROLE_FILE=/usr/local/libexec/mofacts-security-audit/read-default-concern-role.json
RELEASE_RECEIPT_TOOL=/usr/local/libexec/mofacts-security-audit/release-receipt.sh
controls='[]'

add_control() {
  local id="$1" title="$2" status="$3" severity="$4" summary="$5"
  local observations='[]' metrics='{}'
  if [[ $# -ge 6 ]]; then observations="$6"; fi
  if [[ $# -ge 7 ]]; then metrics="$7"; fi
  controls="$(jq -cn --argjson existing "$controls" --arg id "$id" --arg title "$title" \
    --arg status "$status" --arg severity "$severity" --arg summary "$summary" \
    --argjson observations "$observations" --argjson metrics "$metrics" \
    '$existing + [{controlId:$id,title:$title,status:$status,severity:$severity,evidence:
      ({summary:$summary}
      + (if ($observations | length) > 0 then {observations:$observations} else {} end)
      + (if ($metrics | length) > 0 then {metrics:$metrics} else {} end))}]')"
}

error_control() {
  add_control "$1" "$2" ERROR HIGH "$3"
}

# Public policy is installed with the forced command, never read from the caller.
protected_file_safe() {
  local file="$1" expected_mode="$2" directory mode
  [[ -f "$file" && ! -L "$file" && "$(stat -c '%u:%g:%a:%h' "$file" 2>/dev/null)" == "0:0:$expected_mode:1" ]] || return 1
  directory="$(dirname "$file")"
  while [[ "$directory" != / ]]; do
    [[ -d "$directory" && ! -L "$directory" && "$(stat -c '%u:%g' "$directory" 2>/dev/null)" == 0:0 ]] || return 1
    mode="$(stat -c '%a' "$directory" 2>/dev/null)"
    [[ "$mode" =~ ^[0-7]{3,4}$ ]] && (( (8#$mode & 0022) == 0 )) || return 1
    directory="$(dirname "$directory")"
  done
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

if ! protected_file_safe "$CONFIG_FILE" 600; then
  error_control internal.audit-config 'Audit configuration is root-only and complete' 'The root-owned mode-0600 audit configuration is missing or has invalid ownership or permissions.'
  printf '%s\n' "$(jq -cn --argjson controls "$controls" '{sectionId:"internal",status:"ERROR",controls:$controls}')"
  exit 0
fi

required_vars=(
  MOFACTS_APP_CONTAINER MOFACTS_MONGO_CONTAINER MOFACTS_REDIS_CONTAINER
  MOFACTS_MONGO_DB MOFACTS_MONGO_REPLICA_SET MOFACTS_MONGO_ADMIN_USER MOFACTS_MONGO_ADMIN_PASSWORD
  MOFACTS_MONGO_APP_USER MOFACTS_MONGO_APP_PASSWORD MOFACTS_MONGO_SIDECAR_USER
  MOFACTS_MONGO_APP_ROLE MOFACTS_SIDECAR_EXPECTED_STATE
  MOFACTS_REDIS_PASSWORD
  MOFACTS_MANAGEMENT_CIDRS MOFACTS_SSH_MANAGEMENT_INTERFACE APACHE_HTTPS_SITE_FILE MOFACTS_PUBLIC_HOSTNAME
)
# Every protected setting must come from this file, never the invoking process.
for name in "${required_vars[@]}" MOFACTS_MONGO_SIDECAR_PASSWORD MOFACTS_MONGO_SIDECAR_ROLE; do
  unset "$name"
done
# shellcheck disable=SC1090
source "$CONFIG_FILE"

missing=0
for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then missing=$((missing + 1)); fi
done
if [[ "$missing" -eq 0 ]]; then
  if [[ ! "$MOFACTS_MONGO_APP_ROLE" =~ ^[A-Za-z0-9_-]{1,128}$ \
    || "$MOFACTS_MONGO_APP_USER" == "$MOFACTS_MONGO_SIDECAR_USER" \
    || "$MOFACTS_MONGO_ADMIN_USER" == "$MOFACTS_MONGO_SIDECAR_USER" \
    || "$MOFACTS_MONGO_ADMIN_USER" == "$MOFACTS_MONGO_APP_USER" ]]; then missing=$((missing + 1)); fi
  case "$MOFACTS_SIDECAR_EXPECTED_STATE" in
    absent)
      if [[ -n "${MOFACTS_MONGO_SIDECAR_PASSWORD:-}" || -n "${MOFACTS_MONGO_SIDECAR_ROLE:-}" ]]; then missing=$((missing + 1)); fi
      ;;
    configured)
      if [[ -z "${MOFACTS_MONGO_SIDECAR_PASSWORD:-}" || ! "${MOFACTS_MONGO_SIDECAR_ROLE:-}" =~ ^[A-Za-z0-9_-]{1,128}$ ]]; then missing=$((missing + 1)); fi
      ;;
    *) missing=$((missing + 1));;
  esac
fi
# The protected configuration owns the expected public identity. Do not infer it
# from Apache, the running application or the SSH management hostname.
if [[ "$missing" -eq 0 ]]; then
  # ENVIRON preserves literal bytes; awk -v assignments decode backslash escapes.
  export MOFACTS_PUBLIC_HOSTNAME APACHE_HTTPS_SITE_FILE
  if ! protected_file_safe "$APACHE_POLICY_FILE" 644 \
    || ! awk -v mode=validate -f "$APACHE_POLICY_FILE" </dev/null >/dev/null 2>&1; then
    missing=$((missing + 1))
  fi
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
  error_control internal.reverse-proxy-routes 'The active reverse proxy routes only the configured host to the loopback app' 'Protected audit configuration is incomplete.'
  error_control internal.mongodb-auth 'MongoDB authentication, replica set, and scoped roles are enforced' 'Protected audit configuration is incomplete.'
  error_control internal.redis-auth 'Redis requires authentication and remains private' 'Protected audit configuration is incomplete.'
  printf '%s\n' "$(jq -cn --argjson controls "$controls" \
    '{sectionId:"internal",status:"ERROR",controls:$controls,productionImage:"unknown",toolVersions:{}}')"
  exit 0
fi

# Absence is measured across all containers, including stopped and unpublished
# helpers. Only allowlisted non-secret metadata reaches the policy process.
sidecar_inventory=''
sidecar_inventory_ok=false
if [[ "$MOFACTS_SIDECAR_EXPECTED_STATE" == absent ]] \
  && command -v docker >/dev/null 2>&1 && command -v timeout >/dev/null 2>&1 \
  && protected_file_safe "$SIDECAR_POLICY_FILE" 644; then
  # Encode before command substitution so trailing whitespace and NUL cannot
  # disappear before the raw byte bound and exact record validation.
  container_capture="$(timeout 15 docker container ls --all --quiet --no-trunc --last 257 2>/dev/null | head -c 16707 | base64 -w0; printf '\n%d' "$?")"
  inventory_exit="${container_capture##*$'\n'}"
  container_encoded="${container_capture%$'\n'*}"
  if [[ "$inventory_exit" -eq 0 ]]; then
    if container_id_json="$(printf '%s' "$container_encoded" | base64 -d | jq -Rsc '
      if utf8bytelength <= 16706 and (contains("\u0000") | not) then
        split("\n") | map(select(length > 0)) |
        if length <= 256 and all(.[]; test("^[0-9a-f]{64}$")) and (unique | length) == length then . else error("invalid-inventory") end
      else error("invalid-inventory") end' 2>/dev/null)"; then
      container_ids="$(jq -r '.[]' <<<"$container_id_json")"
      inventory_encoded=''
      inspect_format='{"id":{{json .Id}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"imageTitle":{{json (index .Config.Labels "org.opencontainers.image.title")}},"exposedPorts":{{json .Config.ExposedPorts}},"bindings":{{json .HostConfig.PortBindings}},"networkPorts":{{json .NetworkSettings.Ports}}}'
      inventory_exit=0
      if [[ -n "$container_ids" ]]; then
        mapfile -t inventory_ids <<<"$container_ids"
        inventory_capture="$(timeout 20 docker container inspect --format "$inspect_format" "${inventory_ids[@]}" 2>/dev/null | head -c 1048577 | base64 -w0; printf '\n%d' "$?")"
        inventory_exit="${inventory_capture##*$'\n'}"
        inventory_encoded="${inventory_capture%$'\n'*}"
      fi
      if [[ "$inventory_exit" -eq 0 ]]; then
        if inventory_array="$(printf '%s' "$inventory_encoded" | base64 -d | jq -Rsc --argjson ids "$container_id_json" '
          if utf8bytelength <= 1048576 and (contains("\u0000") | not) then
            ("[" + (split("\n") | map(select(length > 0)) | join(",")) + "]" | fromjson) |
            if length == ($ids | length) and (map(.id) | sort) == ($ids | sort) then . else error("incomplete-inventory") end
          else error("incomplete-inventory") end' 2>/dev/null)" \
          && sidecar_inventory="$(jq -e -c -f "$SIDECAR_POLICY_FILE" <<<"$inventory_array" 2>/dev/null)"; then
          sidecar_inventory_ok=true
        fi
      fi
    fi
  fi
fi

if command -v ss >/dev/null 2>&1 && sockets="$(ss -H -lntup 2>/dev/null)"; then
  app_count="$(grep -Ec '127\.0\.0\.1:3000\b' <<<"$sockets" || true)"
  sidecar_bad="$(awk '$5 ~ /:(8931|8932)$/ && $5 !~ /^127\.0\.0\.1:/ {count++} END{print count+0}' <<<"$sockets")"
  sidecar_count="$(grep -Ec '127\.0\.0\.1:(8931|8932)\b' <<<"$sockets" || true)"

  if ! protected_file_safe "$LISTENER_POLICY_FILE" 644; then
    error_control internal.listening-sockets 'Host listening sockets match the approved exposure' 'The root-owned listener policy is unavailable.'
  else
    unexpected_socket_lines="$(awk -f "$LISTENER_POLICY_FILE" <<<"$sockets")"
    listener_policy_exit=$?
    if [[ "$listener_policy_exit" -ne 0 ]]; then
      error_control internal.listening-sockets 'Host listening sockets match the approved exposure' 'The listener policy could not classify host sockets.'
    else
      public_unexpected="$(grep -c . <<<"$unexpected_socket_lines" || true)"
      unexpected_udp_listeners="$(grep -Ec '^listener\.udp:' <<<"$unexpected_socket_lines" || true)"
      unexpected_socket_observations="$(head -n 12 <<<"$unexpected_socket_lines" | jq -Rsc 'split("\n") | map(select(length > 0))')"
      if [[ "$public_unexpected" -eq 0 ]]; then
        add_control internal.listening-sockets 'Host listening sockets match the approved exposure' PASS HIGH 'No unexpected listener was found; loopback infrastructure, the system DHCP client, and narrowly classified Tailscale listeners matched policy, while SSH is evaluated with firewall scope separately.' '[]' '{"unexpectedListenerCount":0,"unexpectedUdpListenerCount":0}'
      else
        listener_severity=HIGH
        if grep -Eq ':(3000|27017|6379|8931|8932)([,[:space:]]|$)' <<<"$unexpected_socket_lines"; then listener_severity=CRITICAL; fi
        add_control internal.listening-sockets 'Host listening sockets match the approved exposure' FAIL "$listener_severity" "$public_unexpected unexpected listeners were found." "$unexpected_socket_observations" "{\"unexpectedListenerCount\":$public_unexpected,\"unexpectedUdpListenerCount\":$unexpected_udp_listeners}"
      fi
    fi
  fi
  if [[ "$app_count" -ge 1 ]]; then
    add_control internal.app-loopback 'Application listens on loopback port 3000' PASS HIGH 'The application listener is present on 127.0.0.1:3000.'
  else
    add_control internal.app-loopback 'Application listens on loopback port 3000' FAIL HIGH 'The required 127.0.0.1:3000 listener is absent.'
  fi
  if [[ "$MOFACTS_SIDECAR_EXPECTED_STATE" == absent ]]; then
    if [[ "$sidecar_inventory_ok" != true ]]; then
      error_control internal.sidecar-loopback 'Sidecar ports are absent or loopback-only' 'Expected Sidecar absence could not be established from the complete bounded Docker inventory.'
    else
      sidecar_metrics="$(jq -c --argjson listenerCount "$((sidecar_bad + sidecar_count))" '. + {expectedState:"absent",listenerCount:$listenerCount}' <<<"$sidecar_inventory")"
      if [[ "$sidecar_bad" -eq 0 && "$sidecar_count" -eq 0 ]] \
        && jq -e '.helperContainerCount == 0 and .endpointDeclarationCount == 0 and .endpointPublicationCount == 0' <<<"$sidecar_inventory" >/dev/null; then
        add_control internal.sidecar-loopback 'Sidecar ports are absent or loopback-only' PASS CRITICAL 'The explicitly absent Sidecar has no host listeners, helper containers, endpoint declarations or publications.' '[]' "$sidecar_metrics"
      else
        add_control internal.sidecar-loopback 'Sidecar ports are absent or loopback-only' FAIL CRITICAL 'A Sidecar listener, helper container, endpoint declaration or publication contradicts the required absence.' '[]' "$sidecar_metrics"
      fi
    fi
  elif [[ "$sidecar_bad" -eq 0 && ( "$sidecar_count" -eq 0 || "$sidecar_count" -eq 2 ) ]]; then
    add_control internal.sidecar-loopback 'Sidecar ports are absent or loopback-only' PASS CRITICAL 'Sidecar ports are absent or both bound only to 127.0.0.1.'
  else
    add_control internal.sidecar-loopback 'Sidecar ports are absent or loopback-only' FAIL CRITICAL 'Sidecar port bindings do not match the absent-or-two-loopback-only contract.'
  fi
else
  error_control internal.listening-sockets 'Host listening sockets match the approved exposure' 'ss is unavailable or its observation failed.'
  error_control internal.app-loopback 'Application listens on loopback port 3000' 'ss is unavailable or its observation failed.'
  error_control internal.sidecar-loopback 'Sidecar ports are absent or loopback-only' 'ss is unavailable or its observation failed.'
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
    unexpected_udp_publications="$(jq '[.[] | .ports // {} | to_entries[] | select(.key | endswith("/udp")) | .value[]?] | length' <<<"$docker_ports")"
    docker_metrics="$(jq -cn --argjson unexpectedUdpPublicationCount "$unexpected_udp_publications" '{unexpectedUdpPublicationCount:$unexpectedUdpPublicationCount}')"
    if [[ "$invalid" -eq 0 && "$invalid_networks" -eq 0 && "$app_bind_count" -eq 1 ]]; then
      add_control internal.docker-ports 'Docker publishes only approved loopback ports' PASS CRITICAL 'MongoDB and Redis have no host publication, and all other inspected publications are loopback-only.' '[]' "$docker_metrics"
    else
      add_control internal.docker-ports 'Docker publishes only approved loopback ports' FAIL CRITICAL 'Docker host publications or private network modes do not match policy.' '[]' "$docker_metrics"
    fi
  fi
else
  error_control internal.docker-ports 'Docker publishes only approved loopback ports' 'Docker or required container configuration is unavailable.'
fi

if command -v ufw >/dev/null 2>&1; then
  ufw_status="$(ufw status verbose 2>/dev/null || true)"
  ufw_added="$(ufw show added 2>/dev/null || true)"
  active="$(grep -Eic '^Status:[[:space:]]+active$' <<<"$ufw_status" || true)"
  default_deny="$(grep -Eic 'Default: deny \(incoming\)' <<<"$ufw_status" || true)"
  if ! protected_file_safe "$FIREWALL_POLICY_FILE" 644; then
    error_control internal.firewall 'UFW is default-deny with scoped SSH and public web only' 'The root-owned firewall policy is unavailable.'
  else
    firewall_violations="$(awk -v management_interface="$MOFACTS_SSH_MANAGEMENT_INTERFACE" \
      -v management_cidrs="$MOFACTS_MANAGEMENT_CIDRS" -f "$FIREWALL_POLICY_FILE" <<<"$ufw_added")"
    firewall_policy_exit=$?
    if [[ "$firewall_policy_exit" -ne 0 ]]; then
      error_control internal.firewall 'UFW is default-deny with scoped SSH and public web only' 'The protected firewall configuration or policy is invalid.'
    else
      policy_violation_count="$(grep -c . <<<"$firewall_violations" || true)"
      missing_cidrs="$(grep -Ec '^firewall\.ssh-rule-count:' <<<"$firewall_violations" || true)"
      unauthorized_ssh="$(grep -Ec '^firewall\.unapproved-rule:.*(port 22|22/tcp)' <<<"$firewall_violations" || true)"
      web_rules="$(grep -Ec '^ufw allow (80|443)/tcp([[:space:]]|$)' <<<"$ufw_added" || true)"
      unexpected_allow_rules="$(grep -Ec '^firewall\.unapproved-rule:' <<<"$firewall_violations" || true)"
      unexpected_udp_allow_rules="$(awk '/^firewall\.unapproved-rule:/ && $0 !~ /\/tcp([[:space:]]|$)/ && $0 !~ /proto[[:space:]]+tcp([[:space:]]|$)/ {count++} END {print count+0}' <<<"$firewall_violations")"
      violation_observations="$(head -n 12 <<<"$firewall_violations" | jq -Rsc 'split("\n") | map(select(length > 0))')"
      firewall_observations="$(jq -cn \
        --arg active "$([[ "$active" -eq 1 ]] && echo PASS || echo FAIL)" \
        --arg defaultDeny "$([[ "$default_deny" -ge 1 ]] && echo PASS || echo FAIL)" \
        --arg policy "$([[ "$policy_violation_count" -eq 0 ]] && echo PASS || echo FAIL)" \
        --argjson violations "$violation_observations" \
        '["firewall.active: " + $active, "firewall.default-deny: " + $defaultDeny, "firewall.saved-rule-policy: " + $policy] + $violations')"
      firewall_metrics="$(jq -cn --arg managementCidrs "$MOFACTS_MANAGEMENT_CIDRS" \
        --arg managementInterface "$MOFACTS_SSH_MANAGEMENT_INTERFACE" \
        --argjson missingCidrs "$missing_cidrs" --argjson unauthorizedSsh "$unauthorized_ssh" \
        --argjson webRules "$web_rules" --argjson unexpectedAllowRules "$unexpected_allow_rules" \
        --argjson unexpectedUdpAllowRules "$unexpected_udp_allow_rules" \
        --argjson policyViolations "$policy_violation_count" \
        --argjson firewallActive "$([[ "$active" -eq 1 ]] && echo true || echo false)" \
        --argjson defaultDenyInbound "$([[ "$default_deny" -ge 1 ]] && echo true || echo false)" \
        '{configuredManagementCidrs:$managementCidrs,managementInterface:$managementInterface,missingManagementCidrCount:$missingCidrs,unauthorizedSshRuleCount:$unauthorizedSsh,publicWebRuleCount:$webRules,unexpectedAllowRuleCount:$unexpectedAllowRules,unexpectedUdpAllowRuleCount:$unexpectedUdpAllowRules,policyViolationCount:$policyViolations,firewallActive:$firewallActive,defaultDenyInbound:$defaultDenyInbound}')"
      if [[ "$active" -eq 1 && "$default_deny" -ge 1 && "$policy_violation_count" -eq 0 ]]; then
        add_control internal.firewall 'UFW is default-deny with scoped SSH and public web only' PASS HIGH 'UFW is active with default-deny inbound, public web rules, and SSH restricted to the configured private management interface and tailnet ranges.' "$firewall_observations" "$firewall_metrics"
      else
        add_control internal.firewall 'UFW is default-deny with scoped SSH and public web only' FAIL HIGH 'UFW policy does not match one or more explicitly reported firewall sub-probes.' "$firewall_observations" "$firewall_metrics"
      fi
    fi
  fi
else
  error_control internal.firewall 'UFW is default-deny with scoped SSH and public web only' 'ufw is unavailable.'
fi

if command -v apache2ctl >/dev/null 2>&1 && command -v systemctl >/dev/null 2>&1 \
  && [[ -f "${APACHE_HTTPS_SITE_FILE:-}" ]] && protected_file_safe "$APACHE_POLICY_FILE" 644; then
  apache_active="$(systemctl is-active apache2 2>/dev/null || true)"
  apache_syntax="$(apache2ctl configtest 2>&1 || true)"
  apache_vhosts="$(apache2ctl -S 2>&1 || true)"
  configured_vhost_count="$(grep -Ec '^<VirtualHost[[:space:]]+\*:443>$' "$APACHE_HTTPS_SITE_FILE" || true)"
  active_vhost_count="$(awk -v mode=active-vhosts -f "$APACHE_POLICY_FILE" <<<"$apache_vhosts")"
  invalid_hosts="$(awk -v mode=configured-hosts -f "$APACHE_POLICY_FILE" "$APACHE_HTTPS_SITE_FILE")"
  proxy_targets="$(awk '
    { directive=tolower($1) }
    directive=="proxypass" || directive=="proxypassmatch" || directive=="proxypassreverse" {
      for (i=2; i<=NF; i++) if ($i ~ /^(http|ws)s?:\/\//) print $i
    }
  ' "$APACHE_HTTPS_SITE_FILE")"
  upstream_count="$(grep -c . <<<"$proxy_targets" || true)"
  invalid_upstreams="$(grep -Evc '^(http|ws)://127\.0\.0\.1:3000(/|$)' <<<"$proxy_targets" || true)"
  syntax_valid=0
  if [[ "$apache_syntax" == 'Syntax OK' ]]; then syntax_valid=1; fi
  if [[ "$apache_active" == active && "$syntax_valid" -eq 1 \
    && "$configured_vhost_count" -eq 1 && "$active_vhost_count" -eq 1 \
    && "$invalid_hosts" -eq 0 && "$upstream_count" -ge 1 && "$invalid_upstreams" -eq 0 ]]; then
    add_control internal.reverse-proxy-routes 'The active reverse proxy routes only the configured host to the loopback app' PASS CRITICAL 'The active Apache HTTPS virtual host matches the protected public hostname and routes every HTTP and WebSocket upstream to 127.0.0.1:3000.'
  else
    add_control internal.reverse-proxy-routes 'The active reverse proxy routes only the configured host to the loopback app' FAIL CRITICAL \
      "Apache route policy failed: active=$([[ "$apache_active" == active ]] && echo 1 || echo 0), syntaxValid=$syntax_valid, configuredHttpsVhosts=$configured_vhost_count, activeExpectedVhosts=$active_vhost_count, invalidHosts=$invalid_hosts, upstreams=$upstream_count, invalidUpstreams=$invalid_upstreams."
  fi
else
  error_control internal.reverse-proxy-routes 'The active reverse proxy routes only the configured host to the loopback app' 'Apache, its configured enabled HTTPS site or the root-owned Apache policy is unavailable.'
fi

if command -v docker >/dev/null 2>&1 && command -v timeout >/dev/null 2>&1 && [[ "$missing" -eq 0 ]]; then
  mongo_connectivity_input="$(jq -cn --arg database "$MOFACTS_MONGO_DB" --arg replicaSet "$MOFACTS_MONGO_REPLICA_SET" \
    '{database:$database,replicaSet:$replicaSet}')"
  mongo_exec=(timeout 15 docker exec -e MOFACTS_AUDIT_MONGO_CONNECTIVITY="$mongo_connectivity_input" "$MOFACTS_MONGO_CONTAINER" \
    mongosh --quiet --host 127.0.0.1 --port 27017)
  unauth_mongo="$("${mongo_exec[@]}" --eval '
    const input=JSON.parse(process.env.MOFACTS_AUDIT_MONGO_CONNECTIVITY);
    let status;
    try {
      const result=db.getSiblingDB(input.database).runCommand({find:"tdfs",filter:{},limit:1});
      status=result.ok ? 0 : (result.code===13 ? 1 : 2);
    } catch (error) { status=error.code===13 ? 1 : 2; }
    quit(status);
  ' >/dev/null 2>&1; echo $?)"
  auth_mongo="$("${mongo_exec[@]}" \
    --username "$MOFACTS_MONGO_ADMIN_USER" --password "$MOFACTS_MONGO_ADMIN_PASSWORD" --authenticationDatabase admin \
    --eval 'const input=JSON.parse(process.env.MOFACTS_AUDIT_MONGO_CONNECTIVITY); quit(db.hello().setName===input.replicaSet ? 0 : 2)' \
    >/dev/null 2>&1; echo $?)"

  role_mongo=70
  role_status=ERROR
  role_observed=0
  role_metrics='{}'
  role_output=''
  if protected_file_safe "$MONGO_ROLE_PROBE_FILE" 644 && protected_file_safe "$READ_CONCERN_ROLE_FILE" 644 \
    && role_program_bytes="$(stat -c '%s' "$MONGO_ROLE_PROBE_FILE" 2>/dev/null)" \
    && role_definition_bytes="$(stat -c '%s' "$READ_CONCERN_ROLE_FILE" 2>/dev/null)" \
    && [[ "$role_program_bytes" =~ ^[0-9]+$ && "$role_definition_bytes" =~ ^[0-9]+$ \
      && "$role_program_bytes" -le 32768 && "$role_definition_bytes" -le 4096 ]]; then
    role_input="$(jq -cn --arg database "$MOFACTS_MONGO_DB" --arg appUser "$MOFACTS_MONGO_APP_USER" \
      --arg appRole "$MOFACTS_MONGO_APP_ROLE" --arg sidecarUser "$MOFACTS_MONGO_SIDECAR_USER" \
      --arg sidecarExpectedState "$MOFACTS_SIDECAR_EXPECTED_STATE" --arg sidecarRole "${MOFACTS_MONGO_SIDECAR_ROLE:-}" \
      '{database:$database,appUser:$appUser,appRole:$appRole,sidecarUser:$sidecarUser,sidecarExpectedState:$sidecarExpectedState}
      + (if $sidecarExpectedState=="configured" then {sidecarRole:$sidecarRole} else {} end)')"
    role_definition="$(cat "$READ_CONCERN_ROLE_FILE")"
    # Preserve capped stdout, including trailing whitespace and NUL bytes, until
    # validation. Command substitution alone would silently discard those bytes.
    role_capture="$(set -o pipefail
      timeout 20 docker exec -i -e MOFACTS_AUDIT_MONGO_INPUT="$role_input" -e MOFACTS_AUDIT_READ_CONCERN_ROLE="$role_definition" \
        "$MOFACTS_MONGO_CONTAINER" mongosh --quiet --host 127.0.0.1 --port 27017 \
        --username "$MOFACTS_MONGO_ADMIN_USER" --password "$MOFACTS_MONGO_ADMIN_PASSWORD" --authenticationDatabase admin \
        --file /dev/stdin < "$MONGO_ROLE_PROBE_FILE" 2>/dev/null | head -c 257 | base64 -w0
      printf '\n%d' "$?")"
    role_mongo="${role_capture##*$'\n'}"
    role_output_encoded="${role_capture%$'\n'*}"
    if printf '%s' "$role_output_encoded" | base64 -d | jq -Rse --arg mode "$MOFACTS_SIDECAR_EXPECTED_STATE" \
      --argjson exitCode "$role_mongo" '
      utf8bytelength<=256 and (contains("\u0000") | not) and (fromjson | type=="object" and
        (if .state=="observed" then
          (if $mode=="configured" then "sidecarRolesExact" else "sidecarUserAbsent" end) as $sidecarKey |
          (keys==(["state","appRolesExact","readConcernRoleExact",$sidecarKey] | sort))
          and ([.appRolesExact,.readConcernRoleExact,.[$sidecarKey]] | all(type=="boolean"))
          and (([.appRolesExact,.readConcernRoleExact,.[$sidecarKey]] | all(.==true)) as $passed |
            ($exitCode==0 and $passed) or ($exitCode==3 and ($passed | not)))
        elif .state=="unavailable" then
          keys==["reason","state"] and (($exitCode==64 and .reason=="invalid-input")
            or ($exitCode==70 and .reason=="query-failed"))
        else false end))
    ' >/dev/null 2>&1; then
      role_output="$(printf '%s' "$role_output_encoded" | base64 -d)"
      if [[ "$(jq -r '.state' <<<"$role_output")" == observed ]]; then
        role_observed=1
        role_metrics="$(jq -c 'del(.state)' <<<"$role_output")"
        if [[ "$role_mongo" -eq 0 ]]; then role_status=PASS; else role_status=FAIL; fi
      fi
    fi
  fi

  app_mongo="$("${mongo_exec[@]}" \
    --username "$MOFACTS_MONGO_APP_USER" --password "$MOFACTS_MONGO_APP_PASSWORD" --authenticationDatabase "$MOFACTS_MONGO_DB" \
    --eval 'const input=JSON.parse(process.env.MOFACTS_AUDIT_MONGO_CONNECTIVITY); quit(db.getSiblingDB(input.database).runCommand({find:"tdfs",filter:{},limit:1}).ok ? 0 : 4)' \
    >/dev/null 2>&1; echo $?)"
  mongo_observations="$(jq -cn \
    --arg unauth "$([[ "$unauth_mongo" -eq 1 ]] && echo PASS || { [[ "$unauth_mongo" -eq 0 ]] && echo FAIL || echo ERROR; })" \
    --arg replica "$([[ "$auth_mongo" -eq 0 ]] && echo PASS || echo ERROR)" \
    --arg roles "$role_status" \
    --arg app "$([[ "$app_mongo" -eq 0 ]] && echo PASS || echo ERROR)" \
    '["mongodb.unauthenticated-denied: " + $unauth, "mongodb.replica-set-and-admin-auth: " + $replica, "mongodb.roles-scoped: " + $roles, "mongodb.app-authenticated-connectivity: " + $app]')"
  mongo_metrics="$(jq -cn --argjson unauthExit "$unauth_mongo" --argjson adminReplicaExit "$auth_mongo" \
    --argjson roleExit "$role_mongo" --argjson appExit "$app_mongo" --argjson roles "$role_metrics" \
    '{unauthenticatedProbeExit:$unauthExit,adminReplicaProbeExit:$adminReplicaExit,roleScopeProbeExit:$roleExit,appConnectivityProbeExit:$appExit} + $roles')"
  sidecar_connectivity_error=0
  if [[ "$MOFACTS_SIDECAR_EXPECTED_STATE" == configured ]]; then
    sidecar_mongo="$("${mongo_exec[@]}" \
      --username "$MOFACTS_MONGO_SIDECAR_USER" --password "$MOFACTS_MONGO_SIDECAR_PASSWORD" --authenticationDatabase "$MOFACTS_MONGO_DB" \
      --eval 'const input=JSON.parse(process.env.MOFACTS_AUDIT_MONGO_CONNECTIVITY); quit(db.getSiblingDB(input.database).runCommand({find:"tdfs",filter:{},limit:1}).ok ? 0 : 5)' \
      >/dev/null 2>&1; echo $?)"
    mongo_observations="$(jq -c --arg sidecar "$([[ "$sidecar_mongo" -eq 0 ]] && echo PASS || echo ERROR)" \
      '. + ["mongodb.sidecar-authenticated-connectivity: " + $sidecar]' <<<"$mongo_observations")"
    mongo_metrics="$(jq -c --argjson sidecarExit "$sidecar_mongo" '. + {sidecarConnectivityProbeExit:$sidecarExit}' <<<"$mongo_metrics")"
    if [[ "$sidecar_mongo" -ne 0 ]]; then sidecar_connectivity_error=1; fi
  else
    sidecar_absence_status=ERROR
    if [[ "$role_observed" -eq 1 ]]; then
      if [[ "$(jq -r '.sidecarUserAbsent' <<<"$role_output")" == true ]]; then sidecar_absence_status=PASS; else sidecar_absence_status=FAIL; fi
    fi
    mongo_observations="$(jq -c --arg absent "$sidecar_absence_status" '. + ["mongodb.sidecar-user-absent: " + $absent]' <<<"$mongo_observations")"
  fi
  if [[ "$unauth_mongo" -eq 0 ]]; then
    add_control internal.mongodb-auth 'MongoDB authentication, replica set, and scoped roles are enforced' FAIL CRITICAL 'MongoDB accepted an unauthenticated data query.' "$mongo_observations" "$mongo_metrics"
  elif [[ "$role_status" == FAIL ]]; then
    add_control internal.mongodb-auth 'MongoDB authentication, replica set, and scoped roles are enforced' FAIL HIGH 'Application grants, the shared read-concern role or the expected Sidecar account state differed from policy.' "$mongo_observations" "$mongo_metrics"
  elif [[ "$unauth_mongo" -ne 1 || "$auth_mongo" -ne 0 || "$role_status" != PASS || "$app_mongo" -ne 0 || "$sidecar_connectivity_error" -ne 0 ]]; then
    mongo_metrics="$(jq '. + {inconclusive:true}' <<<"$mongo_metrics")"
    add_control internal.mongodb-auth 'MongoDB authentication, replica set, and scoped roles are enforced' ERROR HIGH 'One or more MongoDB access, connectivity or role observations could not be confirmed.' "$mongo_observations" "$mongo_metrics"
  else
    add_control internal.mongodb-auth 'MongoDB authentication, replica set, and scoped roles are enforced' PASS CRITICAL 'Unauthenticated access was denied; authenticated connectivity, exact application grants, the shared read-concern role and the expected Sidecar account state matched policy.' "$mongo_observations" "$mongo_metrics"
  fi
else
  error_control internal.mongodb-auth 'MongoDB authentication, replica set, and scoped roles are enforced' 'Docker or protected MongoDB audit configuration is unavailable.'
fi

if command -v docker >/dev/null 2>&1 && [[ "$missing" -eq 0 ]]; then
  unauth_redis_output="$(docker exec "$MOFACTS_REDIS_CONTAINER" redis-cli --no-auth-warning --raw PING 2>&1 || true)"
  if [[ "$unauth_redis_output" == 'PONG' ]]; then
    unauth_redis=0
  elif grep -Eq '^NOAUTH([[:space:]]|$)' <<<"$unauth_redis_output"; then
    unauth_redis=1
  else
    unauth_redis=2
  fi
  auth_redis_output="$(docker exec -e REDISCLI_AUTH="$MOFACTS_REDIS_PASSWORD" "$MOFACTS_REDIS_CONTAINER" redis-cli --no-auth-warning --raw PING 2>&1 || true)"
  if [[ "$auth_redis_output" == 'PONG' ]]; then auth_redis=0; else auth_redis=1; fi
  app_redis="$(docker exec "$MOFACTS_APP_CONTAINER" node -e '
    const net = require("net");
    const parsed = new URL(process.env.REDIS_URL || "");
    if (parsed.protocol !== "redis:" || !parsed.password) process.exit(2);
    const password = decodeURIComponent(parsed.password);
    const username = decodeURIComponent(parsed.username || "");
    const auth = username ? ["AUTH", username, password] : ["AUTH", password];
    const encode = (parts) => Buffer.from(`*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`);
    const socket = net.connect({ host: parsed.hostname, port: Number(parsed.port || 6379) });
    let response = "";
    const timer = setTimeout(() => process.exit(3), 5000);
    socket.on("connect", () => socket.write(Buffer.concat([encode(auth), encode(["PING"])])));
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (response.includes("+PONG\r\n")) {
        clearTimeout(timer);
        socket.destroy();
        process.exit(response.startsWith("+OK\r\n") ? 0 : 4);
      }
    });
    socket.on("error", () => process.exit(5));
  ' >/dev/null 2>&1; echo $?)"
  redis_publication="$(docker inspect --format '{{json .NetworkSettings.Ports}}' "$MOFACTS_REDIS_CONTAINER" 2>/dev/null | jq '[to_entries[] | .value[]?] | length' 2>/dev/null || echo 1)"
  redis_observations="$(jq -cn \
    --arg unauth "$([[ "$unauth_redis" -eq 1 ]] && echo PASS || { [[ "$unauth_redis" -eq 0 ]] && echo FAIL || echo ERROR; })" \
    --arg auth "$([[ "$auth_redis" -eq 0 ]] && echo PASS || echo ERROR)" \
    --arg app "$([[ "$app_redis" -eq 0 ]] && echo PASS || echo ERROR)" \
    --arg publication "$([[ "$redis_publication" -eq 0 ]] && echo PASS || echo FAIL)" \
    '["redis.unauthenticated-denied: " + $unauth, "redis.authenticated-connectivity: " + $auth, "redis.application-authenticated-connectivity: " + $app, "redis.no-host-publication: " + $publication]')"
  redis_metrics="$(jq -cn --argjson unauthExit "$unauth_redis" --argjson authenticatedExit "$auth_redis" \
    --argjson applicationExit "$app_redis" --argjson hostPublicationCount "$redis_publication" \
    '{unauthenticatedProbeExit:$unauthExit,authenticatedProbeExit:$authenticatedExit,applicationConnectivityProbeExit:$applicationExit,hostPublicationCount:$hostPublicationCount}')"
  if [[ "$unauth_redis" -eq 0 || "$redis_publication" -ne 0 ]]; then
    add_control internal.redis-auth 'Redis requires authentication and remains private' FAIL CRITICAL 'Redis accepted an unauthenticated command or has a host-published port.' "$redis_observations" "$redis_metrics"
  elif [[ "$unauth_redis" -ne 1 || "$auth_redis" -ne 0 || "$app_redis" -ne 0 ]]; then
    redis_metrics="$(jq '. + {inconclusive:true}' <<<"$redis_metrics")"
    add_control internal.redis-auth 'Redis requires authentication and remains private' ERROR HIGH 'Unauthenticated Redis was denied, but host-audit or application authenticated connectivity could not be confirmed.' "$redis_observations" "$redis_metrics"
  else
    add_control internal.redis-auth 'Redis requires authentication and remains private' PASS CRITICAL 'Unauthenticated Redis was denied, host-audit and application authenticated connectivity succeeded, and no host publication exists.' "$redis_observations" "$redis_metrics"
  fi
else
  error_control internal.redis-auth 'Redis requires authentication and remains private' 'Docker or protected Redis audit configuration is unavailable.'
fi

status="$(jq -r 'if any(.[]; .status=="ERROR") then "ERROR" elif any(.[]; .status=="FAIL") then "FAIL" elif any(.[]; .status=="PASS") then "PASS" else "NOT_APPLICABLE" end' <<<"$controls")"
production_image="$(docker inspect --format '{{.Image}}' "${MOFACTS_APP_CONTAINER:-}" 2>/dev/null || true)"
release_receipt='{"state":"unavailable","reason":"reader-unavailable"}'
receipt_tool_safe=true
for directory in /usr /usr/local /usr/local/libexec /usr/local/libexec/mofacts-security-audit; do
  if [[ ! -d "$directory" || -L "$directory" || "$(stat -c '%u:%g' "$directory" 2>/dev/null)" != 0:0 ]]; then
    receipt_tool_safe=false
    break
  fi
  mode="$(stat -c '%a' "$directory" 2>/dev/null)"
  if [[ ! "$mode" =~ ^[0-7]{3,4}$ ]] || (( (8#$mode & 0022) != 0 )); then receipt_tool_safe=false; break; fi
done
if [[ "$receipt_tool_safe" == true && -f "$RELEASE_RECEIPT_TOOL" && ! -L "$RELEASE_RECEIPT_TOOL" \
  && "$(stat -c '%u:%g:%a:%h' "$RELEASE_RECEIPT_TOOL" 2>/dev/null)" == 0:0:755:1 ]]; then
  if ! release_receipt="$("$RELEASE_RECEIPT_TOOL" read 2>/dev/null)" \
    || ! jq -e 'type == "object" and (.state == "observed" or .state == "unavailable")' <<<"$release_receipt" >/dev/null 2>&1; then
    release_receipt='{"state":"unavailable","reason":"reader-failed"}'
  fi
fi
tool_versions="$(jq -cn \
  --arg docker "$(docker --version 2>/dev/null | head -n1 || echo unavailable)" \
  --arg apache "$(apache2ctl -v 2>/dev/null | head -n1 || echo unavailable)" \
  --arg mongosh "$(docker exec "${MOFACTS_MONGO_CONTAINER:-}" mongosh --version 2>/dev/null | head -n1 || echo unavailable)" \
  --arg redisCli "$(docker exec "${MOFACTS_REDIS_CONTAINER:-}" redis-cli --version 2>/dev/null | head -n1 || echo unavailable)" \
  '{docker:$docker,apache:$apache,mongosh:$mongosh,"redis-cli":$redisCli}')"
printf '%s\n' "$(jq -cn --arg status "$status" --argjson controls "$controls" \
  --arg productionImage "${production_image:-unknown}" --argjson toolVersions "$tool_versions" --argjson releaseReceipt "$release_receipt" \
  '{sectionId:"internal",status:$status,controls:$controls,productionImage:$productionImage,toolVersions:$toolVersions,releaseReceipt:$releaseReceipt}')"
