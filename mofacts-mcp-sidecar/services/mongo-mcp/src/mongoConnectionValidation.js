export function validateConnectedMongoTarget({ hello, ping, expectedReplicaSetName }) {
  if (ping?.ok !== 1) {
    throw new Error('Mongo MCP database ping failed.');
  }
  if (hello?.ok !== 1 || hello.setName !== expectedReplicaSetName) {
    throw new Error('Mongo MCP connected replica set does not match the configured identity.');
  }
}
