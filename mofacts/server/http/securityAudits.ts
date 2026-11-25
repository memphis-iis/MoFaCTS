import { WebApp } from 'meteor/webapp';
import { HTTP_AUDIT_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';
import type { createSecurityAuditRuntimeV2 } from '../securityAudit/securityAuditRuntimeV2.ts';
import { registerProtocolHttpMount } from '../securitySurfaces/registerHttpRoutes.ts';

export function registerSecurityAuditHttp(runtime: Pick<ReturnType<typeof createSecurityAuditRuntimeV2>, 'http'>): void {
  registerProtocolHttpMount(WebApp, 'connectHandlers', '/internal/security-audits/v2', {
    surfaceId: 'middleware:security-audit-v2-ingest',
    policy: Object.freeze({ kind: 'signed-ingestion', protocol: 'security-audit-v2-hmac' }),
    dataEgress: Object.freeze({ kind: 'none' }),
    verification: HTTP_AUDIT_VERIFICATIONS.ingest,
  }, runtime.http.ingest);
  registerProtocolHttpMount(WebApp, 'connectHandlers', '/admin/security-audits/download', {
    surfaceId: 'middleware:security-audit-download',
    policy: Object.freeze({ kind: 'single-use-capability', issuerAuthorization: 'current-admin' }),
    dataEgress: Object.freeze({ kind: 'security-audit-report' }),
    verification: HTTP_AUDIT_VERIFICATIONS.download,
  }, runtime.http.download);
}
