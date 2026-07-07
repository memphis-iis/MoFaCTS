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
import { requireTargetUiLocale } from '../../common/lib/interfaceLocales';

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

const PROFILE_NAME_MAX_LENGTH = 100;
const DISPLAY_NAME_MAX_LENGTH = 60;
const OPENROUTER_MODEL_MAX_LENGTH = 160;
const OPENROUTER_KEY_MAX_LENGTH = 4096;
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
    throw new Meteor.Error('invalid-openrouter-model', 'OpenRouter model must be text');
  }
  const trimmed = value.trim();
  if (trimmed.length > OPENROUTER_MODEL_MAX_LENGTH) {
    throw new Meteor.Error('invalid-openrouter-model', `OpenRouter model must be ${OPENROUTER_MODEL_MAX_LENGTH} characters or fewer`);
  }
  if (hasControlCharacters(trimmed) || /[<>\s]/.test(trimmed)) {
    throw new Meteor.Error('invalid-openrouter-model', 'OpenRouter model contains unsupported characters');
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

export function createProfileMethods(deps: ProfileMethodsDeps) {
  return {
    updateOwnProfile: async function(this: MethodContext, params: unknown) {
      check(params, {
        name: Match.Maybe(String),
        displayName: Match.Maybe(String),
        uiLocale: Match.Maybe(String),
        avatarType: Match.Maybe(Match.OneOf('initials', 'icon', 'image')),
        avatarIconId: Match.Maybe(Match.OneOf(String, null)),
        avatarImageData: Match.Maybe(Match.OneOf(String, null)),
      });
      const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to update your profile', 401);
      const data = params as {
        name?: string;
        displayName?: string;
        uiLocale?: string;
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

      if (data.uiLocale !== undefined) {
        setFields['profile.uiLocale'] = requireTargetUiLocale(data.uiLocale);
      }

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
      const unsetFields: UnknownRecord = {};
      if (apiKey) {
        setFields['profile.openRouterHasKey'] = true;
        setFields['profile.openRouterKeyUpdatedAt'] = now;
        setFields['services.openRouter.keyEncrypted'] = deps.encryptData(apiKey);
        setFields['services.openRouter.keyUpdatedAt'] = now;
      } else {
        const existingUser = await deps.usersCollection.findOneAsync({ _id: userId }, {
          fields: {
            'profile.openRouterHasKey': 1,
            'services.openRouter.keyEncrypted': 1,
          },
        });
        setFields['profile.openRouterHasKey'] = Boolean(existingUser?.services?.openRouter?.keyEncrypted || existingUser?.profile?.openRouterHasKey);
      }
      const modifier: UnknownRecord = { $set: setFields };
      if (Object.keys(unsetFields).length > 0) {
        modifier.$unset = unsetFields;
      }
      await deps.usersCollection.updateAsync({ _id: userId }, modifier);
      return { success: true, hasOpenRouterKey: Boolean(setFields['profile.openRouterHasKey']) };
    },

    getOwnOpenRouterSettings: async function(this: MethodContext) {
      const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to read OpenRouter settings', 401);
      const user = await deps.usersCollection.findOneAsync({ _id: userId }, {
        fields: {
          'profile.openRouterDefaultModel': 1,
          'profile.openRouterHasKey': 1,
          'services.openRouter.keyEncrypted': 1,
        },
      });
      return {
        model: String(user?.profile?.openRouterDefaultModel || '').trim(),
        hasOpenRouterKey: Boolean(user?.services?.openRouter?.keyEncrypted || user?.profile?.openRouterHasKey),
      };
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
      void userId;
      const data = params as { apiKey?: string; model?: string };
      const apiKey = normalizeOpenRouterKey(data.apiKey);
      normalizeOpenRouterModel(data.model);
      if (apiKey) {
        await deps.usersCollection.updateAsync({ _id: userId }, {
          $set: {
            'profile.openRouterHasKey': true,
            'profile.openRouterKeyUpdatedAt': new Date(),
            'services.openRouter.keyEncrypted': deps.encryptData(apiKey),
            'services.openRouter.keyUpdatedAt': new Date(),
          },
        });
      }
      const currentUser = await deps.usersCollection.findOneAsync({ _id: userId }, {
        fields: {
          'profile.openRouterHasKey': 1,
          'services.openRouter.keyEncrypted': 1,
        },
      });
      const hasStoredKey = Boolean(currentUser?.services?.openRouter?.keyEncrypted || currentUser?.profile?.openRouterHasKey);
      const result = {
        success: hasStoredKey,
        status: 'server-stored-openrouter-key',
        message: hasStoredKey
          ? 'OpenRouter key is saved on the server.'
          : 'OpenRouter API key is required',
      };
      await deps.usersCollection.updateAsync({ _id: userId }, {
        $set: {
          'profile.openRouterLastTestedAt': new Date(),
          'profile.openRouterLastTestStatus': result.message,
        },
      });
      return result;
    },
  };
}
