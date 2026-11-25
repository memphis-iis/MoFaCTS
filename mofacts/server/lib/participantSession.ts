import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { PARTICIPANT_TOKEN_PREFIX, studyOnlyAccount } from '../../common/participantPrivacy';

type Binding = { target: string; rootId: string };
type Scope = { userId: string; tokenHash: string; rootId: string };
const connections = new Map<string, Scope>();

// Accounts hashes the entire bearer token, including the canonical binding.
export function encodeParticipantToken(binding: Binding, secret: string) {
  return PARTICIPANT_TOKEN_PREFIX + Buffer.from(JSON.stringify(binding)).toString('base64url') + '.' + secret;
}

export function participantTokenBinding(token: unknown): Binding | null {
  if (typeof token !== 'string' || token.length > 4096 || !token.startsWith(PARTICIPANT_TOKEN_PREFIX)) return null;
  const parts = token.slice(PARTICIPANT_TOKEN_PREFIX.length).split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const binding = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    return typeof binding?.target === 'string' && typeof binding.rootId === 'string' ? binding : null;
  } catch { return null; }
}

export function bindParticipantConnection(connection: { id: string; onClose: (fn: () => void) => void }, userId: string, token: string, rootId: string) {
  if (!connections.has(connection.id)) connection.onClose(() => connections.delete(connection.id));
  connections.set(connection.id, { userId, tokenHash: (Accounts as any)._hashLoginToken(token), rootId });
}

export function participantConnectionRoot(context: { userId?: string | null; connection?: { id?: string } | null }) {
  return participantRootForConnection(context.connection?.id, context.userId);
}

export function participantRootForConnection(connectionId: string | undefined, userId: string | null | undefined) {
  const scope = connectionId && connections.get(connectionId);
  return scope && scope.userId === userId && scope.tokenHash === (Accounts as any)._getLoginToken(connectionId) ? scope.rootId : null;
}

export const accountDiagnosticsPolicy = Object.freeze({
  kind: 'diagnostic-telemetry', operation: 'non-private-account',
  async authorize(context: Parameters<typeof participantConnectionRoot>[0]) {
    return !!context.userId && !await privateParticipantActivity(context);
  },
} as const);

export async function privateParticipantActivity(context: Parameters<typeof participantConnectionRoot>[0]) {
  if (participantConnectionRoot(context)) return true;
  if (!context.userId) return false;
  const user = await Meteor.users.findOneAsync(context.userId, { fields: { 'profile.experiment': 1, 'profile.createdBy': 1 } });
  return studyOnlyAccount(user);
}
