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

  for (const unsafeOrUnknownValue of [
    undefined,
    null,
    '',
    '/content',
    'https://example.com',
    '//example.com',
    ['/learning-analytics-mock'],
  ]) {
    it(`uses the normal default for ${JSON.stringify(unsafeOrUnknownValue)}`, function() {
      expect(resolveNormalLoginDestination(unsafeOrUnknownValue))
        .to.equal(DEFAULT_NORMAL_LOGIN_DESTINATION);
    });
  }
});
