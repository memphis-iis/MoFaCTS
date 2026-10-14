import { expect } from 'chai';
import { buildExternalSessionHistoryRecord } from './externalUrlHistory';

describe('externalUrlSession history (issue #240)', function() {
  afterEach(function() {
    // Clear the Meteor user stubs the record builder reads.
    (Meteor as unknown as Record<string, unknown>)._userId = undefined;
    delete (Meteor as unknown as Record<string, unknown>).user;
  });

  it('builds a canonical session-summary record with a sanitized result payload', function() {
    (Meteor as unknown as Record<string, unknown>)._userId = 'learner-7';
    (Meteor as unknown as Record<string, unknown>).user = () => ({
      _id: 'learner-7',
      username: 'learner-7',
    });
    const record = buildExternalSessionHistoryRecord({
      sessionId: 'psx-s1',
      tdfId: 'tdf-1',
      unitId: 2,
      result: { trials: 3, correct: 2, rawEvents: [{ payload: 'huge' }] },
      eventId: 'e42',
    });
    expect(record.sessionID).to.equal('psx-s1');
    expect(record.TDFId).to.equal('tdf-1');
    expect(record.levelUnit).to.equal(2);
    expect(record.eventType).to.equal('session-summary');
    expect(record.source).to.equal('psynaptix');
    expect(record.psynaptixEventId).to.equal('e42');
    expect(record.historySchemaVersion).to.equal(1);
    expect(JSON.parse(String(record.result))).to.deep.equal({ trials: 3, correct: 2 });
    expect(String(record.input)).to.not.include('rawEvents');
  });

  it('handles the minimal input (no result, no eventId)', function() {
    const record = buildExternalSessionHistoryRecord({ sessionId: 'psx-s1', tdfId: 'tdf-1' });
    expect(record.eventType).to.equal('session-summary');
    expect(record.psynaptixEventId).to.equal(undefined);
    expect(JSON.parse(String(record.result))).to.deep.equal({});
  });
});
