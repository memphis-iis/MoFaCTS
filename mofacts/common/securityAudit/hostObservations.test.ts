import { expect } from 'chai';
import { canonicalAuditJson } from './canonicalReport.ts';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from './catalogRegistry.ts';
import { parseAuditEvidence } from './evidenceContracts.ts';
import { hostMeasurementsOutcome, hostUnavailableObservations } from './hostAuditPolicy.ts';
import { hostObservationContractDigest, parseHostObservationBytes } from './hostObservations.ts';
import { evaluateHostObservations } from '../../scripts/security-audit/internal/evaluateHost.mjs';
import { hostFixture, hostNow, unavailableFact } from '../../scripts/security-audit/tests/fixtures/hostFixtures.mjs';

describe('V2 host observation shared Node/Meteor parity', function() {
  it('loads the fixed descriptor and keeps unavailable measurements explicit', async function() {
    expect(await hostObservationContractDigest()).to.equal('4646d0cae686fe24499a554e27101fc95a8266d3e3f3308d7a3396d9c91696e0');
    const fixture = await hostFixture();
    unavailableFact(fixture, 'redis', 'applicationConnectivity', 'timeout');
    expect(await parseHostObservationBytes(Buffer.from(canonicalAuditJson(fixture) + '\n'), hostNow)).to.deep.equal(fixture);
  });

  it('preserves a confirmed host failure without treating unavailable connectivity as a vulnerability', async function() {
    const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
    const fixture = await hostFixture();
    fixture.observations.redis!.unauthenticatedCommandAccepted!.value = true;
    unavailableFact(fixture, 'redis', 'auditConnectivity');
    unavailableFact(fixture, 'redis', 'applicationConnectivity');
    unavailableFact(fixture, 'redis', 'hostPublicationCount');
    const result = await evaluateHostObservations(catalog, 'full', fixture, hostNow);
    const redis = result.controls.find((row: { controlId: string }) => row.controlId === 'internal.redis-auth');
    expect(redis?.status).to.equal('FAIL');
    const metrics = { unauthenticatedCommandAccepted: true };
    expect(redis?.evidence).to.include.keys('observations');
    expect(parseAuditEvidence('redis-policy-v1', 'FAIL', {
      summary: 'Synthetic conclusive host failure.', metrics,
      observations: hostUnavailableObservations('redis-policy-v1', metrics),
    }).metrics).to.deep.equal(metrics);
    expect(hostMeasurementsOutcome('redis-policy-v1', { auditConnectivity: false })).to.equal('ERROR');
    expect(() => parseAuditEvidence('redis-policy-v1', 'FAIL', {
      summary: 'Synthetic conclusive host failure.', metrics,
    })).to.throw();
  });

  it('requires the exact app publication and independent Apache active/configuration facts', async function() {
    const fixture = await hostFixture();
    expect(hostMeasurementsOutcome('docker-publications-v1', { expectedApplicationPublicationCount: 0 })).to.equal('FAIL');
    expect(hostMeasurementsOutcome('docker-publications-v1', { expectedApplicationPublicationCount: 2 })).to.equal('FAIL');
    const docker = Object.fromEntries(Object.entries(fixture.observations.docker!).filter(([key]) => key !== 'expectedApplicationPublicationCount')
      .map(([key, fact]) => [key, fact.value]));
    expect(hostMeasurementsOutcome('docker-publications-v1', docker)).to.equal('ERROR');
    for (const key of ['apacheActive', 'apacheConfigValid']) {
      expect(hostMeasurementsOutcome('reverse-proxy-v1', { [key]: false })).to.equal('FAIL');
      const proxy = Object.fromEntries(Object.entries(fixture.observations.proxy!).filter(([name]) => name !== key)
        .map(([name, fact]) => [name, fact.value]));
      expect(hostMeasurementsOutcome('reverse-proxy-v1', proxy)).to.equal('ERROR');
    }
  });
});
