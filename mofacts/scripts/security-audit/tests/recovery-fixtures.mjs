import crypto from 'node:crypto';
import { RECOVERY_PUBLIC_VARIABLE, RECOVERY_SECRETS, RecoveryTransferError } from '../recovery-transfer.mjs';
export const source = {
  repository: 'memphis-iis/MoFaCTS', environment: 'production-security-audit',
  commit: 'a'.repeat(40), runId: '12345', runAttempt: '1',
};
const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
export const privateKey = keyPair.privateKey;
export const publicKey = keyPair.publicKey.export({ type: 'spki', format: 'pem' });
export function bindings() {
  const sshKeyType = 'OPENSSH PRIVATE KEY';
  const actors = ['learnerA', 'learnerB', 'teacherA', 'teacherB', 'admin', 'reset', 'expiry', 'lockout'];
  const fixture = {
    users: Object.fromEntries(actors.map(actor => [actor, { username: `${actor}@audit.invalid`, password: 'synthetic-only', newPassword: 'synthetic-reset-only' }])),
    runNamespace: 'synthetic', imaps: { host: 'mail.audit.invalid', username: 'synthetic', mailbox: 'INBOX' },
    passwordless: { experimentTarget: 'one', otherExperimentTarget: 'two', participantId: 'synthetic' },
    authorizationProbes: ['anonymous', ...actors.slice(0, 5)].map(actor => ({ actor, method: 'syntheticMethod', args: [] })),
    publicationProbes: [{ actor: 'anonymous', publication: 'syntheticPublication' }],
    routeProbes: [{ actor: 'anonymous', path: '/synthetic' }],
    downloadProbes: [{ actor: 'anonymous', path: '/synthetic.wav' }],
    connectionThrottleIdentifiers: Array.from({ length: 12 }, (_, i) => `connection-${i}`),
    ipThrottleIdentifiers: Array.from({ length: 21 }, (_, i) => `ip-${i}`),
    canaries: ['synthetic-canary'], additionalData: { unicode: 'é漢', preserve: true },
  };
  return {
    ...Object.fromEntries(RECOVERY_SECRETS.map(key => [key, 'synthetic-only'])),
    AUDIT_AUTH_FIXTURES_JSON: JSON.stringify(fixture, null, 2),
    AUDIT_REPORT_INGEST_SECRET: 'synthetic-only-'.repeat(4),
    // Deliberately unusable envelope: framing/byte preservation is tested here,
    // not key generation or authentication against an actual SSH service.
    AUDIT_SSH_PRIVATE_KEY: `-----BEGIN ${sshKeyType}-----\nc3ludGhldGljLW9ubHk=\n-----END ${sshKeyType}-----\n`,
    [RECOVERY_PUBLIC_VARIABLE]: publicKey,
  };
}
export const category = expected => error => error instanceof RecoveryTransferError && error.category === expected;
