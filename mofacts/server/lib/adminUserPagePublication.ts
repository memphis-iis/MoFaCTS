type Document = Record<string, unknown> & { _id: string };
type Publication = {
  added(collection: string, id: string, fields: Record<string, unknown>): void;
  ready(): void;
};

export const ADMIN_USER_PAGE_ROLE_FIELDS = {
  'user._id': 1,
  'inheritedRoles._id': 1,
} as const;

/**
 * User membership is an authorized, bounded page snapshot. Return its role
 * cursor without materializing it so Meteor owns live role changes, readiness,
 * and observer cleanup for exactly those page members.
 */
export function publishAdminUserPage<TCursor>(
  publication: Publication,
  pagedUsers: readonly Document[],
  roleAssignments: {
    find(selector: { 'user._id': { $in: string[] } }, options: { fields: typeof ADMIN_USER_PAGE_ROLE_FIELDS }): TCursor;
  },
): TCursor | void {
  if (pagedUsers.length === 0) return publication.ready();
  const userIds = pagedUsers.map(user => {
    if (typeof user._id !== 'string' || !user._id || user._id !== user._id.trim()) {
      throw new Error('Admin user page requires canonical user IDs');
    }
    return user._id;
  });

  for (const user of pagedUsers) {
    const { _id, ...fields } = user;
    publication.added('users', _id, fields);
    publication.added('filtered_user_page_ids', _id, { userId: _id });
  }
  return roleAssignments.find(
    { 'user._id': { $in: userIds } },
    { fields: ADMIN_USER_PAGE_ROLE_FIELDS },
  );
}
