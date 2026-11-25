// Connect mongosh to the approved application database before loading this file.
// The default operation reports counts and index state. Apply requires a separate opt-in.
const conditionField = 'content.tdfs.tutor.setspec.conditionTdfIds';
const conditionIndexName = 'unique_condition_tdf_root';
const conditionIndexFilter = { [`${conditionField}.0`]: { $exists: true } };

async function qualifyConditionRootConstraint(tdfs, { apply = false } = {}) {
  const [counts = {}] = await tdfs.aggregate([
    { $match: conditionIndexFilter },
    { $project: { _id: 1, child: `$${conditionField}` } },
    { $unwind: '$child' },
    { $group: { _id: { child: '$child', root: '$_id' } } },
    { $group: { _id: '$_id.child', roots: { $sum: 1 } } },
    { $group: { _id: null,
      sharedConditions: { $sum: { $cond: [{ $gt: ['$roots', 1] }, 1, 0] } },
      invalidConditionIds: { $sum: { $cond: [
        { $eq: [{ $type: '$_id' }, 'string'] },
        { $cond: [{ $regexMatch: { input: '$_id', regex: '^[A-Za-z0-9_-]{1,128}$' } }, 0, 1] }, 1,
      ] } },
    } },
  ], { allowDiskUse: true, maxTimeMS: 30000 }).toArray();
  const verify = async () => {
    const index = (await tdfs.getIndexes()).find(entry => entry.name === conditionIndexName);
    if (!index) return false;
    if (index.unique !== true || Object.keys(index.key).length !== 1 || index.key[conditionField] !== 1
      || JSON.stringify(index.partialFilterExpression) !== JSON.stringify(conditionIndexFilter)) {
      throw new Error('The named condition-root index has an unexpected definition');
    }
    return true;
  };
  const installed = await verify();
  const result = { sharedConditions: counts.sharedConditions ?? 0, invalidConditionIds: counts.invalidConditionIds ?? 0, installed };
  if (!apply) return result;
  if (result.sharedConditions || result.invalidConditionIds) {
    throw new Error(`Condition-root preflight blocked installation (${result.sharedConditions} shared conditions, ${result.invalidConditionIds} invalid IDs)`);
  }
  if (!installed) {
    try {
      await tdfs.createIndex({ [conditionField]: 1 }, {
        name: conditionIndexName, unique: true, partialFilterExpression: conditionIndexFilter,
      });
    } catch (error) {
      if (error.code === 11000) throw new Error('Concurrent condition claims prevented index installation. Run read-only preflight again.');
      throw error;
    }
  }
  if (!(await verify())) throw new Error('Condition-root uniqueness index readback failed');
  return { ...result, installed: true };
}

const expectedDatabase = process.env.MOFACTS_CONDITION_ROOT_DATABASE;
if (!expectedDatabase || db.getName() !== expectedDatabase) throw new Error('Explicit application database did not match the current database');
const collections = db.getCollectionInfos({ name: 'tdfs', type: 'collection' });
if (!collections.length) throw new Error('Application TDF collection is unavailable');
qualifyConditionRootConstraint(db.getCollection('tdfs'), { apply: process.env.MOFACTS_APPLY_CONDITION_ROOT_INDEX === '1' })
  .then(report => print(JSON.stringify(report)))
  .catch(error => { print(error.message); quit(1); });
