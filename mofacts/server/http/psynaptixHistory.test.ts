import { expect } from 'chai';
import { authorizeServiceToken, buildPsynaptixHistoryRecord, constantTimeEqual } from './psynaptixHistory';

describe('psynaptix history endpoint (mofacts #M5)', function() {
  describe('service-token auth', function() {
    it('accepts the exact token (constant-time)', function() {
      expect(constantTimeEqual('svc-tok-abc', 'svc-tok-abc')).to.equal(true);
      expect(authorizeServiceToken('Bearer svc-tok-abc', 'svc-tok-abc')).to.equal(true);
    });

    it('rejects any mismatch - wrong token, wrong length, missing header', function() {
      expect(constantTimeEqual('svc-tok-abc', 'svc-tok-abd')).to.equal(false);
      expect(constantTimeEqual('svc-tok-abc', 'svc-tok-abcdef')).to.equal(false);
      expect(authorizeServiceToken('Bearer wrong', 'svc-tok-abc')).to.equal(false);
      expect(authorizeServiceToken(undefined, 'svc-tok-abc')).to.equal(false);
      expect(authorizeServiceToken('Token svc-tok-abc', 'svc-tok-abc')).to.equal(false);
    });

    it('never accepts an unconfigured token (no default accept)', function() {
      expect(authorizeServiceToken('Bearer anything', '')).to.equal(false);
    });
  });

  describe('record building', function() {
    it('builds a canonical session-summary envelope with the psynaptix markers', function() {
      const record = buildPsynaptixHistoryRecord({
        sessionId: 'psx-s1',
        tdfId: 'tdf-1',
        userId: 'learner-7',
        eventId: 'e42',
        completedAt: '2026-08-20T10:00:00.000Z',
        result: { trials: 3, correct: 2, trialsDetail: [{ userAnswer: 'Paris' }] },
      });
      expect(record.sessionID).to.equal('psx-s1');
      expect(record.TDFId).to.equal('tdf-1');
      expect(record.userId).to.equal('learner-7');
      expect(record.eventType).to.equal('session-summary');
      expect(record.source).to.equal('psynaptix');
      expect(record.psynaptixEventId).to.equal('e42');
      expect(record.historySchemaVersion).to.equal(1);
      // `result` is the allowlisted object (#286); input/responseValue stay JSON strings.
      expect(record.result).to.deep.equal({ trials: 3, correct: 2 });
      expect(JSON.parse(String(record.input))).to.deep.equal({ trials: 3, correct: 2 });
      expect(String(record.input)).to.not.include('Paris');
      expect(String(record.responseValue)).to.not.include('trialsDetail');
      expect(record.recordedServerTime).to.equal(undefined); // assigned at insert
    });

    it('builds a postprocess metrics envelope with probabilityEstimate (#589)', function() {
      const record = buildPsynaptixHistoryRecord({
        sessionId: 'psx-s2',
        tdfId: 'tdf-1',
        userId: 'learner-7',
        eventId: 'pp-1',
        completedAt: '2026-08-20T10:00:00.000Z',
        result: {
          source: 'psynaptix-postprocess',
          signalId: 'eeg',
          formula: "mean(ch('Fz'))",
          metrics: {
            raw: { trials: 4 },
            postprocessed: { aggregate: { mean: 0.81, se: 0.05, n: 4 } },
          },
          modelInput: 'performance',
          modelMapping: { path: 'aggregate.mean', clamp01: true },
          userAnswer: 'should-not-land',
        },
      });
      expect(record.eventType).to.equal('psynaptix-postprocess');
      expect(record.source).to.equal('psynaptix-postprocess');
      expect(record.selection).to.equal('eeg');
      expect(record.probabilityEstimate).to.equal(0.81);
      expect(String(record.input)).to.not.include('should-not-land');
      const result = record.result as { metrics: { postprocessed: { aggregate: { mean: number } } } };
      expect(result.metrics.postprocessed.aggregate.mean).to.equal(0.81);
    });
  });
});
