import { Meteor } from 'meteor/meteor';

export type ApiKeyKind = 'openrouter' | 'speech' | 'tts';
export type ApiKeySource = 'provided' | 'tdf' | 'user' | 'admin' | null;

type UserApiKeyDoc = {
  speechAPIKey?: unknown;
  ttsAPIKey?: unknown;
  textToSpeechAPIKey?: unknown;
  profile?: {
    openRouterDefaultModel?: unknown;
    openRouterHasKey?: unknown;
  };
  services?: {
    openRouter?: {
      keyEncrypted?: unknown;
    };
  };
} | null | undefined;

type TdfApiKeyDoc = {
  ownerId?: unknown;
  content?: {
    tdfs?: {
      tutor?: {
        setspec?: {
          userselect?: unknown;
          openRouterApiKey?: unknown;
          openRouterModel?: unknown;
          speechAPIKey?: unknown;
          textToSpeechAPIKey?: unknown;
        };
      };
    };
  };
} | null | undefined;

export type ApiKeyResolutionDeps = {
  getUserById: (userId: string) => Promise<UserApiKeyDoc>;
  getTdfById: (tdfId: string) => Promise<TdfApiKeyDoc>;
  getAdminApiKeySettings?: () => Promise<AdminApiKeySettingsDoc>;
  hasHistoryWithTdf: (userId: string, tdfId: string) => Promise<unknown>;
  userIsInRoleAsync: (userId: string, roles: string[]) => Promise<boolean>;
  decryptData: (value: string) => string;
};

export type ApiKeyResolutionResult = {
  apiKey: string | null;
  source: ApiKeySource;
  errors: {
    tdf?: unknown;
    user?: unknown;
    admin?: unknown;
  };
};

export type AdminApiKeyProvider = 'openrouter' | 'googleTts' | 'googleSpeech';

export type AdminApiKeyProviderSettings = {
  keyEncrypted?: unknown;
  model?: unknown;
  keyUpdatedAt?: unknown;
  modelUpdatedAt?: unknown;
  updatedBy?: unknown;
};

export type AdminApiKeySettingsValue = {
  openRouter?: AdminApiKeyProviderSettings;
  googleTts?: AdminApiKeyProviderSettings;
  googleSpeech?: AdminApiKeyProviderSettings;
};

export type AdminApiKeySettingsDoc = {
  value?: AdminApiKeySettingsValue;
} | null | undefined;

const API_KEY_FIELDS = {
  openrouter: {
    tdfField: 'openRouterApiKey',
    userField: 'services.openRouter.keyEncrypted',
    adminProvider: 'openRouter',
  },
  speech: {
    tdfField: 'speechAPIKey',
    userField: 'speechAPIKey',
    adminProvider: 'googleSpeech',
  },
  tts: {
    tdfField: 'textToSpeechAPIKey',
    userField: 'ttsAPIKey',
    adminProvider: 'googleTts',
  },
} as const satisfies Record<ApiKeyKind, { tdfField: string; userField: string; adminProvider: keyof AdminApiKeySettingsValue }>;

export const ADMIN_API_KEY_SETTINGS_KEY = 'apiKeyAlternatives';

