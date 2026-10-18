import assert from 'node:assert/strict';
import { parseSparcVideoSegment, sparcVideoPassages } from '../../../learning-components/runtime/sparcVideo';
const video = { segmentId: 'a'.repeat(64), videoId: 'abcdefghijk', startSeconds: 40, endSeconds: 70, transcript: 'A complete explanation.', language: 'en', title: 'Biology', channel: 'Teaching' };
describe('SPARC immutable video intervals', () => {
  it('accepts a 30-second YouTube interval and rejects unbounded or executable descriptors', () => {
    assert.deepEqual(parseSparcVideoSegment(video), video);
    for (const invalid of [{ ...video, endSeconds: 71 }, { ...video, startSeconds: -1 }, { ...video, videoId: 'javascript:evil' }, { ...video, iframe: '<iframe>' }]) assert.throws(() => parseSparcVideoSegment(invalid));
  });
  it('uses caption timestamps and rejects invented caption IDs', () => {
    const captions = [{ id: 0, text: 'Heritable variation exists.', startSeconds: 10, endSeconds: 20 }];
    assert.deepEqual(sparcVideoPassages(captions, [{ firstCaptionId: 0, lastCaptionId: 0 }]), [{ startSeconds: 10, endSeconds: 20, transcript: 'Heritable variation exists.' }]);
    assert.throws(() => sparcVideoPassages(captions, [{ firstCaptionId: 0, lastCaptionId: 1 }]));
  });
});
