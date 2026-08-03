const operations = db
  .getSiblingDB('admin')
  .aggregate([{ $currentOp: { allUsers: true, idleCursors: true, localOps: true } }])
  .toArray();

const count = operations.filter((operation) => {
  const command =
    operation.cursor?.originatingCommand ??
    operation.originatingCommand ??
    operation.command ??
    {};
  const pipeline = Array.isArray(command.pipeline) ? command.pipeline : [];
  return pipeline.some((stage) =>
    Object.prototype.hasOwnProperty.call(stage, '$changeStream'),
  );
}).length;

print(count);
quit(count > 0 ? 0 : 1);
