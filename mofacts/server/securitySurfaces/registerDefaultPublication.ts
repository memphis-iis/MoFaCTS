import type { Meteor } from 'meteor/meteor';
import type { DEFAULT_PUBLICATION_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';

type Verification = typeof DEFAULT_PUBLICATION_VERIFICATIONS[keyof typeof DEFAULT_PUBLICATION_VERIFICATIONS];
type Surface = Readonly<{
  surfaceId: Verification['surfaceId'];
  name: null;
  policy: 'authenticated-self';
  verification: Verification;
}>;
type Publish = typeof Meteor.publish;
const registrations: Surface[] = [];

export function registerDefaultPublication(
  server: { publish: Publish },
  surfaceId: Surface['surfaceId'],
  verification: Verification,
  handler: Parameters<Publish>[1],
): void {
  if (surfaceId !== verification.surfaceId) throw new Error('Default publication verification does not match its binding');
  server.publish(null, handler);
  registrations.push(Object.freeze({ surfaceId, name: null, policy: 'authenticated-self', verification }));
}

export function registeredDefaultPublications(): readonly Surface[] {
  return Object.freeze([...registrations]);
}
