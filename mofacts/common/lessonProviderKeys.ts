export const LESSON_PROVIDER_KEY_FIELDS = ['speechAPIKey', 'textToSpeechAPIKey', 'openRouterApiKey'] as const;

export function prepareEditorProviderKeyChanges(
  editedSettings: Record<string, unknown>,
  configuredFields: readonly string[],
  removedTutorPaths: readonly string[],
) {
  const updates: Partial<Record<typeof LESSON_PROVIDER_KEY_FIELDS[number], boolean>> = {};
  for (const field of LESSON_PROVIDER_KEY_FIELDS) {
    if (editedSettings[field]) {
      updates[field] = true;
    } else {
      delete editedSettings[field];
      if (configuredFields.includes(field) && removedTutorPaths.includes('setspec.' + field)) updates[field] = false;
    }
  }
  return updates;
}
