import { profileControls } from '../../../common/securityAudit/catalogRegistry.ts';
import path from 'node:path';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';
import { parseAuditIdentity } from '../../../common/securityAudit/reportIdentity.ts';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { parseCiEvidenceJson } from '../qualification/ciEvidence.mjs';
import { npmAuditFindings, developmentOnlyNpmFindings, parseNpmAuditVulnerabilityCount,
  parseTrivyHighCritical } from '../scanner-parsers.mjs';
import { classifyDevelopmentDependencyPosture } from '../dependency-posture.mjs';
import { evaluateFindingTiers, repositoryFindingArtifact, repositoryFindingGroups } from './findingTiers.mjs';

const invalid = () => { throw new Error('Invalid repository acquisition observations'); };
const unavailable = reason => ({ state: 'unavailable', reason });
const observed = value => ({ state: 'observed', value });
const severities = ['info', 'low', 'moderate', 'high', 'critical'];

// Use the bounded duplicate-key/UTF-8 JSON parser already shared by image and
// qualification collectors. Raw tool values never enter report diagnostics.
function toolJson(result, allowedExitCodes) {
  if (!result || !allowedExitCodes.includes(result.exitCode)) invalid();
  const bytes = typeof result.stdout === 'string' ? Buffer.from(result.stdout) : result.stdout;
  return parseCiEvidenceJson(bytes, 8 * 1024 * 1024);
}
function npmInventory(result) {
  const raw = toolJson(result, [0, 1]);
  if (!raw.vulnerabilities || typeof raw.vulnerabilities !== 'object' || Array.isArray(raw.vulnerabilities)) invalid();
  parseNpmAuditVulnerabilityCount(raw);
  const counts = proofRecord(raw.metadata.vulnerabilities, [...severities, 'total']);
  const findings = npmAuditFindings(raw);
  if (findings.length > 10000 || counts.total !== findings.length
    || counts.total !== severities.reduce((sum, severity) => sum + counts[severity], 0)
    || (result.exitCode === 0) !== (findings.length === 0)
    || findings.some(row => !severities.includes(row.severity))) invalid();
  for (const [index, [name, row]] of Object.entries(raw.vulnerabilities).entries()) {
    // The existing display parser bounds names/IDs. Do not let its redaction
    // collapse distinct package identities before comparing dependency graphs.
    if (findings[index].name !== name || findings[index].severity !== row.severity || !Array.isArray(row.via)) invalid();
    for (const advisory of row.via.filter(value => value && typeof value === 'object')) {
      if (!['string', 'number'].includes(typeof advisory.source)
        || !findings[index].advisoryIds.includes(String(advisory.source))) invalid();
    }
  }
  for (const severity of severities) if (counts[severity] !== findings.filter(row => row.severity === severity).length) invalid();
  return findings;
}

export function parseNpmRepositoryObservationsV2({ runtime, all, policy, lockfile }) {
  if (!['application', 'sidecar-mongo'].includes(lockfile)) invalid();
  const results = {};
  let runtimeFindings;
  try {
    runtimeFindings = npmInventory(runtime);
    results[`${lockfile}-runtime`] = observed({ findings: runtimeFindings.map(({ severity }) => ({ severity })) });
  } catch { results[`${lockfile}-runtime`] = unavailable('producer-malformed'); }
  if (!runtimeFindings) results[`${lockfile}-development`] = unavailable('evidence-incomplete');
  else {
    let development;
    try { development = developmentOnlyNpmFindings(npmInventory(all), runtimeFindings); }
    catch { results[`${lockfile}-development`] = unavailable('producer-malformed'); }
    if (development) {
      try {
        const posture = classifyDevelopmentDependencyPosture(development, policy, lockfile);
        results[`${lockfile}-development`] = observed({ findings: posture.confirmed.map(({ severity }) => ({ severity })),
          maintenanceAdvisoryPackageCount: posture.maintenanceAdvisoryPackageCount });
      } catch { results[`${lockfile}-development`] = unavailable('configuration'); }
    }
  }
  return results;
}

export function parseGitleaksRepositoryObservationV2(result) {
  try {
    const findings = toolJson(result, [0, 1]);
    if (!Array.isArray(findings) || findings.length > 10000 || (result.exitCode === 0) !== (findings.length === 0)
      || findings.some(row => !row || typeof row.RuleID !== 'string' || !row.RuleID.length
        || typeof row.File !== 'string' || !row.File.length)) invalid();
    // This is the reported finding inventory inspected, not a claim about the
    // number of commits/files searched by the independently executed tool.
    return observed({ evaluatedCount: findings.length, findingCount: findings.length });
  } catch { return unavailable('producer-malformed'); }
}

