import { expect } from 'chai';
import { resolveContentLanguageAttributes } from './contentLanguageAttributes';

describe('content language attributes', function() {
  it('emits lang and LTR direction for declared authored content language', function() {
    expect(resolveContentLanguageAttributes('zh-Hans')).to.deep.equal({
      lang: 'zh-Hans',
      dir: 'ltr',
    });
  });

  it('emits RTL direction for right-to-left authored content language', function() {
    expect(resolveContentLanguageAttributes('ur')).to.deep.equal({
      lang: 'ur',
      dir: 'rtl',
    });
  });

  it('omits attributes when content language is not declared', function() {
    expect(resolveContentLanguageAttributes('')).to.deep.equal({});
    expect(resolveContentLanguageAttributes(null)).to.deep.equal({});
  });

  it('fails clearly on malformed content language metadata', function() {
    expect(() => resolveContentLanguageAttributes('bad locale'))
      .to.throw('Invalid contentLanguage "bad locale"');
  });
});
