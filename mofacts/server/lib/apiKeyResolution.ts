import { Meteor } from 'meteor/meteor';

type ApiKeyKind = 'speech' | 'tts';

type UserApiKeyDoc = {
  speechAPIKey?: unknown;
  ttsAPIKey?: unknown;
} | null | undefined;

type TdfApiKeyDoc = {
  ownerId?: unknown;
  content?: {
    tdfs?: {
      tutor?: {
        setspec?: {
          userselect?: unknown;
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
  hasHistoryWithTdf: (userId: string, tdfId: string) => Promise<unknown>;
  userIsInRoleAsync: (userId: string, roles: string[]) => Promise<boolean>;
  decryptData: (value: string) => string;
};

type ApiKeyResolutionResult = {
  apiKey: string | null;
  source: 'provided' | 'tdf' | 'user' | null;
  errors: {
    tdf?: unknown;
    user?: unknown;
  };
};

const API_KEY_FIELDS = {
  speech: {
    tdfField: 'speechAPIKey',
    userField: 'speechAPIKey',
  },
  tts: {
    tdfField: 'textToSpeechAPIKey',
    userField: 'ttsAPIKey',
  },
} as const satisfies Record<ApiKeyKind, { tdfField: string; userField: string }>;

function normalizeString(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function getEncryptedTdfApiKey(tdf: TdfApiKeyDoc, kind: ApiKeyKind) {
  const keyField = API_KEY_FIELDS[kind].tdfField;
  const value = tdf?.content?.tdfs?.tutor?.setspec?.[keyField as 'speechAPIKey' | 'textToSpeechAPIKey'];
  return normalizeString(value) || null;
}

function getEncryptedUserApiKey(user: UserApiKeyDoc, kind: ApiKeyKind) {
  const keyField = API_KEY_FIELDS[kind].userField;
  const value = user?.[keyField as 'speechAPIKey' | 'ttsAPIKey'];
  return normalizeString(value) || null;
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
  return encryptedKey ? deps.decryptData(encryptedKey) : '';
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
  const directKey = normalizeString(params.initialKey);
  if (directKey) {
    return {
      apiKey: directKey,
      source: 'provided',
      errors: {},
    };
  }

  if (!params.userId) {
    return {
      apiKey: null,
      source: null,
      errors: {},
    };
  }

  const errors: ApiKeyResolutionResult['errors'] = {};

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
      errors.tdf = error;
    }
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

  return {
    apiKey: null,
    source: null,
    errors,
  };
}
