import {Roles} from 'meteor/alanning:roles';
// import * as ElaboratedFeedback from './lib/CachedElaboratedFeedback';
// import * as DefinitionalFeedback from '../server/lib/DefinitionalFeedback.js';
// import * as ClozeAPI from '../server/lib/ClozeAPI.js';
import {createExperimentExport, createExperimentExportByTdfIds} from './experiment_times';
import {getNewItemFormat} from './conversions/convert';
import { legacyTrim } from '../common/underscoreCompat';
import _ from 'underscore';
const underscoreAny = _ as {
  trim?: (str: unknown) => string;
  intval?: (val: unknown) => number;
  display?: (val: unknown) => string;
};

// The npm 'underscore' package (used in Meteor 3 / rspack builds) does not include trim/intval/display helpers.
if (typeof underscoreAny.trim !== 'function') {
  underscoreAny.trim = function(str: unknown) {
    return str == null ? '' : String(str).trim();
  };
}
if (typeof underscoreAny.intval !== 'function') {
  underscoreAny.intval = function(val: unknown) {
    return parseInt(String(val), 10) || 0;
  };
}
if (typeof underscoreAny.display !== 'function') {
  underscoreAny.display = function(val: unknown) {
    return val == null ? '' : String(val);
  };
}
import { applyMeteorSettingsWorkaround } from './startup/meteorSettingsWorkaround';
import { runServerStartup } from './startup/serverStartup';
import { registerServerRuntime } from './runtime/serverRuntime';
import { getResponseKCAnswerKey } from '../common/lib/responseKCAnswerKey';
import { computePracticeTimeMs } from '../lib/practiceTime';
import { createServerUtilityHelpers } from './lib/serverUtilities';
import { createStimulusLookupHelpers } from './lib/stimulusLookup';
import { createAccessMethods } from './methods/accessMethods';
import { createAdminMethods } from './methods/adminMethods';
import { createAnalyticsMethods } from './methods/analyticsMethods';
import { createAuthMethods } from './methods/authMethods';
import { createContentMethods } from './methods/contentMethods';
import { createCourseMethods } from './methods/courseMethods';
import { createDashboardCacheMethods } from './methods/dashboardCacheMethods';
import { createExperimentMethods } from './methods/experimentMethods';
import { createPackageMethods } from './methods/packageMethods';
import { createSpeechMethods } from './methods/speechMethods';
import { createSystemMethods } from './methods/systemMethods';
import { createTurkWorkflowMethods } from './methods/turkWorkflowMethods';
import {
  createThemeMethods,
  createUpdateActiveThemeDocument,
} from './methods/themeMethods';
import { getOrBuildCurrentPackageAsset } from './lib/packageExport';
import { getClassPerformanceByTdfWorkflow } from './lib/classPerformance';
import { createAuthSupport } from './lib/authSupport';
import { createMediaReferenceHelpers } from './lib/mediaReferences';
import { getMemphisSamlClientConfig } from './lib/memphisSaml';
import { createTdfLookupHelpers } from './lib/tdfLookup';
import {
  hasMeaningfulProgressSignal,
  isBreakingMappingChange,
} from './lib/mappingPolicyClassifier';
import {
  canAccessContentUploadTdf,
  canDownloadOwnedTdfData,
  canViewDashboardTdf,
  hasSharedTdfAccess,
  isTdfOwner,
} from './lib/contentAccessPolicy';
import {
  getAccessibleTdfApiKey,
  getUserPersonalApiKey,
  type ApiKeyResolutionDeps,
} from './lib/apiKeyResolution';
import {
  clearStimDisplayTypeMap,
  getStimDisplayTypeMap as getStimDisplayTypeMapSnapshot,
  getStimDisplayTypeMapVersion as getStimDisplayTypeMapSnapshotVersion,
  rebuildStimDisplayTypeMapSnapshot,
  updateStimDisplayTypeMap as refreshStimDisplayTypeMap,
} from './lib/stimDisplayTypeMap';
import {
  requireAuthenticatedUser,
  requireUserWithRoles,
  getUserRoleFlags,
  type MethodAuthorizationDeps,
} from './lib/methodAuthorization';
import { encryptData, decryptData } from './lib/encryption';
import { HISTORY_KEY_MAP } from '../common/Definitions';

const MeteorAny = Meteor as any;

