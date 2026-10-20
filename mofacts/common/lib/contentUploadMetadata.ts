/** DDP-only metadata. No backing Mongo collection and no authored schema changes. */
export const CONTENT_UPLOAD_METADATA_COLLECTION = 'content_upload_metadata';
export const CONTENT_UPLOAD_CACHE_VERSION = 1;
export const CONTENT_UPLOAD_BATCH_SIZE = 200;

export type ContentUploadMetadata = {
  _id: string;
  userId: string;
  kind: 'tdf' | 'stim' | 'count';
  root?: boolean;
  data: Record<string, any>;
};

export type ContentUploadSnapshot = {
  version: number;
  userId: string;
  generatedAt: number;
  records: ContentUploadMetadata[];
};

export function stimuliSetCandidates(value: unknown): Array<string | number> {
  if (value === null || value === undefined || String(value).trim() === '') return [];
  const text = String(value).trim();
  const number = Number(text);
  return Number.isFinite(number) ? [...new Set([value, text, number])] as Array<string | number> : [text];
}

export function stimuliSetCountKey(value: string | number): string {
  return `${typeof value}:${String(value)}`;
}

/** Projection limits both observation and transport; credentials become presence flags. */
export const CONTENT_UPLOAD_TDF_FIELDS = {
  ownerId: 1, accessors: 1, packageFile: 1, packageAssetId: 1, stimuliSetId: 1, conditionCounts: 1,
  'content.fileName': 1,
  'content.tdfs.tutor.setspec.lessonname': 1,
  'content.tdfs.tutor.setspec.userselect': 1,
  'content.tdfs.tutor.setspec.textToSpeechAPIKey': 1,
  'content.tdfs.tutor.setspec.speechAPIKey': 1,
  'content.tdfs.tutor.setspec.openRouterApiKey': 1,
  'content.tdfs.tutor.setspec.condition': 1,
  'content.tdfs.tutor.setspec.conditionTdfIds': 1,
  'content.tdfs.tutor.setspec.stimulusfile': 1,
  'content.tdfs.tutor.setspec.experimentTarget': 1,
  'content.tdfs.tutor.setspec.aiVisibilityLockReason': 1,
  'content.tdfs.tutor.setspec.contentLanguage': 1,
  'content.tdfs.tutor.setspec.recommendedUiLocales': 1,
  'content.tdfs.tutor.setspec.translationStatus': 1,
  'content.tdfs.tutor.unit.learningsession.stimulusfile': 1,
  'content.tdfs.tutor.unit.sparcsession.pageId': 1,
  'rawStimuliFile.setspec.sparcPages.pageId': 1,
  'rawStimuliFile.setspec.sparcPages.display.unitType': 1,
} as const;

export function uploadMetadataReferences(tdf: Record<string, any>) {
  const tutor = tdf.content?.tdfs?.tutor;
  const setspec = tutor?.setspec;
  const conditions: string[] = (Array.isArray(setspec?.conditionTdfIds) ? setspec.conditionTdfIds : [])
    .filter((id: unknown) => typeof id === 'string' && id);
  const files: string[] = [setspec?.stimulusfile, ...(Array.isArray(tutor?.unit) ? tutor.unit : [])
    .map((unit: any) => unit?.learningsession?.stimulusfile)]
    .filter((name: unknown) => typeof name === 'string' && name.trim()).map((name: string) => name.trim());
  return { conditions, files, sets: stimuliSetCandidates(tdf.stimuliSetId) };
}

export function publicUploadMetadata(tdf: Record<string, any>): Record<string, any> {
  const data = JSON.parse(JSON.stringify(tdf));
  delete data.accessors;
  const setspec = data.content?.tdfs?.tutor?.setspec;
  data.hasAPIKeys = Boolean(setspec?.textToSpeechAPIKey || setspec?.speechAPIKey || setspec?.openRouterApiKey);
  if (setspec) {
    delete setspec.textToSpeechAPIKey;
    delete setspec.speechAPIKey;
    delete setspec.openRouterApiKey;
  }
  return data;
}
