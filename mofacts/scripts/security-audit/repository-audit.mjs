import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { control, errorControl, runCommand, section, writeJsonFile } from './audit-lib.mjs';
import {
  boundedGitleaksObservations,
  boundedNpmFindings,
  boundedTrivyObservations,
  countPotentialSensitiveLogStatements,
  developmentOnlyNpmFindings,
  parseNpmAuditVulnerabilityCount,
  npmAuditFindings,
  parseTrivyHighCritical,
} from './scanner-parsers.mjs';
import {
  boundedBuildExposureObservations,
  classifyDevelopmentDependencyPosture,
} from './dependency-posture.mjs';

const outputPath = process.argv[2];
if (!outputPath) throw new Error('output path is required');
const toolAppRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1')), '..', '..');
const toolRepoRoot = path.resolve(toolAppRoot, '..');
const repoRoot = toolRepoRoot;
const appRoot = path.join(repoRoot, 'mofacts');
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-security-audit-'));
const controls = [];
let developmentExposurePolicy = null;
try {
  developmentExposurePolicy = JSON.parse(await fs.readFile(
    path.join(toolAppRoot, 'scripts', 'security-audit', 'development-dependency-exposure.json'),
    'utf8',
  ));
} catch { /* each development control reports the missing policy below */ }

async function sourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(full));
    else if (entry.isFile() && /\.(?:ts|js|mjs|svelte)$/.test(entry.name) && !entry.name.includes('.test.')) files.push(full);
  }
  return files;
}

