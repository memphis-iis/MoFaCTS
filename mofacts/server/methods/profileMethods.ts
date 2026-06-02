import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { requireAuthenticatedUser } from '../lib/methodAuthorization';
import {
  findProfileAvatarIcon,
  isSupportedProfileAvatarImageMime,
  normalizeProfileAvatarType,
  PROFILE_AVATAR_IMAGE_MAX_BYTES,
  PROFILE_AVATAR_IMAGE_MAX_DATA_URL_LENGTH,
  type ProfileAvatarType,
} from '../../common/profileAvatar';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
};

type ProfileMethodsDeps = {
  usersCollection: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
  };
  encryptData: (value: string) => string;
  decryptData: (value: string) => string;
};

type OpenRouterTestStatus =
  | 'Connection successful'
  | 'Invalid OpenRouter key'
  | 'Model not found'
  | 'Billing or quota problem'
  | 'Rate limited'
  | 'OpenRouter unavailable'
  | 'Unknown error';

const PROFILE_NAME_MAX_LENGTH = 100;
const DISPLAY_NAME_MAX_LENGTH = 60;
const OPENROUTER_MODEL_MAX_LENGTH = 160;
const OPENROUTER_KEY_MAX_LENGTH = 4096;
const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DATA_URL_PATTERN = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/;

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

function normalizeProfileText(value: unknown, maxLength: number, fieldLabel: string): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new Meteor.Error('invalid-profile-field', `${fieldLabel} must be text`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Meteor.Error('invalid-profile-field', `${fieldLabel} must be ${maxLength} characters or fewer`);
  }
  if (hasControlCharacters(trimmed)) {
    throw new Meteor.Error('invalid-profile-field', `${fieldLabel} cannot contain control characters`);
  }
  if (/[<>]/.test(trimmed)) {
    throw new Meteor.Error('invalid-profile-field', `${fieldLabel} cannot contain HTML`);
  }
  return trimmed;
}

function normalizeOpenRouterModel(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new Meteor.Error('invalid-openrouter-model', 'Default OpenRouter model must be text');
  }
  const trimmed = value.trim();
  if (trimmed.length > OPENROUTER_MODEL_MAX_LENGTH) {
    throw new Meteor.Error('invalid-openrouter-model', `Default OpenRouter model must be ${OPENROUTER_MODEL_MAX_LENGTH} characters or fewer`);
  }
  if (hasControlCharacters(trimmed) || /[<>\s]/.test(trimmed)) {
    throw new Meteor.Error('invalid-openrouter-model', 'Default OpenRouter model contains unsupported characters');
  }
  return trimmed;
}

function normalizeOpenRouterKey(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new Meteor.Error('invalid-openrouter-key', 'OpenRouter API key must be text');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length > OPENROUTER_KEY_MAX_LENGTH) {
    throw new Meteor.Error('invalid-openrouter-key', 'OpenRouter API key is too long');
  }
  if (hasControlCharacters(trimmed) || /\s/.test(trimmed)) {
    throw new Meteor.Error('invalid-openrouter-key', 'OpenRouter API key contains unsupported whitespace or control characters');
  }
  return trimmed;
}

function validateAvatarImageData(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Meteor.Error('invalid-avatar-image', 'Avatar image is required');
  }
  const trimmed = value.trim();
  if (trimmed.length > PROFILE_AVATAR_IMAGE_MAX_DATA_URL_LENGTH) {
    throw new Meteor.Error('invalid-avatar-image', 'Avatar image is too large');
  }
  const match = trimmed.match(DATA_URL_PATTERN);
  if (!match) {
    throw new Meteor.Error('invalid-avatar-image', 'Avatar image must be a base64 image data URL');
  }
  const [, rawMimeType, base64] = match;
  if (!rawMimeType || !base64) {
    throw new Meteor.Error('invalid-avatar-image', 'Avatar image must be a base64 image data URL');
  }
  const mimeType = rawMimeType.toLowerCase();
  if (!isSupportedProfileAvatarImageMime(mimeType)) {
    throw new Meteor.Error('invalid-avatar-image', 'Avatar image must be JPEG, PNG, or WebP');
  }
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const byteLength = Math.floor((base64.length * 3) / 4) - padding;
  if (byteLength <= 0 || byteLength > PROFILE_AVATAR_IMAGE_MAX_BYTES) {
    throw new Meteor.Error('invalid-avatar-image', 'Avatar image is too large');
  }
  return `data:${mimeType};base64,${base64}`;
}

function openRouterStatusForResponse(status: number, bodyText: string): OpenRouterTestStatus {
  const lowerBody = bodyText.toLowerCase();
  if (status === 401 || status === 403) return 'Invalid OpenRouter key';
  if (status === 404 || lowerBody.includes('model') && lowerBody.includes('not found')) return 'Model not found';
  if (status === 402 || lowerBody.includes('billing') || lowerBody.includes('quota') || lowerBody.includes('credits')) return 'Billing or quota problem';
  if (status === 429) return 'Rate limited';
  if (status >= 500) return 'OpenRouter unavailable';
  return 'Unknown error';
}

async function testOpenRouterKey(apiKey: string, model: string): Promise<{ success: boolean; status: OpenRouterTestStatus }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'MoFaCTS Profile OpenRouter Test',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 3,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      return { success: false, status: openRouterStatusForResponse(response.status, responseText) };
    }
    return { success: true, status: 'Connection successful' };
  } catch (_error: unknown) {
    return { success: false, status: 'OpenRouter unavailable' };
  } finally {
    clearTimeout(timeout);
  }
}

