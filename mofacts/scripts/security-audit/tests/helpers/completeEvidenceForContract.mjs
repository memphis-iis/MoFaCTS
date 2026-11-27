const metricsByContract = () => ({
  'address-inventory-v1': { addressCount: 1 },
  'finding-inventory-v1': { evaluatedCount: 1, findingCount: 0 },
  'image-findings-v1': { evaluatedCount: 1, findingCount: 0 },
  'tcp-policy-v1': { addressCount: 1, testedEndpointCount: 2, unexpectedPortCount: 0, missingRequiredPortCount: 0 },
  'udp-exposure-v1': { observedResultCount: 7, expectedResultCount: 7, openSelectedUdpPortCount: 0, unexpectedUdpListenerCount: 0, unexpectedUdpAllowRuleCount: 0, unexpectedUdpPublicationCount: 0, firewallActive: true, defaultDenyInbound: true },
  'http-redirect-v1': { testedPathCount: 3, passingPathCount: 3 },
  'tls-protocols-v1': { addressCount: 1, testedProtocolCount: 4, acceptedLegacyCount: 0, rejectedModernCount: 0 },
  'certificate-policy-v1': { addressCount: 1, validatedCertificateCount: 1, minimumValidityDays: 60 },
  'tls-ciphers-v1': { cipherCount: 5, weakCipherCount: 0 },
  'websocket-policy-v1': { addressCount: 1, secureUpgradeCount: 1, insecureUpgradeCount: 0 },
  'header-policy-v1': { requiredRestrictionCount: 4, matchingRestrictionCount: 4 },
  'enumeration-observations-v1': { loginCodeMatch: true, resetShapeMatch: true, rateLimitedAttemptCount: 0, comparedAttemptCount: 10 },
  'timing-observations-v1': { loginDifferentialMs: 5, loginApprovedBoundMs: 50, resetDifferentialMs: 8, resetApprovedBoundMs: 50, sampleCountPerIdentifier: 10 },
  'reset-expiration-v1': { ageMinutes: 65, configuredLifetimeMinutes: 60, accepted: false },
  'session-lifetime-v1': { lifetimeDays: 30, authenticated: true },
  'session-lifetime-v2': { lifetimeDays: 30, authenticated: true, freshSessionVerified: true },
  'verification-observations-v1': { expectedCaseCount: 2, completedCaseCount: 2, matchedCaseCount: 2, domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 },
  'reproducible-authentication-v1': { requiredCaseCount: 1, passedCaseCount: 1, ordinaryLoginSmokePassed: true, resetSmokePassed: true, passwordlessSmokePassed: true },
  'deployment-network-attestation-v1': { cloudUnexpectedAllowRuleCount: 0, hostUnexpectedAllowRuleCount: 0, unexpectedListenerCount: 0, unexpectedDockerPublicationCount: 0, httpReachable: true, httpsReachable: true },
  'mongodb-deployment-attestation-v1': { disposableUnauthenticatedReadRejected: true, disposableAuthenticatedReadSucceeded: true, authEnabled: true, privateBinding: true, unexpectedDockerPublicationCount: 0, authenticatedHealthPassed: true },
  'host-configuration-v1': { requiredSettingCount: 3, presentSettingCount: 3, rootOwned: true, rootOnly: true },
  'host-listeners-v1': { inspectedListenerCount: 5, unexpectedListenerCount: 0, unexpectedUdpListenerCount: 0 },
  'application-listener-v1': { expectedListenerPresent: true },
  'sidecar-policy-v1': { absenceRequired: true, listenerCount: 0, helperContainerCount: 0, endpointDeclarationCount: 0, publicationCount: 0, loopbackOnly: true },
  'docker-publications-v1': { inspectedContainerCount: 3, expectedApplicationPublicationCount: 1, unexpectedPublicationCount: 0, unexpectedUdpPublicationCount: 0, privateNetworkModeCount: 0 },
  'firewall-policy-v1': { firewallActive: true, defaultDenyInbound: true, publicWebAllowed: true, scopedSshOnly: true, unexpectedAllowRuleCount: 0, unexpectedUdpAllowRuleCount: 0 },
  'reverse-proxy-v1': { configuredHostMatched: true, apacheActive: true, apacheConfigValid: true, httpLoopbackOnly: true, websocketLoopbackOnly: true, inspectedUpstreamCount: 2 },
  'mongodb-unauthenticated-v1': { unauthenticatedReadAccepted: false },
  'mongodb-scoped-roles-v1': { authenticatedConnectivity: true, replicaSetMatched: true, applicationGrantsMatched: true, readConcernRoleMatched: true, sidecarAccountStateMatched: true },
  'redis-policy-v1': { unauthenticatedCommandAccepted: false, auditConnectivity: true, applicationConnectivity: true, hostPublicationCount: 0 },
  'repository-security-workflow-v1': { workflowPresent: true, triggerPolicyMatched: true, permissionsMatched: true, dependencyAuditMatched: true, secretScanMatched: true, sourceContractMatched: true, sidecarAuditMatched: true },
  'dependency-findings-v1': { evaluatedCount: 1, findingCount: 0 },
  'secret-scan-v1': { evaluatedCommitCount: 1, findingCount: 0 },
  'source-security-v1': { expectedCaseCount: 1, passedCaseCount: 1, failedCaseCount: 0, skippedCaseCount: 0 },
  'release-image-v1': { deployedDigestMatched: true, sourceRevisionMatched: true, platformMatched: true },
});

const comparison = { loginPairCount: 5, resetPairCount: 2, baselineVerified: true, bindingsVerified: true,
  environmentLeaseHeld: true, rateLimitedAttemptCount: 0, domainRejectionCount: 0,
  transportErrorCount: 0, inconclusiveCaseCount: 0 };

export function completeEvidenceMetricsByContract() {
  const samples = metricsByContract();
  samples['enumeration-observations-v2'] = { ...comparison, loginResponseMatch: true, resetResponseMatch: true };
  samples['timing-observations-v2'] = { ...comparison, loginExistingMedianMs: 900, loginMissingMedianMs: 900,
    loginDifferentialMs: 0, loginApprovedBoundMs: 450, loginDominantDirectionCount: 0, loginRequiredDirectionCount: 4,
    resetExistingMedianMs: 300, resetMissingMedianMs: 300, resetDifferentialMs: 0,
    resetApprovedBoundMs: 250, resetDominantDirectionCount: 0, resetRequiredDirectionCount: 2 };
  return samples;
}

export function completeEvidenceForContract(contract) {
  const metrics = completeEvidenceMetricsByContract()[contract];
  if (!metrics) throw new Error(`No complete evidence fixture for ${contract}`);
  return { summary: 'Complete bounded observations.', metrics };
}
