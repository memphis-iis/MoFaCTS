import { expect } from 'chai';
import { applyDisplayFieldSubset, validateDisplayFieldSubset } from './displayFieldSubsets';

describe('display field subsets', function() {
  const display = {
    text: 'глаз - ',
    imgSrc: '12.jpg',
    audioSrc: 'eye_audio.mp3',
    attribution: { sourceName: 'Source' },
  };

  it('preserves the full display when no subset is configured', function() {
    expect(applyDisplayFieldSubset(display, {}, 's')).to.deep.equal(display);
    expect(applyDisplayFieldSubset(display, { studyOnlyFields: '', drillFields: '' }, 'd')).to.deep.equal(display);
  });

  it('uses studyOnlyFields for study trials', function() {
    expect(applyDisplayFieldSubset(display, { studyOnlyFields: 'imgSrc,audioSrc' }, 's')).to.deep.equal({
      imgSrc: '12.jpg',
      audioSrc: 'eye_audio.mp3',
    });
  });

  it('uses drillFields for drill, test, and review-backed prompt trials', function() {
    const params = { drillFields: 'text, audioSrc' };
    expect(applyDisplayFieldSubset(display, params, 'd')).to.deep.equal({
      text: 'глаз - ',
      audioSrc: 'eye_audio.mp3',
    });
    expect(applyDisplayFieldSubset(display, params, 't')).to.deep.equal({
      text: 'глаз - ',
      audioSrc: 'eye_audio.mp3',
    });
  });

  it('rejects unsupported fields clearly', function() {
    expect(() => validateDisplayFieldSubset('text,keywordSrc', 'drillFields'))
      .to.throw('drillFields contains unsupported display field(s): keywordSrc');
  });
});
