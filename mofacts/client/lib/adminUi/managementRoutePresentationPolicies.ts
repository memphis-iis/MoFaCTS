import type { PlatformStringKey } from '../interfaceI18nResources';
import type { AUDIT_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';

export type ManagementChromeMode = 'app' | 'practice' | 'none';

type RegisteredSurfaceId = Extract<typeof AUDIT_VERIFICATIONS[number], { kind: 'integrationTest'; lane: 'meteor' }>['surfaceId'];

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
  /** References to the server owners of this page's actions and data. */
  serverSurfaceIds: readonly [RegisteredSurfaceId, ...RegisteredSurfaceId[]];
  load: () => Promise<unknown>;
}>;

const assetUploadSurfaceIds = [
  'framework:ostrio-files:assets-start', 'framework:ostrio-files:assets-write', 'framework:ostrio-files:assets-abort',
] as const;
const packageProcessingSurfaceIds = [
  'method:processPackageUpload', 'method:confirmPackageUpload', 'method:cancelPackageUpload',
] as const;

const MANAGEMENT_ROUTE_PRESENTATION_POLICIES = [
  { routeName: 'client.prolific', path: '/prolific', template: 'prolific', titleKey: 'home.prolific', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin,teacher',
    serverSurfaceIds: [
      'method:prolificTestSetupStatus', 'method:prolificList', 'method:prolificDashboard', 'method:prolificConnect',
      'method:prolificPrepareTestStudy', 'method:prolificCreateTestParticipant', 'method:prolificExecuteTestStudy',
      'method:prolificBindStudy', 'method:prolificMessages', 'method:prolificPrepareOperation',
      'method:prolificConfirmOperation', 'method:prolificReviewOperation', 'method:prolificRetryReminder',
    ],
    load: () => import('../../views/prolific') },
  { routeName: 'client.contentUpload', path: '/contentUpload', template: 'contentUpload', titleKey: 'home.content', chromeMode: 'app', requiresAuth: true,
    serverSurfaceIds: [
      'publication:contentUploadMetadata', 'publication:tdfForContentUploadDetails', 'publication:assets',
      ...assetUploadSurfaceIds, ...packageProcessingSurfaceIds, 'middleware:dynamic-assets',
      'middleware:cdn-public-assets', 'method:getUploadQuotaStatus', 'method:getAccessorsTDFID',
      'method:resolveUsersForTdf', 'method:assignAccessors', 'method:transferDataOwnership',
      'method:setTdfUserSelect', 'method:copyTdf', 'method:getPackageDownloadLink', 'method:deletePackageFile',
      'method:resetTdfConditionCounts', 'method:removeAssetById', 'method:removeMultipleAssets',
      'method:getStimuliFileForTdf', 'method:getSparcVideoCatalogTargets', 'method:prepareSparcVideoCatalogTarget',
      'method:callResolvedOpenRouterJson', 'method:saveSparcVideoCatalogPassages',
    ],
    load: () => import('../../views/experimentSetup/contentUpload') },
  { routeName: 'client.aiContentCreator', path: '/aiContentCreate', template: 'aiContentCreator', titleKey: 'home.content', chromeMode: 'app', requiresAuth: true,
    serverSurfaceIds: [
      'method:getAiContentOpenRouterCapability', 'method:callAiContentOpenRouterRequest', ...assetUploadSurfaceIds,
      'method:saveAiGeneratedPackageContent', 'method:removeAssetById',
    ],
    load: () => import('../../views/experimentSetup/aiContentCreator') },
  { routeName: 'client.manualContentCreator', path: '/contentCreate', template: 'manualContentCreator', titleKey: 'home.content', chromeMode: 'app', requiresAuth: true,
    serverSurfaceIds: [
      'method:getManualContentDraft', 'method:saveManualContentDraft', 'method:deleteManualContentDraft',
      'method:getUserAssetByName', ...assetUploadSurfaceIds, ...packageProcessingSurfaceIds,
    ],
    load: () => import('../../views/experimentSetup/manualContentCreator') },
  { routeName: 'client.contentEdit', path: '/contentEdit/:tdfId', template: 'contentEdit', titleKey: 'home.content', chromeMode: 'app', requiresAuth: true,
    serverSurfaceIds: [
      'publication:tdfForEdit', 'publication:files.assets.all', 'method:saveTdfStimuli',
    ],
    load: () => import('../../views/experimentSetup/contentEdit') },
  { routeName: 'client.sparcImageLibrary', path: '/sparcImageLibrary', template: 'sparcImageLibrary', titleKey: 'home.content', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin',
    serverSurfaceIds: [
      'method:getSparcLibraryClusters', 'method:listSparcInstructionalComponents',
      'method:deleteSparcInstructionalComponent', 'method:replaceSparcLibraryImage', 'method:reviseSparcPrimitive',
    ],
    load: () => import('../../views/experimentSetup/sparcImageLibrary') },
  { routeName: 'client.tdfEdit', path: '/tdfEdit/:tdfId', template: 'tdfEdit', titleKey: 'home.content', chromeMode: 'app', requiresAuth: true,
    serverSurfaceIds: [
      'publication:tdfForEdit', 'method:saveTdfContent', 'method:getOpenRouterModelCatalog',
    ],
    load: () => import('../../views/experimentSetup/tdfEdit') },
  { routeName: 'client.dataDownload', path: '/dataDownload', template: 'dataDownload', titleKey: 'home.data', chromeMode: 'app', requiresAuth: true,
    serverSurfaceIds: [
      'method:getAccessableTDFSForUser', 'method:downloadDataById', 'method:downloadDataByTeacher',
      'method:downloadOwnHistoryAcrossTdfs', 'http:get:/data-download/owned-history/:token/:filename',
      'http:get:/data-download/own-history/:token/:filename',
    ],
    load: () => import('../../views/experimentReporting/dataDownload') },
  { routeName: 'client.profile', path: '/profile', template: 'profile', titleKey: 'home.profile', chromeMode: 'app', requiresAuth: true,
    serverSurfaceIds: [
      'publication:default:account-self', 'method:updateOwnProfile', 'method:updateOwnOpenRouterSettings',
      'method:testOwnOpenRouterSettings', 'method:deleteOwnOpenRouterKey', 'method:updateOwnSparcPersona',
      'method:getOpenRouterModelCatalog',
    ],
    load: () => import('../../views/profile') },
  { routeName: 'client.audioSettings', path: '/audioSettings', template: 'audioSettings', titleKey: 'audio.settings', chromeMode: 'app', requiresAuth: true,
    serverSurfaceIds: [
      'publication:userAudioSettings', 'method:saveAudioSettings', 'method:isUserSpeechAPIKeySetup',
      'method:saveUserSpeechAPIKey', 'method:deleteUserSpeechAPIKey', 'method:makeGoogleTTSApiCall',
      'method:makeGoogleSpeechAPICall',
    ],
    load: () => import('../../views/audioSettings') },
  { routeName: 'client.classSelection', path: '/classSelection', template: 'classSelection', titleKey: 'home.joinCourses', chromeMode: 'app', requiresAuth: true,
    serverSurfaceIds: [
      'method:getAllTeachers', 'method:getAllCourseSections', 'method:addUserToTeachersClass',
      'method:setUserLoginData',
    ],
    load: () => import('../../views/home/classSelection') },
  { routeName: 'client.help', path: '/help', template: 'help', titleKey: 'home.help', chromeMode: 'app', requiresAuth: false,
    serverSurfaceIds: [
      'publication:deploymentBrandProfile', 'method:getCustomHelpPage',
    ],
    load: () => import('../../views/help') },
  { routeName: 'client.adminControls', path: '/adminControls', template: 'adminControls', titleKey: 'home.adminControlPanel', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin',
    serverSurfaceIds: [
      'publication:settings', 'method:getServerStatus', 'method:setVerbosity', 'method:setClientVerbosity',
    ],
    load: () => import('../../views/adminControls') },
  { routeName: 'client.adminBackups', path: '/admin/backups', template: 'adminBackups', titleKey: 'home.backups', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin',
    serverSurfaceIds: [
      'method:admin.backups.config', 'method:admin.backups.list', 'method:admin.backups.create',
      'method:admin.backups.verify', 'method:admin.backups.get', 'method:admin.backups.downloadToken',
      'method:admin.backups.restore', 'method:admin.backups.delete',
      'http:get:/admin/backups/download/:token/:filename',
    ],
    load: () => import('../../views/adminBackups') },
  { routeName: 'client.adminSecurityAudits', path: '/admin/security-audits', template: 'adminSecurityAuditsV2', titleKey: 'home.securityAudits', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin',
    serverSurfaceIds: [
      'method:admin.securityAudits.list', 'method:admin.securityAudits.downloadToken',
      'http:get:/admin/security-audits/download/:token/:filename',
    ],
    load: () => import('../../views/adminSecurityAuditsV2') },
  { routeName: 'client.userAdmin', path: '/userAdmin', template: 'userAdmin', titleKey: 'home.userAdmin', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin',
    serverSurfaceIds: [
      'publication:filteredUsers', 'publication:filteredUsersCount', 'publication:userAdminDashboardUsage',
      'method:getAdminApiKeyAlternativeMetadata', 'method:saveAdminApiKeyAlternative',
      'method:deleteAdminApiKeyAlternative', 'method:userAdminNewsEmailRecipients',
      'method:refreshUserAdminUsageCaches', 'method:userAdminRoleChange', 'method:userAdminDeleteUser',
      'method:insertNewUsers', 'method:getOpenRouterModelCatalog',
    ],
    load: () => import('../../views/userAdmin') },
  { routeName: 'client.theme', path: '/theme', template: 'theme', titleKey: 'home.theme', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin',
    serverSurfaceIds: [
      'publication:theme', 'publication:themeLibrary', 'method:getDeploymentBrandProfileDraft',
      'method:exportDeploymentBrandProfile', 'method:saveDeploymentBrandProfileDraft',
      'method:publishDeploymentBrandProfile', 'method:importDeploymentBrandProfileDraft', 'method:exportThemeFile',
      'method:setCustomThemeProperty', 'method:setActiveTheme', 'method:duplicateTheme', 'method:renameTheme',
      'method:deleteTheme', 'method:importThemeFile', 'method:initializeCustomTheme', 'method:setCustomHelpPage',
      'method:removeCustomHelpPage',
    ],
    load: () => import('../../views/theme') },
  { routeName: 'client.adminTests', path: '/admin/tests', template: 'testRunner', titleKey: 'home.adminTests', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin',
    serverSurfaceIds: [
      'method:deploymentReadiness', 'method:getAdminTestOpenRouterCapability',
      'method:callAdminTestOpenRouterRequest', 'method:getAdminTestSparcCompoundInterestSources',
      'method:getAdminTestSparcCompoundInterestSource', 'method:callAdminTestResolvedOpenRouterJson',
    ],
    load: () => import('../../views/testRunner') },
  { routeName: 'client.classEdit', path: '/classEdit', template: 'classEdit', titleKey: 'home.courses', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin,teacher',
    serverSurfaceIds: [
      'method:getAllCourseSections', 'method:addCourse', 'method:editCourse', 'method:deleteCourse',
    ],
    load: () => import('../../views/experimentSetup/classEdit') },
  { routeName: 'client.courses', path: '/courses', template: 'courses', titleKey: 'home.courses', chromeMode: 'app', requiresAuth: true,
    serverSurfaceIds: [
      'method:ensureDashboardCacheCurrent', 'method:getLearnerCoursesSnapshot', 'method:getTdfById',
      'method:getProgressiveAssignmentLaunch', 'method:addUserToTeachersClass', 'method:setUserLoginData',
    ],
    load: () => import('../../views/home/courses') },
  { routeName: 'client.tdfAssignmentEdit', path: '/tdfAssignmentEdit', template: 'tdfAssignmentEdit', titleKey: 'home.assignments', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin,teacher',
    serverSurfaceIds: [
      'method:getCourseAssignmentEditorSnapshot', 'method:getAllCoursesForInstructor',
      'method:saveCourseAssignments',
    ],
    load: () => import('../../views/experimentSetup/tdfAssignmentEdit') },
  { routeName: 'client.instructorReporting', path: '/instructorReporting', template: 'instructorReporting', titleKey: 'home.grades', chromeMode: 'app', requiresAuth: true, allowedRoles: 'admin,teacher',
    serverSurfaceIds: [
      'method:getTdfAssignmentsByCourseIdMap', 'method:getAllCoursesForInstructor',
      'method:getClassPerformanceByTDF', 'method:addUserDueDateException', 'method:removeUserDueDateException',
    ],
    load: () => import('../../views/experimentReporting/instructorReporting') },
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
