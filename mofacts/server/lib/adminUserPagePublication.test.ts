import { expect } from 'chai';
import { publishAdminUserPage } from './adminUserPagePublication';

describe('admin user page role publication', function() {
  it('publishes only page identities and returns their projected canonical role cursor for live delivery', function() {
    const additions: Array<{ collection: string; id: string; fields: Record<string, unknown> }> = [];
    let readyCalls = 0;
    const publication = {
      added: (collection: string, id: string, fields: Record<string, unknown>) => { additions.push({ collection, id, fields }); },
      ready: () => { readyCalls += 1; },
    };
    const roleCursor = {
      fetchAsync: async () => { throw new Error('Roles must remain a live publication cursor'); },
    };
    const roleQueries: Array<{ selector: unknown; options: unknown }> = [];
    const roleAssignments = {
      find(selector: unknown, options: unknown) {
        roleQueries.push({ selector, options });
        return roleCursor;
      },
    };

    const result = publishAdminUserPage(publication, [
      { _id: 'page-user-one', username: 'one@example.test' },
      { _id: 'page-user-two', username: 'two@example.test' },
    ], roleAssignments);

    expect(result).to.equal(roleCursor);
    expect(roleQueries).to.deep.equal([{
      selector: { 'user._id': { $in: ['page-user-one', 'page-user-two'] } },
      options: { fields: { 'user._id': 1, 'inheritedRoles._id': 1 } },
    }]);
    expect(additions).to.deep.equal([
      { collection: 'users', id: 'page-user-one', fields: { username: 'one@example.test' } },
      { collection: 'filtered_user_page_ids', id: 'page-user-one', fields: { userId: 'page-user-one' } },
      { collection: 'users', id: 'page-user-two', fields: { username: 'two@example.test' } },
      { collection: 'filtered_user_page_ids', id: 'page-user-two', fields: { userId: 'page-user-two' } },
    ]);
    // Meteor marks readiness after its returned role cursor's initial delivery.
    expect(readyCalls).to.equal(0);
  });

  it('binds each resubscribed page to its own role membership without an all-assignment query', function() {
    const requestedPages: string[][] = [];
    const publication = { added: () => undefined, ready: () => undefined };
    const roleAssignments = {
      find(selector: { 'user._id': { $in: string[] } }) {
        const userIds = selector['user._id'].$in;
        requestedPages.push(userIds);
        return { userIds };
      },
    };
    const firstPage = publishAdminUserPage(publication, [{ _id: 'first-page' }], roleAssignments);
    const secondPage = publishAdminUserPage(publication, [{ _id: 'second-page' }], roleAssignments);

    expect(requestedPages).to.deep.equal([['first-page'], ['second-page']]);
    expect(firstPage).not.to.equal(secondPage);
  });

  it('marks an empty page ready without querying roles', function() {
    let readyCalls = 0;
    const publication = { added: () => { throw new Error('Empty pages cannot publish users'); }, ready: () => { readyCalls += 1; } };
    const roleAssignments = { find: () => { throw new Error('Empty pages cannot query roles'); } };

    publishAdminUserPage(publication, [], roleAssignments);

    expect(readyCalls).to.equal(1);
  });

  it('rejects malformed page identity before publishing data or querying roles', function() {
    const publication = {
      added: () => { throw new Error('Invalid pages cannot publish users'); },
      ready: () => { throw new Error('Invalid pages cannot complete'); },
    };
    const roleAssignments = { find: () => { throw new Error('Invalid pages cannot query roles'); } };
    for (const _id of ['', ' malformed ']) {
      expect(() => publishAdminUserPage(publication, [{ _id }], roleAssignments)).to.throw('requires canonical user IDs');
    }
  });
});
