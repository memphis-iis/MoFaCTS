import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'connect';
import type { PublicHttpVerification } from '../../common/securityAudit/verificationCatalog.ts';

type PublicHttpMount = Readonly<{
  surfaceId: `middleware:${string}`;
  stack: 'connectHandlers';
  mount: `/${string}`;
  dispatch: 'mounted-prefix';
  policy: Readonly<{ kind: 'public'; applicationRateLimit: 'none' }>;
  dataEgress: Readonly<{ kind: 'public-operational-metadata' }>;
  verification: PublicHttpVerification;
}>;

const registrations: PublicHttpMount[] = [];

export function registerPublicHttpMount(
  stack: Pick<Server, 'use'>,
  mount: PublicHttpMount['mount'],
  descriptor: Pick<PublicHttpMount, 'dataEgress' | 'verification'>,
  respond: (request: IncomingMessage, response: ServerResponse) => void,
): void {
  const methods: ReadonlySet<string> = new Set(descriptor.verification.endpoints.map(entry => entry.method));
  const registration: PublicHttpMount = Object.freeze({
    ...descriptor,
    surfaceId: descriptor.verification.fallthrough.surfaceId,
    stack: 'connectHandlers',
    mount,
    dispatch: 'mounted-prefix',
    policy: Object.freeze({ kind: 'public', applicationRateLimit: 'none' }),
    dataEgress: Object.freeze({ ...descriptor.dataEgress }),
  });
  stack.use(mount, (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (!request.method || !methods.has(request.method)) return next();
    return respond(request, response);
  });
  registrations.push(registration);
}

// This reports registrations owned by this adapter. Coverage and sealing belong
// to final composition, once every application and framework owner is accounted for.
export function registeredPublicHttpMounts(): readonly PublicHttpMount[] {
  return Object.freeze([...registrations]);
}
