const databaseName = process.env.MOFACTS_MONGO_APP_DATABASE;
const username = process.env.MOFACTS_MONGO_APP_USERNAME;
const password = process.env.MOFACTS_MONGO_APP_PASSWORD;

if (!databaseName || !username || !password) {
  throw new Error('MOFACTS_MONGO_APP_DATABASE, MOFACTS_MONGO_APP_USERNAME, and MOFACTS_MONGO_APP_PASSWORD are required');
}

db = db.getSiblingDB(databaseName);
db.createUser({
  user: username,
  pwd: password,
  roles: [
    { role: 'readWrite', db: databaseName },
    { role: 'dbAdmin', db: databaseName },
  ],
});
