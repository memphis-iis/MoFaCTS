import { expect } from 'chai';
import { normalizeDeploymentReadinessResult } from './testRunnerState';

describe('Admin Tests result state', function() {
  it('normalizes the declared deployment-readiness result contract', function() {
    expect(normalizeDeploymentReadinessResult({
      ok: true,
      generatedAt: '2026-07-10T12:00:00.000Z',
      checks: [{ name: 'Database', status: 'pass', message: 'Ready' }],
    })).to.deep.equal({
      ok: true,
      generatedAt: '2026-07-10T12:00:00.000Z',
      checks: [{ name: 'Database', status: 'pass', message: 'Ready' }],
    });
  });

  it('converts the EJSON date returned by the server to display text', function() {
    expect(normalizeDeploymentReadinessResult({
      ok: true,
      generatedAt: new Date('2026-07-10T12:00:00.000Z'),
      checks: [],
    }).generatedAt).to.equal('2026-07-10T12:00:00.000Z');
  });

  it('rejects invalid envelopes and check rows explicitly', function() {
    expect(() => normalizeDeploymentReadinessResult({ ok: true, checks: [] }))
      .to.throw('invalid result envelope');
    expect(() => normalizeDeploymentReadinessResult({
      ok: false,
      generatedAt: 'now',
      checks: [{ name: 'Database', status: 'unknown', message: 'No result' }],
    })).to.throw('check 1 is invalid');
  });
});
