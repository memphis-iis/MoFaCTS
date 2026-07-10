import type { PlatformStringKey } from '../interfaceI18nResources';

export type ManagementChromeMode = 'app' | 'practice' | 'none';

export type RouteAccessPolicy = Readonly<{
  requiresAuth: boolean;
  allowedRoles?: string;
}>;

export type ManagementRoutePresentationPolicy = RouteAccessPolicy & Readonly<{
  routeName: string;
  path: string;
  template: string;
  titleKey: PlatformStringKey;
  chromeMode: ManagementChromeMode;
  load: () => Promise<unknown>;
}>;

const MANAGEMENT_ROUTE_PRESENTATION_POLICIES = [
  { routeName: 'client.contentUpload', path: '/contentUpload', template: 'contentUpload', titleKey: 'home.content', chromeMode: 'app', requiresAuth: true, load: () => import('../../views/experimentSetup/contentUpload') },
  { routeName: 'client.aiContentCreator', path: '/aiContentCreate', template: 'aiContentCreator', titleKey: 'home.content', chromeMode: 'app', requiresAuth: true, load: () => import('../../views/experimentSetup/aiContentCreator') },
  { routeName: 'client.manualContentCreator', path: '/contentCreate', template: 'manualContentCreator', titleKey: 'home.content', chromeMode: 'app', requiresAuth: true, load: () => import('../../views/experimentSetup/manualContentCreator') },
  { routeName: 'client.contentEdit', path: '/contentEdit/:tdfId', template: 'contentEdit', titleKey: 'home.content', chromeMode: 'app', requiresAuth: true, load: () => import('../../views/experimentSetup/contentEdit') },
  { routeName: 'client.tdfEdit', path: '/tdfEdit/:tdfId', template: 'tdfEdit', titleKey: 'home.content', chromeMode: 'app', requiresAuth: true, load: () => import('../../views/experimentSetup/tdfEdit') },
  { routeName: 'client.dataDownload', path: '/dataDownload', template: 'dataDownload', titleKey: 'home.data', chromeMode: 'app', requiresAuth: true, load: () => import('../../views/experimentReporting/dataDownload') },
  { routeName: 'client.profile', path: '/profile', template: 'profile', titleKey: 'home.profile', chromeMode: 'app', requiresAuth: true, load: () => import('../../views/profile') },
  { routeName: 'client.audioSettings', path: '/audioSettings', template: 'audioSettings', titleKey: 'audio.settings', chromeMode: 'app', requiresAuth: true, load: () => import('../../views/audioSettings') },
  { routeName: 'client.classSelection', path: '/classSelection', template: 'classSelection', titleKey: 'home.joinCourses', chromeMode: 'app', requiresAuth: true, load: () => import('../../views/home/classSelection') },
  { routeName: 'client.help', path: '/help', template: 'help', titleKey: 'home.help', chromeMode: 'app', requiresAuth: false, load: () => import('../../views/help') },
  { routeName: 'client.adminControls', path: '/adminControls', template: 'adminControls', titleKey: 'home.adminControlPanel', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin', load: () => import('../../views/adminControls') },
  { routeName: 'client.adminBackups', path: '/admin/backups', template: 'adminBackups', titleKey: 'home.backups', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin', load: () => import('../../views/adminBackups') },
  { routeName: 'client.userAdmin', path: '/userAdmin', template: 'userAdmin', titleKey: 'home.userAdmin', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin', load: () => import('../../views/userAdmin') },
  { routeName: 'client.turkWorkflow', path: '/turkWorkflow', template: 'turkWorkflow', titleKey: 'home.mechanicalTurk', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin', load: () => import('../../views/turkWorkflow') },
  { routeName: 'client.theme', path: '/theme', template: 'theme', titleKey: 'home.theme', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin', load: () => import('../../views/theme') },
  { routeName: 'client.adminTests', path: '/admin/tests', template: 'testRunner', titleKey: 'home.adminTests', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin', load: () => import('../../views/testRunner') },
  { routeName: 'client.classEdit', path: '/classEdit', template: 'classEdit', titleKey: 'home.courses', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin,teacher', load: () => import('../../views/experimentSetup/classEdit') },
  { routeName: 'client.courses', path: '/courses', template: 'courses', titleKey: 'home.courses', chromeMode: 'app', requiresAuth: true, load: () => import('../../views/home/courses') },
  { routeName: 'client.tdfAssignmentEdit', path: '/tdfAssignmentEdit', template: 'tdfAssignmentEdit', titleKey: 'home.assignments', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin,teacher', load: () => import('../../views/experimentSetup/tdfAssignmentEdit') },
  { routeName: 'client.instructorReporting', path: '/instructorReporting', template: 'instructorReporting', titleKey: 'home.grades', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin,teacher', load: () => import('../../views/experimentReporting/instructorReporting') },
] as const satisfies readonly ManagementRoutePresentationPolicy[];

function uniquePolicyMap(
  key: 'routeName' | 'template',
): ReadonlyMap<string, ManagementRoutePresentationPolicy> {
  const result = new Map<string, ManagementRoutePresentationPolicy>();
  for (const policy of MANAGEMENT_ROUTE_PRESENTATION_POLICIES) {
    const value = policy[key];
    if (result.has(value)) {
      throw new Error(`Duplicate management route ${key}: ${value}`);
    }
    result.set(value, policy);
  }
  return result;
}

const POLICIES_BY_ROUTE_NAME = uniquePolicyMap('routeName');
const POLICIES_BY_TEMPLATE = uniquePolicyMap('template');

export function getManagementRoutePolicies(): readonly ManagementRoutePresentationPolicy[] {
  return MANAGEMENT_ROUTE_PRESENTATION_POLICIES;
}

export function getManagementRoutePolicyByRouteName(
  routeName: string,
): ManagementRoutePresentationPolicy | undefined {
  return POLICIES_BY_ROUTE_NAME.get(routeName);
}

export function getManagementRoutePolicyByTemplate(
  template: string,
): ManagementRoutePresentationPolicy | undefined {
  return POLICIES_BY_TEMPLATE.get(template);
}

