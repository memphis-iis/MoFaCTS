import assert from 'node:assert/strict';
import { parseSparcVideoSegment, sparcVideoPassages } from '../../../learning-components/runtime/sparcVideo';
import { supportsSparcVideoCatalog } from './sparcVideoCatalog';
const video = { segmentId: 'a'.repeat(64), videoId: 'abcdefghijk', startSeconds: 40, endSeconds: 70, transcript: 'A complete explanation.', language: 'en', title: 'Biology', channel: 'Teaching' };

describe('SPARC video catalog eligibility', () => {
  it('requires a SPARC session that selects an authored AutoTutor page', () => {
    const rawStimuliFile = { setspec: { sparcPages: [{ pageId: 'biology', display: { unitType: 'sparc-autotutor-dialogue' } }] } };
    const lesson = (unit: unknown[]) => ({ content: { tdfs: { tutor: { unit } } }, rawStimuliFile });
    assert.equal(supportsSparcVideoCatalog(lesson([{ sparcsession: { pageId: 'biology' } }])), true);
    assert.equal(supportsSparcVideoCatalog(lesson([{ unitinstructions: 'Start' }, { sparcsession: {} }])), true);
    for (const unit of [[], [{ learningsession: {} }], [{ assessmentsession: {} }], [{ videosession: {} }],
      [{ autotutorsession: {} }], [{ sparcsession: { pageId: 'other' } }]]) {
      assert.equal(supportsSparcVideoCatalog(lesson(unit)), false);
    }
    assert.equal(supportsSparcVideoCatalog({ content: { tdfs: { tutor: { unit: [{ sparcsession: {} }] } } } }), false);
    assert.equal(supportsSparcVideoCatalog({ ...lesson([{ sparcsession: {} }]), rawStimuliFile: {
      setspec: { sparcPages: [{ pageId: 'biology', display: { nodes: [] } }] },
    } }), false);
    assert.equal(supportsSparcVideoCatalog(undefined), false);
  });
});
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
