// Run as the deployment administrator after primary election. This shared
// provisioning step covers both fresh databases and existing installations.
(() => {
  const databaseName = process.env.MOFACTS_MONGO_APP_DATABASE;
  const username = process.env.MOFACTS_MONGO_APP_USERNAME;
  if (!databaseName || !username) {
    throw new Error('Application database and username are required for read-concern permission provisioning.');
  }
  const appDatabase = db.getSiblingDB(databaseName);
  const user = appDatabase.getUser(username);
  if (!user) throw new Error('Configured application database user does not exist.');

  const adminDatabase = db.getSiblingDB('admin');
  const roleName = 'mofactsReadDefaultConcern';
  const role = adminDatabase.getRole(roleName, { showPrivileges: true });
  if (role) {
    const privilege = role.privileges?.[0];
    if (role.roles?.length !== 0 || role.privileges?.length !== 1
      || privilege.resource?.cluster !== true || Object.keys(privilege.resource).length !== 1
      || privilege.actions?.length !== 1 || privilege.actions[0] !== 'getDefaultRWConcern') {
      throw new Error('Existing MoFaCTS read-concern role differs from its single read-only privilege contract.');
    }
  } else {
    adminDatabase.createRole({
      role: roleName,
      privileges: [{ resource: { cluster: true }, actions: ['getDefaultRWConcern'] }],
      roles: [],
    });
  }

  if (!user.roles.some(entry => entry.role === roleName && entry.db === 'admin')) {
    appDatabase.grantRolesToUser(username, [{ role: roleName, db: 'admin' }]);
  }
  print('Application read-concern permission verified.');
})();