const AssetsAny = Assets as unknown as { getTextAsync: (path: string) => Promise<string> };
const PapaAny = (globalThis as unknown as {
  Papa?: { parse: (csv: string) => { data: unknown[] } };
}).Papa;




export { getTdfByFileName, getTdfById, getHistoryByTDFID, getStimuliSetById, serverConsole, decryptData };

/* jshint sub:true*/

// The jshint inline option above suppresses a warning about using sqaure
// brackets instead of dot notation - that's because we prefer square brackets
// for creating some MongoDB queries
let verbosityLevel = 0; //0 = only output serverConsole logs, 1 = only output function times, 2 = output serverConsole and function times

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
};
const AuthThrottleStateAny = (globalThis as any).AuthThrottleState as {
  findOneAsync(selector: UnknownRecord): Promise<UnknownRecord | null>;
  upsertAsync(selector: UnknownRecord, modifier: UnknownRecord): Promise<unknown>;
  updateAsync(selector: UnknownRecord, modifier: UnknownRecord): Promise<unknown>;
  removeAsync(selector: UnknownRecord): Promise<unknown>;
  rawCollection(): { createIndex(keys: UnknownRecord, options?: UnknownRecord): Promise<unknown> };
};

function getApiKeyResolutionDeps(): ApiKeyResolutionDeps {
  return {
    getUserById: async (userId: string) => await MeteorAny.users.findOneAsync({ _id: userId }),
    getTdfById: async (tdfId: string) => await Tdfs.findOneAsync({ _id: tdfId }),
    hasHistoryWithTdf: async (userId: string, tdfId: string) =>
      await Histories.findOneAsync({ userId, TDFId: tdfId }),
    userIsInRoleAsync: async (userId: string, roles: string[]) =>
      await Roles.userIsInRoleAsync(userId, roles),
    decryptData,
  };
}

function getApiKeyResolutionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getMethodAuthorizationDeps(): MethodAuthorizationDeps {
  return {
    userIsInRoleAsync: async (userId: string, roles: string[]) =>
      await Roles.userIsInRoleAsync(userId, roles),
  };
}

function isPlainRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonLike<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

const authSupport = createAuthSupport({
  usersCollection: MeteorAny.users,
  AuditLog,
  AuthThrottleState: AuthThrottleStateAny,
  serverConsole,
  getMethodAuthorizationDeps,
});
const {
  minPasswordLength,
  experimentUsernameRegex,
  normalizeAccountUsername,
  normalizeCanonicalEmail,
  isEmailVerificationRequired,
  isArgon2Enabled,
  getPasswordHashRuntimeInfo,
  buildAccountAuthState,
  buildSessionAuthState,
  syncUserAuthState,
  normalizeAuthIdentifier,
  getAuthClientIp,
  assertAuthThrottle,
  recordAuthThrottle,
  clearAuthThrottle,
  assertSoftLock,
  recordSoftLockFailure,
  applyMethodRateLimit,
  extractLoginAttemptIdentifier,
  exactCaseInsensitiveRegex,
  findNormalAccountUserByCanonicalEmail,
  isNormalAccountUser,
  isUserEmailVerified,
  getUserDisplayIdentifier,
  syncUsernameCaches,
  enforceCanonicalEmailIdentity,
  sendVerificationEmailForUser,
  escapeRegexLiteral,
  assertStrongPassword,
  isValidEmailAddress,
  createUserWithRetry,
  withSignUpLock,
  writeAuditLog,
  requireAdminUser,
  assertRequiredMeteorSettings,
  requireAllowPublicSignupSetting,
} = authSupport;

applyMeteorSettingsWorkaround({ serverConsole });

assertRequiredMeteorSettings();

// SECURITY FIX: Removed insecure TLS configuration
// Setting NODE_TLS_REJECT_UNAUTHORIZED = 0 disables certificate verification
// for ALL outbound HTTPS connections, making the app vulnerable to MITM attacks.
// This app should never disable TLS verification globally.



let nextStimuliSetId = 1;
let nextEventId = 1;

process.env.MAIL_URL = Meteor.settings.MAIL_URL;
const adminUsers = Meteor.settings.initRoles?.admins || [];
const ownerEmail = Meteor.settings.owner;
const isProd = Meteor.settings.prod || false;
serverConsole('isProd: ' + isProd);

