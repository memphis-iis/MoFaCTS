import { collectionMongoName } from '../../common/collectionOwnership';
import { strict as assert } from 'node:assert';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { Roles } from 'meteor/alanning:roles';
import { GlobalExperimentStates, DynamicSettings, Tdfs } from '../../common/Collections';
import { DIRECT_WRITE_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';
import { registeredDirectWriteDenials } from './registerDirectWriteDenial';

describe('direct collection write rules', function() {
  it('keeps direct account updates denied synchronously', function() {
    const rows = registeredDirectWriteDenials().filter(row => row.verification === DIRECT_WRITE_VERIFICATIONS.profile);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.rules.update(), true);
  });
  it('requires the server methods for administrator settings changes', async function() {
    const userId = Random.id(), id = Random.id();
    const row = { _id: id, key: id, value: 'original' };
    const rows = registeredDirectWriteDenials().filter(rule => rule.verification === DIRECT_WRITE_VERIFICATIONS.settings);
    assert.equal(rows.length, 1);
    try {
      await Meteor.users.insertAsync({ _id: userId });
      await Roles.createRoleAsync('admin', { unlessExists: true });
      await Roles.addUsersToRolesAsync(userId, 'admin');
      await DynamicSettings.insertAsync(row);
      const update = (Meteor as any).server.method_handlers['/' + collectionMongoName('DynamicSettings') + '/update'];
      await assert.rejects(async () => update.call({ userId, isSimulation: false }, { _id: id }, { $set: { value: 'changed' } }), { error: 403 });
      assert.equal((await DynamicSettings.findOneAsync(id))?.value, 'original');
    } finally {
      await DynamicSettings.removeAsync(id);
      await Roles.removeUsersFromRolesAsync(userId, 'admin');
      await Meteor.users.removeAsync(userId);
    }
  });
  it('rejects direct progress inserts and updates and preserves saved progress', async function() {
    const rows = registeredDirectWriteDenials().filter(row => row.verification === DIRECT_WRITE_VERIFICATIONS.progress);
    assert.equal(rows.length, 1);
    const handlers = (Meteor as any).server.method_handlers;
    const userId = Random.id(), id = Random.id(), otherId = Random.id();
    const saved = { _id: id, userId, TDFId: Random.id(), experimentState: { currentUnitNumber: 1 } };
    try {
      await Meteor.users.insertAsync({ _id: userId });
      await Tdfs.insertAsync({ _id: saved.TDFId, ownerId: userId, content: { fileName: 'fixture.json', tdfs: { tutor: { setspec: { userselect: 'true' }, unit: [{}] } } } });
      await GlobalExperimentStates.insertAsync(saved);
      const context = { userId, isSimulation: false, connection: { id: Random.id() } };
      await assert.rejects(async () => handlers['/' + collectionMongoName('GlobalExperimentStates') + '/insert'].call(context, { ...saved, _id: otherId }), { error: 403 });
      await assert.rejects(async () => handlers['/' + collectionMongoName('GlobalExperimentStates') + '/update'].call(context, { _id: id },
        { $set: { experimentState: { currentUnitNumber: 2 } } }), { error: 403 });
      assert.deepEqual(await GlobalExperimentStates.findOneAsync(id), saved);
      assert.equal(await GlobalExperimentStates.findOneAsync(otherId), undefined);
      await handlers.updateExperimentState.call(context, { currentRootTdfId: saved.TDFId, currentUnitNumber: 2 }, id);
      assert.equal((await GlobalExperimentStates.findOneAsync(id))?.experimentState.currentUnitNumber, 2);
    } finally {
      await Meteor.users.removeAsync(userId);
      await Tdfs.removeAsync(saved.TDFId);
      await GlobalExperimentStates.removeAsync({ _id: { $in: [id, otherId] } });
    }
  });
});
