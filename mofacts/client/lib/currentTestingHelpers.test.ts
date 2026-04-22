import { expect } from 'chai';
import { getUserDisplayIdentifier } from './currentTestingHelpers';

describe('currentTestingHelpers user identity', function() {
  it('prefers username when present', function() {
    const identifier = getUserDisplayIdentifier({
      username: 'student@example.com',
      email_canonical: 'canonical@example.com',
      emails: [{ address: 'primary@example.com' }],
    });

    expect(identifier).to.equal('student@example.com');
  });

  it('uses canonical email when username is missing', function() {
    const identifier = getUserDisplayIdentifier({
      email_canonical: 'canonical@example.com',
      emails: [{ address: 'primary@example.com' }],
    });

    expect(identifier).to.equal('canonical@example.com');
  });

  it('uses primary email when username and canonical email are missing', function() {
    const identifier = getUserDisplayIdentifier({
      emails: [{ address: 'primary@example.com' }],
    });

    expect(identifier).to.equal('primary@example.com');
  });

  it('returns empty string when no display identifier exists', function() {
    expect(getUserDisplayIdentifier(null)).to.equal('');
    expect(getUserDisplayIdentifier({})).to.equal('');
  });
});