export function parseTrivyRepositoryObservationV2(result, runtimeImage) {
  try { parseAuditIdentity({ state: 'observed', value: runtimeImage }, 'platform-image'); }
  catch { return unavailable('identity-unavailable'); }
  try {
    const raw = toolJson(result, [0]);
    if (typeof raw.ArtifactName !== 'string' || !raw.ArtifactName.length) invalid();
    if (raw.ArtifactName !== runtimeImage) return unavailable('identity-conflict');
    if (!Array.isArray(raw.Results) || !raw.Results.length
      || raw.Results.some(row => !row || typeof row.Target !== 'string' || !row.Target.length
        || !['os-pkgs', 'lang-pkgs'].includes(row.Class)
        || (row.Vulnerabilities !== undefined && row.Vulnerabilities !== null && (!Array.isArray(row.Vulnerabilities)
          || row.Vulnerabilities.some(finding => !finding || !['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(finding.Severity)
            || typeof finding.VulnerabilityID !== 'string' || !finding.VulnerabilityID.length
            || typeof finding.PkgName !== 'string' || !finding.PkgName.length))))) invalid();
    const findings = parseTrivyHighCritical(raw);
    if (findings.length > 10000 || findings.some(row => typeof row.VulnerabilityID !== 'string'
      || !row.VulnerabilityID.length || typeof row.PkgName !== 'string' || !row.PkgName.length)) invalid();
    return observed({ findings: findings.map(({ Severity }) => ({ severity: Severity.toLowerCase() })) });
  } catch { return unavailable('producer-malformed'); }
}

// The source-security suite is explicitly a flat Node test plan. Missing plans,
// skipped/cancelled/TODO cases, crashes and filtered runs never prove coverage.
// Only completed assertion failures establish FAIL; runner/import errors stay ERROR.
export function parseNodeSourceTestObservationV2(result, sourceFile) {
  try {
    if (typeof sourceFile !== 'string' || !path.isAbsolute(sourceFile)) return unavailable('configuration');
    const requiredArgs = ['--test', '--test-reporter=tap', sourceFile];
    if (!Array.isArray(result?.args) || result.args.length !== requiredArgs.length
      || result.args.some((argument, index) => argument !== requiredArgs[index])
      || result.NODE_OPTIONS !== '') return unavailable('configuration');
    if (!result || ![0, 1].includes(result.exitCode)) invalid();
    const bytes = typeof result.stdout === 'string' ? Buffer.from(result.stdout) : result.stdout;
    if (!(bytes instanceof Uint8Array) || bytes.length > 8 * 1024 * 1024) invalid();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if ((text.match(/^TAP version 13$/gm) || []).length !== 1) invalid();
    const one = expression => {
      const matches = [...text.matchAll(expression)]; if (matches.length !== 1) invalid(); return Number(matches[0][1]);
    };
    const planned = one(/^1\.\.(\d+)$/gm), counts = Object.fromEntries(['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']
      .map(name => [name, one(new RegExp(`^# ${name} (\\d+)$`, 'gm'))]));
    const rows = [...text.matchAll(/^(not ok|ok) (\d+)(?: -([^\n]*))?$/gm)];
    if (planned < 1 || planned > 10000 || planned !== counts.tests || counts.suites !== 0 || rows.length !== planned
      || rows.some((row, index) => Number(row[2]) !== index + 1)
      || counts.pass + counts.fail + counts.cancelled + counts.skipped + counts.todo !== planned) invalid();
    // Node can report an empty test file itself as one passing case. That is
    // process completion, not a registered security-contract test.
    if (rows.some(row => path.normalize((row[3] || '').trim()) === path.normalize(sourceFile))) return unavailable('evidence-incomplete');
    if (counts.cancelled || counts.skipped || counts.todo) return unavailable('evidence-incomplete');
    if (rows.filter(row => row[1] === 'ok').length !== counts.pass
      || rows.filter(row => row[1] === 'not ok').length !== counts.fail || (result.exitCode === 0) !== (counts.fail === 0)) invalid();
    for (let index = 0; index < rows.length; index++) if (rows[index][1] === 'not ok') {
      const diagnostic = text.slice(rows[index].index, rows[index + 1]?.index ?? text.length);
      if (!/^\s+code: ['"]ERR_ASSERTION['"]\s*$/m.test(diagnostic)) return unavailable('evidence-incomplete');
    }
    return observed({ expectedCaseCount: planned, completedCaseCount: planned, matchedCaseCount: counts.pass,
      domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 });
  } catch { return unavailable('producer-malformed'); }
}

export function repositoryImageAvailabilityV2(context) {
  let revision, deployed;
  try { revision = parseAuditIdentity(context?.deployedApplicationRevision, 'revision'); } catch { /* Missing/invalid observations remain unavailable. */ }
  try { deployed = parseAuditIdentity(context?.deployedImageDigest, 'platform-image'); } catch { /* No identity is inferred from the selected scan image. */ }
  if (revision?.state === 'conflicting' || deployed?.state === 'conflicting') return 'identity-conflict';
  if (revision?.state !== 'observed' || deployed?.state !== 'observed') return 'identity-unavailable';
  try {
    const selected = parseAuditIdentity({ state: 'observed', value: context?.AUDIT_RUNTIME_IMAGE }, 'platform-image');
    return deployed.value === selected.value ? undefined : 'identity-conflict';
  } catch { return 'identity-unavailable'; }
}

export function evaluateRepositoryObservationsV2(catalog, profile, observations, imageContext) {
  const definitions = profileControls(catalog, profile).filter(row => row.producerId === 'repository');
  if (!definitions.length) invalid();
  const groups = repositoryFindingGroups(catalog, profile), tierIds = new Set(groups.flatMap(group => group.controls));
  const singles = definitions.filter(row => !tierIds.has(row.controlId));
  const slots = [...groups.map(row => row.group), ...singles.map(row => row.controlId)];
  if (observations !== undefined && (!observations || typeof observations !== 'object' || Array.isArray(observations)
    || Object.keys(observations).some(name => !slots.includes(name)))) invalid();
  const imageError = repositoryImageAvailabilityV2(imageContext), controls = [];
  const errorRows = (ids, category) => ids.map(controlId => ({ controlId, status: 'ERROR',
    evidence: { summary: 'Required repository observations did not establish this control.', category } }));
  const unavailableCategory = input => {
    if (input === undefined) return 'evidence-incomplete';
    if (input.state === 'unavailable') {
      proofRecord(input, ['state', 'reason']);
      parseAuditEvidence('finding-inventory-v1', 'ERROR', { summary: 'Repository acquisition unavailable.', category: input.reason });
      return input.reason;
    }
    proofRecord(input, ['state', 'value']); if (input.state !== 'observed') invalid();
  };
  for (const { group, controls: ids } of groups) {
    try {
      const input = observations?.[group], category = group === 'runtime-image' && imageError ? imageError : unavailableCategory(input);
      if (category) { controls.push(...errorRows(ids, category)); continue; }
      const development = group.endsWith('-development');
      const value = proofRecord(input.value, development ? ['findings', 'maintenanceAdvisoryPackageCount'] : ['findings']);
      const rows = evaluateFindingTiers(catalog, profile, group, value.findings);
      if (development) {
        if (!Number.isSafeInteger(value.maintenanceAdvisoryPackageCount) || value.maintenanceAdvisoryPackageCount < 0
          || value.maintenanceAdvisoryPackageCount > 10000) invalid();
        for (const row of rows) row.evidence.observations = [`Development advisory inventory contains ${value.maintenanceAdvisoryPackageCount} packages; reviewed exposures are evaluated separately.`];
      }
      controls.push(...rows);
    } catch { controls.push(...errorRows(ids, 'producer-malformed')); }
  }
  for (const definition of singles) {
    try {
      const input = observations?.[definition.controlId];
      const category = definition.evidenceContract === 'image-findings-v1' && imageError ? imageError : unavailableCategory(input);
      if (category) { controls.push(...errorRows([definition.controlId], category)); continue; }
      const metrics = input.value, status = definition.evidenceContract === 'verification-observations-v1'
        ? metrics.matchedCaseCount === metrics.expectedCaseCount ? 'PASS' : 'FAIL'
        : metrics.findingCount === 0 ? 'PASS' : 'FAIL';
      const evidence = parseAuditEvidence(definition.evidenceContract, status,
        { summary: 'The complete reported repository observation inventory was evaluated.', metrics });
      controls.push({ controlId: definition.controlId, status, evidence });
    } catch { controls.push(...errorRows([definition.controlId], 'producer-malformed')); }
  }
  return repositoryFindingArtifact(catalog, profile, controls);
}
