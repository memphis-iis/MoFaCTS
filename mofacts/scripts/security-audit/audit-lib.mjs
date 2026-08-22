import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const SECTION_IDS = ['external', 'authentication', 'internal', 'repository'];

export function sanitizedText(value, maxLength = 500) {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  const redacted = text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(authorization|cookie|set-cookie)\s*:[^,;\s]+/gi, '$1:[redacted]')
    .replace(/\b(password|passwd|secret|token|session)\s*[=:]\s*\S+/gi, '$1=[redacted]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[redacted-high-entropy]')
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, '[redacted-high-entropy]');
  return (redacted || 'No detail was returned.').slice(0, maxLength);
}

export function sanitizedMetrics(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const metrics = {};
  for (const [key, metric] of Object.entries(value).slice(0, 32)) {
    if (!/^[a-z][A-Za-z0-9.-]{0,79}$/.test(key)
      || /(?:password|secret|token|session|cookie|credential|email)/i.test(key)) continue;
    if (typeof metric === 'string') metrics[key] = sanitizedText(metric, 120);
    else if (typeof metric === 'number' && Number.isFinite(metric)) metrics[key] = metric;
    else if (typeof metric === 'boolean' || metric === null) metrics[key] = metric;
  }
  return metrics;
}

export function control(controlId, title, status, severity, summary, options = {}) {
  return {
    controlId,
    title,
    status,
    severity,
    evidence: {
      summary: sanitizedText(summary),
      ...(options.observations?.length
        ? { observations: options.observations.slice(0, 12).map((entry) => sanitizedText(entry)) }
        : {}),
      ...(options.metrics ? { metrics: sanitizedMetrics(options.metrics) } : {}),
    },
  };
}

export function errorControl(controlId, title, error) {
  return control(controlId, title, 'ERROR', 'HIGH', `Control did not complete: ${sanitizedText(error)}`);
}

export function section(sectionId, controls) {
  const statuses = controls.map((entry) => entry.status);
  const status = statuses.includes('ERROR') ? 'ERROR'
    : statuses.includes('FAIL') ? 'FAIL'
      : statuses.includes('PASS') ? 'PASS'
        : 'NOT_APPLICABLE';
  return { sectionId, status, controls };
}

export function isExecutionErrorControl(value) {
  return value?.status === 'ERROR' && value?.evidence?.metrics?.inconclusive !== true;
}

export function notApplicableSection(sectionId, reason) {
  return section(sectionId, [control(
    `${sectionId}.not-applicable`,
    `${sectionId} section not scheduled`,
    'NOT_APPLICABLE',
    'INFO',
    reason,
  )]);
}

export async function runCommand(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      timeout: options.timeoutMs || 15 * 60 * 1000,
      maxBuffer: options.maxBuffer || 32 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || ''),
      exitCode: Number.isInteger(error.code) ? error.code : -1,
      reason: error.code === 'ENOENT' ? `${command} is not installed` : `${command} exited unsuccessfully`,
    };
  }
}

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function calculateCounts(sections) {
  const counts = { pass: 0, fail: 0, error: 0, notApplicable: 0, info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const auditSection of Object.values(sections)) {
    for (const result of auditSection.controls) {
      const statusKey = result.status === 'NOT_APPLICABLE' ? 'notApplicable' : result.status.toLowerCase();
      counts[statusKey] += 1;
      if (result.status === 'FAIL') counts[result.severity.toLowerCase()] += 1;
    }
  }
  return counts;
}

export function finalizeReport(reportWithoutDigest) {
  const counts = calculateCounts(reportWithoutDigest.sections);
  const payload = { ...reportWithoutDigest, counts };
  const digestSha256 = crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex');
  return { ...payload, digestSha256 };
}

export async function writeJsonFile(path, value) {
  await fs.writeFile(path, `${canonicalJson(value)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export async function readJsonFile(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}
