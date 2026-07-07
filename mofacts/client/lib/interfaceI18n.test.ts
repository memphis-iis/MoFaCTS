import { expect } from 'chai';
import {
  assertCompletePlatformLocaleResources,
  getPlatformTextDirection,
  translatePlatformString,
} from './interfaceI18n';

describe('interfaceI18n', function() {
  it('keeps all starter platform translations complete for every target locale', function() {
    expect(() => assertCompletePlatformLocaleResources()).not.to.throw();
  });

  it('translates platform strings for target locales', function() {
    expect(translatePlatformString('en', 'common.submit')).to.equal('Submit');
    expect(translatePlatformString('zh-Hans', 'common.submit')).to.equal('提交');
    expect(translatePlatformString('ur', 'common.submit')).to.equal('جمع کریں');
  });

  it('fails clearly for unsupported locales instead of falling back', function() {
    expect(() => translatePlatformString('de-DE', 'common.submit')).to.throw(/Unsupported UI locale/);
  });

  it('interpolates account strings and fails clearly when values are missing', function() {
    expect(translatePlatformString('en', 'auth.passwordMinLength', { min: 8 })).to.equal('Use at least 8 characters.');
    expect(() => translatePlatformString('en', 'auth.passwordMinLength')).to.throw(/Missing interpolation value "min"/);
  });

  it('reports right-to-left direction for Arabic and Urdu', function() {
    expect(getPlatformTextDirection('ar')).to.equal('rtl');
    expect(getPlatformTextDirection('ur')).to.equal('rtl');
    expect(getPlatformTextDirection('fr')).to.equal('ltr');
  });
});
