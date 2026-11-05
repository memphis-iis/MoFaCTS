import { createHash } from 'node:crypto';
import { canonicalAuditJson } from '../../common/securityAudit/canonicalReport.ts';
import { AUDIT_SECTION_IDS } from '../../common/securityAudit/catalogRegistry.ts';
import { parseSecurityAuditReportV2 } from '../../common/securityAudit/reportV2.ts';

const html = (value: unknown): string => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

// A specifically authorized full read must call this boundary; summaries never
// render/download evidence or claim to recompute the full report digest.
export async function auditDownloadBytesV2(value: unknown, format: 'json' | 'html') {
  const report = await parseSecurityAuditReportV2(value, { purpose: 'retained' });
  if (format !== 'json' && format !== 'html') throw new Error('Unsupported audit download format');
  const bodyText = format === 'json' ? canonicalAuditJson(report) : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'"><meta name="viewport" content="width=device-width"><title>MoFaCTS security audit</title></head><body><main>
<h1>MoFaCTS security audit</h1><dl>
<dt>Report</dt><dd>${html(report.reportId)}</dd><dt>Type</dt><dd>${report.reportType}</dd><dt>Started</dt><dd>${report.startedAt}</dd><dt>Completed</dt><dd>${report.completedAt}</dd><dt>Catalog</dt><dd>${html(report.catalogId)} / ${report.catalogVersion}</dd>
<dt>Catalog digest</dt><dd>${report.catalogDigestSha256}</dd><dt>Report digest</dt><dd>${report.digestSha256}</dd>
<dt>Scanner revision</dt><dd>${report.scannerSourceRevision}</dd><dt>Application revision</dt><dd>${html(canonicalAuditJson(report.deployedApplicationRevision))}</dd>
<dt>Platform image</dt><dd>${html(canonicalAuditJson(report.deployedImageDigest))}</dd><dt>Target</dt><dd>${html(report.target)}</dd></dl>
${report.executionErrors.length ? `<section><h2>Execution errors</h2><ul>${report.executionErrors.map(category => `<li>${category}</li>`).join('')}</ul></section>` : ''}
${AUDIT_SECTION_IDS.map(id => `<section><h2>${id}: ${report.sections[id].status}</h2><table><thead><tr><th>Control</th><th>Status</th><th>Failure severity</th><th>Evidence</th></tr></thead><tbody>
${report.sections[id].controls.map(control => `<tr><td><code>${html(control.controlId)}</code> ${html(control.title)}</td><td>${control.status}</td><td>${control.failureSeverity}</td><td>${html(control.evidence.summary)}
${control.evidence.category ? `<p>${control.evidence.category}</p>` : ''}
${control.evidence.observations ? `<ul>${control.evidence.observations.map(text => `<li>${html(text)}</li>`).join('')}</ul>` : ''}
${control.evidence.metrics ? `<dl>${Object.entries(control.evidence.metrics).map(([key, value]) => `<dt>${html(key)}</dt><dd>${html(value)}</dd>`).join('')}</dl>` : ''}</td></tr>`).join('')}
</tbody></table></section>`).join('')}
</main></body></html>`;
  const body = Buffer.from(`${bodyText}\n`, 'utf8');
  return { body, fileName: `${report.reportId}.${format}`,
    contentType: format === 'json' ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
    sha256: createHash('sha256').update(body).digest('hex') };
}
