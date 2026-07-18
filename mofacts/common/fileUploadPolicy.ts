export type DynamicAssetUploadPurpose = 'package' | 'content-media' | 'ai-draft-media';

export type DynamicAssetUploadMeta = {
  uploadPurpose?: DynamicAssetUploadPurpose;
  tdfId?: string;
  stimuliSetId?: string | number;
  draftId?: string;
  itemId?: string;
  mediaSlotId?: string;
  public?: boolean;
  expectedSize?: number;
  sha256?: string;
};

export type DynamicAssetUploadFile = {
  name?: string;
  extension?: string;
  type?: string;
  meta?: DynamicAssetUploadMeta;
};

const ZIP_MIME_TYPES = new Set(['application/zip', 'application/x-zip-compressed', 'application/octet-stream']);
const CONTENT_MEDIA_MIME_BY_EXTENSION: Record<string, ReadonlySet<string>> = {
  jpg: new Set(['image/jpeg']),
  jpeg: new Set(['image/jpeg']),
  png: new Set(['image/png']),
  gif: new Set(['image/gif']),
  webp: new Set(['image/webp']),
  svg: new Set(['image/svg+xml']),
  bmp: new Set(['image/bmp']),
  avif: new Set(['image/avif']),
  mp3: new Set(['audio/mpeg', 'audio/mp3']),
  wav: new Set(['audio/wav', 'audio/x-wav']),
  ogg: new Set(['audio/ogg', 'video/ogg']),
  m4a: new Set(['audio/m4a', 'audio/x-m4a', 'audio/mp4']),
  aac: new Set(['audio/aac']),
  mp4: new Set(['video/mp4']),
  webm: new Set(['video/webm']),
  mov: new Set(['video/quicktime']),
};
const AI_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif']);

function fileExtension(file: DynamicAssetUploadFile): string {
  const explicit = String(file.extension || '').trim().toLowerCase().replace(/^\./, '');
  if (explicit) return explicit;
  const match = String(file.name || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

export function validateDynamicAssetUpload(file: DynamicAssetUploadFile): true | string {
  const filename = String(file.name || '');
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return 'Invalid filename - path traversal not allowed';
  }
  const purpose = file.meta?.uploadPurpose;
  if (!purpose) {
    return 'Upload purpose is required';
  }
  const extension = fileExtension(file);
  const mimeType = String(file.type || '').trim().toLowerCase();

  if (purpose === 'package') {
    if (extension !== 'zip' || !ZIP_MIME_TYPES.has(mimeType)) {
      return 'Package uploads must be ZIP files';
    }
    return true;
  }

  const allowedMimes = CONTENT_MEDIA_MIME_BY_EXTENSION[extension];
  if (!allowedMimes || !allowedMimes.has(mimeType)) {
    return 'File extension and media type do not match an approved media format';
  }

  if (purpose === 'content-media') {
    if (!String(file.meta?.tdfId || '').trim() || file.meta?.stimuliSetId === undefined || file.meta?.stimuliSetId === null) {
      return 'Content media uploads require a TDF and stimuli set';
    }
    return true;
  }

  if (purpose === 'ai-draft-media') {
    if (!AI_IMAGE_EXTENSIONS.has(extension) || !mimeType.startsWith('image/')) {
      return 'AI draft media must be an approved image file';
    }
    if (!String(file.meta?.draftId || '').trim() || !String(file.meta?.itemId || '').trim() || !String(file.meta?.mediaSlotId || '').trim()) {
      return 'AI draft media uploads require a draft, item, and media slot';
    }
    if (file.meta?.public === true) {
      return 'AI draft media must remain private until content is saved';
    }
    return true;
  }

  return 'Unsupported upload purpose';
}
