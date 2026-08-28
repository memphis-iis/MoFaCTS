import { expect } from 'chai';

import { shouldSuppressAuthenticatedChrome } from './authenticatedChromePolicy';

describe('authenticatedChromePolicy', function() {
  it('keeps the themed application chrome for public demo accounts', function() {
    expect(shouldSuppressAuthenticatedChrome({
      explicitlySuppressed: true,
      loginMode: 'experiment',
      userCreatedBy: 'publicDemo',
    })).to.equal(false);
  });

  it('keeps ordinary experiment participant entry compact', function() {
    expect(shouldSuppressAuthenticatedChrome({
      explicitlySuppressed: false,
      loginMode: 'experiment',
      userCreatedBy: 'provisionExperimentUser',
    })).to.equal(true);
  });

  it('honors explicit chrome suppression for ordinary accounts', function() {
    expect(shouldSuppressAuthenticatedChrome({
      explicitlySuppressed: true,
      loginMode: 'password',
      userCreatedBy: undefined,
    })).to.equal(true);
  });
});
