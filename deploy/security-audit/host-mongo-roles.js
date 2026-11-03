// Observation-only mongosh program. The caller supplies authentication and the
// reviewed role definition; no administrative provisioning code is loaded.
(() => {
  const exactKeys = (value, keys) => value !== null && typeof value === 'object'
    && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
  const parseBounded = (text) => {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 4096) throw new Error();
    return JSON.parse(text);
  };
  const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 128
    && Buffer.byteLength(value, 'utf8') <= 255 && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
  const roleIdentifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  let input;
  let definition;
  let result;
  let exitCode;
  try {
    input = parseBounded(process.env.MOFACTS_AUDIT_MONGO_INPUT);
    definition = parseBounded(process.env.MOFACTS_AUDIT_READ_CONCERN_ROLE);
    const configured = input?.sidecarExpectedState === 'configured';
    const keys = ['database', 'appUser', 'appRole', 'sidecarUser', 'sidecarExpectedState'];
    if (configured) keys.push('sidecarRole');
    const privilege = definition?.privileges?.[0];
    if (!exactKeys(input, keys)
      || (input.sidecarExpectedState !== 'absent' && !configured)
      || !identifier(input.database) || Buffer.byteLength(input.database, 'utf8') > 63
      || /[/\\. "$]/.test(input.database)
      || !identifier(input.appUser) || !identifier(input.sidecarUser) || input.appUser === input.sidecarUser
      || !roleIdentifier(input.appRole) || (configured && !roleIdentifier(input.sidecarRole))
      || !exactKeys(definition, ['db', 'role', 'privileges', 'roles']) || definition.db !== 'admin'
      || typeof definition.role !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(definition.role)
      || !Array.isArray(definition.roles) || definition.roles.length !== 0
      || !Array.isArray(definition.privileges) || definition.privileges.length !== 1
      || !exactKeys(privilege, ['resource', 'actions'])
      || !exactKeys(privilege.resource, ['cluster']) || privilege.resource.cluster !== true
      || !Array.isArray(privilege.actions) || privilege.actions.length !== 1
      || typeof privilege.actions[0] !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(privilege.actions[0])
      || input.database === definition.db) {
      throw new Error();
    }
  } catch {
    result = { state: 'unavailable', reason: 'invalid-input' };
    exitCode = 64;
  }

  if (!result) {
    try {
      const appDatabase = db.getSiblingDB(input.database);
      const app = appDatabase.getUser(input.appUser);
      const sidecar = appDatabase.getUser(input.sidecarUser);
      const role = db.getSiblingDB(definition.db).getRole(definition.role, { showPrivileges: true });
      const exactRoles = (user, expected) => Boolean(user && Array.isArray(user.roles)
        && user.roles.length === expected.length
        && expected.every(wanted => user.roles.filter(observed => exactKeys(observed, ['role', 'db'])
          && observed.role === wanted.role && observed.db === wanted.db).length === 1));
      const privilege = role?.privileges?.[0];
      const expected = definition.privileges[0];
      const readConcernRoleExact = Boolean(role && role.role === definition.role && role.db === definition.db
        && Array.isArray(role.roles) && role.roles.length === 0
        && Array.isArray(role.privileges) && role.privileges.length === 1
        && exactKeys(privilege, ['resource', 'actions'])
        && exactKeys(privilege.resource, ['cluster']) && privilege.resource.cluster === expected.resource.cluster
        && Array.isArray(privilege.actions) && privilege.actions.length === 1
        && privilege.actions[0] === expected.actions[0]);
      result = {
        state: 'observed',
        appRolesExact: exactRoles(app, [
          { role: input.appRole, db: input.database },
          { role: definition.role, db: definition.db },
        ]),
        readConcernRoleExact,
      };
      if (input.sidecarExpectedState === 'configured') {
        result.sidecarRolesExact = exactRoles(sidecar, [{ role: input.sidecarRole, db: input.database }]);
      } else {
        result.sidecarUserAbsent = sidecar === null;
      }
      exitCode = Object.values(result).every(value => value === 'observed' || value === true) ? 0 : 3;
    } catch {
      result = { state: 'unavailable', reason: 'query-failed' };
      exitCode = 70;
    }
  }
  print(JSON.stringify(result));
  // Keep quit outside the catches: test doubles may throw to model termination.
  quit(exitCode);
})();
