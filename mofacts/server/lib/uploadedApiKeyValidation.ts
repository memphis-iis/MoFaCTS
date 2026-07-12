import { Meteor } from 'meteor/meteor';

export type UploadedApiKeyField = 'openRouterApiKey' | 'speechAPIKey' | 'textToSpeechAPIKey';

const API_KEY_FORMATS: Record<UploadedApiKeyField, RegExp> = {
  openRouterApiKey: /^sk-[0-9A-Za-z_-]{16,}$/,
  speechAPIKey: /^AIza[0-9A-Za-z_-]{20,}$/,
  textToSpeechAPIKey: /^AIza[0-9A-Za-z_-]{20,}$/,
};

export function validateAndEncryptUploadedApiKey(params: {
  encryptData: (value: string) => string;
  field: UploadedApiKeyField;
  value: unknown;
}): string {
  const value = typeof params.value === 'string' ? params.value.trim() : '';
  if (!value || !API_KEY_FORMATS[params.field].test(value)) {
    throw new Meteor.Error(
      'invalid-uploaded-api-key',
      `${params.field} contains a placeholder or malformed provider key. Remove the field to use the configured admin-level key, or supply a valid provider key.`,
    );
  }
  return params.encryptData(value);
}
