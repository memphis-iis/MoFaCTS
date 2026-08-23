import { errorControl, section } from './audit-lib.mjs';

export const INTERNAL_CONTROL_DEFINITIONS = Object.freeze([
  ['internal.audit-config', 'Audit configuration is root-only and complete'],
  ['internal.listening-sockets', 'Host listening sockets match the approved exposure'],
  ['internal.app-loopback', 'Application listens on loopback port 3000'],
  ['internal.sidecar-loopback', 'Sidecar ports are absent or loopback-only'],
  ['internal.docker-ports', 'Docker publishes only approved loopback ports'],
  ['internal.firewall', 'UFW is default-deny with scoped SSH and public web only'],
  ['internal.reverse-proxy-routes', 'The active reverse proxy routes only the production host to the loopback app'],
  ['internal.mongodb-auth', 'MongoDB authentication, replica set, and scoped roles are enforced'],
  ['internal.redis-auth', 'Redis requires authentication and remains private'],
]);

export const INTERNAL_EXECUTION_CATEGORIES = Object.freeze([
  'tailnet-connection-failed',
  'ssh-identity-configuration-failed',
  'ssh-transport-failed',
  'forced-command-rejected',
  'host-output-invalid',
]);

export function internalExecutionError(category) {
  if (!INTERNAL_EXECUTION_CATEGORIES.includes(category)) {
    throw new Error('unsupported internal audit execution category');
  }
  const controls = INTERNAL_CONTROL_DEFINITIONS.map(([controlId, title]) => {
    const result = errorControl(controlId, title, `Internal host evidence was unavailable (${category})`);
    result.evidence.metrics = { executionCategory: category };
    return result;
  });
  return {
    ...section('internal', controls),
    productionImage: 'unknown',
    toolVersions: {},
  };
}
