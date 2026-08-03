import { expect } from 'chai';
import { formatMongoConnectionValidation, validateMongoConnection } from './mongoConnectionValidation';

describe('mongoConnectionValidation', function() {
  it('validates an opaque URI through the connected database', async function() {
    const commands: Record<string, unknown>[] = [];
    const result = await validateMongoConnection({
      databaseName: 'MoFACT-meteor3',
      command: async (command) => {
        commands.push(command);
        if ('hello' in command) return { setName: 'rs0' };
        return { ok: 1 };
      },
    }, {
      MONGO_URL: 'opaque-to-application-validation',
      EXPECTED_MONGO_DB_NAME: 'MoFACT-meteor3',
      MOFACTS_MONGO_REPLICA_SET_NAME: 'rs0',
      MOFACTS_SELF_HOSTED: 'false',
    });

    expect(commands).to.deep.equal([{ ping: 1 }, { hello: 1 }]);
    expect(result).to.deep.equal({
      databaseName: 'MoFACT-meteor3',
      topology: 'replica-set',
      authenticated: false,
    });
    expect(formatMongoConnectionValidation(result)).to.equal('connected to MoFACT-meteor3 (replica-set)');
  });

  it('requires an authenticated connected session for self-hosted deployments', async function() {
    const result = await validateMongoConnection({
      databaseName: 'MoFACT-meteor3',
      command: async (command) => {
        if ('connectionStatus' in command) {
          return { authInfo: { authenticatedUsers: [{ user: 'app', db: 'MoFACT-meteor3' }] } };
        }
        if ('hello' in command) return { ok: 1, setName: 'rs0' };
        return { ok: 1 };
      },
    }, {
      MONGO_URL: 'opaque-to-application-validation',
      EXPECTED_MONGO_DB_NAME: 'MoFACT-meteor3',
      MOFACTS_MONGO_REPLICA_SET_NAME: 'rs0',
      MOFACTS_SELF_HOSTED: 'true',
    });

    expect(result.authenticated).to.equal(true);
  });

  it('rejects a connection to the wrong replica set', async function() {
    let error: Error | undefined;
    try {
      await validateMongoConnection({
        databaseName: 'MoFACT-meteor3',
        command: async (command) => 'hello' in command
          ? { ok: 1, setName: 'other-rs' }
          : { ok: 1 },
      }, {
        MONGO_URL: 'opaque-to-application-validation',
        EXPECTED_MONGO_DB_NAME: 'MoFACT-meteor3',
        MOFACTS_MONGO_REPLICA_SET_NAME: 'mofacts-rs',
      });
    } catch (caught) {
      error = caught as Error;
    }

    expect(error?.message).to.equal('connected MongoDB replica set is other-rs; expected mofacts-rs');
  });

  it('redacts driver failures', async function() {
    let error: Error | undefined;
    try {
      await validateMongoConnection({
        databaseName: 'MoFACT-meteor3',
        command: async () => {
          throw new Error('mongodb://user:secret@example.invalid/private');
        },
      }, {
        MONGO_URL: 'opaque-to-application-validation',
        EXPECTED_MONGO_DB_NAME: 'MoFACT-meteor3',
      });
    } catch (caught) {
      error = caught as Error;
    }

    expect(error?.message).to.equal('MongoDB ping failed; MongoDB connection details redacted');
    expect(error?.message).not.to.include('secret');
  });
});
