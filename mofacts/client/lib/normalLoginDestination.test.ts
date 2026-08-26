import { expect } from 'chai';
import {
  DEFAULT_NORMAL_LOGIN_DESTINATION,
  LEARNING_ANALYTICS_DESTINATION,
  resolveNormalLoginDestination,
} from './normalLoginDestination';

describe('normalLoginDestination', function() {
  it('returns to the authenticated learning analytics page', function() {
    expect(resolveNormalLoginDestination(LEARNING_ANALYTICS_DESTINATION))
      .to.equal(LEARNING_ANALYTICS_DESTINATION);
  });

  it('preserves a safe internal dynamic route and query string', function() {
    expect(resolveNormalLoginDestination('/content/tdf-123?tab=details'))
      .to.equal('/content/tdf-123?tab=details');
  });

  it('preserves an allowlisted authenticated route', function() {
    expect(resolveNormalLoginDestination('/courses?section=active'))
      .to.equal('/courses?section=active');
  });

  it('preserves the authenticated content entry route', function() {
    expect(resolveNormalLoginDestination('/content')).to.equal('/content');
  });

  for (const unsafeOrUnknownValue of [
    undefined,
    null,
    '',
    '/auth/logout',
    '/auth/login?returnTo=/home',
    '/demo/student',
    '/experiment/public-demo-student-maps',
    '/content/../../auth/logout',
    'https://example.com',
    '//example.com',
    '/\\example.com',
    ['/learning-analytics-mock'],
  ]) {
    it(`uses the normal default for ${JSON.stringify(unsafeOrUnknownValue)}`, function() {
      expect(resolveNormalLoginDestination(unsafeOrUnknownValue))
        .to.equal(DEFAULT_NORMAL_LOGIN_DESTINATION);
    });
  }
});
