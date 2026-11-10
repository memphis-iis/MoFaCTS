export function safeExternalObservationsV2() {
  const measurements = {
    'external.dns-addresses': { addressCount: 1 },
    'external.public-tcp-ports.standard': { addressCount: 1, testedEndpointCount: 65535, unexpectedPortCount: 0, missingRequiredPortCount: 0 },
    'external.public-tcp-ports.sensitive': { addressCount: 1, testedEndpointCount: 65535, unexpectedPortCount: 0, missingRequiredPortCount: 0 },
    'external.http-redirect': { testedPathCount: 3, passingPathCount: 3 },
    'external.tls-protocols': { addressCount: 1, testedProtocolCount: 4, acceptedLegacyCount: 0, rejectedModernCount: 0 },
    'external.certificate': { addressCount: 1, validatedCertificateCount: 1, minimumValidityDays: 45 },
    'external.tls-ciphers': { cipherCount: 5, weakCipherCount: 0 },
    'external.websocket-tls': { addressCount: 1, secureUpgradeCount: 1, insecureUpgradeCount: 0 },
    'external.hsts': { requiredRestrictionCount: 1, matchingRestrictionCount: 1 },
    'external.csp': { requiredRestrictionCount: 5, matchingRestrictionCount: 5 },
    'external.security-headers': { requiredRestrictionCount: 4, matchingRestrictionCount: 4 },
  };
  return Object.fromEntries(Object.entries(measurements).map(([id, value]) => [id, { state: 'observed', value }]));
}