const thisServerUrl = Meteor.settings.ROOT_URL;
serverConsole('thisServerUrl: ' + thisServerUrl);

// const clozeGeneration = require('./lib/Process.js');

const serverUtilities = createServerUtilityHelpers({
  Assignments,
  Histories,
  GlobalExperimentStates,
  ErrorReports,
  findUsersByIds: (userIds) => MeteorAny.users.find(
    { _id: { $in: userIds } },
    { fields: { _id: 1, username: 1, emails: 1 } }
  ).fetchAsync(),
  adminUsers,
  ownerEmail,
  thisServerUrl,
  isProd,
  serverConsole,
});
const {
  getDiskUsageInfo,
  buildDiskUsageStatus,
  sendEmail,
  sendErrorReportSummaries,
  deleteTdfRuntimeData,
} = serverUtilities;

const stimulusLookupHelpers = createStimulusLookupHelpers({
  Tdfs,
  serverConsole,
  refreshStimDisplayTypeMap,
  getStimDisplayTypeMapSnapshot,
  getStimDisplayTypeMapSnapshotVersion,
});
const {
  getStimDisplayTypeMapDeps,
  updateStimDisplayTypeMap,
  getStimDisplayTypeMap,
  getStimDisplayTypeMapVersion,
  getStimuliSetById,
  getStimuliSetIdByFilename,
} = stimulusLookupHelpers;

const updateActiveThemeDocument = createUpdateActiveThemeDocument({
  serverConsole,
  DynamicSettings,
  usersCollection: MeteorAny.users,
});

const courseMethods = createCourseMethods({
  serverConsole,
  Courses,
  Sections,
  SectionUserMap,
  Assignments,
  Tdfs,
  Histories,
  itemSourceSentences,
  usersCollection: MeteorAny.users,
  getMethodAuthorizationDeps,
  getUserDisplayIdentifier,
  normalizeCanonicalId,
});

const {
  resolveAssignedRootTdfIdsForUser: resolveAssignedRootTdfIdsForUserMethod,
  getTdfNamesByOwnerId: getTdfNamesByOwnerIdMethod,
  getSourceSentences: _getSourceSentences,
  checkForTDFData: _checkForTDFData,
  ...publicCourseMethods
} = courseMethods as Record<string, unknown>;
const resolveAssignedRootTdfIdsForUser = resolveAssignedRootTdfIdsForUserMethod as (userId: string) => Promise<string[]>;
const getTdfNamesByOwnerId = getTdfNamesByOwnerIdMethod as (ownerId: string) => Promise<string[] | null>;

const tdfLookupHelpers = createTdfLookupHelpers({
  serverConsole,
  Tdfs,
  usersCollection: MeteorAny.users,
  GlobalExperimentStates,
  normalizeCanonicalId,
  resolveAssignedRootTdfIdsForUser,
  canViewDashboardTdf,
  canAccessContentUploadTdf,
  isTdfOwner,
  hasSharedTdfAccess,
});
const {
  getTdfById,
  getTdfByFileName,
  getTdfsByFileNameOrId,
  userCanManageTdf,
  assertUserOwnsTdfs,
} = tdfLookupHelpers;

const mediaReferenceHelpers = createMediaReferenceHelpers({
  DynamicAssets,
  serverConsole,
});
const {
  normalizeUploadedMediaLookupKey,
  extractSrcFromHtml,
  getMimeTypeForAssetName,
  getStimuliSetIdCandidates,
  parseLocalMediaReference,
  toCanonicalDynamicAssetPath,
  findDynamicAssetScoped,
  findDynamicAssetsScopedBatch,
  processAudioFilesForTDF,
  canonicalizeStimDisplayMediaRefs,
  canonicalizeFlatStimuliMediaRefs,
} = mediaReferenceHelpers;

