import { auditReportId, auditTargetOrigin, parseSecurityAuditReportV2 } from '../../../common/securityAudit/reportV2.ts';
import { AUDIT_V2_MAX_BODY_BYTES } from '../../../server/securityAudit/securityAuditIngestionV2.ts';
import { validateAuthorizationActorPageV2 } from '../authentication/browserV2.mjs';
import { parseAuditFileV2 } from './producerFilesV2.mjs';

// Reuse an explicitly supplied, already authenticated operator page. This helper
// grants no login/access, lists no reports and requests only the selected ID.
// Returned bytes are private workflow input; never print them or the download URL.
export async function acquireAuditReportReadbackV2({ page, target, adminUserId, reportId }) {
  try {
    const origin = auditTargetOrigin(target), id = auditReportId(reportId);
    if (origin !== 'https://staging2.optimallearning.org' || typeof adminUserId !== 'string' || !adminUserId
      || await validateAuthorizationActorPageV2(page, origin, 'admin', adminUserId) !== 'matched') throw new Error();
    const text = await page.evaluate(async ({ origin, adminUserId, reportId, maximumBytes }) => {
      const owned = () => location.origin === origin && globalThis.Meteor.status().connected
        && globalThis.Meteor.userId() === adminUserId && globalThis.Session.get('authReady') === true
        && globalThis.Session.get('authRolesHydrated') === true
        && globalThis.Session.get('authRolesSyncedUserId') === adminUserId
        && globalThis.Session.get('authRoles')?.admin === true;
      if (!owned()) throw new Error();
      let timer;
      let issued;
      try {
        issued = await Promise.race([globalThis.Meteor.callAsync('admin.securityAudits.downloadToken', reportId, 'json'),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error()), 10000); })]);
      } finally { clearTimeout(timer); }
      if (!owned() || typeof issued?.url !== 'string') throw new Error();
      const url = new URL(issued.url, origin);
      if (url.origin !== origin || url.username || url.password || url.search || url.hash
        || !url.pathname.startsWith('/admin/security-audits/download/')) throw new Error();
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (response.status !== 200 || !response.body || !owned()) throw new Error();
      const reader = response.body.getReader(), chunks = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          size += part.value.length;
          if (size > maximumBytes) { await reader.cancel(); throw new Error(); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      if (!owned()) throw new Error();
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      if (response.headers.get('x-content-sha256') !== digest) throw new Error();
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    }, { origin, adminUserId, reportId: id, maximumBytes: AUDIT_V2_MAX_BODY_BYTES });
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length > AUDIT_V2_MAX_BODY_BYTES) throw new Error();
    const report = await parseSecurityAuditReportV2(parseAuditFileV2(bytes), { purpose: 'retained' });
    if (report.target !== origin || report.reportId !== id) throw new Error();
    if (await validateAuthorizationActorPageV2(page, origin, 'admin', adminUserId) !== 'matched') throw new Error();
    return bytes;
  } catch { throw new Error('V2 authorized report readback is unavailable'); }
}
