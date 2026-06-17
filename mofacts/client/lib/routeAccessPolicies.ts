export type RouteAccessPolicy = {
  requiresAuth: boolean;
  allowedRoles?: string;
};

export const routeAccessPolicies: Readonly<Record<string, RouteAccessPolicy>> = {
  'client.turkWorkflow': { requiresAuth: true, allowedRoles: 'admin' },
  'client.userAdmin': { requiresAuth: true, allowedRoles: 'admin' },
  'client.tdfAssignmentEdit': { requiresAuth: true, allowedRoles: 'admin,teacher' },
  'client.instructorReporting': { requiresAuth: true, allowedRoles: 'admin,teacher' },
  'client.classEdit': { requiresAuth: true, allowedRoles: 'admin,teacher' },
  'client.courses': { requiresAuth: true },
  'client.contentUpload': { requiresAuth: true },
  'client.aiContentCreator': { requiresAuth: true },
  'client.manualContentCreator': { requiresAuth: true },
  'client.contentEdit': { requiresAuth: true },
  'client.sparcEdit': { requiresAuth: true },
  'client.tdfEdit': { requiresAuth: true },
  'client.profile': { requiresAuth: true },
  'client.dataDownload': { requiresAuth: true },
  'client.adminControls': { requiresAuth: true, allowedRoles: 'admin' },
  'client.adminBackups': { requiresAuth: true, allowedRoles: 'admin' },
  'client.adminTests': { requiresAuth: true, allowedRoles: 'admin' },
  'client.theme': { requiresAuth: true, allowedRoles: 'admin' },
};

export function getRouteAccessPolicy(routeName: string): RouteAccessPolicy {
  const policy = routeAccessPolicies[routeName];
  if (!policy) {
    return { requiresAuth: true };
  }
  return policy;
}
