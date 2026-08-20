export function parseNmapPortStates(xml) {
  if (typeof xml !== 'string' || !xml.includes('<nmaprun') || !xml.includes('</nmaprun>')) {
    throw new Error('nmap XML is missing or malformed');
  }
  const ports = [];
  const hostPattern = /<host[\s\S]*?<address addr="([^"]+)"[^>]*addrtype="(?:ipv4|ipv6)"[^>]*\/>[\s\S]*?<ports>([\s\S]*?)<\/ports>[\s\S]*?<\/host>/g;
  for (const hostMatch of xml.matchAll(hostPattern)) {
    for (const portMatch of hostMatch[2].matchAll(/<port protocol="([^"]+)" portid="(\d+)">[\s\S]*?<state state="([^"]+)"/g)) {
      ports.push({
        endpoint: `${hostMatch[1]}/${portMatch[1]}/${portMatch[2]}`,
        state: portMatch[3].toLowerCase(),
      });
    }
  }
  return ports;
}

export function parseNmapOpenPorts(xml) {
  return parseNmapPortStates(xml)
    .filter((entry) => entry.state === 'open')
    .map((entry) => entry.endpoint);
}

export function classifyUdpPortStates(entries, expectedResultCount) {
  if (!Array.isArray(entries) || !Number.isSafeInteger(expectedResultCount) || expectedResultCount < 1
    || entries.some((entry) => !entry || typeof entry.endpoint !== 'string' || typeof entry.state !== 'string')) {
    throw new Error('UDP port-state input is invalid');
  }
  const openPortCount = entries.filter((entry) => entry.state === 'open').length;
  const inconclusivePortCount = entries.filter((entry) => entry.state !== 'open' && entry.state !== 'closed').length;
  const uniqueResultCount = new Set(entries.map((entry) => entry.endpoint)).size;
  const complete = entries.length === expectedResultCount && uniqueResultCount === expectedResultCount;
  return {
    status: openPortCount > 0 ? 'FAIL' : inconclusivePortCount > 0 || !complete ? 'ERROR' : 'PASS',
    openPortCount,
    inconclusivePortCount,
    observedResultCount: entries.length,
    expectedResultCount,
  };
}

export function parseNmapTlsCipherReport(output) {
  if (typeof output !== 'string' || !/ssl-enum-ciphers:/i.test(output)) {
    throw new Error('TLS cipher enumeration output is missing or malformed');
  }
  const ciphers = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*\|?\s*(TLS_[A-Z0-9_]+)\b.*?\s-\s([A-F])\s*$/i);
    if (match) ciphers.push({ name: match[1].toUpperCase(), grade: match[2].toUpperCase() });
  }
  if (ciphers.length === 0) throw new Error('TLS cipher enumeration contained no cipher entries');
  const weak = ciphers.filter(({ name, grade }) =>
    /(?:3DES|RC4|_NULL_|_ANON_|(?:^|_)ADH_|AECDH|EXPORT|DES_CBC)/i.test(name)
      || ['C', 'D', 'F'].includes(grade));
  return { cipherCount: ciphers.length, weakCipherCount: weak.length };
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
  return statements.filter((statement) => {
    const expressionsOnly = statement.replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, '');
    return /\b(?:email|username|password|token|cookie|sessionId|userRecord|dispUsr|normalizedEmail)\b/i.test(expressionsOnly);
  }).length;
}
