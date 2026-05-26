import { expect } from 'chai';
import { getRouteAccessPolicy, routeAccessPolicies } from './routeAccessPolicies';

describe('route access policies', function() {
  it('keeps deployment readiness diagnostics behind the admin-only tests route', function() {
    expect(routeAccessPolicies['client.adminTests']).to.deep.equal({
      requiresAuth: true,
      allowedRoles: 'admin',
    });
  });

  it('keeps other admin surfaces admin-only for comparison', function() {
    expect(routeAccessPolicies['client.adminControls']).to.deep.equal({
      requiresAuth: true,
      allowedRoles: 'admin',
    });
    expect(routeAccessPolicies['client.theme']).to.deep.equal({
      requiresAuth: true,
      allowedRoles: 'admin',
    });
  });

  it('requires authentication for routes without an explicit policy', function() {
    expect(getRouteAccessPolicy('client.futureRoute')).to.deep.equal({
      requiresAuth: true,
    });
  });
});
