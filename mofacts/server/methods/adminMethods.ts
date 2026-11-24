import Papa from 'papaparse';
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { Roles } from 'meteor/alanning:roles';
import {
  normalizeOpenRouterReasoningLevel,
  validateOpenRouterReasoningLevelForModel,
  type OpenRouterReasoningLevel,
} from '../../common/lib/openRouterModelCatalog';
import type { OpenRouterModelCatalogService } from './openRouterCatalogMethods';
import {
  ADMIN_API_KEY_SETTINGS_KEY,
  type AdminApiKeyProvider,
  type AdminApiKeySettingsDoc,
} from '../lib/apiKeyResolution';
import { roleGrantedBySettings } from '../lib/configuredRoles';
import { removeUserOwnedData } from '../lib/userDeletion';

type UnknownRecord = Record<string, unknown>;
type Logger = (...args: unknown[]) => void;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
};
type CountAndFetchCursor = {
  countAsync: () => Promise<number>;
  fetchAsync: () => Promise<any[]>;
};
type FetchCursor = {
  fetchAsync: () => Promise<any[]>;
};

type AdminMethodsDeps = {
  isValidEmailAddress: (value: string) => boolean;
  serverConsole: Logger;
  usersCollection: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => FetchCursor;
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  };
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => CountAndFetchCursor;
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  DynamicAssets: {
    collection: {
      rawCollection: () => {
        countDocuments: (selector: UnknownRecord) => Promise<number>;
      };
    };
  };
  Courses: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { countAsync: () => Promise<number> };
  };
  DynamicSettings: {
    findOneAsync: (selector: UnknownRecord) => Promise<any>;
    updateAsync?: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
    upsertAsync?: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
  };
  Histories: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  GlobalExperimentStates: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  SectionUserMap: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  UserTimesLog: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  UserMetrics: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  PasswordResetTokens: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  UserDashboardCache: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  HistoryCommitState: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  UserUploadQuota: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  requireAdminUser: (
    userId: string | null | undefined,
    errMsg?: string,
    errorCode?: string | number
  ) => Promise<void>;
  normalizeCanonicalEmail: (rawEmail: unknown) => { original: string; canonical: string };
  assertStrongPassword: (password: string) => void;
  withSignUpLock: <T>(username: string, work: () => Promise<T>) => Promise<T>;
  findNormalAccountUserByCanonicalEmail: (emailCanonical: string) => Promise<any>;
  createUserWithRetry: (
    username: string,
    password: string,
    profile?: UnknownRecord,
    options?: { includeEmail?: boolean; emailOriginal?: string; emailCanonical?: string }
  ) => Promise<string>;
  enforceCanonicalEmailIdentity: (
    userId: string,
    rawEmail?: unknown,
    options?: { actorUserId?: string | null; source?: string }
  ) => Promise<void>;
  writeAuditLog: (
    action: string,
    actorUserId: string | null,
    targetUserId: string | null,
    details?: UnknownRecord
  ) => Promise<void>;
  syncUserAuthState: (userId: string, primaryMethodHint?: string) => Promise<void>;
  isEmailVerificationRequired: () => boolean;
  sendVerificationEmailForUser: (userId: string, actorUserId: string | null, source: string) => Promise<boolean>;
  getUserDisplayIdentifier: (user: any) => string;
  syncUsernameCaches: (userId: string, nextUsername: string, previousUsername?: string) => void;
  removeSparcFigureUserDecisions: (userId: string) => Promise<void>;
  removeSimulationResearchUserRecords: (userId: string) => Promise<void>;
  encryptData?: (value: string) => string;
  decryptData?: (value: string) => string;
  openRouterModelCatalogService: OpenRouterModelCatalogService;
};

const OPENROUTER_MODEL_MAX_LENGTH = 160;
const API_KEY_MAX_LENGTH = 4096;
const COMPOUND_INTEREST_MECHANISM_ID = 'autotutor.compound-interest-001.kc.compounding-mechanism';
const COMPOUND_INTEREST_GROWTH_ID = 'autotutor.compound-interest-001.kc.growth-consequence';
const COMPOUND_INTEREST_FREQUENCY_ID = 'autotutor.compound-interest-001.kc.frequency-effect';

