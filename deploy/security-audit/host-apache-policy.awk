# Target identity policy for the existing single-*:443 Apache site contract.
# Public identity and site come literally through ENVIRON from the protected
# host audit configuration, avoiding awk -v backslash decoding.
# Modes validate DNS identity, count matching active vhosts, or count configured
# ServerName/ServerAlias values outside that identity. Comparisons are literal.

function valid_public_hostname(hostname, count, labels, i, label) {
  if (length(hostname) > 253 || hostname !~ /^[a-z0-9.-]+$/ ||
      index(hostname, ".") == 0 || hostname ~ /^[0-9.]+$/) return 0
  count = split(hostname, labels, /[.]/)
  for (i = 1; i <= count; i++) {
    label = labels[i]
    if (length(label) > 63 || label !~ /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/) return 0
  }
  return 1
}

BEGIN {
  public_hostname = ENVIRON["MOFACTS_PUBLIC_HOSTNAME"]
  expected_site = ENVIRON["APACHE_HTTPS_SITE_FILE"]
  if (!valid_public_hostname(public_hostname) ||
      (mode != "validate" && mode != "active-vhosts" && mode != "configured-hosts") ||
      (mode == "active-vhosts" && expected_site == "")) {
    config_error = 1
    exit 2
  }
}

mode == "active-vhosts" && $1 == "*:443" && $2 == public_hostname {
  prefix = "(" expected_site ":"
  if (index($3, prefix) == 1 && substr($3, length(prefix) + 1) ~ /^[0-9]+\)$/) count++
}

mode == "configured-hosts" {
  directive = tolower($1)
  if (directive == "servername" || directive == "serveralias") {
    for (i = 2; i <= NF; i++) if ($i != public_hostname) count++
  }
}

END {
  if (config_error) exit 2
  if (mode != "validate") print count+0
}
