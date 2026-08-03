type UnknownRecord = Record<string, unknown>;

type MongoDatabaseLike = {
  databaseName?: string;
  command(command: UnknownRecord): Promise<UnknownRecord>;
};

export type MongoConnectionValidation = {
  databaseName: string;
  topology: 'replica-set' | 'sharded' | 'standalone';
  authenticated: boolean;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function runRedactedCommand(
  database: MongoDatabaseLike,
  command: UnknownRecord,
  label: string,
): Promise<UnknownRecord> {
  try {
    return await database.command(command);
  } catch {
    throw new Error(`${label} failed; MongoDB connection details redacted`);
  }
}

export async function validateMongoConnection(
  database: MongoDatabaseLike,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MongoConnectionValidation> {
  if (!String(env.MONGO_URL || '').trim()) {
    throw new Error('MONGO_URL is not set');
  }

  const expectedDatabase = String(env.EXPECTED_MONGO_DB_NAME || '').trim();
  if (!expectedDatabase) {
    throw new Error('EXPECTED_MONGO_DB_NAME is not set');
  }

  const actualDatabase = String(database.databaseName || '').trim();
  if (actualDatabase !== expectedDatabase) {
    throw new Error(`connected MongoDB database is ${actualDatabase || 'unknown'}; expected ${expectedDatabase}`);
  }

  await runRedactedCommand(database, { ping: 1 }, 'MongoDB ping');
  const hello = await runRedactedCommand(database, { hello: 1 }, 'MongoDB topology check');
  const topology = hello.msg === 'isdbgrid'
    ? 'sharded'
    : typeof hello.setName === 'string' && hello.setName.length > 0
      ? 'replica-set'
      : 'standalone';

  const expectedReplicaSetName = String(env.MOFACTS_MONGO_REPLICA_SET_NAME || '').trim();
  if (expectedReplicaSetName && hello.setName !== expectedReplicaSetName) {
    const actualReplicaSetName = typeof hello.setName === 'string' && hello.setName.length > 0
      ? hello.setName
      : 'none';
    throw new Error(`connected MongoDB replica set is ${actualReplicaSetName}; expected ${expectedReplicaSetName}`);
  }

  let authenticated = false;
  if (env.MOFACTS_SELF_HOSTED === 'true') {
    const status = await runRedactedCommand(
      database,
      { connectionStatus: 1, showPrivileges: false },
      'MongoDB authentication check',
    );
    const authInfo = isRecord(status.authInfo) ? status.authInfo : {};
    authenticated = Array.isArray(authInfo.authenticatedUsers) && authInfo.authenticatedUsers.length > 0;
    if (!authenticated) {
      throw new Error('connected MongoDB session is not authenticated');
    }
  }

  return {
    databaseName: actualDatabase,
    topology,
    authenticated,
  };
}

export function formatMongoConnectionValidation(result: MongoConnectionValidation): string {
  const authentication = result.authenticated ? ', authenticated' : '';
  return `connected to ${result.databaseName} (${result.topology}${authentication})`;
}
