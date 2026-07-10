import { expect } from 'chai';
import {
  getManagementRoutePolicies,
  getManagementRoutePolicyByRouteName,
  getManagementRoutePolicyByTemplate,
} from './managementRoutePresentationPolicies';

describe('management route presentation policies', function() {
  it('characterizes the complete management-route access baseline', function() {
    expect(getManagementRoutePolicies().map((policy) => ({
      routeName: policy.routeName,
      requiresAuth: policy.requiresAuth,
      allowedRoles: policy.allowedRoles ?? null,
    }))).to.deep.equal([
      { routeName: 'client.contentUpload', requiresAuth: true, allowedRoles: null },
      { routeName: 'client.aiContentCreator', requiresAuth: true, allowedRoles: null },
      { routeName: 'client.manualContentCreator', requiresAuth: true, allowedRoles: null },
      { routeName: 'client.contentEdit', requiresAuth: true, allowedRoles: null },
      { routeName: 'client.tdfEdit', requiresAuth: true, allowedRoles: null },
      { routeName: 'client.dataDownload', requiresAuth: true, allowedRoles: null },
      { routeName: 'client.profile', requiresAuth: true, allowedRoles: null },
      { routeName: 'client.audioSettings', requiresAuth: true, allowedRoles: null },
      { routeName: 'client.classSelection', requiresAuth: true, allowedRoles: null },
      { routeName: 'client.help', requiresAuth: false, allowedRoles: null },
      { routeName: 'client.adminControls', requiresAuth: true, allowedRoles: 'admin' },
      { routeName: 'client.adminBackups', requiresAuth: true, allowedRoles: 'admin' },
      { routeName: 'client.userAdmin', requiresAuth: true, allowedRoles: 'admin' },
      { routeName: 'client.turkWorkflow', requiresAuth: true, allowedRoles: 'admin' },
      { routeName: 'client.theme', requiresAuth: true, allowedRoles: 'admin' },
      { routeName: 'client.adminTests', requiresAuth: true, allowedRoles: 'admin' },
      { routeName: 'client.classEdit', requiresAuth: true, allowedRoles: 'admin,teacher' },
      { routeName: 'client.courses', requiresAuth: true, allowedRoles: null },
      { routeName: 'client.tdfAssignmentEdit', requiresAuth: true, allowedRoles: 'admin,teacher' },
      { routeName: 'client.instructorReporting', requiresAuth: true, allowedRoles: 'admin,teacher' },
    ]);
  });

  it('keeps route and template identities unique', function() {
    const policies = getManagementRoutePolicies();

    expect(new Set(policies.map((policy) => policy.routeName)).size).to.equal(policies.length);
    expect(new Set(policies.map((policy) => policy.template)).size).to.equal(policies.length);
  });

  it('owns pilot route access, title, chrome, and loader metadata together', function() {
    expect(getManagementRoutePolicyByRouteName('client.adminTests')).to.include({
      path: '/admin/tests',
      template: 'testRunner',
      titleKey: 'home.adminTests',
      chromeMode: 'app',
      requiresAuth: true,
      allowedRoles: 'admin',
    });
    expect(getManagementRoutePolicyByTemplate('profile')).to.include({
      routeName: 'client.profile',
      path: '/profile',
      titleKey: 'home.profile',
      requiresAuth: true,
    });
    expect(getManagementRoutePolicyByTemplate('classEdit')).to.include({
      routeName: 'client.classEdit',
      allowedRoles: 'admin,teacher',
    });
  });
});