async function getSavedOpenRouterKey(deps: ProfileMethodsDeps, userId: string): Promise<string> {
  const user = await deps.usersCollection.findOneAsync(
    { _id: userId },
    { fields: { 'services.openRouter.keyEncrypted': 1 } }
  );
  const encryptedKey = user?.services?.openRouter?.keyEncrypted;
  if (typeof encryptedKey !== 'string' || !encryptedKey) {
    return '';
  }
  return deps.decryptData(encryptedKey);
}

export function createProfileMethods(deps: ProfileMethodsDeps) {
  return {
    updateOwnProfile: async function(this: MethodContext, params: unknown) {
      check(params, {
        name: Match.Maybe(String),
        displayName: Match.Maybe(String),
        avatarType: Match.Maybe(Match.OneOf('initials', 'icon', 'image')),
        avatarIconId: Match.Maybe(Match.OneOf(String, null)),
        avatarImageData: Match.Maybe(Match.OneOf(String, null)),
      });
      const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to update your profile', 401);
      const data = params as {
        name?: string;
        displayName?: string;
        avatarType?: ProfileAvatarType;
        avatarIconId?: string | null;
        avatarImageData?: string | null;
      };
      const name = normalizeProfileText(data.name, PROFILE_NAME_MAX_LENGTH, 'Name');
      const displayName = normalizeProfileText(data.displayName, DISPLAY_NAME_MAX_LENGTH, 'Display name');
      const avatarType = normalizeProfileAvatarType(data.avatarType);
      const setFields: UnknownRecord = {
        'profile.name': name,
        'profile.displayName': displayName,
        'profile.avatarType': avatarType,
        'profile.updatedAt': new Date(),
      };
      const unsetFields: UnknownRecord = {};

      if (avatarType === 'icon') {
        const icon = findProfileAvatarIcon(data.avatarIconId);
        if (!icon) {
          throw new Meteor.Error('invalid-avatar-icon', 'Choose a supported avatar icon');
        }
        setFields['profile.avatarIconId'] = icon.id;
        unsetFields['profile.avatarImageData'] = '';
      } else if (avatarType === 'image') {
        setFields['profile.avatarImageData'] = validateAvatarImageData(data.avatarImageData);
        unsetFields['profile.avatarIconId'] = '';
      } else {
        unsetFields['profile.avatarIconId'] = '';
        unsetFields['profile.avatarImageData'] = '';
      }

      const modifier: UnknownRecord = { $set: setFields };
      if (Object.keys(unsetFields).length > 0) {
        modifier.$unset = unsetFields;
      }

      await deps.usersCollection.updateAsync({ _id: userId }, modifier);
      return { success: true };
    },

    updateOwnOpenRouterSettings: async function(this: MethodContext, params: unknown) {
      check(params, {
        apiKey: Match.Maybe(String),
        model: Match.Maybe(String),
      });
      const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to update OpenRouter settings', 401);
      const data = params as { apiKey?: string; model?: string };
      const apiKey = normalizeOpenRouterKey(data.apiKey);
      const model = normalizeOpenRouterModel(data.model);
      const now = new Date();
      const setFields: UnknownRecord = {
        'profile.openRouterDefaultModel': model,
        'profile.openRouterUpdatedAt': now,
      };
      if (apiKey) {
        setFields['services.openRouter.keyEncrypted'] = deps.encryptData(apiKey);
        setFields['services.openRouter.keyUpdatedAt'] = now;
        setFields['profile.openRouterHasKey'] = true;
        setFields['profile.openRouterKeyUpdatedAt'] = now;
      }
      await deps.usersCollection.updateAsync({ _id: userId }, { $set: setFields });
      return { success: true, hasOpenRouterKey: apiKey ? true : undefined };
    },

    deleteOwnOpenRouterKey: async function(this: MethodContext) {
      const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to delete your OpenRouter key', 401);
      await deps.usersCollection.updateAsync({ _id: userId }, {
        $set: {
          'profile.openRouterHasKey': false,
          'profile.openRouterUpdatedAt': new Date(),
        },
        $unset: {
          'profile.openRouterKeyUpdatedAt': '',
          'services.openRouter.keyEncrypted': '',
          'services.openRouter.keyUpdatedAt': '',
        },
      });
      return { success: true };
    },

    testOwnOpenRouterSettings: async function(this: MethodContext, params: unknown) {
      check(params, {
        apiKey: Match.Maybe(String),
        model: Match.Maybe(String),
      });
      const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to test OpenRouter settings', 401);
      const data = params as { apiKey?: string; model?: string };
      const apiKey = normalizeOpenRouterKey(data.apiKey) || await getSavedOpenRouterKey(deps, userId);
      const model = normalizeOpenRouterModel(data.model);
      if (!apiKey) {
        return { success: false, status: 'missing-key', message: 'OpenRouter API key is required' };
      }
      if (!model) {
        return { success: false, status: 'missing-model', message: 'Default OpenRouter model is required' };
      }

      const result = await testOpenRouterKey(apiKey, model);
      await deps.usersCollection.updateAsync({ _id: userId }, {
        $set: {
          'profile.openRouterDefaultModel': model,
          'profile.openRouterLastTestedAt': new Date(),
          'profile.openRouterLastTestStatus': result.status,
        },
      });
      return { success: result.success, status: result.status, message: result.status };
    },
  };
}
