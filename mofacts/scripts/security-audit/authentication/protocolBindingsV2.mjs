import { randomBytes } from 'node:crypto';
import { AUTHORIZATION_VERIFICATIONS, AUTHENTICATION_THROTTLE_CASES } from '../../../common/securityAudit/verificationCatalog.ts';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { parseAuthorizationActorBindingV2, parseAuthorizationBindingsV2 } from './bindingsV2.mjs';
import { createFixtureCredentialsV2, fixtureNamespaceV2, STAGING_FIXTURE_ACTORS_V2 } from './stagingFixturesV2.mjs';

const invalid = () => { throw new Error('Protected protocol bindings are invalid'); };
const selectedActors = Object.freeze(['admin', ...STAGING_FIXTURE_ACTORS_V2]);
const actorNames = Object.freeze([...selectedActors, 'reset', 'expiry', 'lockout']);
const selectedAliases = Object.freeze([...new Set(AUTHORIZATION_VERIFICATIONS.flatMap(row => row.bindingAliases))]);
const passwordlessAliases = Object.freeze(['passwordless.experimentTarget', 'passwordless.otherExperimentTarget', 'passwordless.participantId', 'passwordless.ownProgress']);
function mailbox(value) {
  if (typeof value !== 'string' || !/^[a-z0-9._-]+@gmail\.com$/.test(value)) invalid();
  return value;
}
const recipient = (address, namespace, actor) => address.replace('@', `+${namespace}-${actor}@`);
const strong = () => randomBytes(32).toString('base64url') + 'aA1!';

// Only seven new scoped credentials; the existing operator admin is supplied
// separately. No provider authorization, expected decisions or permission flags.
export function createProtocolFixtureCredentialsV2({ namespace, connectedMailboxAddress }) {
  fixtureNamespaceV2(namespace); const address = mailbox(connectedMailboxAddress);
  return { ...createFixtureCredentialsV2(namespace),
    reset: { username: recipient(address, namespace, 'reset'), password: strong(), newPassword: strong() },
    expiry: { username: recipient(address, namespace, 'expiry'), password: strong() },
    lockout: { username: `${namespace}-lockout@localhost.invalid`, password: strong() } };
}

// Validate only after creation returned exact IDs and ownership was checked.
// Projection reuses the accepted selected contract instead of storing a second
// selected binding document or accepting old protected probe arrays/IMAP blocks.
export function parseProtocolBindingsV2(value, { connectedMailboxAddress }) {
  const address = mailbox(connectedMailboxAddress);
  const row = proofRecord(value, ['schema', 'target', 'namespace', 'actors', 'values']);
  fixtureNamespaceV2(row.namespace);
  if (row.schema !== 'MoFaCTSAuditProtocolBindingsV1' || row.target !== 'https://staging2.optimallearning.org') invalid();
  const actors = proofRecord(row.actors, actorNames), ids = new Set(), usernames = new Set(), passwords = new Set();
  for (const name of actorNames) {
    let actor;
    if (name === 'reset') {
      const reset = proofRecord(actors[name], ['userId', 'username', 'password', 'newPassword']);
      actor = parseAuthorizationActorBindingV2({ userId: reset.userId, username: reset.username, password: reset.password });
      if (typeof reset.newPassword !== 'string' || reset.newPassword.length < 32 || reset.newPassword.length > 1024
          || reset.newPassword === actor.password || /[\r\n\0]/.test(reset.newPassword)) invalid();
    } else actor = parseAuthorizationActorBindingV2(actors[name]);
    if (ids.has(actor.userId) || usernames.has(actor.username) || passwords.has(actor.password)) invalid();
    ids.add(actor.userId); usernames.add(actor.username); passwords.add(actor.password);
    if (name !== 'admin') {
      const expected = ['reset', 'expiry'].includes(name) ? recipient(address, row.namespace, name)
        : `${row.namespace}-${name.toLowerCase()}@localhost.invalid`;
      if (actor.username !== expected) invalid();
    }
  }
  if (passwords.has(actors.reset.newPassword)) invalid();
  const values = proofRecord(row.values, [...selectedAliases, ...passwordlessAliases]);
  if (values['passwordless.experimentTarget'] !== `${row.namespace}-target-a`
      || values['passwordless.otherExperimentTarget'] !== `${row.namespace}-target-b`
      || values['passwordless.participantId'] !== `AUDIT_${row.namespace.slice(-12).toUpperCase()}`
      || values['passwordless.ownProgress'] !== `${row.namespace}-passwordless-progress`) invalid();
  const selected = { schema: 'MoFaCTSAuditAuthorizationBindingsV1',
    actors: Object.fromEntries(selectedActors.map(name => [name, actors[name]])),
    values: Object.fromEntries(selectedAliases.map(name => [name, values[name]])) };
  parseAuthorizationBindingsV2(selected);
  return structuredClone(row);
}

export function selectedBindingsFromProtocolV2(value, context) {
  const row = parseProtocolBindingsV2(value, context);
  return parseAuthorizationBindingsV2({ schema: 'MoFaCTSAuditAuthorizationBindingsV1',
    actors: Object.fromEntries(selectedActors.map(name => [name, row.actors[name]])),
    values: Object.fromEntries(selectedAliases.map(name => [name, row.values[name]])) });
}

// This is the only projection into each secret-bearing child. Repository/image
// children keep their existing separate canary inputs and never receive this
// object. The connected Gmail authorization itself stays outside every child.
export function protocolChildInputV2(kind, value, context) {
  const row = parseProtocolBindingsV2(value, context);
  if (kind === 'selected') return { target: row.target, namespace: row.namespace, bindings: selectedBindingsFromProtocolV2(row, context) };
  const actorSets = { comparison: ['learnerA'], reset: ['reset', 'expiry'],
    passwordless: ['admin', 'learnerA', 'learnerB'], throttle: ['lockout'] };
  if (!Object.hasOwn(actorSets, kind)) invalid();
  const aliases = kind === 'passwordless'
    ? ['lesson.progress', 'progress.learnerA', 'progress.learnerB', 'performance.learnerB', ...passwordlessAliases] : [];
  const input = { target: row.target, namespace: row.namespace,
    actors: Object.fromEntries(actorSets[kind].map(name => [name, row.actors[name]])),
    values: Object.fromEntries(aliases.map(name => [name, row.values[name]])) };
  if (kind === 'comparison') input.values['login.missing'] = `${row.namespace}-missing@localhost.invalid`;
  if (kind === 'throttle') {
    for (const [name, scope] of [['connectionThrottleIdentifiers', 'connection'], ['ipThrottleIdentifiers', 'ip']]) {
      const count = AUTHENTICATION_THROTTLE_CASES.find(row => row.scope === scope).maximumAttempts;
      input.values[name] = Array.from({ length: count }, (_, index) => `${row.namespace}-${name.toLowerCase()}-${index}@localhost.invalid`);
    }
  }
  return input;
}