const ADMIN_API_KEY_PROVIDER_FIELDS = {
  openrouter: 'openRouter',
  googleTts: 'googleTts',
  googleSpeech: 'googleSpeech',
} as const satisfies Record<AdminApiKeyProvider, string>;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compatibleCompoundInterestPages(tdf: any) {
  const pages = tdf?.rawStimuliFile?.setspec?.sparcPages;
  if (!Array.isArray(pages)) return [];
  return pages.filter((page: unknown) => {
    if (!isRecord(page) || !isRecord(page.display)) return false;
    if (page.display.unitType !== 'sparc-autotutor-dialogue') return false;
    const targets = isRecord(page.display.autoTutorTargets)
      ? page.display.autoTutorTargets
      : {};
    const expectations = Array.isArray(targets.expectations) ? targets.expectations : [];
    const misconceptions = Array.isArray(targets.misconceptions) ? targets.misconceptions : [];
    const expectationIds = new Set(expectations
      .filter(isRecord)
      .map((target) => trimString(target.clusterKC)));
    const misconceptionIds = new Set(misconceptions
      .filter(isRecord)
      .map((target) => trimString(target.id)));
    return expectationIds.has(COMPOUND_INTEREST_MECHANISM_ID)
      && expectationIds.has(COMPOUND_INTEREST_GROWTH_ID)
      && expectationIds.has(COMPOUND_INTEREST_FREQUENCY_ID)
      && ['M1', 'M2', 'M3'].every((id) => misconceptionIds.has(id));
  });
}