const packageMethods = createPackageMethods({
  Tdfs,
  DynamicAssets,
  UserUploadQuota,
  AuditLog,
  ownerEmail,
  serverConsole,
  sendEmail,
  getCurrentUser: () => MeteorAny.userAsync(),
  userIsInRoleAsync: (userId, roles) => Roles.userIsInRoleAsync(userId, roles),
  normalizeCanonicalId,
  getResponseKCAnswerKey,
  getTdfByFileName,
  getTdfsByFileNameOrId,
  getStimuliSetIdByFilename,
  userCanManageTdf,
  allocateNextStimuliSetId: () => {
    const stimuliSetId = nextStimuliSetId;
    nextStimuliSetId += 1;
    return stimuliSetId;
  },
  getNewItemFormat,
  legacyTrim,
  encryptData,
  isBreakingMappingChange,
  updateStimDisplayTypeMap,
  rebuildStimDisplayTypeMapSnapshot,
  getStimDisplayTypeMapDeps,
  getMimeTypeForAssetName,
  parseLocalMediaReference,
  findDynamicAssetScoped,
  toCanonicalDynamicAssetPath,
  normalizeUploadedMediaLookupKey,
  processAudioFilesForTDF,
  canonicalizeStimDisplayMediaRefs,
  canonicalizeFlatStimuliMediaRefs,
});
const {
  getResponseKCMapForTdf,
  processPackageUpload,
  saveContentFile,
  tdfUpdateConfirmed,
  saveTdfStimuli,
  saveTdfContent,
  copyTdf,
  upsertStimFile,
  upsertTDFFile,
  resolveConditionTdfIds,
  normalizeOptionalString,
} = packageMethods;

const analyticsMethods = createAnalyticsMethods({
  serverConsole,
  Histories,
  GlobalExperimentStates,
  Tdfs,
  Courses,
  Sections,
  SectionUserMap,
  usersCollection: MeteorAny.users,
  getMethodAuthorizationDeps,
  normalizeCanonicalId,
  normalizeOptionalString,
  canViewDashboardTdf,
  resolveAssignedRootTdfIdsForUser,
  allocateNextEventId: () => {
    const eventId = nextEventId;
    nextEventId += 1;
    return eventId;
  },
  syncUsernameCaches,
  createExperimentExport,
  createExperimentExportByTdfIds,
  getTdfNamesByOwnerId,
  assertUserOwnsTdfs,
  canDownloadOwnedTdfData,
  resolveConditionTdfIds,
  getClassPerformanceByTdfWorkflow,
  getStimuliSetById,
  hasMeaningfulProgressSignal,
  HISTORY_KEY_MAP,
});

const {
  getHistoryByTDFID: getHistoryByTDFIDMethod,
  getStimSetFromLearningSessionByClusterList: _getStimSetFromLearningSessionByClusterList,
  getUserLastFeedbackTypeFromHistory: _getUserLastFeedbackTypeFromHistory,
  ...publicAnalyticsMethods
} = analyticsMethods as Record<string, unknown>;
const getHistoryByTDFID = getHistoryByTDFIDMethod as (TDFId: string) => Promise<any[]>;

const speechMethods = createSpeechMethods({
  serverConsole,
  getApiKeyResolutionDeps,
  getApiKeyResolutionErrorMessage,
});

const experimentMethods = createExperimentMethods({
  serverConsole,
  Tdfs,
  GlobalExperimentStates,
  usersCollection: MeteorAny.users,
  experimentUsernameRegex,
  normalizeAccountUsername,
  escapeRegexLiteral,
  withSignUpLock,
  createUserWithRetry,
  writeAuditLog,
});
const {
  getTdfByExperimentTarget: getTdfByExperimentTargetRaw,
  ...publicExperimentMethods
} = experimentMethods;

const turkWorkflowMethods = createTurkWorkflowMethods({
  serverConsole,
  Tdfs,
  ScheduledTurkMessages,
  usersCollection: MeteorAny.users,
  getCurrentUser: () => MeteorAny.userAsync(),
  getMethodAuthorizationDeps,
  encryptData,
});

// Published to all clients (even without subscription calls)
Meteor.publish(null, function() {
  // Only valid way to get the user ID for publications
  const userId = this.userId;

  // The default data published to everyone - all TDF's and stims, and the
  // user data (user times log and user record) for them
  const defaultData = [
    MeteorAny.users.find({_id: userId}, {
      fields: {
        username: 1,
        profile: 1,
        loginParams: 1,
        authState: 1,
        emails: 1,
        email_canonical: 1,
        email_original: 1,
        verificationEmailLastSentAt: 1
      }
    }),
  ];

  return defaultData;
});

