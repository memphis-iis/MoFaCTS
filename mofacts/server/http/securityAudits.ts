import { WebApp } from 'meteor/webapp';
import type { createSecurityAuditRuntimeV2 } from '../securityAudit/securityAuditRuntimeV2.ts';

// The application composition registers one receiver and one download binding.
// V1 has no route, reader or write path in this application candidate.
export function registerSecurityAuditHttp(runtime: Pick<ReturnType<typeof createSecurityAuditRuntimeV2>, 'http'>): void {
  WebApp.connectHandlers.use('/internal/security-audits/v2', runtime.http.ingest);
  WebApp.connectHandlers.use('/admin/security-audits/download', runtime.http.download);
}
