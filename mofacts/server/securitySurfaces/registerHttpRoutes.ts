import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NextFunction, Server } from 'connect';
import type { HttpIntegrationVerification, PublicHttpVerification } from '../../common/securityAudit/verificationCatalog.ts';

type MountPath = `/${string}`;
type HttpHandler = (request: IncomingMessage, response: ServerResponse, next: NextFunction) => void | Promise<void>;
type HttpMount = Readonly<{
  surfaceId: `middleware:${string}`;
  stack: 'connectHandlers' | 'rawConnectHandlers';
  mount: MountPath;
  dispatch: 'mounted-prefix';
}>;

type PublicHttpPolicy = Readonly<{ kind: 'public'; applicationRateLimit: 'none' }>;
type PublicHttpMount = HttpMount & Readonly<{
  policy: PublicHttpPolicy;
  dataEgress: Readonly<{ kind: 'public-operational-metadata' }>;
  stack: 'connectHandlers';
  verification: PublicHttpVerification;
}>;

type ProtocolHttpDescriptor = Pick<HttpMount, 'surfaceId'> & Readonly<{
  verification: HttpIntegrationVerification & { surfaceId: `http:${'post' | 'get'}:/${string}` | HttpMount['surfaceId'] };
}> & (
  | Readonly<{ policy: Readonly<{ kind: 'signed-ingestion'; protocol: 'security-audit-v2-hmac' }>;
    dataEgress: Readonly<{ kind: 'none' }> }>
  | Readonly<{ policy: Readonly<{ kind: 'single-use-capability'; issuerAuthorization: 'current-admin' }>;
    dataEgress: Readonly<{ kind: 'security-audit-report' | 'backup-archive' }> }>
  | Readonly<{ policy: Readonly<{ kind: 'single-use-capability'; issuerAuthorization: 'bound-user-exists' | 'current-lesson-owner' }>;
    dataEgress: Readonly<{ kind: 'learner-history' }> }>
  | Readonly<{ policy: Readonly<{ kind: 'public-asset-marker' }>;
    dataEgress: Readonly<{ kind: 'public-asset' }> }>
);

type ProtocolHttpMount = HttpMount & ProtocolHttpDescriptor;

type MiddlewareStack = 'connectHandlers' | 'handlers';
type HttpMiddlewareVerification = HttpIntegrationVerification & {
  surfaceId: HttpMount['surfaceId'] | `http:${'get' | 'post'}:/${string}`;
};
type HttpMiddlewareDescriptor = Readonly<{
  surfaceId: HttpMount['surfaceId'];
  verification: readonly [HttpMiddlewareVerification, ...HttpMiddlewareVerification[]];
}> & (
  | Readonly<{ policy: PublicHttpPolicy; dataEgress: Readonly<{ kind: 'public-brand-assets' | 'public-preview' }> }>
  | Readonly<{ policy: Readonly<{ kind: 'saml-protocol' }>; dataEgress: Readonly<{ kind: 'saml-protocol-response' }> }>
  | Readonly<{ policy: Readonly<{ kind: 'response-headers' }>; dataEgress: Readonly<{ kind: 'none' }> }>
);

type HttpMiddleware = HttpMiddlewareDescriptor & Readonly<{ mount: null; stack: MiddlewareStack; dispatch: 'handler-owned' }>;
type FrameworkRuntimeConfig = Readonly<{
  surfaceId: 'framework:webapp:external-runtime-config';
  mount: '/meteor_runtime_config.js';
  stack: 'framework';
  dispatch: 'framework-owned';
  policy: Readonly<{ kind: 'external-runtime-config'; inlineScriptsAllowed: false }>;
  dataEgress: Readonly<{ kind: 'public-runtime-config' }>;
  verification: HttpIntegrationVerification & { surfaceId: 'framework:webapp:external-runtime-config' };
}>;
type HttpRegistration = PublicHttpMount | ProtocolHttpMount | HttpMiddleware | FrameworkRuntimeConfig;

const registrations: HttpRegistration[] = [];

function registerHttpMount(stack: Pick<Server, 'use'>, registration: PublicHttpMount | ProtocolHttpMount, handler: HttpHandler): void {
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

export function registerProtocolHttpMount(
  stacks: Record<HttpMount['stack'], Pick<Server, 'use'>>,
  stack: HttpMount['stack'],
  mount: MountPath,
  descriptor: ProtocolHttpDescriptor,
  handler: HttpHandler,
): void {
  // The protocol handler owns its path and method checks and the order in
  // which it validates the request. Register the callback on the same stack.
  registerHttpMount(stacks[stack], {
    ...descriptor,
    stack,
    mount,
    dispatch: 'mounted-prefix',
  }, handler);
}

export function registerHttpMiddleware<Stack extends MiddlewareStack>(
  stacks: Record<Stack, { use: (handler: HttpHandler) => void }>,
  stack: Stack,
  descriptor: HttpMiddlewareDescriptor,
  handler: HttpHandler,
): void {
  stacks[stack].use(handler);
  registrations.push(Object.freeze({ ...descriptor, stack, mount: null, dispatch: 'handler-owned' }));
}

export async function bindFrameworkRuntimeConfig(
  webAppInternals: { setInlineScriptsAllowed(allowed: boolean): Promise<void> },
  verification: FrameworkRuntimeConfig['verification'],
): Promise<void> {
  // Meteor owns the route and response. Preserve the awaited startup hook.
  await webAppInternals.setInlineScriptsAllowed(false);
  registrations.push(Object.freeze({
    surfaceId: verification.surfaceId,
    mount: '/meteor_runtime_config.js',
    stack: 'framework',
    dispatch: 'framework-owned',
    policy: Object.freeze({ kind: 'external-runtime-config', inlineScriptsAllowed: false }),
    dataEgress: Object.freeze({ kind: 'public-runtime-config' }),
    verification,
  }));
}

// Coverage and sealing belong to final composition after every owner is accounted for.
export function registeredHttpSurfaces(): readonly HttpRegistration[] {
  return Object.freeze([...registrations]);
}
