import { strict as assert } from 'node:assert';
import { expectationLogitChange, expectationProbability, calculateExpectationProbabilities } from '../../models/adaptive-logistic/probabilityCalculation';
import { readExpectationLogitHistory } from '../../runtime/expectationLogitHistory';
import { sparcHistoryWriteId } from '../../../mofacts/server/lib/sparcHistoryWrite';
import { sameHistoryWrite } from '../../../mofacts/server/lib/historyWriteIdentity';

const scope = { userId: 'learner', TDFId: 'lesson', levelUnit: 0, pageKey: 'page' };
function record(eventId: string, delta: number) {
  return { ...scope, eventType: 'sparc', sessionID: 'attempt', sparc: {
    pageKey: 'page', stateTransition: { transitionId: `${eventId}:dialogue-turn`, event: { eventId, source: { pageKey: 'page' } } },
    expectationLogitChanges: [{ clusterKC: 'a', delta }, { clusterKC: 'b', delta: 0 }],
  } };
}

describe('SPARC expectation history', () => {
  it('uses bounded logit differences and the sum-only probability function', () => {
    const gain = expectationLogitChange(0.5, 0.75);
    assert.ok(Math.abs(gain - Math.log(3)) < 1e-12);
    assert.equal(expectationLogitChange(0.75, 0.5), -gain);
    assert.equal(expectationLogitChange(0, 0), 0);
    assert.ok(Number.isFinite(expectationLogitChange(0, 1)));
    assert.equal(expectationProbability([]), 0.5);
    assert.equal(expectationProbability([gain, -gain]), 0.5);
    for (const value of [-1, 2, NaN, Infinity]) assert.throws(() => expectationLogitChange(0.5, value));
  });
  it('projects each expectation separately, scopes records, and counts an accepted response once after reload', () => {
    const row = record('r1', Math.log(3));
    const rows = [row, JSON.parse(JSON.stringify(row)), { ...record('other', 10), userId: 'other' }];
    assert.deepEqual([...readExpectationLogitHistory(rows, scope)], [['a', [Math.log(3)]], ['b', [0]]]);
    const predict = (history: typeof rows) => calculateExpectationProbabilities(history, scope, ['a', 'b', 'unobserved']);
    assert.ok(Math.abs(predict(rows).a! - 0.75) < 1e-12);
    assert.equal(predict(rows).b, 0.5);
    assert.equal(predict(rows).unobserved, 0.5);
    assert.deepEqual(predict(rows), predict(JSON.parse(JSON.stringify(rows))));
    assert.throws(() => predict([row, record('r1', 2)]), /Conflicting/);
  });
  it('derives stable scoped write identities and rejects semantic conflicts', () => {
    const row = record('r1', 1);
    assert.equal(sparcHistoryWriteId(row), sparcHistoryWriteId({ ...row, eventId: 27 }));
    assert.notEqual(sparcHistoryWriteId(row), sparcHistoryWriteId({ ...row, sessionID: 'another' }));
    assert.ok(sameHistoryWrite(row, { ...row, eventId: 27, recordedServerTime: 10 }));
    assert.equal(sameHistoryWrite(row, record('r1', 2)), false);
  });
  it('loads separate per-KC change rows from one response and deduplicates each target independently', () => {
    const a = record('r1', 1), b = record('r1', 2);
    a.sparc.expectationLogitChanges = [{ clusterKC: 'a', delta: 1 }];
    b.sparc.expectationLogitChanges = [{ clusterKC: 'b', delta: 2 }];
    b.sparc.stateTransition.transitionId = 'r1:assessment:score:expectation:b';
    const rows = [a, b, JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))];
    assert.deepEqual([...readExpectationLogitHistory(rows, scope)], [['a', [1]], ['b', [2]]]);
    const conflict = JSON.parse(JSON.stringify(a)); conflict.sparc.expectationLogitChanges[0].delta = 3;
    assert.throws(() => readExpectationLogitHistory([...rows, conflict], scope), /Conflicting/);
  });
});
