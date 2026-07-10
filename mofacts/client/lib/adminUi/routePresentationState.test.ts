import { expect } from 'chai';
import { createRoutePresentationStore } from './routePresentationState';
import type { ManagementRoutePresentationPolicy } from './managementRoutePresentationPolicies';

const policy: ManagementRoutePresentationPolicy = {
  routeName: 'client.adminTests',
  path: '/admin/tests',
  template: 'testRunner',
  titleKey: 'home.adminTests',
  chromeMode: 'app',
  requiresAuth: true,
  allowedRoles: 'admin',
  load: async () => undefined,
};

describe('management route presentation state', function() {
  it('publishes target identity synchronously before readiness', function() {
    const store = createRoutePresentationStore();
    const generation = store.begin(policy, '/admin/tests');

    expect(store.get()).to.deep.equal({
      status: 'loading',
      routeName: 'client.adminTests',
      path: '/admin/tests',
      targetTemplate: 'testRunner',
      titleKey: 'home.adminTests',
      chromeMode: 'app',
      navigationGeneration: generation,
    });
  });

  it('accepts resolve and failure only for the current navigation', function() {
    const store = createRoutePresentationStore();
    const first = store.begin(policy, '/admin/tests');
    const second = store.begin({ ...policy, routeName: 'client.profile', template: 'profile' }, '/profile');

    expect(store.resolve(first)).to.equal(false);
    expect(store.fail(first, 'stale', true)).to.equal(false);
    expect(store.resolve(second)).to.equal(true);
    expect(store.get()).to.include({
      status: 'ready',
      routeName: 'client.profile',
      targetTemplate: 'profile',
    });
  });

  it('retains an explicit retry action only for retryable failure', function() {
    const store = createRoutePresentationStore();
    let retries = 0;
    const generation = store.begin(policy, '/admin/tests', () => {
      retries += 1;
    });

    store.fail(generation, 'Module failed', true);

    expect(store.retry()).to.equal(true);
    expect(retries).to.equal(1);
    store.clear();
    expect(store.retry()).to.equal(false);
  });
});
