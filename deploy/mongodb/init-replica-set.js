const setName = process.env.MOFACTS_MONGO_REPLICA_SET_NAME;
const memberHost = process.env.MOFACTS_MONGO_REPLICA_SET_MEMBER;

if (!setName || !memberHost) {
  throw new Error('Replica-set name and initial member address are required.');
}

const admin = db.getSiblingDB('admin');
let hello = admin.runCommand({ hello: 1 });

if (hello.ok !== 1) {
  throw new Error('MongoDB hello command failed before replica-set initialization.');
}

if (hello.setName && hello.setName !== setName) {
  throw new Error(`MongoDB belongs to replica set ${hello.setName}, not configured set ${setName}.`);
}

let existingConfig;
try {
  existingConfig = admin.runCommand({ replSetGetConfig: 1 });
} catch (error) {
  if (error?.codeName === 'NotYetInitialized' || error?.code === 94) {
    existingConfig = { ok: 0, codeName: error.codeName, code: error.code };
  } else {
    throw error;
  }
}
if (existingConfig.ok === 1) {
  if (existingConfig.config?._id !== setName) {
    throw new Error(`MongoDB replica-set configuration does not match configured set ${setName}.`);
  }
} else if (existingConfig.codeName === 'NotYetInitialized' || existingConfig.code === 94) {
  const initiated = admin.runCommand({
    replSetInitiate: {
      _id: setName,
      members: [{ _id: 0, host: memberHost }],
    },
  });

  if (initiated.ok !== 1 && initiated.codeName !== 'AlreadyInitialized') {
    throw new Error(`Replica-set initiation failed: ${initiated.codeName || initiated.code || 'unknown error'}.`);
  }
} else {
  throw new Error(`Replica-set configuration check failed: ${existingConfig.codeName || existingConfig.code || 'unknown error'}.`);
}

const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  hello = admin.runCommand({ hello: 1 });
  const status = admin.runCommand({ replSetGetStatus: 1 });
  const hasWritablePrimary = status.ok === 1 && Array.isArray(status.members) && status.members.some(
    (member) => member.state === 1 || member.stateStr === 'PRIMARY',
  );
  if (hello.ok === 1 && hello.setName === setName && hasWritablePrimary) {
    const configResult = admin.runCommand({replSetGetConfig: 1});
    if (configResult.ok !== 1) {
      throw new Error('Replica-set configuration could not be read after primary election.');
    }
    if (!Array.isArray(configResult.config?.members)) {
      throw new Error('Replica-set configuration has no member list after primary election.');
    }
    if (!configResult.config.members.some((member) => member.host === memberHost)) {
      throw new Error(`Configured member ${memberHost} is not present in replica set ${setName}.`);
    }
    print(`Replica set ${setName} has a writable primary and includes configured member ${memberHost}.`);
    quit(0);
  }
  sleep(1000);
}

throw new Error(`Replica set ${setName} did not report a writable primary before timeout.`);