try {
  const gitleaksReport = path.join(tempRoot, 'gitleaks.json');
  const gitleaks = await runCommand('gitleaks', [
    'git', '--redact', '--config', path.join(toolRepoRoot, '.gitleaks.toml'),
    '--report-format', 'json', '--report-path', gitleaksReport, toolRepoRoot,
  ], { cwd: toolRepoRoot, timeoutMs: 20 * 60 * 1000 });
  if (gitleaks.exitCode === 0) {
    controls.push(control('repository.git-history-secrets', 'Git history contains no detected secrets', 'PASS', 'CRITICAL',
      'Pinned Gitleaks completed a redacted full-history scan without a finding.'));
  } else if (gitleaks.exitCode === 1) {
    let findingCount = -1;
    let observations = [];
    try {
      const findings = JSON.parse(await fs.readFile(gitleaksReport, 'utf8'));
      findingCount = findings.length;
      observations = boundedGitleaksObservations(findings);
    } catch { /* parser error handled below */ }
    controls.push(findingCount >= 0
      ? control('repository.git-history-secrets', 'Git history contains no detected secrets', 'FAIL', 'CRITICAL',
        `Gitleaks reported ${findingCount} potential secret findings.`, { observations, metrics: { findingCount } })
      : errorControl('repository.git-history-secrets', 'Git history contains no detected secrets', 'Gitleaks finding output was malformed'));
  } else {
    controls.push(errorControl('repository.git-history-secrets', 'Git history contains no detected secrets', gitleaks.reason));
  }

  const lockfiles = [
    { name: 'application', cwd: appRoot },
    { name: 'sidecar-mongo', cwd: path.join(repoRoot, 'mofacts-mcp-sidecar', 'services', 'mongo-mcp') },
  ];
  for (const lockfile of lockfiles) {
    const [runtimeResult, allResult] = await Promise.all([
      runCommand('npm', ['audit', '--json', '--package-lock-only', '--omit=dev'], { cwd: lockfile.cwd }),
      runCommand('npm', ['audit', '--json', '--package-lock-only'], { cwd: lockfile.cwd }),
    ]);
    let runtimeFindings = null;
    let developmentFindings = null;
    try {
      const runtimeParsed = JSON.parse(runtimeResult.stdout || '{}');
      const allParsed = JSON.parse(allResult.stdout || '{}');
      parseNpmAuditVulnerabilityCount(runtimeParsed);
      parseNpmAuditVulnerabilityCount(allParsed);
      runtimeFindings = npmAuditFindings(runtimeParsed);
      developmentFindings = developmentOnlyNpmFindings(npmAuditFindings(allParsed), runtimeFindings);
    } catch { /* malformed output becomes two explicit ERROR controls */ }
    for (const graph of [
      { id: 'runtime', findings: runtimeFindings },
      { id: 'development', findings: developmentFindings },
    ]) {
      const controlId = `repository.dependencies-${lockfile.name}-${graph.id}`;
      const title = graph.id === 'runtime'
        ? `${lockfile.name} runtime dependencies have no known vulnerable packages`
        : `${lockfile.name} development advisories have no confirmed production build exposure`;
      if (!graph.findings) {
        controls.push(errorControl(controlId, title, 'npm audit output was missing or malformed'));
        continue;
      }
      if (graph.id === 'development') {
        let posture = null;
        try {
          posture = classifyDevelopmentDependencyPosture(
            graph.findings,
            developmentExposurePolicy,
            lockfile.name,
          );
        } catch { /* malformed or missing policy becomes an explicit ERROR */ }
        if (!posture) {
          controls.push(errorControl(controlId, title, 'development dependency exposure policy was missing or malformed'));
          continue;
        }
        const observations = [
          ...boundedBuildExposureObservations(posture.confirmed),
          ...boundedNpmFindings(graph.findings),
        ].slice(0, 12);
        controls.push(control(
          controlId,
          title,
          posture.status,
          posture.severity,
          posture.status === 'FAIL'
            ? `${posture.confirmed.length} development dependency advisories have a reviewed build or CI exploitation path.`
            : graph.findings.length === 0
              ? 'npm audit reported no advisories unique to the development dependency graph.'
              : `npm audit reported ${graph.findings.length} advisory packages unique to the development dependency graph; they remain visible as maintenance evidence and have no confirmed build or CI exploitation path.`,
          {
            observations,
            metrics: {
              maintenanceAdvisoryPackageCount: posture.maintenanceAdvisoryPackageCount,
              confirmedBuildExposureCount: posture.confirmed.length,
              productionDependencyGraphReachable: false,
            },
          },
        ));
        continue;
      }
      const highest = graph.findings.some((finding) => finding.severity === 'critical') ? 'CRITICAL'
        : graph.findings.some((finding) => finding.severity === 'high') ? 'HIGH'
          : graph.findings.some((finding) => finding.severity === 'moderate') ? 'MEDIUM' : 'LOW';
      controls.push(control(controlId, title, graph.findings.length === 0 ? 'PASS' : 'FAIL',
        graph.findings.length === 0 ? 'INFO' : highest,
        graph.findings.length === 0
          ? `npm audit reported no vulnerable packages in the ${graph.id} dependency graph.`
          : `npm audit reported ${graph.findings.length} vulnerable packages unique to the ${graph.id} dependency graph.`,
        { observations: boundedNpmFindings(graph.findings), metrics: { vulnerablePackageCount: graph.findings.length } }));
    }
  }

  const surface = await runCommand('node', [path.join(toolAppRoot, 'scripts', 'security-audit', 'check-security-surfaces.mjs')], { cwd: toolAppRoot });
  controls.push(surface.ok
    ? control('repository.security-surface-contract', 'Every server surface has an access classification', 'PASS', 'HIGH',
      'The checked-in method, publication, HTTP, export, and management-route contract matches the source tree.')
    : control('repository.security-surface-contract', 'Every server surface has an access classification', 'FAIL', 'HIGH',
      'The security surface contract is incomplete or stale.'));

  let sensitiveLogCount = 0;
  for (const file of await sourceFiles(path.join(appRoot, 'server'))) {
    sensitiveLogCount += countPotentialSensitiveLogStatements(await fs.readFile(file, 'utf8'));
  }
  controls.push(control('repository.sensitive-logging', 'Potential credentials and personal identifiers are absent from log calls',
    sensitiveLogCount === 0 ? 'PASS' : 'FAIL', 'HIGH',
    sensitiveLogCount === 0 ? 'No sensitive-identifier log statement matched the source policy.' : `${sensitiveLogCount} potential sensitive-identifier log statements require review.`,
    { metrics: { findingCount: sensitiveLogCount } }));

  const tests = await runCommand('node', ['--test', 'scripts/security-audit/source-security.test.mjs'], { cwd: toolAppRoot });
  controls.push(tests.ok
    ? control('repository.source-security-tests', 'Source security contract tests pass', 'PASS', 'HIGH',
      'Report, parser, redaction, and canary tests completed successfully.')
    : control('repository.source-security-tests', 'Source security contract tests pass', 'FAIL', 'HIGH',
      'One or more source security contract tests failed.'));

  const image = String(process.env.AUDIT_RUNTIME_IMAGE || '').trim();
  if (!image) {
    controls.push(errorControl('repository.runtime-image-vulnerabilities', 'Built runtime image has no high or critical vulnerability', 'AUDIT_RUNTIME_IMAGE is not configured'));
  } else {
    const trivyPath = path.join(tempRoot, 'trivy.json');
    const trivy = await runCommand('trivy', [
      'image', '--quiet', '--format', 'json', '--output', trivyPath,
      '--severity', 'HIGH,CRITICAL', image,
    ], { timeoutMs: 30 * 60 * 1000 });
    if (!trivy.ok) {
      controls.push(errorControl('repository.runtime-image-vulnerabilities', 'Built runtime image has no high or critical vulnerability', trivy.reason));
    } else {
      let vulnerabilities = null;
      let observations = [];
      try {
        const json = JSON.parse(await fs.readFile(trivyPath, 'utf8'));
        vulnerabilities = parseTrivyHighCritical(json);
        observations = boundedTrivyObservations(vulnerabilities);
      } catch { /* malformed output becomes ERROR */ }
      controls.push(vulnerabilities === null
        ? errorControl('repository.runtime-image-vulnerabilities', 'Built runtime image has no high or critical vulnerability', 'Trivy output was malformed')
        : control('repository.runtime-image-vulnerabilities', 'Built runtime image has no high or critical vulnerability',
          vulnerabilities.length ? 'FAIL' : 'PASS', vulnerabilities.some((entry) => entry.Severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH',
          vulnerabilities.length ? `Trivy reported ${vulnerabilities.length} high or critical vulnerabilities.` : 'Trivy reported no high or critical vulnerabilities.',
          {
            observations,
            metrics: {
              vulnerabilityCount: vulnerabilities.length,
              operatingSystemVulnerabilityCount: vulnerabilities.filter((entry) => entry.auditClass === 'os-pkgs').length,
              libraryVulnerabilityCount: vulnerabilities.filter((entry) => entry.auditClass === 'lang-pkgs').length,
            },
          }));
    }
  }

  let canaries = [];
  try { canaries = JSON.parse(process.env.AUDIT_AUTH_FIXTURES_JSON || '{}').canaries || []; } catch { canaries = []; }
  if (!image || !Array.isArray(canaries) || canaries.length === 0
    || canaries.some((entry) => typeof entry !== 'string' || entry.length < 8)) {
    controls.push(errorControl('repository.client-bundle-canaries', 'Synthetic canaries are absent from built client bundles',
      'The runtime image or protected canary inventory is unavailable'));
  } else {
    const canaryFile = path.join(tempRoot, 'canaries.txt');
    await fs.writeFile(canaryFile, `${canaries.join('\n')}\n`, { mode: 0o600 });
    const scan = await runCommand('docker', [
      'run', '--rm', '--entrypoint', '/bin/grep',
      '-v', `${canaryFile}:/tmp/mofacts-audit-canaries:ro`, image,
      '-R', '-F', '-f', '/tmp/mofacts-audit-canaries',
      '/opt/bundle/bundle/programs/web.browser', '/opt/bundle/bundle/programs/web.browser.legacy',
    ]);
    controls.push(scan.exitCode === 1
      ? control('repository.client-bundle-canaries', 'Synthetic canaries are absent from built client bundles', 'PASS', 'CRITICAL',
        'No protected synthetic canary was found in either built client bundle.')
      : scan.exitCode === 0
        ? control('repository.client-bundle-canaries', 'Synthetic canaries are absent from built client bundles', 'FAIL', 'CRITICAL',
          'At least one protected synthetic canary was found in a built client bundle.')
        : errorControl('repository.client-bundle-canaries', 'Synthetic canaries are absent from built client bundles', scan.reason));
  }
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

await writeJsonFile(outputPath, section('repository', controls));
