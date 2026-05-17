import { expect } from 'chai';
import {
  clampH5PPreferredHeight,
  normalizeH5PDisplayConfig,
  validateH5PDisplayConfig,
} from './h5pDisplay';

describe('h5p display config', function() {
  const baseUrl = 'https://lesson.example/';

  it('accepts passive external embeds', function() {
    const config = normalizeH5PDisplayConfig({
      sourceType: 'external-embed',
      embedUrl: 'https://h5p.example/embed/1',
      completionPolicy: 'manual-continue',
      preferredHeight: 560,
    }, baseUrl);

    expect(config).to.deep.equal({
      sourceType: 'external-embed',
      embedUrl: 'https://h5p.example/embed/1',
      completionPolicy: 'manual-continue',
      preferredHeight: 560,
    });
  });

  it('accepts same-origin relative embeds', function() {
    expect(validateH5PDisplayConfig({
      sourceType: 'external-embed',
      embedUrl: '/h5p/embed/local',
      completionPolicy: 'viewed',
    }, baseUrl).valid).to.equal(true);
  });

  it('accepts self-hosted scored package references', function() {
    expect(validateH5PDisplayConfig({
      sourceType: 'self-hosted',
      contentId: 'activity-1',
      packageAssetId: 'activity.h5p',
      library: 'H5P.MultiChoice 1.16',
      completionPolicy: 'xapi-completed',
      scorePolicy: 'record-only',
    }, baseUrl).valid).to.equal(true);
  });

  it('rejects unsupported external embed scoring combinations clearly', function() {
    expect(validateH5PDisplayConfig({
      sourceType: 'external-embed',
      embedUrl: 'https://h5p.example/embed/1',
      completionPolicy: 'xapi-passed',
    }, baseUrl).message).to.contain('completionPolicy');

    expect(validateH5PDisplayConfig({
      sourceType: 'external-embed',
      embedUrl: 'https://h5p.example/embed/1',
      completionPolicy: 'manual-continue',
      scorePolicy: 'record-only',
    }, baseUrl).message).to.contain('scorePolicy');
  });

  it('rejects unsafe embed URLs', function() {
    for (const embedUrl of ['javascript:alert(1)', 'data:text/html,nope', 'http://h5p.example/embed/1', '//h5p.example/embed/1', '']) {
      expect(validateH5PDisplayConfig({
        sourceType: 'external-embed',
        embedUrl,
        completionPolicy: 'manual-continue',
      }, baseUrl).valid, embedUrl).to.equal(false);
    }
  });

  it('clamps renderer height separately from author validation', function() {
    expect(clampH5PPreferredHeight(10)).to.equal(240);
    expect(clampH5PPreferredHeight(1200)).to.equal(900);
    expect(clampH5PPreferredHeight(640)).to.equal(640);
  });
});
