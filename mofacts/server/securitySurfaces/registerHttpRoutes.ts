import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'connect';
import type { HttpIntegrationVerification, PublicHttpVerification } from '../../common/securityAudit/verificationCatalog.ts';

type MountPath = `/${string}`;
type HttpHandler = (request: IncomingMessage, response: ServerResponse, next: () => void) => void | Promise<void>;
type HttpMount = Readonly<{
  surfaceId: `middleware:${string}`;
  stack: 'connectHandlers';
  mount: MountPath;
  dispatch: 'mounted-prefix';
}>;

type PublicHttpPolicy = Readonly<{ kind: 'public'; applicationRateLimit: 'none' }>;
type PublicHttpMount = HttpMount & Readonly<{
  policy: PublicHttpPolicy;
  dataEgress: Readonly<{ kind: 'public-operational-metadata' }>;
  verification: PublicHttpVerification;
}>;

type AuditHttpDescriptor = Pick<HttpMount, 'surfaceId'> & Readonly<{
  verification: HttpIntegrationVerification & { surfaceId: `http:${'post' | 'get'}:/${string}` };
}> & (
  | Readonly<{ policy: Readonly<{ kind: 'signed-ingestion'; protocol: 'security-audit-v2-hmac' }>;
    dataEgress: Readonly<{ kind: 'none' }> }>
  | Readonly<{ policy: Readonly<{ kind: 'single-use-capability'; issuerAuthorization: 'current-admin' }>;
    dataEgress: Readonly<{ kind: 'security-audit-report' }> }>
);

type AuditHttpMount = HttpMount & AuditHttpDescriptor;

const registrations: (PublicHttpMount | AuditHttpMount)[] = [];

function registerHttpMount(stack: Pick<Server, 'use'>, registration: PublicHttpMount | AuditHttpMount, handler: HttpHandler): void {
  stack.use(registration.mount, handler);
  registrations.push(Object.freeze(registration));
}

export function registerPublicHttpMount(
  stack: Pick<Server, 'use'>,
  mount: MountPath,
  descriptor: Pick<PublicHttpMount, 'dataEgress' | 'verification'>,
  respond: (request: IncomingMessage, response: ServerResponse) => void,
): void {
  const methods: ReadonlySet<string> = new Set(descriptor.verification.endpoints.map(entry => entry.method));
  registerHttpMount(stack, {
    ...descriptor,
    surfaceId: descriptor.verification.fallthrough.surfaceId,
    stack: 'connectHandlers',
    mount,
    dispatch: 'mounted-prefix',
    policy: Object.freeze({ kind: 'public', applicationRateLimit: 'none' }),
    dataEgress: Object.freeze({ ...descriptor.dataEgress }),
  }, (request, response, next) => {
    if (!request.method || !methods.has(request.method)) return next();
    return respond(request, response);
  });
}

export function registerAuditHttpMount(
  stack: Pick<Server, 'use'>,
  mount: MountPath,
  descriptor: AuditHttpDescriptor,
  handler: HttpHandler,
): void {
  // The protocol handler owns its path and method checks and the order in
  // which it validates the request. Register the callback on the same stack.
  registerHttpMount(stack, {
    ...descriptor,
    stack: 'connectHandlers',
    mount,
    dispatch: 'mounted-prefix',
  }, handler);
}

// Coverage and sealing belong to final composition after every owner is accounted for.
export function registeredHttpMounts(): readonly (PublicHttpMount | AuditHttpMount)[] {
  return Object.freeze([...registrations]);
}
