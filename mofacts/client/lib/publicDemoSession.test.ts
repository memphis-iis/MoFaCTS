import { expect } from 'chai';
import { isPublicDemoAccount, publicDemoOverviewPath } from './publicDemoSession';

describe('publicDemoSession', function() {
  it('maps every public demo kind to its overview role', function() {
    expect(publicDemoOverviewPath('student')).to.equal('/#students');
    expect(publicDemoOverviewPath('teacher')).to.equal('/#teachers');
    expect(publicDemoOverviewPath('researcher')).to.equal('/#researchers');
  });

  it('distinguishes public demo accounts from ordinary and experiment accounts', function() {
    expect(isPublicDemoAccount({ profile: { createdBy: 'publicDemo' } })).to.equal(true);
    expect(isPublicDemoAccount({ profile: { experiment: true } })).to.equal(false);
    expect(isPublicDemoAccount({ profile: { createdBy: 'administrator' } })).to.equal(false);
    expect(isPublicDemoAccount(null)).to.equal(false);
  });
});
