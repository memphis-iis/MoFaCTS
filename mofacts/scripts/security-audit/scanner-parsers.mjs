export function parseNmapOpenPorts(xml) {
  if (typeof xml !== 'string' || !xml.includes('<nmaprun') || !xml.includes('</nmaprun>')) {
    throw new Error('nmap XML is missing or malformed');
  }
  const ports = [];
  const hostPattern = /<host[\s\S]*?<address addr="([^"]+)"[^>]*addrtype="(?:ipv4|ipv6)"[^>]*\/>[\s\S]*?<ports>([\s\S]*?)<\/ports>[\s\S]*?<\/host>/g;
  for (const hostMatch of xml.matchAll(hostPattern)) {
    for (const portMatch of hostMatch[2].matchAll(/<port protocol="([^"]+)" portid="(\d+)">[\s\S]*?<state state="open(?:\|filtered)?"/g)) {
      ports.push(`${hostMatch[1]}/${portMatch[1]}/${portMatch[2]}`);
    }
  }
  return ports;
}

export function parseNpmAuditVulnerabilityCount(value) {
  const vulnerabilities = value?.metadata?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== 'object') {
    throw new Error('npm audit JSON is missing vulnerability metadata');
  }
  const counts = Object.values(vulnerabilities);
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0)) {
    throw new Error('npm audit vulnerability counts are invalid');
  }
  return counts.reduce((sum, count) => sum + count, 0);
}

export function parseTrivyHighCritical(value) {
  if (!value || !Array.isArray(value.Results)) throw new Error('Trivy JSON is missing Results');
  return value.Results.flatMap((result) => Array.isArray(result.Vulnerabilities) ? result.Vulnerabilities : [])
    .filter((vulnerability) => vulnerability.Severity === 'HIGH' || vulnerability.Severity === 'CRITICAL');
}

export function findCanaryLeaks(channels, canaries) {
  if (!Array.isArray(channels) || !Array.isArray(canaries)) throw new Error('canary scan input is invalid');
  const haystack = channels.map(String).join('\n');
  return canaries.filter((canary) => typeof canary === 'string' && canary.length >= 8 && haystack.includes(canary));
}

export function countPotentialSensitiveLogStatements(sourceText) {
  if (typeof sourceText !== 'string') throw new Error('source text is required');
  const statements = sourceText.match(/(?:serverConsole|clientConsole|console\.(?:log|info|warn|error|debug))\s*\([\s\S]{0,600}?\);/g) || [];
  return statements.filter((statement) =>
    /\b(?:email|username|password|token|cookie|sessionId|userRecord|dispUsr|normalizedEmail)\b/i.test(statement)
  ).length;
}
