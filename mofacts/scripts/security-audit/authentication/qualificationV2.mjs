import { parseAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { evaluatePasswordlessProtocol } from '../../../common/securityAudit/passwordlessProtocol.ts';
import { parseAuditProducerArtifact } from '../../../common/securityAudit/producerArtifact.ts';
import { sessionLifetimeStatus } from '../../../common/securityAudit/sessionLifetime.ts';
import { AUTHENTICATION_CONTROL_CASES, AUTHENTICATION_THROTTLE_CASES } from '../../../common/securityAudit/verificationCatalog.ts';
import { authenticationComparisonProofsV2 } from './comparisonV2.mjs';
import { evaluateCurrentResetSessionsV2 } from './currentResetV2.mjs';
import { evaluateSelectedAuthenticationV2 } from './producerFilesV2.mjs';
import { evaluateLogoutRevocationV2 } from './sessionBrowserV2.mjs';

const literalFlag = 'authentication.passwordless.experiment-flag';
const eligibility = 'authentication.passwordless.experiment-eligibility';
const qualifiedId = id => id === literalFlag ? eligibility : id;
const titles = {
  [eligibility]: 'The passwordless participant has an experiment marker or verified owned progress',
  'authentication.material-leakage': 'Bounded browser channels contain no unintended authentication material disclosure',
  'authentication.passwordless.token-not-leaked': 'Bounded browser channels contain no unintended passwordless token disclosure',
};

// This qualification candidate leaves the deployed ingestion registry intact.
export function authenticationQualificationCatalogV2(released) {
  if (released.catalogId !== 'mofacts-security-audit-controls' || released.catalogVersion !== 1) throw new Error('Unexpected base catalog');
  const contracts = new Map(AUTHENTICATION_CONTROL_CASES.map(row => [row.controlId, row.evidenceContract]));
  return parseAuditCatalog({
    ...released, catalogVersion: 2,
    controls: released.controls.map(row => {
      const controlId = qualifiedId(row.controlId);
      return { ...row, controlId, title: titles[controlId] ?? row.title, evidenceContract: contracts.get(row.controlId) ?? row.evidenceContract };
    }),
    profiles: Object.fromEntries(Object.entries(released.profiles).map(([name, sections]) => [
      name, { ...sections, authentication: sections.authentication.map(qualifiedId) },
    ])),
  });
}

function verifiedReceipt(receipt) {
  if (receipt.state !== 'qualified' || receipt.ownedAccountAndResetStateAbsent !== true
    || receipt.operatorSessionCleanupVerified !== true || receipt.productionAccess !== false) throw new Error('Qualification receipt is incomplete');
  return receipt.result;
}

function fromMetrics(controlId, value, summary) {
  return { controlId, status: value.status, evidence: value.status === 'ERROR'
    ? { category: 'evidence-incomplete', summary }
    : { summary, metrics: value.metrics } };
}

function completeGroup(controlId, statuses, summary) {
  if (statuses.some(status => !['PASS', 'FAIL', 'ERROR'].includes(status))) throw new Error('Invalid protocol result status');
  const status = statuses.includes('ERROR') ? 'ERROR' : statuses.includes('FAIL') ? 'FAIL' : 'PASS';
  return fromMetrics(controlId, { status, metrics: { expectedCaseCount: statuses.length, completedCaseCount: statuses.length,
    matchedCaseCount: statuses.filter(value => value === 'PASS').length,
    domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 } }, summary);
}

// Assemble evidence from independently accepted staging2 runs. This does not
// qualify a single end-to-end scanner invocation or publish an active report.
export function assembleAuthenticationQualificationV2(released, receipts) {
  const catalog = authenticationQualificationCatalogV2(released);
  const selected = evaluateSelectedAuthenticationV2(released, receipts.selected).controls.find(row => row.controlId === 'authentication.authorization');
  const comparison = verifiedReceipt(receipts.comparison);
  const comparisons = authenticationComparisonProofsV2(comparison.observation);
  if (canonicalAuditJson(comparisons) !== canonicalAuditJson(comparison.proofs)) throw new Error('Comparison receipt differs from its observations');
  const reset = verifiedReceipt(receipts.reset);
  const resetCases = [['current', 'current-single-use'], ['replay', 'replay-rejected'], ['expired', 'expired-rejected']];
  const resetControls = resetCases.map(([key, name]) => {
    const controlId = `authentication.reset-token.${name}`;
    const value = reset.protocol[key];
    const expected = AUTHENTICATION_CONTROL_CASES.find(row => row.controlId === controlId).verificationIds;
    if (canonicalAuditJson(value.results.map(row => row.verificationId).sort()) !== canonicalAuditJson([...expected].sort())) {
      throw new Error('Reset receipt has incorrect case membership');
    }
    return fromMetrics(controlId, value, 'Owned reset capability tested under its verified lifetime and state.');
  });
  const logout = receipts.logout;
  if (logout.state !== 'logout-observation-complete' || logout.target !== 'https://staging2.optimallearning.org'
    || logout.productionAccess !== false) throw new Error('Logout receipt is incomplete');
  const logoutStatus = evaluateLogoutRevocationV2(logout.observation).status;
  const resetRevocationStatus = evaluateCurrentResetSessionsV2(reset.session.outcomes).status;
  const lifetime = reset.lifetime;
  if (lifetime.status !== sessionLifetimeStatus(lifetime.metrics.lifetimeDays)) throw new Error('Session lifetime receipt status mismatch');
  const returnFlow = receipts.passwordless.observation;
  const returnReceipt = receipts.passwordless.qualification;
  if (returnReceipt.state !== 'qualification-observed' || returnReceipt.cleanup !== true || returnReceipt.closed !== true
    || returnFlow.acquisitionComplete !== true || returnFlow.progressReloadVerified !== true) throw new Error('Passwordless receipt is incomplete');
  const passwordless = evaluatePasswordlessProtocol(returnFlow.observation);
  if (canonicalAuditJson(passwordless) !== canonicalAuditJson(returnFlow.result)) throw new Error('Passwordless receipt differs from its observations');
  const throttles = receipts.throttles.flatMap(receipt => {
    if (receipt.state !== 'qualification-observed' || receipt.acquisitionComplete !== true
      || receipt.cleanup !== true || receipt.closed !== true) throw new Error('Throttle receipt is incomplete');
    return Array.isArray(receipt.result) ? receipt.result : [receipt.result];
  });
  const scopeIds = AUTHENTICATION_THROTTLE_CASES.map(row => row.verificationId);
  if (canonicalAuditJson(throttles.map(row => row.verificationId).sort()) !== canonicalAuditJson(scopeIds.sort())) {
    throw new Error('Throttle receipt has incorrect scope membership');
  }
  const artifact = parseAuditProducerArtifact({
    artifactSchema: 'MoFaCTSSecurityAuditProducerArtifactV1', producerId: 'authentication', sectionId: 'authentication',
    controls: [
      selected,
      ...comparisons.map(({ controlId, status, evidence }) => ({ controlId, status, evidence })),
      ...resetControls,
      completeGroup('authentication.session-revocation', [logoutStatus, resetRevocationStatus], 'Live logout and password reset session revocation observed.'),
      fromMetrics('authentication.session-lifetime', lifetime, 'Identity-bound fresh session lifetime observed.'),
      { controlId: 'authentication.material-leakage', ...returnFlow.material },
      ...passwordless.map(row => ({ ...row, controlId: qualifiedId(row.controlId) })),
      completeGroup('authentication.throttling', throttles.map(row => row.status), 'Connection, identifier, and IP throttles attributed independently.'),
    ],
  }, catalog, 'full', 'authentication');
  return { catalog, artifact };
}
