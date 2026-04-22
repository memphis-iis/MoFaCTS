/**
 * Media upload loop extracted from package-upload orchestration.
 * Accepts parsed media files and saves them scoped to stimuliSetIds.
 */

import type { UploadedPackageFile } from './packageParser';

/**
 * Upload media files from a parsed package, scoped to the given stimuli set IDs.
 * Returns a map of stimSetId → (normalized media name → canonical asset path).
 */
export async function uploadPackageMedia(opts: {
  mediaFiles: UploadedPackageFile[];
  uploadStimSetIds: Set<string | number>;
  fallbackStimSetId: string | number | undefined;
  owner: string;
  saveMediaFile: (media: UploadedPackageFile, owner: string, stimSetId: string | number | null | undefined) => Promise<{ _id?: string; name?: string; link?: () => string } | null>;
  toCanonicalDynamicAssetPath: (savedMedia: { _id?: string; name?: string; link?: () => string } | null) => string;
  normalizeUploadedMediaLookupKey: (value: unknown) => string;
  serverConsole: (...args: unknown[]) => void;
}): Promise<Map<string, Map<string, string>>> {
  const {
    mediaFiles, uploadStimSetIds, fallbackStimSetId, owner,
    saveMediaFile, toCanonicalDynamicAssetPath, normalizeUploadedMediaLookupKey, serverConsole,
  } = opts;

  const uploadedMediaPathMapsByStimSetId = new Map<string, Map<string, string>>();

  serverConsole('Package media upload scopes:', Array.from(uploadStimSetIds));

  for (const media of mediaFiles) {
    if (uploadStimSetIds.size > 0) {
      for (const scopedStimSetId of uploadStimSetIds) {
        const savedMedia = await saveMediaFile(media, owner, scopedStimSetId);
        const canonicalPath = toCanonicalDynamicAssetPath(savedMedia);
        const scopedKey = String(scopedStimSetId ?? '').trim();
        if (canonicalPath && scopedKey) {
          if (!uploadedMediaPathMapsByStimSetId.has(scopedKey)) {
            uploadedMediaPathMapsByStimSetId.set(scopedKey, new Map<string, string>());
          }
          uploadedMediaPathMapsByStimSetId.get(scopedKey)?.set(
            normalizeUploadedMediaLookupKey(media.name),
            canonicalPath,
          );
        }
      }
    } else {
      const savedMedia = await saveMediaFile(media, owner, fallbackStimSetId);
      const canonicalPath = toCanonicalDynamicAssetPath(savedMedia);
      const scopedKey = String(fallbackStimSetId ?? '').trim();
      if (canonicalPath && scopedKey) {
        if (!uploadedMediaPathMapsByStimSetId.has(scopedKey)) {
          uploadedMediaPathMapsByStimSetId.set(scopedKey, new Map<string, string>());
        }
        uploadedMediaPathMapsByStimSetId.get(scopedKey)?.set(
          normalizeUploadedMediaLookupKey(media.name),
          canonicalPath,
        );
      }
    }
  }

  return uploadedMediaPathMapsByStimSetId;
}
