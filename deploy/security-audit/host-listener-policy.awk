# Emit only listeners that are outside the approved production host policy.
# Input is the stable, headerless output of: ss -H -lntup

function endpoint_address(endpoint, port, address) {
  port = endpoint
  sub(/^.*:/, "", port)
  address = substr(endpoint, 1, length(endpoint) - length(port) - 1)
  return address
}

function endpoint_port(endpoint, port) {
  port = endpoint
  sub(/^.*:/, "", port)
  return port
}

function without_scope(address, result) {
  result = address
  sub(/%.*/, "", result)
  return result
}

function is_loopback(address, unscoped) {
  unscoped = without_scope(address)
  return unscoped ~ /^127\./ || unscoped == "::1" || unscoped == "[::1]" || unscoped == "localhost"
}

function is_wildcard(address, unscoped) {
  unscoped = without_scope(address)
  return unscoped == "" || unscoped == "*" || unscoped == "0.0.0.0" || unscoped == "::" || unscoped == "[::]"
}

function is_tailscale_address(address, unscoped, octets) {
  unscoped = without_scope(address)
  gsub(/^\[/, "", unscoped)
  gsub(/\]$/, "", unscoped)

  if (unscoped ~ /^fd7a:115c:a1e0:/) {
    return 1
  }

  split(unscoped, octets, ".")
  return octets[1] == "100" && octets[2] >= 64 && octets[2] <= 127
}

function is_expected_public_web_or_ssh(protocol, port) {
  return protocol == "tcp" && (port == "22" || port == "80" || port == "443")
}

function is_expected_dhcp_client(protocol, address, port, line) {
  return protocol == "udp" && port == "68" && !is_wildcard(address) && line ~ /systemd-network(d)?/
}

function is_expected_tailscale_listener(protocol, address, port, line) {
  if (line !~ /users:\(\("tailscaled",/) {
    return 0
  }

  return (protocol == "udp" && port == "41641" && is_wildcard(address)) || \
    (protocol == "tcp" && is_tailscale_address(address))
}

$1 == "tcp" || $1 == "udp" {
  protocol = $1
  endpoint = $5
  address = endpoint_address(endpoint)
  port = endpoint_port(endpoint)

  if (is_loopback(address) || is_expected_public_web_or_ssh(protocol, port) || is_expected_dhcp_client(protocol, address, port, $0) || is_expected_tailscale_listener(protocol, address, port, $0)) {
    next
  }

  print "listener." protocol ": endpoint=" endpoint ", process=" $NF
}
