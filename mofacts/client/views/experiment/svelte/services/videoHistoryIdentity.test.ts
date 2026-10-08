import { expect } from 'chai';
import { buildVideoHistoryIdentity } from './videoHistoryIdentity';
import { assertCanonicalHistoryEnvelope, withCanonicalHistorySchemaVersion, validateHistoryWirePayload } from '../../../../../common/historyEnvelope';
import { compressHistoryRecord, decompressHistoryRecord } from '../../../../../common/historyCompression';
import { getHistory } from '../../../../../server/orm';

describe('video history identity', function() {
  const videoUrl = 'https://www.youtube.com/watch?v=TitrRpMUt0I';
  const unit = { unitname: 'Lecture', videosession: { videosource: videoUrl } };

  it('saves and exports player events without a checkpoint display or trial unit type', function() {
    const identity = buildVideoHistoryIdentity({ videoUrl, unitNumber: 1, unit });
    for (const action of ['play', 'pause', 'seek', 'volumechange', 'ratechange', 'end']) {
      const record = withCanonicalHistorySchemaVersion({
        userId: 'synthetic-user', TDFId: 'synthetic-tdf', sessionID: 'synthetic-session',
        ...identity, time: 2000, problemStartTime: 1000, selection: 'video', action,
        outcome: '', typeOfResponse: 'N/A', responseValue: 'N/A', input: action, eventType: 'video',
        CFVideoTimeStamp: 25, CFVideoSeekStart: 0, CFVideoSeekEnd: 25,
      });
      assertCanonicalHistoryEnvelope(record);
      const wire = compressHistoryRecord(record);
      validateHistoryWirePayload(wire);
      const restored = decompressHistoryRecord(wire);
      assertCanonicalHistoryEnvelope(restored);
      expect(restored).to.include(identity);
      const exported = getHistory(restored);
      expect(exported['Event Type']).to.equal('video');
      expect(exported['CF (Video TimeStamp)']).to.equal(25);
      expect(exported['CF (Video Seek Start)']).to.equal(0);
      expect(exported['CF (Video Seek End)']).to.equal(25);
    }
  });

  it('keeps consecutive units distinct even when their video source is the same', function() {
    const first = buildVideoHistoryIdentity({ videoUrl, unitNumber: 1, unit });
    const second = buildVideoHistoryIdentity({ videoUrl, unitNumber: 2, unit: { ...unit, unitname: 'Repeated lecture' } });
    expect(first.levelUnit).to.equal(1);
    expect(second.levelUnit).to.equal(2);
    expect(second.levelUnitName).to.equal('Repeated lecture');
    expect(second.displayedStimulus).to.equal(first.displayedStimulus);
  });

  it('rejects missing media and invalid unit ownership without filling in trial defaults', function() {
    expect(() => buildVideoHistoryIdentity({ videoUrl: '', unitNumber: 1, unit })).to.throw(/source is missing/);
    expect(() => buildVideoHistoryIdentity({ videoUrl, unitNumber: -1, unit })).to.throw(/unit is missing/);
    expect(() => buildVideoHistoryIdentity({ videoUrl, unitNumber: 1, unit: {} })).to.throw(/unit is missing/);
  });
});
