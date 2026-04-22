import { Meteor } from 'meteor/meteor';

export type MethodAuthorizationDeps = {
  userIsInRoleAsync: (userId: string, roles: string[]) => Promise<boolean>;
};

type ErrorCode = string | number;

function normalizeUserId(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

export function requireAuthenticatedUser(
  userId: string | null | undefined,
  errMsg = 'Must be logged in',
  errorCode: ErrorCode = 401
) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    throw new Meteor.Error(errorCode, errMsg);
  }
  return normalizedUserId;
}

export async function requireUserWithRoles(
  deps: MethodAuthorizationDeps,
  params: {
    userId: string | null | undefined;
    roles: string[];
    notLoggedInMessage?: string;
    notLoggedInCode?: ErrorCode;
    forbiddenMessage?: string;
    forbiddenCode?: ErrorCode;
  }
) {
  const actingUserId = requireAuthenticatedUser(
    params.userId,
    params.notLoggedInMessage,
    params.notLoggedInCode
  );
  const hasRole = await deps.userIsInRoleAsync(actingUserId, params.roles);
  if (!hasRole) {
    throw new Meteor.Error(params.forbiddenCode ?? 403, params.forbiddenMessage ?? 'Permission denied');
  }
  return actingUserId;
}

export async function requireUserMatchesOrHasRole(
  deps: MethodAuthorizationDeps,
  params: {
    actingUserId: string | null | undefined;
    subjectUserId: string | null | undefined;
    roles?: string[];
    notLoggedInMessage?: string;
    notLoggedInCode?: ErrorCode;
    forbiddenMessage?: string;
    forbiddenCode?: ErrorCode;
  }
) {
  const actingUserId = requireAuthenticatedUser(
    params.actingUserId,
    params.notLoggedInMessage,
    params.notLoggedInCode
  );
  const normalizedSubjectUserId = normalizeUserId(params.subjectUserId);
  if (normalizedSubjectUserId && normalizedSubjectUserId === actingUserId) {
    return actingUserId;
  }

  const roles = Array.isArray(params.roles) ? params.roles : [];
  if (roles.length > 0) {
    const hasRole = await deps.userIsInRoleAsync(actingUserId, roles);
    if (hasRole) {
      return actingUserId;
    }
  }

  throw new Meteor.Error(params.forbiddenCode ?? 403, params.forbiddenMessage ?? 'Permission denied');
}

export async function hasUserRole(
  deps: MethodAuthorizationDeps,
  userId: string | null | undefined,
  roles: string[]
) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return false;
  }
  return await deps.userIsInRoleAsync(normalizedUserId, roles);
}

export async function getUserRoleFlags<const TRoles extends readonly string[]>(
  deps: MethodAuthorizationDeps,
  userId: string | null | undefined,
  roles: TRoles
): Promise<Record<TRoles[number], boolean>> {
  const normalizedUserId = normalizeUserId(userId);
  const flags = Object.create(null) as Record<TRoles[number], boolean>;

  for (const role of roles) {
    flags[role as TRoles[number]] = false;
  }

  if (!normalizedUserId || roles.length === 0) {
    return flags;
  }

  const results = await Promise.all(
    roles.map(async (role) => [role, await deps.userIsInRoleAsync(normalizedUserId, [role])] as const)
  );

  for (const [role, hasRole] of results) {
    flags[role as TRoles[number]] = hasRole;
  }

  return flags;
}
