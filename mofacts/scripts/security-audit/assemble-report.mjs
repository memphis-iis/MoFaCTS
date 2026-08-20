import fs from 'node:fs/promises';
import { control, errorControl, finalizeReport, notApplicableSection, sanitizedText, section, writeJsonFile } from './audit-lib.mjs';

const [mode, externalPath, internalPath, authenticationPath, repositoryPath, outputPath] = process.argv.slice(2);
if (!['exposure', 'full'].includes(mode) || !externalPath || !internalPath || !outputPath) {
  throw new Error('usage: assemble-report.mjs <exposure|full> <external> <internal> <authentication-or-dash> <repository-or-dash> <output>');
}

const expected = {
  external: [
    ['external.dns-addresses', 'Resolve every public address'],
    ['external.public-tcp-ports', 'Only TCP 80 and 443 are public'],
    ['external.public-udp-ports', 'Selected UDP ports are closed'],
    ['external.http-redirect', 'HTTP redirects to the same HTTPS host and path'],
    ['external.tls-protocols', 'Only TLS 1.2 and 1.3 are accepted'],
    ['external.certificate', 'Certificate hostname, chain, and validity are acceptable'],
    ['external.tls-ciphers', 'No weak TLS cipher is accepted'],
    ['external.websocket-tls', 'WSS upgrades and insecure WebSockets do not'],
    ['external.hsts', 'HSTS is at least one year'],
    ['external.csp', 'CSP restricts frames, objects, base URLs, and forms'],
    ['external.security-headers', 'Frame, MIME, referrer, and permissions policies are approved'],
  ],
  authentication: [
    ['authentication.enumeration', 'Login and reset responses resist account enumeration'],
    ['authentication.timing', 'Authentication timing resists account enumeration'],
    ['authentication.reset-token', 'Reset tokens expire and are one-time'],
    ['authentication.session-revocation', 'Logout and password reset revoke sessions'],
    ['authentication.session-lifetime', 'Sessions expire within 30 days'],
    ['authentication.material-leakage', 'Authentication material does not enter client-observable channels'],
    ['authentication.authorization', 'Anonymous and cross-user authorization is enforced'],
    ['authentication.passwordless-containment', 'Passwordless experiment sessions remain bound to their authorized target'],
    ['authentication.throttling', 'Login throttles cover connection, identifier, and IP'],
  ],
  internal: [
    ['internal.audit-config', 'Audit configuration is root-only and complete'],
    ['internal.listening-sockets', 'Host listening sockets match the approved exposure'],
    ['internal.app-loopback', 'Application listens on loopback port 3000'],
    ['internal.sidecar-loopback', 'Sidecar ports are absent or loopback-only'],
    ['internal.docker-ports', 'Docker publishes only approved loopback ports'],
    ['internal.firewall', 'UFW is default-deny with scoped SSH and public web only'],
    ['internal.caddy-routes', 'Caddy routes only the production host to the loopback app'],
    ['internal.mongodb-auth', 'MongoDB authentication, replica set, and scoped roles are enforced'],
    ['internal.redis-auth', 'Redis requires authentication and remains private'],
  ],
  repository: [
    ['repository.git-history-secrets', 'Git history contains no detected secrets'],
    ['repository.dependencies-application', 'application dependencies have no known vulnerability'],
    ['repository.dependencies-sidecar-mongo', 'sidecar-mongo dependencies have no known vulnerability'],
    ['repository.security-surface-contract', 'Every server surface has an access classification'],
    ['repository.sensitive-logging', 'Potential credentials and personal identifiers are absent from log calls'],
    ['repository.source-security-tests', 'Source security contract tests pass'],
    ['repository.runtime-image-vulnerabilities', 'Built runtime image has no high or critical vulnerability'],
    ['repository.client-bundle-canaries', 'Synthetic canaries are absent from built client bundles'],
  ],
};

const executionErrors = [];

