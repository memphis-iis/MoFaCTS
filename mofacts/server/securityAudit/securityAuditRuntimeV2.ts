import { createProtectedSecurityAuditReceiverV2 } from './securityAuditReceiverV2.ts';
import { createSecurityAuditHttpV2 } from './securityAuditHttpV2.ts';
import { createSecurityAuditV2Methods } from './securityAuditMethodsV2.ts';

// Single composition owner for the service and its transport bindings.
// The server composition explicitly initializes and registers this runtime.
// One secret getter/receiver/metadata loader serves all callers.
export function createSecurityAuditRuntimeV2(deps: Parameters<typeof createProtectedSecurityAuditReceiverV2>[0]) {
  const receiver = createProtectedSecurityAuditReceiverV2(deps);
  return { initialize: receiver.initialize, methods: createSecurityAuditV2Methods(receiver),
    http: createSecurityAuditHttpV2({ receiver, ingestionConfigured: () => {
      const secret = deps.ingestSecret(); return typeof secret === 'string' && secret.length >= 32;
    } }) };
}
