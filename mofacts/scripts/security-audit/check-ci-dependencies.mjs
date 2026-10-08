import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  boundedNpmFindings,
  developmentOnlyNpmFindings,
  npmAuditFindings,
  parseNpmAuditVulnerabilityCount,
} from './scanner-parsers.mjs';
import {
  boundedBuildExposureObservations,
  classifyDevelopmentDependencyPosture,
} from './dependency-posture.mjs';

function validatedFindings(audit) {
  if (audit?.error) throw new Error('npm audit reported an execution error');
  parseNpmAuditVulnerabilityCount(audit);
  const findings = npmAuditFindings(audit);
  for (const severity of ['info', 'low', 'moderate', 'high', 'critical']) {
    const count = audit.metadata.vulnerabilities[severity];
    if (!Number.isSafeInteger(count) || count < 0
      || count !== findings.filter((finding) => finding.severity === severity).length) {
      throw new Error('npm audit severity counts do not match its findings');
    }
  }
  if (audit.metadata.vulnerabilities.total !== findings.length) {
    throw new Error('npm audit total count does not match its findings');
  }
  return findings;
}

export function assessCiDependencies(allAudit, runtimeAudit, policy, lockfile) {
  const allFindings = validatedFindings(allAudit);
  const runtimeFindings = validatedFindings(runtimeAudit);
  const developmentFindings = developmentOnlyNpmFindings(allFindings, runtimeFindings);
  const developmentPosture = classifyDevelopmentDependencyPosture(developmentFindings, policy, lockfile);
  const blockingRuntimeFindings = runtimeFindings.filter((finding) => ['high', 'critical'].includes(finding.severity));
  return {
    runtimeFindings,
    developmentFindings,
    developmentPosture,
    blockingRuntimeFindings,
    status: blockingRuntimeFindings.length > 0 || developmentPosture.status === 'FAIL' ? 'FAIL' : 'PASS',
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [lockfile, allPath, runtimePath] = process.argv.slice(2);
    if (!allPath || !runtimePath || process.argv.length !== 5) {
      throw new Error('Expected a lockfile identity and full/runtime npm audit JSON files');
    }
    const policy = JSON.parse(fs.readFileSync(new URL('./development-dependency-exposure.json', import.meta.url), 'utf8'));
    const result = assessCiDependencies(
      JSON.parse(fs.readFileSync(allPath, 'utf8')),
      JSON.parse(fs.readFileSync(runtimePath, 'utf8')),
      policy,
      lockfile,
    );
    console.log(`${lockfile}: ${result.blockingRuntimeFindings.length} high/critical runtime findings; ${result.developmentFindings.length} development advisory packages; ${result.developmentPosture.confirmed.length} confirmed build exposures.`);
    console.log('Runtime dependency advisories:');
    for (const observation of boundedNpmFindings(result.runtimeFindings)) console.log(observation);
    console.log('Development maintenance advisories (informational unless build exposure is confirmed):');
    for (const observation of boundedNpmFindings(result.developmentFindings)) console.log(observation);
    for (const observation of boundedBuildExposureObservations(result.developmentPosture.confirmed)) console.log(observation);
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  } catch {
    console.error('Dependency audit failed: output or exposure policy is missing, invalid, or reports an execution error.');
    process.exitCode = 1;
  }
}