function normalizeString(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function getEncryptedTdfApiKey(tdf: TdfApiKeyDoc, kind: ApiKeyKind) {
  const keyField = API_KEY_FIELDS[kind].tdfField;
  const value = tdf?.content?.tdfs?.tutor?.setspec?.[keyField as 'openRouterApiKey' | 'speechAPIKey' | 'textToSpeechAPIKey'];
  return normalizeString(value) || null;
}

function getEncryptedUserApiKey(user: UserApiKeyDoc, kind: ApiKeyKind) {
  if (kind === 'openrouter') {
    return normalizeString(user?.services?.openRouter?.keyEncrypted) || null;
  }
  if (kind === 'tts') {
    return normalizeString(user?.ttsAPIKey) || normalizeString(user?.textToSpeechAPIKey) || null;
  }
  const keyField = API_KEY_FIELDS[kind].userField;
  const value = user?.[keyField as 'speechAPIKey' | 'ttsAPIKey'];
  return normalizeString(value) || null;
}

function getEncryptedAdminApiKey(settings: AdminApiKeySettingsDoc, kind: ApiKeyKind) {
  const provider = API_KEY_FIELDS[kind].adminProvider;
  return normalizeString(settings?.value?.[provider]?.keyEncrypted) || null;
}

function looksLikePlaintextProviderKey(value: string, kind: ApiKeyKind) {
  if (kind === 'openrouter') {
    return value.startsWith('sk-');
  }
  return value.startsWith('AIza');
}

function decryptTdfApiKey(
  deps: Pick<ApiKeyResolutionDeps, 'decryptData'>,
  value: string,
  kind: ApiKeyKind
) {
  try {
    return deps.decryptData(value);
  } catch (error) {
    if (looksLikePlaintextProviderKey(value, kind)) {
      return value;
    }
    throw new Meteor.Error(
      'tdf-api-key-resolution-failed',
      `Could not resolve TDF ${kind} API key`,
    );
  }
}

export function getAdminOpenRouterModel(settings: AdminApiKeySettingsDoc) {
  return normalizeString(settings?.value?.openRouter?.model);
}

export function getTdfOpenRouterModel(tdf: TdfApiKeyDoc) {
  return normalizeString(tdf?.content?.tdfs?.tutor?.setspec?.openRouterModel);
}

export function getUserOpenRouterModel(user: UserApiKeyDoc) {
  return normalizeString(user?.profile?.openRouterDefaultModel);
}

export async function getUserPersonalApiKey(
  deps: ApiKeyResolutionDeps,
  userId: string | null | undefined,
  kind: ApiKeyKind
) {
  if (!userId) {
    return null;
  }

  const user = await deps.getUserById(userId);
  const encryptedKey = getEncryptedUserApiKey(user, kind);
  return encryptedKey ? deps.decryptData(encryptedKey) : null;
}

export async function getAccessibleTdfApiKey(
  deps: ApiKeyResolutionDeps,
  params: {
    userId: string | null | undefined;
    tdfId: string;
    kind: ApiKeyKind;
  }
) {
  if (!params.userId) {
    throw new Meteor.Error(401, 'Must be logged in');
  }

  const tdf = await deps.getTdfById(params.tdfId);
  if (!tdf) {
    return '';
  }

  const normalizedUserId = normalizeString(params.userId);
  const isOwner = normalizeString(tdf.ownerId) === normalizedUserId;
  const isAdminOrTeacher = await deps.userIsInRoleAsync(normalizedUserId, ['admin', 'teacher']);
  const isUserSelectTdf = normalizeString(tdf.content?.tdfs?.tutor?.setspec?.userselect).toLowerCase() === 'true';
  const hasHistory = Boolean(await deps.hasHistoryWithTdf(normalizedUserId, params.tdfId));

  if (!isOwner && !isAdminOrTeacher && !isUserSelectTdf && !hasHistory) {
    throw new Meteor.Error(403, 'Access denied to TDF API keys');
  }

  const encryptedKey = getEncryptedTdfApiKey(tdf, params.kind);
  return encryptedKey ? decryptTdfApiKey(deps, encryptedKey, params.kind) : '';
}

export async function resolvePreferredApiKey(
  deps: ApiKeyResolutionDeps,
  params: {
    userId: string | null | undefined;
    tdfId?: string | null;
    kind: ApiKeyKind;
    initialKey?: string | null;
  }
): Promise<ApiKeyResolutionResult> {
  if (!params.userId) {
    return {
      apiKey: null,
      source: null,
      errors: {},
    };
  }

  const errors: ApiKeyResolutionResult['errors'] = {};
  const directKey = normalizeString(params.initialKey);

  if (params.tdfId) {
    try {
      const tdfKey = await getAccessibleTdfApiKey(deps, {
        userId: params.userId,
        tdfId: params.tdfId,
        kind: params.kind,
      });
      if (tdfKey) {
        return {
          apiKey: tdfKey,
          source: 'tdf',
          errors,
        };
      }
    } catch (error) {
      if (error instanceof Meteor.Error && (error.error === 401 || error.error === 403)) {
        throw error;
      }
      throw error instanceof Meteor.Error ? error : new Meteor.Error(
        'tdf-api-key-resolution-failed',
        `Could not resolve TDF ${params.kind} API key`,
      );
    }
  }

  if (directKey) {
    return {
      apiKey: directKey,
      source: 'provided',
      errors,
    };
  }

  try {
    const userKey = await getUserPersonalApiKey(deps, params.userId, params.kind);
    if (userKey) {
      return {
        apiKey: userKey,
        source: 'user',
        errors,
      };
    }
  } catch (error) {
    errors.user = error;
  }

  if (deps.getAdminApiKeySettings) {
    try {
      const settings = await deps.getAdminApiKeySettings();
      const encryptedKey = getEncryptedAdminApiKey(settings, params.kind);
      if (encryptedKey) {
        return {
          apiKey: deps.decryptData(encryptedKey),
          source: 'admin',
          errors,
        };
      }
    } catch (error) {
      errors.admin = error;
    }
  }

  return {
    apiKey: null,
    source: null,
    errors,
  };
}