async function loadSection(sectionId, filePath) {
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    executionErrors.push(`${sectionId} scanner output was missing or malformed.`);
    return section(sectionId, expected[sectionId].map(([id, title]) => errorControl(id, title, 'Scanner output was missing or malformed')));
  }
  if (!raw || raw.sectionId !== sectionId || !Array.isArray(raw.controls)) {
    executionErrors.push(`${sectionId} scanner output did not match its section contract.`);
    return section(sectionId, expected[sectionId].map(([id, title]) => errorControl(id, title, 'Scanner output did not match its section contract')));
  }
  const byId = new Map(raw.controls.map((entry) => [entry?.controlId, entry]));
  const controls = expected[sectionId].map(([id, title]) => {
    const value = byId.get(id);
    if (!value || !['PASS', 'FAIL', 'ERROR', 'NOT_APPLICABLE'].includes(value.status)
      || !['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(value.severity)
      || !value.evidence?.summary) {
      executionErrors.push(`${id} did not return valid structured evidence.`);
      return errorControl(id, title, 'Control evidence was missing or malformed');
    }
    if (value.status === 'ERROR') executionErrors.push(`${id} did not complete.`);
    return control(id, title, value.status, value.severity, value.evidence.summary, {
      observations: Array.isArray(value.evidence.observations) ? value.evidence.observations : undefined,
      metrics: value.evidence.metrics && typeof value.evidence.metrics === 'object' ? value.evidence.metrics : undefined,
    });
  });
  return section(sectionId, controls);
}

const external = await loadSection('external', externalPath);
const internalRaw = await fs.readFile(internalPath, 'utf8').then(JSON.parse).catch(() => null);
const internal = await loadSection('internal', internalPath);
const authentication = mode === 'full'
  ? await loadSection('authentication', authenticationPath)
  : notApplicableSection('authentication', 'Authentication controls run in the Monday full audit.');
const repository = mode === 'full'
  ? await loadSection('repository', repositoryPath)
  : notApplicableSection('repository', 'Repository controls run in the Monday full audit.');

const startedAt = new Date(process.env.AUDIT_STARTED_AT || Date.now()).toISOString();
const completedAt = new Date().toISOString();
const reportId = String(process.env.AUDIT_REPORT_ID || `audit-${Date.now()}`);
const sourceCandidate = String(process.env.GITHUB_SHA || '').toLowerCase();
const sourceRevision = /^[a-f0-9]{40}$/.test(sourceCandidate) ? sourceCandidate : 'unknown';
const imageCandidate = String(internalRaw?.productionImage || '').toLowerCase();
const productionImage = /^sha256:[a-f0-9]{64}$/.test(imageCandidate) ? imageCandidate : 'unknown';
let toolVersions = {};
try { toolVersions = JSON.parse(process.env.AUDIT_TOOL_VERSIONS_JSON || '{}'); } catch {
  executionErrors.push('Tool-version metadata was malformed.');
}
if (internalRaw?.toolVersions && typeof internalRaw.toolVersions === 'object') {
  toolVersions = { ...toolVersions, ...internalRaw.toolVersions };
}
const allowedToolNames = new Set([
  'node', 'nmap', 'openssl', 'gitleaks', 'trivy', 'playwright', 'curl', 'ssh',
  'docker', 'caddy', 'mongosh', 'redis-cli',
]);
toolVersions = Object.fromEntries(Object.entries(toolVersions)
  .filter(([name, version]) => allowedToolNames.has(name) && typeof version === 'string')
  .slice(0, 32)
  .map(([name, version]) => [name, sanitizedText(version, 120)]));

const report = finalizeReport({
  schema: 'SecurityAuditReportV1',
  reportId,
  reportType: mode,
  startedAt,
  completedAt,
  target: 'https://mofacts.optimallearning.org',
  sourceRevision,
  productionImage,
  toolVersions,
  sections: { external, authentication, internal, repository },
  executionErrors,
});

await writeJsonFile(outputPath, report);
