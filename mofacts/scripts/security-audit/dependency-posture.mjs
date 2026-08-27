const SEVERITY_ORDER = ['critical', 'high', 'moderate', 'low', 'info'];
const REPORT_SEVERITY = { critical: 'CRITICAL', high: 'HIGH', moderate: 'MEDIUM', low: 'LOW', info: 'INFO' };

function validatePolicy(policy) {
  if (policy?.schema !== 'DevelopmentDependencyExposurePolicyV1'
    || !Array.isArray(policy.confirmedBuildExposures)) {
    throw new Error('development dependency exposure policy is malformed');
  }
  const identities = new Set();
  for (const entry of policy.confirmedBuildExposures) {
    if (!entry || !['application', 'sidecar-mongo'].includes(entry.lockfile)
      || typeof entry.package !== 'string' || !/^[A-Za-z0-9@._/+:-]{1,80}$/.test(entry.package)
      || typeof entry.advisoryId !== 'string' || !/^[A-Za-z0-9._:-]{1,80}$/.test(entry.advisoryId)
      || typeof entry.rationaleId !== 'string' || !/^[a-z0-9][a-z0-9.-]{2,79}$/.test(entry.rationaleId)) {
      throw new Error('development dependency exposure policy entry is malformed');
    }
    const identity = `${entry.lockfile}\u0000${entry.package}\u0000${entry.advisoryId}`;
    if (identities.has(identity)) {
      throw new Error('development dependency exposure policy contains a duplicate entry');
    }
    identities.add(identity);
  }
}

export function classifyDevelopmentDependencyPosture(findings, policy, lockfile) {
  if (!Array.isArray(findings) || !['application', 'sidecar-mongo'].includes(lockfile)) {
    throw new Error('development dependency posture input is malformed');
  }
  validatePolicy(policy);
  const confirmed = findings.flatMap((finding) => {
    if (!finding || typeof finding.name !== 'string' || !Array.isArray(finding.advisoryIds)) {
      throw new Error('development dependency finding is malformed');
    }
    return policy.confirmedBuildExposures
      .filter((entry) => entry.lockfile === lockfile
        && entry.package === finding.name
        && finding.advisoryIds.includes(entry.advisoryId))
      .map((entry) => ({ ...finding, advisoryId: entry.advisoryId, rationaleId: entry.rationaleId }));
  });
  const highest = SEVERITY_ORDER.find((candidate) => confirmed.some((finding) => finding.severity === candidate));
  const severity = confirmed.length === 0 ? 'INFO' : (REPORT_SEVERITY[highest] || 'MEDIUM');
  return {
    status: confirmed.length === 0 ? 'PASS' : 'FAIL',
    severity,
    confirmed,
    maintenanceAdvisoryPackageCount: findings.length,
  };
}

export function boundedBuildExposureObservations(findings, limit = 12) {
  if (!Array.isArray(findings)) throw new Error('confirmed build exposure list is malformed');
  return findings.slice(0, limit).map((finding) => (
    `confirmed-build-exposure.${finding.name}: advisory=${finding.advisoryId}, rationale=${finding.rationaleId}`
  ));
}
