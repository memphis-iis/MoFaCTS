import { expect } from 'chai';
import { STIM_VALIDATORS, TDF_VALIDATORS, VALIDATOR_TYPES } from './validatorRegistry';

describe('validator registry H5P support', function() {
  it('counts h5p as display content', function() {
    const displayValidator = STIM_VALIDATORS['[].stims[].display'].validators[0];
    const result = VALIDATOR_TYPES.atLeastOneOf({
      h5p: {
        sourceType: 'external-embed',
        embedUrl: 'https://h5p.example/embed/1',
        completionPolicy: 'manual-continue',
      },
    }, displayValidator);

    expect(result.valid).to.equal(true);
  });

  it('validates supported H5P display configs', function() {
    const valid = VALIDATOR_TYPES.h5pDisplayConfig({
      sourceType: 'external-embed',
      embedUrl: 'https://h5p.example/embed/1',
      completionPolicy: 'manual-continue',
    });
    const selfHosted = VALIDATOR_TYPES.h5pDisplayConfig({
      sourceType: 'self-hosted',
      contentId: 'activity-1',
      packageAssetId: 'activity.h5p',
      library: 'H5P.MultiChoice 1.16',
      completionPolicy: 'xapi-completed',
      scorePolicy: 'record-only',
    });

    expect(valid.valid).to.equal(true);
    expect(selfHosted.valid).to.equal(true);
  });

  it('rejects incomplete self-hosted configs', function() {
    const invalid = VALIDATOR_TYPES.h5pDisplayConfig({
      sourceType: 'self-hosted',
      packageAssetId: 'activity.h5p',
      completionPolicy: 'xapi-completed',
      scorePolicy: 'record-only',
    });

    expect(invalid.valid).to.equal(false);
    expect(invalid.message).to.contain('contentId');
  });
});

describe('validator registry language metadata support', function() {
  it('exposes BCP 47 validators for optional TDF language metadata', function() {
    const contentLanguageValidator = TDF_VALIDATORS['tdfs.tutor.setspec.contentLanguage'];
    const recommendedUiLocalesValidator = TDF_VALIDATORS['tdfs.tutor.setspec.recommendedUiLocales'];

    expect(contentLanguageValidator).to.not.equal(undefined);
    expect(recommendedUiLocalesValidator).to.not.equal(undefined);
    expect(contentLanguageValidator?.validators[0]?.type).to.equal('bcp47LanguageTag');
    expect(recommendedUiLocalesValidator?.validators[0]?.type).to.equal('bcp47LanguageTagArray');
  });

  it('validates conservative BCP 47 language tags', function() {
    expect(VALIDATOR_TYPES.bcp47LanguageTag('zh-Hans').valid).to.equal(true);
    expect(VALIDATOR_TYPES.bcp47LanguageTag('not a locale').valid).to.equal(false);
    expect(VALIDATOR_TYPES.bcp47LanguageTagArray(['en', 'es-US']).valid).to.equal(true);
    expect(VALIDATOR_TYPES.bcp47LanguageTagArray(['en', 'bad locale']).valid).to.equal(false);
  });
});
