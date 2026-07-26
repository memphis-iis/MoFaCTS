import { strict as assert } from 'node:assert';
import { isRateLimitedOpenRouterMethod } from './ddpRateLimits';

describe('DDP rate limits', function() {
  it('does not rate-limit admin OpenRouter test methods', function() {
    assert.equal(isRateLimitedOpenRouterMethod('callAdminTestResolvedOpenRouterJson'), false);
    assert.equal(isRateLimitedOpenRouterMethod('callAdminTestOpenRouterRequest'), false);
  });

  it('retains limits for ordinary authenticated OpenRouter methods', function() {
    assert.equal(isRateLimitedOpenRouterMethod('callResolvedOpenRouterJson'), true);
    assert.equal(isRateLimitedOpenRouterMethod('callResolvedOpenRouterEmbeddings'), true);
  });
});
