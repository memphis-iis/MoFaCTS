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

  it('retains bounded TDF expression locations without admitting arbitrary details', function() {
    expect(normalizeDeploymentReadinessResult({
      ok: false,
      generatedAt: '2026-07-10T12:00:00.000Z',
      checks: [
        {
          name: 'tdf.expressions',
          status: 'fail',
          message: '3 invalid expressions',
          details: {
            tdfCount: 65,
            expressionCount: 10,
            probabilityExpressionCount: 8,
            adaptiveRuleCount: 2,
            failureCount: 3,
            failures: [
              { tdfId: 'tdf-1', fieldPath: 'unit[0].calculateProbability' },
              { tdfId: 'tdf-2', fieldPath: 'unitTemplate[1].adaptiveLogic[0]' },
            ],
            omittedFailureCount: 1,
          },
        },
        {
          name: 'mongo.connection',
          status: 'pass',
          message: 'Ready',
          details: { connectionString: 'must-not-reach-the-client-view' },
        },
      ],
    }).checks).to.deep.equal([
      {
        name: 'tdf.expressions',
        status: 'fail',
        message: '3 invalid expressions',
        details: {
          tdfCount: 65,
          expressionCount: 10,
          probabilityExpressionCount: 8,
          adaptiveRuleCount: 2,
          failureCount: 3,
          failures: [
            { tdfId: 'tdf-1', fieldPath: 'unit[0].calculateProbability' },
            { tdfId: 'tdf-2', fieldPath: 'unitTemplate[1].adaptiveLogic[0]' },
          ],
          omittedFailureCount: 1,
        },
      },
      { name: 'mongo.connection', status: 'pass', message: 'Ready' },
    ]);
  });

  it('rejects invalid envelopes and check rows explicitly', function() {
    expect(() => normalizeDeploymentReadinessResult({ ok: true, checks: [] }))
      .to.throw('invalid result envelope');
    expect(() => normalizeDeploymentReadinessResult({
      ok: false,
      generatedAt: 'now',
      checks: [{ name: 'Database', status: 'unknown', message: 'No result' }],
    })).to.throw('check 1 is invalid');
    expect(() => normalizeDeploymentReadinessResult({
      ok: false,
      generatedAt: 'now',
      checks: [{
        name: 'tdf.expressions',
        status: 'fail',
        message: 'Invalid',
        details: {
          tdfCount: 1,
          expressionCount: 1,
          probabilityExpressionCount: 1,
          adaptiveRuleCount: 0,
          failureCount: 1,
          failures: [{ tdfId: '<script>', fieldPath: 'unit[0].calculateProbability' }],
          omittedFailureCount: 0,
        },
      }],
    })).to.throw('invalid TDF expression details');
  });
});
