import { AUDIT_CATALOG_V1, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { imageDigest, proofRecord, sourceCommit } from '../../../common/securityAudit/proofFields.ts';
import { fixtureNamespaceV2 } from './stagingFixturesV2.mjs';
import { assembleAuthenticationQualificationV2 } from './qualificationV2.mjs';

function parseRuntime(value) {
  const row = proofRecord(value, ['target', 'applicationRevision', 'platformImageDigest']);
  if (row.target !== 'https://staging2.optimallearning.org') throw new Error('Invalid integrated audit target');
  return { target: row.target, applicationRevision: sourceCommit(row.applicationRevision),
    platformImageDigest: imageDigest(row.platformImageDigest) };
}

// The protected driver supplies scoped live executors. The scanner collects
// their results in one invocation and checks the receiver identity between
// phases. A saved qualification report is never an executor input.
export async function runIntegratedAuthenticationV2({ observeRuntime, captureMailProtocols, captureSelected, capturePasswordless, captureThrottles }) {
  const startedAt = new Date().toISOString();
  const namespace = fixtureNamespaceV2();
  const runtime = parseRuntime(await observeRuntime());
  const signature = canonicalAuditJson(runtime);
  async function capture(execute) {
    const value = proofRecord(await execute({ namespace, runtime }), ['namespace', 'result', 'cleanupVerified']);
    if (value.namespace !== namespace || value.cleanupVerified !== true
      || canonicalAuditJson(parseRuntime(await observeRuntime())) !== signature) {
      throw new Error('Integrated authentication phase did not retain its run scope');
    }
    return value.result;
  }

  const mail = await capture(captureMailProtocols);
  const selected = await capture(captureSelected);
  const passwordless = await capture(capturePasswordless);
  // These deliberately exercise limits, so they follow all positive login
  // baselines and account cleanup from the preceding phases.
  const throttles = await capture(captureThrottles);
  const released = await readAuditCatalog(AUDIT_CATALOG_V1, 'retained');
  const { catalog, artifact } = assembleAuthenticationQualificationV2(released, {
    selected,
    comparison: { ...mail, result: mail.result.comparisons },
    reset: mail,
    logout: { state: 'logout-observation-complete', target: runtime.target, productionAccess: false,
      observation: mail.result.logout.observation },
    passwordless,
    throttles,
  });
  return { namespace, runtime, startedAt, completedAt: new Date().toISOString(), catalog, artifact };
}
