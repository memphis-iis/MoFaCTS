import { expect } from 'chai';
import { resolveInterfaceLocale } from './interfaceLocaleSelection';

describe('interface locale selection', function() {
  it('uses the first explicit configured locale source in order', function() {
    expect(resolveInterfaceLocale({
      explicitUserPreference: 'fr-CA',
      institutionLocale: 'es',
      deploymentLocale: 'hi',
      applicationLocale: 'en',
    })).to.equal('fr');

    expect(resolveInterfaceLocale({
      institutionLocale: 'es',
      deploymentLocale: 'hi',
      applicationLocale: 'en',
    })).to.equal('es');

    expect(resolveInterfaceLocale({
      deploymentLocale: 'hi',
      applicationLocale: 'en',
    })).to.equal('hi');
  });

  it('uses permitted browser preferences only when earlier sources are absent', function() {
    expect(resolveInterfaceLocale({
      browserLocales: ['de-DE', 'pt-PT'],
      applicationLocale: 'en',
    })).to.equal('pt');
  });

  it('fails clearly for unsupported explicit locale sources', function() {
    expect(() => resolveInterfaceLocale({
      explicitUserPreference: 'de-DE',
      applicationLocale: 'en',
    })).to.throw(/Unsupported UI locale "de-DE" from user preference/);
  });

  it('fails clearly when browser preferences are present but unsupported', function() {
    expect(() => resolveInterfaceLocale({
      browserLocales: ['de-DE', 'it-IT'],
      applicationLocale: 'en',
    })).to.throw(/Unsupported UI locale list from browser preferences/);
  });

  it('uses the application locale when no higher-priority source is present', function() {
    expect(resolveInterfaceLocale({ applicationLocale: 'ur-PK' })).to.equal('ur');
    expect(resolveInterfaceLocale({})).to.equal('en');
  });
});