function serverConsole(...args: unknown[]) {
  if(verbosityLevel == 1) return;
  const disp: unknown[] = [(new Date()).toString()];
  for (let i = 0; i < args.length; ++i) {
    disp.push(args[i]);
  }
  console.log(...disp);
}

function normalizeCanonicalId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export const methods: any = {
  ...createSystemMethods({
    serverConsole,
    ScheduledTurkMessages,
    usersCollection: MeteorAny.users,
    ErrorReports,
    DynamicSettings,
    getMethodAuthorizationDeps,
    requireAdminUser,
    buildDiskUsageStatus,
    sendErrorReportSummaries,
    sendEmail,
    getCurrentUser: () => MeteorAny.userAsync(),
    getVerbosityLevel: () => verbosityLevel,
    setVerbosityLevel: (level: number) => {
      verbosityLevel = level;
    },
  }),

  ...publicExperimentMethods,

  ...createAccessMethods({
    serverConsole,
    Tdfs,
    usersCollection: MeteorAny.users,
    getMethodAuthorizationDeps,
    isTdfOwner,
    getUserDisplayIdentifier,
    exactCaseInsensitiveRegex,
    isValidEmailAddress,
    normalizeCanonicalId,
    resolveConditionTdfIds,
  }),

  ...createAdminMethods({
    serverConsole,
    csvParser: PapaAny,
    usersCollection: MeteorAny.users,
    Tdfs,
    DynamicAssets,
    Courses,
    DynamicSettings,
    Histories,
    GlobalExperimentStates,
    SectionUserMap,
    UserTimesLog,
    UserMetrics,
    PasswordResetTokens,
    UserDashboardCache,
    UserUploadQuota,
    requireAdminUser,
    normalizeCanonicalEmail,
    assertStrongPassword,
    withSignUpLock,
    findNormalAccountUserByCanonicalEmail,
    createUserWithRetry,
    enforceCanonicalEmailIdentity,
    writeAuditLog,
    syncUserAuthState,
    isEmailVerificationRequired,
    sendVerificationEmailForUser,
    getUserDisplayIdentifier,
    syncUsernameCaches,
    deleteTdfRuntimeData,
    clearStimDisplayTypeMap,
  }),
  ...createAuthMethods({
    serverConsole,
    ownerEmail,
    usersCollection: MeteorAny.users,
    PasswordResetTokens,
    requireAdminUser,
    getMethodAuthorizationDeps,
    getUserRoleFlags,
    requireAllowPublicSignupSetting,
    getMemphisSamlClientConfig,
    minPasswordLength,
    normalizeCanonicalEmail,
    findNormalAccountUserByCanonicalEmail,
    applyMethodRateLimit,
    getAuthClientIp,
    sendEmail,
    writeAuditLog,
    assertStrongPassword,
    enforceCanonicalEmailIdentity,
    syncUserAuthState,
    createUserWithRetry,
    withSignUpLock,
    isEmailVerificationRequired,
    sendVerificationEmailForUser,
    normalizeAuthIdentifier,
    getUserDisplayIdentifier,
    isNormalAccountUser,
    isUserEmailVerified,
    buildSessionAuthState,
    normalizeCanonicalId,
    syncUsernameCaches,
    encryptData,
    getUserPersonalApiKey,
    getAccessibleTdfApiKey,
    getApiKeyResolutionDeps,
    getPasswordHashRuntimeInfo,
  }),

  ...createContentMethods({
    ManualContentDrafts,
    Tdfs,
    Stims,
    DynamicAssets,
    usersCollection: MeteorAny.users,
    UserUploadQuota,
    AuditLog,
    serverConsole,
    isPlainRecord,
    cloneJsonLike,
    normalizeCanonicalId,
    getTdfsByFileNameOrId,
    canAccessContentUploadTdf,
    getOrBuildCurrentPackageAsset,
    parseLocalMediaReference,
    extractSrcFromHtml,
    getStimuliSetIdCandidates,
    findDynamicAssetsScopedBatch,
    decryptData,
    deleteTdfRuntimeData,
    updateStimDisplayTypeMap,
    rebuildStimDisplayTypeMapSnapshot,
    getStimDisplayTypeMapDeps,
    getMethodAuthorizationDeps,
    resolveConditionTdfIds,
  }),

  ...createThemeMethods({
    serverConsole,
    DynamicSettings,
    usersCollection: MeteorAny.users,
    requireAdminUser,
    getMethodAuthorizationDeps,
    updateActiveThemeDocument,
  }),
}

