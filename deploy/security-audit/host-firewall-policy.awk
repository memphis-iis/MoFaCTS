# Emit only UFW allow rules that are outside the approved production policy,
# plus missing or duplicate required rules. Input is the stable output of:
#   ufw show added

function trim(value) {
  sub(/^[[:space:]]+/, "", value)
  sub(/[[:space:]]+$/, "", value)
  return value
}

BEGIN {
  if (management_interface !~ /^[A-Za-z0-9_.:-]+$/) {
    print "firewall.config-error: invalid-management-interface"
    config_error = 1
  }

  cidr_count = split(management_cidrs, configured_cidrs, ",")
  for (i = 1; i <= cidr_count; i++) {
    cidr = trim(configured_cidrs[i])
    configured_cidrs[i] = cidr
    if (cidr == "" || cidr ~ /[[:space:]]/ || expected_cidr[cidr]) {
      print "firewall.config-error: invalid-management-cidrs"
      config_error = 1
    }
    expected_cidr[cidr] = 1
  }
}

/^ufw allow/ {
  if ($1 == "ufw" && $2 == "allow" && ($3 == "80/tcp" || $3 == "443/tcp")) {
    web_rule_count[$3]++
    next
  }

  if ($1 == "ufw" && $2 == "allow" && $3 == "in" && $4 == "on" &&
      $6 == "from" && $8 == "to" && $9 == "any" && $10 == "port" &&
      $11 == "22" && $12 == "proto" && $13 == "tcp" &&
      $5 == management_interface && expected_cidr[$7]) {
    ssh_rule_count[$7]++
    next
  }

  print "firewall.unapproved-rule: " $0
}

END {
  if (config_error) exit 2

  for (i = 1; i <= cidr_count; i++) {
    cidr = configured_cidrs[i]
    if (ssh_rule_count[cidr] != 1) {
      print "firewall.ssh-rule-count: " cidr "=" (ssh_rule_count[cidr] + 0)
    }
  }

  if (web_rule_count["80/tcp"] != 1) {
    print "firewall.web-rule-count: 80/tcp=" (web_rule_count["80/tcp"] + 0)
  }
  if (web_rule_count["443/tcp"] != 1) {
    print "firewall.web-rule-count: 443/tcp=" (web_rule_count["443/tcp"] + 0)
  }
}
