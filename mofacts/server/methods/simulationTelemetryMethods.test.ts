import { randomUUID } from 'node:crypto';
import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/alanning:roles';
import { SIMULATION_METHOD_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import { exportSimulationTrace, removeSimulationResearchUserRecords, startSimulationAttempt } from '../lib/simulationTelemetry';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods';

describe('simulation telemetry runtime bindings', function() {
  const handlers = () => (Meteor as any).server.method_handlers;
  const scope = { tdfId: 'synthetic-simulation-lesson', pageKey: 'synthetic-page', nodeId: 'synthetic-node',
    buildId: 'synthetic-build', history: { sessionID: 'synthetic-session', levelUnit: 0 } };

  it('binds the five installed methods and denies unsigned telemetry operations', async function() {
    const observation = registeredMeteorMethodSurfaces();
    if (observation.state !== 'observed') throw new Error(observation.reason);
    const expected = {
      startSimulationResearchAttempt: { kind: 'diagnostic-telemetry', operation: 'lesson-package' },
      interruptSimulationResearchActivity: { kind: 'diagnostic-telemetry', operation: 'lesson-package' },
      ingestSimulationResearchBatch: { kind: 'diagnostic-telemetry', operation: 'owned-attempt' },
      endSimulationResearchAttempt: { kind: 'diagnostic-telemetry', operation: 'owned-attempt' },
      exportSimulationResearchTrace: { kind: 'role', role: 'admin' },
    } as const;
    for (const verification of Object.values(SIMULATION_METHOD_VERIFICATIONS)) {
      const entries = observation.surfaces.filter(entry => entry.name === verification.method);
      expect(entries).to.have.length(1);
      expect(entries[0]?.verification).to.equal(verification);
      expect(entries[0]?.policy).to.deep.equal(expected[verification.method]);
      let failure: any;
      try { await handlers()[verification.method].call({}, null); }
      catch (error) { failure = error; }
      expect(failure?.reason).to.equal('Must be logged in');
    }
  });

  it('preserves owner checks in the installed attempt operations', async function() {
    const owner = `synthetic-simulation-owner-${randomUUID()}`;
    try {
      const { attemptId } = await startSimulationAttempt(owner, scope, async () => {});
      const before = await exportSimulationTrace(attemptId, 0);
      const other = { userId: 'synthetic-unrelated-simulation-user' };
      for (const operation of [
        () => handlers().ingestSimulationResearchBatch.call(other, attemptId, null),
        () => handlers().endSimulationResearchAttempt.call(other, attemptId, 'completed'),
      ]) {
        let failure: any;
        try { await operation(); }
        catch (error) { failure = error; }
        expect(failure?.error).to.equal(403);
      }
      expect(await exportSimulationTrace(attemptId, 0)).to.deep.equal(before);
    } finally {
      await removeSimulationResearchUserRecords(owner);
    }
  });

  it('preserves administrator authorization for the installed trace export', async function() {
    const owner = `synthetic-trace-owner-${randomUUID()}`;
    const admin = await Meteor.users.insertAsync({ username: `synthetic-trace-admin-${randomUUID()}` });
    try {
      const { attemptId } = await startSimulationAttempt(owner, scope, async () => {});
      let failure: any;
      try { await handlers().exportSimulationResearchTrace.call({ userId: owner }, attemptId, 0); }
      catch (error) { failure = error; }
      expect(failure?.error).to.equal(403);
      await Roles.createRoleAsync('admin', { unlessExists: true });
      await Roles.addUsersToRolesAsync(admin, 'admin');
      const trace = await handlers().exportSimulationResearchTrace.call({ userId: admin }, attemptId, 0);
      expect(trace.attempt.attemptId).to.equal(attemptId);
      expect(trace.batches).to.deep.equal([]);
    } finally {
      await Roles.removeUsersFromRolesAsync(admin, 'admin');
      await Meteor.users.removeAsync(admin);
      await removeSimulationResearchUserRecords(owner);
    }
  });
});
