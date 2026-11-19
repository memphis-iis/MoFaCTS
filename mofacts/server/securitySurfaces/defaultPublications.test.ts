import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { DEFAULT_PUBLICATION_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';
import { registeredDefaultPublications } from './registerDefaultPublication.ts';

describe('application default publications', function() {
  const userId = Random.id();
  const otherId = Random.id();
  const users = (Meteor as any).users;
  const roles = (Meteor as any).roleAssignment;
  const roleIds = [Random.id(), Random.id()];

  function binding(name: string) {
    const handlers = (Meteor as any).server.universal_publish_handlers as Array<(this: unknown) => any>;
    const matching = handlers.filter(handler => handler.name === name);
    expect(matching, name).to.have.length(1);
    return matching[0]!;
  }

  it('automatically publishes only the current account projection', async function() {
    expect(registeredDefaultPublications().filter(item => item.verification === DEFAULT_PUBLICATION_VERIFICATIONS.account))
      .to.deep.equal([{ surfaceId: 'publication:default:account-self', name: null,
        policy: 'authenticated-self', verification: DEFAULT_PUBLICATION_VERIFICATIONS.account }]);
    const handler = binding('publishCurrentAccount');
    try {
      await users.insertAsync({ _id: userId, username: 'synthetic-current', services: { syntheticCanary: true } });
      await users.insertAsync({ _id: otherId, username: 'synthetic-other' });
      const [own] = handler.call({ userId });
      expect(await own.fetchAsync()).to.deep.equal([{ _id: userId, username: 'synthetic-current' }]);
      const [anonymous] = handler.call({ userId: null });
      expect(await anonymous.fetchAsync()).to.deep.equal([]);
    } finally {
      await users.removeAsync({ _id: { $in: [userId, otherId] } });
    }
  });

  it('automatically publishes only the current role assignments', async function() {
    expect(registeredDefaultPublications().filter(item => item.verification === DEFAULT_PUBLICATION_VERIFICATIONS.roles))
      .to.deep.equal([{ surfaceId: 'publication:default:role-assignments-self', name: null,
        policy: 'authenticated-self', verification: DEFAULT_PUBLICATION_VERIFICATIONS.roles }]);
    const handler = binding('publishCurrentRoleAssignments');
    try {
      await roles.insertAsync({ _id: roleIds[0], user: { _id: userId }, role: { _id: 'synthetic-role' } });
      await roles.insertAsync({ _id: roleIds[1], user: { _id: otherId }, role: { _id: 'synthetic-role' } });
      const rows = await handler.call({ userId }).fetchAsync();
      expect(rows.map((row: { _id: string }) => row._id)).to.deep.equal([roleIds[0]]);
      let ready = false;
      expect(handler.call({ userId: null, ready() { ready = true; } })).to.equal(undefined);
      expect(ready).to.equal(true);
    } finally {
      await roles.removeAsync({ _id: { $in: roleIds } });
    }
  });
});
