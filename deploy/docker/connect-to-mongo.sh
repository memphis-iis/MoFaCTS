#!/bin/bash

set -o errexit

cd $SCRIPTS_FOLDER

echo 'Connecting to MongoDB...'
node <<'EOJS'
const { MongoClient } = require('mongodb');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const deadline = Date.now() + 120_000;

async function validateConnection() {
  const client = new MongoClient(process.env.MONGO_URL, { serverSelectionTimeoutMS: 5_000 });
  try {
    await client.connect();
    const database = client.db();
    const expectedDatabase = process.env.EXPECTED_MONGO_DB_NAME;
    if (database.databaseName !== expectedDatabase) {
      throw new Error('connected database does not match EXPECTED_MONGO_DB_NAME');
    }
    await database.command({ ping: 1 });
    const hello = await database.command({ hello: 1 });
    const expectedReplicaSetName = process.env.MOFACTS_MONGO_REPLICA_SET_NAME;
    if (expectedReplicaSetName && hello.setName !== expectedReplicaSetName) {
      throw new Error('connected MongoDB replica set does not match MOFACTS_MONGO_REPLICA_SET_NAME');
    }
    if (process.env.MOFACTS_SELF_HOSTED === 'true') {
      const status = await database.command({ connectionStatus: 1, showPrivileges: false });
      if (!Array.isArray(status?.authInfo?.authenticatedUsers) || status.authInfo.authenticatedUsers.length === 0) {
        throw new Error('connected MongoDB session is not authenticated');
      }
    }
  } finally {
    await client.close().catch(() => undefined);
  }
}

(async () => {
  while (true) {
    try {
      await validateConnection();
      console.log('Successfully validated the MongoDB connection');
      return;
    } catch {
      if (Date.now() >= deadline) {
        console.error('MongoDB readiness validation failed; connection details redacted.');
        process.exit(1);
      }
      await delay(1_000);
    }
  }
})().catch(() => {
  console.error('MongoDB readiness validation failed; connection details redacted.');
  process.exit(1);
});
EOJS
