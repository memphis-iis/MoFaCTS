import { Meteor } from 'meteor/meteor';

declare const Session: any;

// Use Meteor.roleAssignment directly — set unconditionally by alanning:roles v4
// at package load time, avoiding any module-order issues with re-exports.
const getRoleAssignment = () => (Meteor as any).roleAssignment;

type RoleListInput = string | string[] | null | undefined;
type UserWithId = { _id?: string } | null | undefined;
type AuthRoleFlags = { admin: boolean; teacher: boolean };

function normalizeRoleList(roleList: RoleListInput): string[] {
  if (!roleList) return [];
  if (Array.isArray(roleList)) return roleList.map((r) => String(r).trim().toLowerCase()).filter(Boolean);
  if (typeof roleList === 'string') return roleList.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
  return [];
}

function getAuthRoleFlags(): AuthRoleFlags {
  const authRoles = Session?.get?.('authRoles');
  return {
    admin: !!authRoles?.admin,
    teacher: !!authRoles?.teacher,
  };
}

function hasRoleFromAuthFlags(roleList: RoleListInput, authRoles = getAuthRoleFlags()): boolean {
  const roles = normalizeRoleList(roleList);
  if (roles.length === 0) return false;
  return roles.some((role) => {
    if (role === 'admin') return !!authRoles.admin;
    if (role === 'teacher') return !!authRoles.teacher;
    return false;
  });
}

function isCurrentUserRoleSyncAuthoritative(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return Session?.get?.('authRolesHydrated') === true
    && Session?.get?.('authRolesSyncedUserId') === userId;
}

function userHasRole(user: UserWithId, roleList: RoleListInput): boolean {
  const roles = normalizeRoleList(roleList);
  if (roles.length === 0 || !user?._id) return false;
  if (user._id === Meteor.userId() && isCurrentUserRoleSyncAuthoritative(user._id)) {
    return hasRoleFromAuthFlags(roles);
  }
  const col = getRoleAssignment();
  if (!col) return false;
  return !!col.findOne({
    'user._id': user._id,
    'inheritedRoles._id': { $in: roles }
  });
}

function currentUserHasRole(roleList: RoleListInput): boolean {
  const currentUserId = Meteor.userId();
  if (isCurrentUserRoleSyncAuthoritative(currentUserId)) {
    return hasRoleFromAuthFlags(roleList);
  }
  return userHasRole(currentUserId ? { _id: currentUserId } : null, roleList);
}

export { hasRoleFromAuthFlags, currentUserHasRole, userHasRole };

