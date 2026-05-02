import { expect } from 'chai';
import { parseYouTubeVideoUrl } from './youtubeUrl';

describe('youtubeUrl', function() {
  it('parses youtu.be share URLs without preserving share parameters', function() {
    const parsed = parseYouTubeVideoUrl('https://youtu.be/HhkENXQtETM?si=hR4XBAr9SDgztziR');

    expect(parsed?.id).to.equal('HhkENXQtETM');
    expect(parsed?.watchUrl).to.equal('https://www.youtube.com/watch?v=HhkENXQtETM');
    expect(parsed?.noCookieEmbedUrl).to.equal('https://www.youtube-nocookie.com/embed/HhkENXQtETM');
  });

  it('parses watch and embed URLs', function() {
    expect(parseYouTubeVideoUrl('https://www.youtube.com/watch?v=fl4FpOznvrw&feature=share')?.id)
      .to.equal('fl4FpOznvrw');
    expect(parseYouTubeVideoUrl('https://www.youtube-nocookie.com/embed/fl4FpOznvrw?rel=0')?.id)
      .to.equal('fl4FpOznvrw');
  });

  it('rejects non-YouTube URLs and malformed IDs', function() {
    expect(parseYouTubeVideoUrl('https://example.com/video.mp4')).to.equal(null);
    expect(parseYouTubeVideoUrl('https://youtu.be/not-valid')).to.equal(null);
  });
});