function getStimuliSetIdCandidatesForMethod(stimuliSetId: string | number) {
  const candidates = new Set<string | number>();
  if (typeof stimuliSetId === 'number' && Number.isFinite(stimuliSetId)) {
    candidates.add(stimuliSetId);
    candidates.add(String(stimuliSetId));
  } else if (typeof stimuliSetId === 'string') {
    const trimmed = stimuliSetId.trim();
    if (trimmed) {
      candidates.add(trimmed);
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        candidates.add(numeric);
      }
    }
  }
  return Array.from(candidates);
}

async function getTdfByIdPublic(this: MethodContext, TDFId: string) {
  const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to access TDF content', 401);
  return await getTdfById.call({ userId }, TDFId);
}

async function getTdfByFileNamePublic(this: MethodContext, filename: string) {
  const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to access TDF content', 401);
  const tdf = await getTdfByFileName(filename);
  if (!tdf) {
    return null;
  }
  const tdfId = normalizeCanonicalId(tdf?._id);
  if (!tdfId) {
    throw new Meteor.Error(404, 'TDF not found');
  }
  return await getTdfById.call({ userId }, tdfId);
}

function buildPublicExperimentEntry(tdf: any) {
  const setspec = isPlainRecord(tdf?.content?.tdfs?.tutor?.setspec)
    ? tdf.content.tdfs.tutor.setspec
    : {};
  const publicSetSpec: UnknownRecord = {};
  for (const key of [
    'lessonname',
    'condition',
    'experimentTarget',
    'experimentPasswordRequired',
    'speechIgnoreOutOfGrammarResponses',
    'speechOutOfGrammarFeedback',
    'showPageNumbers',
    'audioPromptMode',
    'audioInputEnabled',
    'audioPromptFeedbackSpeakingRate',
    'audioPromptQuestionSpeakingRate',
    'audioPromptVoice',
    'audioPromptQuestionVolume',
    'audioPromptFeedbackVolume',
    'audioPromptFeedbackVoice',
  ]) {
    if (Object.prototype.hasOwnProperty.call(setspec, key)) {
      publicSetSpec[key] = cloneJsonLike((setspec as UnknownRecord)[key]);
    }
  }
  const uiSettings = isPlainRecord((setspec as UnknownRecord).uiSettings)
    ? (setspec as { uiSettings?: UnknownRecord }).uiSettings
    : null;
  if (uiSettings && typeof uiSettings.experimentLoginText === 'string') {
    publicSetSpec.uiSettings = { experimentLoginText: uiSettings.experimentLoginText };
  }

  return {
    _id: tdf?._id || null,
    stimuliSetId: tdf?.stimuliSetId ?? null,
    content: {
      isMultiTdf: tdf?.content?.isMultiTdf ?? null,
      tdfs: {
        tutor: {
          setspec: publicSetSpec,
        },
      },
    },
  };
}

async function getTdfByExperimentTargetPublic(this: MethodContext, experimentTarget: string) {
  const normalizedTarget = typeof experimentTarget === 'string'
    ? experimentTarget.trim().toLowerCase()
    : '';
  if (!normalizedTarget) {
    return null;
  }

  const tdf = await getTdfByExperimentTargetRaw(normalizedTarget);
  if (!tdf) {
    return null;
  }

  const userId = typeof this.userId === 'string' && this.userId.trim()
    ? this.userId.trim()
    : null;
  if (userId && tdf?._id) {
    try {
      return await getTdfById.call({ userId }, String(tdf._id));
    } catch (error: unknown) {
      if (!(error instanceof Meteor.Error) || (error.error !== 401 && error.error !== 403)) {
        throw error;
      }
    }
  }

  return buildPublicExperimentEntry(tdf);
}

