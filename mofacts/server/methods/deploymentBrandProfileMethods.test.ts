import { randomUUID } from 'node:crypto';
import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/alanning:roles';
import { BRAND_PROFILE_METHOD_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods';

describe('deployment brand profile methods', function() {
  it('binds the installed handlers and denies callers without administrator access', async function() {
    const observation = registeredMeteorMethodSurfaces();
    if (observation.state !== 'observed') throw new Error(observation.reason);
    const handlers = (Meteor as any).server.method_handlers;
    for (const verification of Object.values(BRAND_PROFILE_METHOD_VERIFICATIONS)) {
      const entries = observation.surfaces.filter(entry => entry.name === verification.method);
      expect(entries).to.have.length(1);
      expect(entries[0]?.verification).to.equal(verification);
      expect(entries[0]?.policy).to.deep.equal({ kind: 'role', role: 'admin' });
      const handler = handlers[verification.method];
      expect(handler).to.be.a('function');
      for (const userId of [null, 'synthetic-missing-brand-user']) {
        let error: unknown;
        try { await handler.call({ userId }, '{invalid-json'); }
        catch (caught) { error = caught; }
        expect(error).to.be.instanceOf(Meteor.Error);
        expect(error).to.include({ error: 'unauthorized', reason: 'Only admins can manage the Brand Profile' });
      }
    }
  });

  it('preserves the authorized brand draft read, export and import validation', async function() {
    const userId = await Meteor.users.insertAsync({ username: `synthetic-brand-admin-${randomUUID()}` });
    try {
      await Roles.createRoleAsync('admin', { unlessExists: true });
      await Roles.addUsersToRolesAsync(userId, 'admin');
      const handlers = (Meteor as any).server.method_handlers;
      const draft = await handlers.getDeploymentBrandProfileDraft.call({ userId });
      expect(draft).to.have.property('schemaVersion');
      const exported = JSON.parse(await handlers.exportDeploymentBrandProfile.call({ userId }));
      expect(exported).to.deep.equal({ ...draft, updatedAt: '', updatedBy: '' });
      let error: unknown;
      try { await handlers.importDeploymentBrandProfileDraft.call({ userId }, '{invalid-json'); }
      catch (caught) { error = caught; }
      expect(error).to.be.instanceOf(Meteor.Error);
      expect(error).to.include({ error: 'invalid-json' });
      expect(await handlers.getDeploymentBrandProfileDraft.call({ userId })).to.deep.equal(draft);
    } finally {
      await Roles.removeUsersFromRolesAsync(userId, 'admin');
      await Meteor.users.removeAsync(userId);
    }
  });
});