function adminTestTdfName(tdf: any): string {
  return trimString(tdf?.content?.tdfs?.tutor?.setspec?.lessonname)
    || trimString(tdf?.content?.fileName)
    || trimString(tdf?._id);
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

function normalizeAdminApiKey(value: unknown, label: string): string {
  const trimmed = trimString(value);
  if (!trimmed) {
    return '';
  }
  if (trimmed.length > API_KEY_MAX_LENGTH) {
    throw new Meteor.Error('invalid-api-key', `${label} key is too long`);
  }
  if (hasControlCharacters(trimmed) || /\s/.test(trimmed)) {
    throw new Meteor.Error('invalid-api-key', `${label} key contains unsupported whitespace or control characters`);
  }
  return trimmed;
}

function normalizeAdminOpenRouterModel(value: unknown): string {
  const trimmed = trimString(value);
  if (!trimmed) {
    return '';
  }
  if (trimmed.length > OPENROUTER_MODEL_MAX_LENGTH) {
    throw new Meteor.Error('invalid-openrouter-model', `Admin OpenRouter model must be ${OPENROUTER_MODEL_MAX_LENGTH} characters or fewer`);
  }
  if (hasControlCharacters(trimmed) || /[<>\s]/.test(trimmed)) {
    throw new Meteor.Error('invalid-openrouter-model', 'Admin OpenRouter model contains unsupported characters');
  }
  return trimmed;
}

async function validateAdminOpenRouterModelReasoningSelection(
  deps: Pick<AdminMethodsDeps, 'openRouterModelCatalogService'>,
  model: string,
  reasoningLevel: OpenRouterReasoningLevel,
): Promise<void> {
  if (!model) {
    if (reasoningLevel !== 'none') {
      throw new Meteor.Error(
        'invalid-openrouter-reasoning-level',
        'Admin OpenRouter reasoning must be none when no model is selected',
      );
    }
    return;
  }
  const catalog = await deps.openRouterModelCatalogService.getCatalog();
  const catalogModel = catalog.find((entry) => entry.id === model);
  if (!catalogModel) {
    throw new Meteor.Error(
      'openrouter-model-unavailable',
      `OpenRouter model ${JSON.stringify(model)} is not available in the current catalog`,
    );
  }
  try {
    validateOpenRouterReasoningLevelForModel(reasoningLevel, catalogModel);
  } catch (error: unknown) {
    throw new Meteor.Error(
      'invalid-openrouter-reasoning-level',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function adminApiKeyUsability(
  encryptedKey: unknown,
  decryptData?: (value: string) => string
) {
  const configured = typeof encryptedKey === 'string' && encryptedKey.trim().length > 0;
  if (!configured || !decryptData) {
    return { configured, unusable: false };
  }
  try {
    return {
      configured: decryptData(encryptedKey).trim().length > 0,
      unusable: false,
    };
  } catch (_error) {
    return { configured: false, unusable: true };
  }
}

function summarizeAdminApiKeySettings(
  doc: AdminApiKeySettingsDoc,
  decryptData?: (value: string) => string
) {
  const value = doc?.value || {};
  const summarizeProvider = (provider: keyof typeof value) => {
    const entry = value[provider] || {};
    const usability = adminApiKeyUsability(entry.keyEncrypted, decryptData);
    return {
      ...usability,
      keyUpdatedAt: entry.keyUpdatedAt || null,
      modelUpdatedAt: provider === 'openRouter' ? entry.modelUpdatedAt || null : null,
      reasoningLevelUpdatedAt: provider === 'openRouter' ? entry.reasoningLevelUpdatedAt || null : null,
      prefixCachingUpdatedAt: provider === 'openRouter' ? entry.prefixCachingUpdatedAt || null : null,
      updatedBy: entry.updatedBy || null,
      ...(provider === 'openRouter' ? {
        model: trimString(entry.model),
        prefixCachingEnabled: entry.prefixCachingEnabled === true,
        reasoningLevel: normalizeOpenRouterReasoningLevel(
          entry.reasoningLevel,
          'Stored admin OpenRouter reasoning level',
        ),
      } : {}),
    };
  };
  return {
    openRouter: summarizeProvider('openRouter'),
    googleTts: summarizeProvider('googleTts'),
    googleSpeech: summarizeProvider('googleSpeech'),
  };
}

async function writeAdminApiKeySettings(
  deps: AdminMethodsDeps,
  modifier: UnknownRecord,
) {
  if (typeof deps.DynamicSettings.upsertAsync === 'function') {
    await deps.DynamicSettings.upsertAsync({ key: ADMIN_API_KEY_SETTINGS_KEY }, modifier);
    return;
  }
  if (typeof deps.DynamicSettings.updateAsync === 'function') {
    await deps.DynamicSettings.updateAsync({ key: ADMIN_API_KEY_SETTINGS_KEY }, modifier, { upsert: true });
    return;
  }
  throw new Meteor.Error('admin-api-key-settings-unavailable', 'Dynamic settings cannot save API key alternatives');
}

async function getUserDeletionBlockingReasons(deps: AdminMethodsDeps, targetUserId: string) {
  const reasons: string[] = [];

  const ownedTdfCount = await deps.Tdfs.find({ ownerId: targetUserId }, { fields: { _id: 1 } }).countAsync();
  if (ownedTdfCount > 0) {
    reasons.push(`owns ${ownedTdfCount} lesson${ownedTdfCount === 1 ? '' : 's'}`);
  }

  const uploadedAssetCount = await deps.DynamicAssets.collection.rawCollection().countDocuments({ userId: targetUserId });
  if (uploadedAssetCount > 0) {
    reasons.push(`has ${uploadedAssetCount} uploaded asset${uploadedAssetCount === 1 ? '' : 's'}`);
  }

  const teacherCourseCount = await deps.Courses.find({ teacherUserId: targetUserId }, { fields: { _id: 1 } }).countAsync();
  if (teacherCourseCount > 0) {
    reasons.push(`teaches ${teacherCourseCount} course${teacherCourseCount === 1 ? '' : 's'}`);
  }

  const themeLibrarySetting = await deps.DynamicSettings.findOneAsync({ key: 'themeLibrary' });
  const themeLibrary = Array.isArray(themeLibrarySetting?.value) ? themeLibrarySetting.value : [];
  const authoredThemeCount = themeLibrary.filter((theme: any) => String(theme?.metadata?.author || '').trim() === targetUserId).length;
  if (authoredThemeCount > 0) {
    reasons.push(`authored ${authoredThemeCount} custom theme${authoredThemeCount === 1 ? '' : 's'}`);
  }

  return reasons;
}

async function createRosterAccount(deps: AdminMethodsDeps, actor: string, email: string, password: string) {
  const normalizedEmail = deps.normalizeCanonicalEmail(email);

  return await deps.withSignUpLock(normalizedEmail.canonical, async () => {
    if (await deps.findNormalAccountUserByCanonicalEmail(normalizedEmail.canonical)) return 'skipped';
    deps.assertStrongPassword(password);
    const createdId = await deps.createUserWithRetry(
      normalizedEmail.canonical,
      password,
      { experiment: false, createdBy: actor, username: normalizedEmail.canonical },
      {
        emailOriginal: normalizedEmail.original,
        emailCanonical: normalizedEmail.canonical,
      }
    );
    await deps.enforceCanonicalEmailIdentity(createdId, normalizedEmail.original, {
      actorUserId: actor,
      source: 'insertNewUsers.createdUser',
    });
    await deps.syncUserAuthState(createdId, 'password');
    await deps.writeAuditLog('admin.userCreated', actor, createdId, {
      username: normalizedEmail.canonical,
      source: 'insertNewUsers',
    });
    if (deps.isEmailVerificationRequired()) {
      await deps.sendVerificationEmailForUser(createdId, actor, 'insertNewUsers');
    }

    return 'created';
  });
}

export function createAdminMethods(deps: AdminMethodsDeps) {
  return {
    getAdminTestSparcCompoundInterestSources: async function(this: MethodContext) {
      await deps.requireAdminUser(
        this.userId,
        'Only admins can select uploaded TDFs for SPARC live evaluations',
      );
      const tdfs = await deps.Tdfs.find(
        { 'rawStimuliFile.setspec.sparcPages.display.unitType': 'sparc-autotutor-dialogue' },
        {
          fields: {
            _id: 1,
            'content.fileName': 1,
            'content.tdfs.tutor.setspec.lessonname': 1,
            'rawStimuliFile.setspec.sparcPages.pageId': 1,
            'rawStimuliFile.setspec.sparcPages.display.unitType': 1,
            'rawStimuliFile.setspec.sparcPages.display.autoTutorTargets': 1,
          },
        },
      ).fetchAsync();
      return tdfs.flatMap((tdf: any) => compatibleCompoundInterestPages(tdf).map((page: any) => ({
        tdfId: trimString(tdf?._id),
        tdfName: adminTestTdfName(tdf),
        pageId: trimString(page?.pageId),
      }))).filter((option: { tdfId: string; pageId: string }) => option.tdfId && option.pageId)
        .sort((left, right) => `${left.tdfName}\u0000${left.pageId}`.localeCompare(`${right.tdfName}\u0000${right.pageId}`));
    },

    getAdminTestSparcCompoundInterestSource: async function(
      this: MethodContext,
      tdfId: string,
      pageId: string,
    ) {
      check(tdfId, String);
      check(pageId, String);
      await deps.requireAdminUser(
        this.userId,
        'Only admins can load uploaded TDFs for SPARC live evaluations',
      );
      const normalizedTdfId = trimString(tdfId);
      const normalizedPageId = trimString(pageId);
      if (!normalizedTdfId || !normalizedPageId) {
        throw new Meteor.Error('invalid-sparc-evaluation-source', 'A TDF and SPARC page must be selected');
      }
      const tdf = await deps.Tdfs.findOneAsync(
        { _id: normalizedTdfId },
        {
          fields: {
            _id: 1,
            'content.fileName': 1,
            'content.tdfs.tutor.setspec.lessonname': 1,
            'rawStimuliFile.setspec.sparcPages': 1,
          },
        },
      );
      if (!tdf) {
        throw new Meteor.Error('sparc-evaluation-source-not-found', 'The selected uploaded TDF was not found');
      }
      const page = compatibleCompoundInterestPages(tdf)
        .find((candidate: any) => trimString(candidate?.pageId) === normalizedPageId);
      if (!page) {
        throw new Meteor.Error(
          'incompatible-sparc-evaluation-source',
          'The selected TDF page is not compatible with the compound-interest evaluation scenario',
        );
      }
      return {
        tdfId: normalizedTdfId,
        tdfName: adminTestTdfName(tdf),
        pageId: normalizedPageId,
        display: page.display,
      };
    },

    getAdminApiKeyAlternativeMetadata: async function(this: MethodContext) {
      await deps.requireAdminUser(this.userId, 'Only admins can read API key alternative settings');
      const doc = await deps.DynamicSettings.findOneAsync({ key: ADMIN_API_KEY_SETTINGS_KEY });
      return summarizeAdminApiKeySettings(doc, deps.decryptData);
    },

    saveAdminApiKeyAlternative: async function(
      this: MethodContext,
      provider: AdminApiKeyProvider,
      params: {
        apiKey?: unknown;
        model?: unknown;
        reasoningLevel?: unknown;
        prefixCachingEnabled?: unknown;
      } = {},
    ) {
      check(provider, String);
      check(params, {
        apiKey: Match.Maybe(String),
        model: Match.Maybe(String),
        reasoningLevel: Match.Maybe(String),
        prefixCachingEnabled: Match.Maybe(Boolean),
      });
      await deps.requireAdminUser(this.userId, 'Only admins can save API key alternatives');
      if (!deps.encryptData) {
        throw new Meteor.Error('encryption-unavailable', 'API key encryption is unavailable');
      }
      const providerField = ADMIN_API_KEY_PROVIDER_FIELDS[provider];
      if (!providerField) {
        throw new Meteor.Error('invalid-provider', 'Unknown API key alternative provider');
      }

      const now = new Date();
      const setFields: UnknownRecord = {
        updatedAt: now,
        [`value.${providerField}.updatedBy`]: this.userId || null,
      };
      let openRouterReasoningLevel: OpenRouterReasoningLevel | null = null;
      const apiKey = normalizeAdminApiKey(params?.apiKey, provider);
      if (apiKey) {
        setFields[`value.${providerField}.keyEncrypted`] = deps.encryptData(apiKey);
        setFields[`value.${providerField}.keyUpdatedAt`] = now;
      }
      if (provider === 'openrouter') {
        const model = normalizeAdminOpenRouterModel(params?.model);
        openRouterReasoningLevel = normalizeOpenRouterReasoningLevel(
          params?.reasoningLevel as OpenRouterReasoningLevel | undefined,
          'Admin OpenRouter reasoning level',
        );
        await validateAdminOpenRouterModelReasoningSelection(deps, model, openRouterReasoningLevel);
        setFields['value.openRouter.model'] = model;
        setFields['value.openRouter.modelUpdatedAt'] = now;
        setFields['value.openRouter.reasoningLevel'] = openRouterReasoningLevel;
        setFields['value.openRouter.reasoningLevelUpdatedAt'] = now;
        if (typeof params?.prefixCachingEnabled === 'boolean') {
          setFields['value.openRouter.prefixCachingEnabled'] = params.prefixCachingEnabled;
          setFields['value.openRouter.prefixCachingUpdatedAt'] = now;
        }
      }
      if (!apiKey && provider !== 'openrouter') {
        throw new Meteor.Error('missing-api-key', 'API key is required');
      }

      await writeAdminApiKeySettings(deps, { $set: setFields, $setOnInsert: { key: ADMIN_API_KEY_SETTINGS_KEY } });
      await deps.writeAuditLog('admin.apiKeyAlternativeSaved', this.userId || null, null, {
        provider,
        keyUpdated: Boolean(apiKey),
        modelUpdated: provider === 'openrouter',
        reasoningLevelUpdated: provider === 'openrouter',
        prefixCachingUpdated: provider === 'openrouter'
          && typeof params?.prefixCachingEnabled === 'boolean',
        ...(provider === 'openrouter'
          ? {
            reasoningLevel: openRouterReasoningLevel,
            prefixCachingEnabled: params?.prefixCachingEnabled === true,
          }
          : {}),
      });
      const doc = await deps.DynamicSettings.findOneAsync({ key: ADMIN_API_KEY_SETTINGS_KEY });
      return summarizeAdminApiKeySettings(doc, deps.decryptData);
    },

    deleteAdminApiKeyAlternative: async function(this: MethodContext, provider: AdminApiKeyProvider) {
      check(provider, String);
      await deps.requireAdminUser(this.userId, 'Only admins can delete API key alternatives');
      const providerField = ADMIN_API_KEY_PROVIDER_FIELDS[provider];
      if (!providerField) {
        throw new Meteor.Error('invalid-provider', 'Unknown API key alternative provider');
      }
      const now = new Date();
      await writeAdminApiKeySettings(deps, {
        $set: {
          updatedAt: now,
          [`value.${providerField}.updatedBy`]: this.userId || null,
        },
        $unset: {
          [`value.${providerField}.keyEncrypted`]: '',
          [`value.${providerField}.keyUpdatedAt`]: '',
        },
        $setOnInsert: { key: ADMIN_API_KEY_SETTINGS_KEY },
      });
      await deps.writeAuditLog('admin.apiKeyAlternativeDeleted', this.userId || null, null, { provider });
      const doc = await deps.DynamicSettings.findOneAsync({ key: ADMIN_API_KEY_SETTINGS_KEY });
      return summarizeAdminApiKeySettings(doc, deps.decryptData);
    },

    userAdminNewsEmailRecipients: async function(this: MethodContext) {
      await deps.requireAdminUser(this.userId, 'Only admins can compose news emails');

      const users = await deps.usersCollection.find(
        { $or: [{ email_canonical: { $type: 'string' } }, { 'emails.0.address': { $type: 'string' } }] },
        { fields: { email_canonical: 1, emails: { $slice: 1 }, _id: 0 } },
      ).fetchAsync();

      const recipients = new Set<string>();
      for (const user of users) {
        const address = trimString(user.email_canonical || user.emails?.[0]?.address).toLowerCase();
        if (deps.isValidEmailAddress(address)) recipients.add(address);
      }
      const emails = [...recipients].sort((a, b) => a.localeCompare(b));
      await deps.writeAuditLog('admin.newsEmailComposeRequested', this.userId || null, null, {
        recipientCount: emails.length,
      });

      return {
        emails,
        count: emails.length,
      };
    },

    userAdminRoleChange: async function(this: MethodContext, targetUserId: string, roleAction: string, roleName: string) {
      deps.serverConsole('userAdminRoleChange request received:', { roleAction, roleName });
      await deps.requireAdminUser(this.userId, 'You are not authorized to do that', 'not-authorized');

      const normalizedTargetUserId = trimString(targetUserId);
      const normalizedRoleAction = trimString(roleAction).toLowerCase();
      const normalizedRoleName = trimString(roleName);

      if (!normalizedTargetUserId) {
        throw new Meteor.Error('invalid-args', 'Invalid: blank user ID not allowed');
      }
      if (!['add', 'remove'].includes(normalizedRoleAction)) {
        throw new Meteor.Error('invalid-args', 'Invalid: unknown requested action');
      }
      if (!['admin', 'teacher'].includes(normalizedRoleName)) {
        throw new Meteor.Error('invalid-args', 'Invalid: unknown requested role');
      }

      const targetUser = await deps.usersCollection.findOneAsync({ _id: normalizedTargetUserId });
      if (!targetUser) {
        throw new Meteor.Error('not-found', 'Invalid: could not find that user');
      }

      if (normalizedRoleAction === 'remove') {
        if (normalizedRoleName === 'admin' && normalizedTargetUserId === this.userId) {
          throw new Meteor.Error('admin-self-demotion', 'Another administrator must remove your admin role.');
        }
        const settings = Meteor.settings as any;
        if (roleGrantedBySettings(settings.initRoles, normalizedRoleName as 'admin' | 'teacher', targetUser,
          deps.isValidEmailAddress, settings.owner)) {
          throw new Meteor.Error('role-granted-by-settings', 'Site settings grant this role. Remove the setting before removing the role in User Admin.');
        }
      }
      const targetUsername = targetUser?.username;

      if (normalizedRoleAction === 'add') {
        await Roles.addUsersToRolesAsync(normalizedTargetUserId, normalizedRoleName);
      } else {
        await Roles.removeUsersFromRolesAsync(normalizedTargetUserId, normalizedRoleName);
      }

      const targetRoles = {
        admin: await Roles.userIsInRoleAsync(normalizedTargetUserId, ['admin']),
        teacher: await Roles.userIsInRoleAsync(normalizedTargetUserId, ['teacher']),
      };

      deps.serverConsole('Role change complete:', normalizedRoleAction, normalizedRoleName);

      return {
        RESULT: 'SUCCESS',
        targetUserId: normalizedTargetUserId,
        targetUsername,
        roleAction: normalizedRoleAction,
        roleName: normalizedRoleName,
        targetRoles,
      };
    },

    userAdminDeleteUser: async function(this: MethodContext, targetUserId: string) {
      await deps.requireAdminUser(this.userId, 'Only admins can delete users');

      const normalizedTargetUserId = trimString(targetUserId);
      if (!normalizedTargetUserId) {
        throw new Meteor.Error('invalid-args', 'Invalid: blank user ID not allowed');
      }
      if (normalizedTargetUserId === this.userId) {
        throw new Meteor.Error('delete-user-blocked', 'You cannot delete your own account from User Admin.');
      }

      const targetUser = await deps.usersCollection.findOneAsync({ _id: normalizedTargetUserId });
      if (!targetUser) {
        throw new Meteor.Error('not-found', 'Invalid: could not find that user');
      }

      const settings = Meteor.settings as any;
      if ((['admin', 'teacher'] as const).some(role =>
        roleGrantedBySettings(settings.initRoles, role, targetUser, deps.isValidEmailAddress, settings.owner))) {
        throw new Meteor.Error('delete-user-configured', 'Remove the account from site role settings before deleting it.');
      }
      const blockingReasons = await getUserDeletionBlockingReasons(deps, normalizedTargetUserId);
      if (blockingReasons.length > 0) {
        throw new Meteor.Error(
          'delete-user-blocked',
          `This user cannot be deleted yet because the account ${blockingReasons.join(', ')}.`
        );
      }

      await removeUserOwnedData(deps, normalizedTargetUserId);
      await deps.removeSparcFigureUserDecisions(normalizedTargetUserId);
      await deps.removeSimulationResearchUserRecords(normalizedTargetUserId);
      await Roles.setUserRolesAsync(normalizedTargetUserId, []);
      await deps.usersCollection.removeAsync({ _id: normalizedTargetUserId });
      deps.syncUsernameCaches(normalizedTargetUserId, '', String(targetUser?.username || ''));
      await deps.writeAuditLog('admin.userDeleted', this.userId || null, normalizedTargetUserId, {
        deletedIdentifier: deps.getUserDisplayIdentifier(targetUser),
      });

      return {
        RESULT: 'SUCCESS',
        targetUserId: normalizedTargetUserId,
        deletedIdentifier: deps.getUserDisplayIdentifier(targetUser),
      };
    },

    insertNewUsers: async function(this: MethodContext, filename: string, filecontents: string) {
      await deps.requireAdminUser(this.userId, 'Only admins can bulk import users');
      deps.serverConsole('insertNewUsers: ' + filename);

      check(filename, String);
      check(filecontents, String);
      const parsed = Papa.parse(filecontents, { delimiter: ',' });
      if (parsed.errors.length) {
        throw new Meteor.Error('invalid-roster-csv', 'The roster contains invalid CSV quoting');
      }

      const errors: Array<{ row: number; error: string }> = [];
      const skippedRows: number[] = [];
      let created = 0;
      const rows = parsed.data.slice(1);
      deps.serverConsole('insertNewUsers parsed row count:', rows.length);

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        if (row.every(value => value === '')) {
          continue;
        }

        const username = typeof row[0] === 'string' ? row[0] : '';
        const password = typeof row[1] === 'string' ? row[1] : '';

        try {
          const outcome = await createRosterAccount(deps, this.userId!, username, password);
          if (outcome === 'skipped') skippedRows.push(rowNumber);
          else created++;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          deps.serverConsole('Bulk user creation failed for one row');
          errors.push({ row: rowNumber, error: message });
        }
      }

      deps.serverConsole('Bulk user creation error count:', errors.length);
      await deps.writeAuditLog('admin.bulkImportUsers', this.userId || null, null, {
        fileName: filename,
        rowCount: rows.length,
        created, skipped: skippedRows.length, errorCount: errors.length,
      });
      return { created, skippedRows, errors };
    },
  };
}