async function getStimuliSetByIdPublic(this: MethodContext, stimuliSetId: string | number) {
  const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to access stimulus content', 401);
  const candidates = getStimuliSetIdCandidatesForMethod(stimuliSetId);
  if (candidates.length === 0) {
    throw new Meteor.Error(400, 'Invalid stimuli set id');
  }

  const tdfs = await Tdfs.find(
    { stimuliSetId: { $in: candidates } },
    { fields: { _id: 1, stimuliSetId: 1 } }
  ).fetchAsync();
  if (tdfs.length === 0) {
    return [];
  }

  for (const tdf of tdfs) {
    const tdfId = normalizeCanonicalId(tdf?._id);
    if (!tdfId) {
      continue;
    }
    try {
      await getTdfById.call({ userId }, tdfId);
      return await getStimuliSetById(tdf.stimuliSetId ?? stimuliSetId);
    } catch (error: unknown) {
      if (error instanceof Meteor.Error && (error.error === 403 || error.error === 401)) {
        continue;
      }
      throw error;
    }
  }

  throw new Meteor.Error(403, 'Not authorized to access this stimulus set');
}

async function getResponseKCMapForTdfPublic(this: MethodContext, tdfId: string) {
  const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to access response mappings', 401);
  await getTdfById.call({ userId }, tdfId);
  return await getResponseKCMapForTdf(tdfId);
}

async function updateStimDisplayTypeMapPublic(this: MethodContext, stimuliSetIds: unknown[] | null = null) {
  await requireUserWithRoles(getMethodAuthorizationDeps(), {
    userId: this.userId,
    roles: ['admin'],
    notLoggedInMessage: 'Must be logged in',
    notLoggedInCode: 401,
    forbiddenMessage: 'Admin access required to update stimulus display map',
    forbiddenCode: 403,
  });
  return await updateStimDisplayTypeMap(stimuliSetIds);
}

async function getStimDisplayTypeMapPublic() {
  return await getStimDisplayTypeMap();
}

async function getStimDisplayTypeMapVersionPublic() {
  return await getStimDisplayTypeMapVersion();
}

export const asyncMethods: Record<string, unknown> = {
  getTdfByFileName: getTdfByFileNamePublic,
  getTdfByExperimentTarget: getTdfByExperimentTargetPublic,
  ...turkWorkflowMethods,

  ...publicAnalyticsMethods,
  ...publicCourseMethods,

  getStimDisplayTypeMap: getStimDisplayTypeMapPublic,
  getStimDisplayTypeMapVersion: getStimDisplayTypeMapVersionPublic,
  getStimuliSetById: getStimuliSetByIdPublic,
  updateStimDisplayTypeMap: updateStimDisplayTypeMapPublic,

  saveContentFile,

  getResponseKCMapForTdf: getResponseKCMapForTdfPublic,
  processPackageUpload,

  tdfUpdateConfirmed, saveTdfStimuli, saveTdfContent,
  copyTdf,

  getTdfById: getTdfByIdPublic,

  ...speechMethods,

  ...createDashboardCacheMethods({
    Meteor,
    Roles,
    Histories,
    Tdfs,
    UserDashboardCache,
    serverConsole,
    computePracticeTimeMs
  }),
}

// Server-side startup logic
Meteor.methods({...methods, ...asyncMethods});

registerServerRuntime({
  DynamicAssets,
  serverConsole,
});

Meteor.startup(async function() {
  await runServerStartup({
    serverConsole,
    DynamicSettings,
    usersCollection: MeteorAny.users,
    ManualContentDrafts,
    ScheduledTurkMessages,
    AuthThrottleState: AuthThrottleStateAny,
    Tdfs,
    Histories,
    AssetsAny,
    updateActiveThemeDocument,
    upsertStimFile,
    upsertTDFFile,
    updateStimDisplayTypeMap,
    sendErrorReportSummaries,
    sendEmail,
    getDiskUsageInfo,
    ownerEmail,
    isProd,
    thisServerUrl,
    enforceCanonicalEmailIdentity,
    syncUserAuthState,
    writeAuditLog,
    getAuthClientIp,
    buildSessionAuthState,
    extractLoginAttemptIdentifier,
    assertSoftLock,
    assertAuthThrottle,
    recordAuthThrottle,
    recordSoftLockFailure,
    clearAuthThrottle,
    normalizeCanonicalEmail,
    isValidEmailAddress,
    buildAccountAuthState,
    syncUsernameCaches,
    isArgon2Enabled,
    getPasswordHashRuntimeInfo,
    setRuntimeCounters: ({ nextStimuliSetId: nextStimuliSetIdValue, nextEventId: nextEventIdValue }) => {
      nextStimuliSetId = nextStimuliSetIdValue;
      nextEventId = nextEventIdValue;
    }
  });
});
