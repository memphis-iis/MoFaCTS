// Run as the deployment administrator after primary election. This shared
// provisioning step covers both fresh databases and existing installations.
(() => {
  const databaseName = process.env.MOFACTS_MONGO_APP_DATABASE;
  const username = process.env.MOFACTS_MONGO_APP_USERNAME;
  if (!databaseName || !username) {
    throw new Error('Application database and username are required for read-concern permission provisioning.');
  }

  // The adjacent reviewed JSON owns policy for provisioning and read-only
  // auditing. Resolve beside this loaded script, never from shell cwd.
  const fs = require('fs');
  const path = require('path');
  const exactKeys = (value, keys) => value !== null && typeof value === 'object'
    && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
  let definition;
  try {
    const definitionPath = path.join(__dirname, 'read-default-concern-role.json');
    const stat = fs.lstatSync(definitionPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error();
    const bytes = fs.readFileSync(definitionPath);
    if (bytes.length > 4096) throw new Error();
    definition = JSON.parse(bytes.toString('utf8'));
    const privilege = definition?.privileges?.[0];
    if (!exactKeys(definition, ['db', 'role', 'privileges', 'roles']) || definition.db !== 'admin'
      || typeof definition.role !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(definition.role)
      || !Array.isArray(definition.roles) || definition.roles.length !== 0
      || !Array.isArray(definition.privileges) || definition.privileges.length !== 1
      || !exactKeys(privilege, ['resource', 'actions'])
      || !exactKeys(privilege.resource, ['cluster']) || privilege.resource.cluster !== true
      || !Array.isArray(privilege.actions) || privilege.actions.length !== 1
      || typeof privilege.actions[0] !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(privilege.actions[0])) {
      throw new Error();
    }
  } catch {
    throw new Error('MoFaCTS read-concern role definition is missing or invalid.');
  }

  const appDatabase = db.getSiblingDB(databaseName);
  const user = appDatabase.getUser(username);
  if (!user) throw new Error('Configured application database user does not exist.');
  if (!Array.isArray(user.roles)) throw new Error('Configured application database user has invalid role metadata.');

  const adminDatabase = db.getSiblingDB(definition.db);
  const roleName = definition.role;
  const role = adminDatabase.getRole(roleName, { showPrivileges: true });
  if (role) {
    const privilege = role.privileges?.[0];
    const expected = definition.privileges[0];
    if (role.role !== definition.role || role.db !== definition.db
      || !Array.isArray(role.roles) || role.roles.length !== 0
      || !Array.isArray(role.privileges) || role.privileges.length !== 1
      || !exactKeys(privilege, ['resource', 'actions'])
      || !exactKeys(privilege.resource, ['cluster']) || privilege.resource.cluster !== expected.resource.cluster
      || !Array.isArray(privilege.actions) || privilege.actions.length !== 1
      || privilege.actions[0] !== expected.actions[0]) {
      throw new Error('Existing MoFaCTS read-concern role differs from its single read-only privilege contract.');
    }
  } else {
    adminDatabase.createRole({
      role: roleName,
      privileges: definition.privileges,
      roles: definition.roles,
    });
  }

  if (!user.roles.some(entry => entry.role === roleName && entry.db === definition.db)) {
    appDatabase.grantRolesToUser(username, [{ role: roleName, db: definition.db }]);
  }
  print('Application read-concern permission verified.');
})();
