import type { H5PDisplayConfig } from '../types/h5p';

export const H5P_MIN_PREFERRED_HEIGHT = 240;
export const H5P_MAX_PREFERRED_HEIGHT = 900;
export const H5P_DEFAULT_PREFERRED_HEIGHT = 560;

export interface H5PValidationResult {
  valid: boolean;
  message?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeEmbedUrl(embedUrl: string, baseUrl: string): string | null {
  const trimmed = embedUrl.trim();
  if (!trimmed || trimmed.startsWith('//')) {
    return null;
  }

  try {
    const hasExplicitScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed);
    const base = new URL(baseUrl);
    const url = new URL(trimmed, baseUrl);
    if (hasExplicitScheme) {
      return url.protocol === 'https:' ? trimmed : null;
    }
    if (url.origin !== base.origin) {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

export function clampH5PPreferredHeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return H5P_DEFAULT_PREFERRED_HEIGHT;
  }
  return Math.min(H5P_MAX_PREFERRED_HEIGHT, Math.max(H5P_MIN_PREFERRED_HEIGHT, value));
}

export function validateH5PDisplayConfigPhase1(
  value: unknown,
  baseUrl = 'https://mofacts.local/'
): H5PValidationResult {
  if (!isPlainObject(value)) {
    return { valid: false, message: 'H5P display must be an object' };
  }

  if (value.sourceType !== 'external-embed') {
    return { valid: false, message: 'Phase 1 H5P supports only sourceType "external-embed"' };
  }

  if (value.completionPolicy !== 'viewed' && value.completionPolicy !== 'manual-continue') {
    return {
      valid: false,
      message: 'Phase 1 H5P supports only completionPolicy "viewed" or "manual-continue"',
    };
  }

  if (!hasNonEmptyString(value.embedUrl)) {
    return { valid: false, message: 'Phase 1 external H5P requires a non-empty embedUrl' };
  }

  if (!normalizeEmbedUrl(value.embedUrl, baseUrl)) {
    return {
      valid: false,
      message: 'H5P embedUrl must be an https URL or a same-origin relative URL',
    };
  }

  if (value.preferredHeight !== undefined) {
    if (typeof value.preferredHeight !== 'number' || !Number.isFinite(value.preferredHeight) || value.preferredHeight <= 0) {
      return { valid: false, message: 'H5P preferredHeight must be a positive finite number' };
    }
  }

  const unsupportedFields = ['scorePolicy', 'contentId', 'packageAssetId', 'library']
    .filter((field) => value[field] !== undefined && value[field] !== null && value[field] !== '');
  if (unsupportedFields.length) {
    return {
      valid: false,
      message: `Phase 1 H5P does not support ${unsupportedFields.join(', ')}`,
    };
  }

  return { valid: true };
}

export function validateH5PDisplayConfig(
  value: unknown,
  baseUrl = 'https://mofacts.local/'
): H5PValidationResult {
  if (!isPlainObject(value)) {
    return { valid: false, message: 'H5P display must be an object' };
  }

  if (value.sourceType === 'external-embed') {
    return validateH5PDisplayConfigPhase1(value, baseUrl);
  }

  if (value.sourceType !== 'self-hosted') {
    return { valid: false, message: 'H5P sourceType must be "external-embed" or "self-hosted"' };
  }

  if (!hasNonEmptyString(value.contentId)) {
    return { valid: false, message: 'Self-hosted H5P requires contentId' };
  }
  if (!hasNonEmptyString(value.packageAssetId)) {
    return { valid: false, message: 'Self-hosted H5P requires packageAssetId' };
  }
  if (!hasNonEmptyString(value.library)) {
    return { valid: false, message: 'Self-hosted H5P requires library metadata' };
  }
  if (value.completionPolicy !== 'xapi-completed' && value.completionPolicy !== 'xapi-passed') {
    return { valid: false, message: 'Self-hosted H5P requires an xAPI completionPolicy' };
  }
  if (value.scorePolicy !== 'record-only' && value.scorePolicy !== 'correct-if-passed' && value.scorePolicy !== 'correct-if-full-score') {
    return { valid: false, message: 'Self-hosted H5P requires a supported scorePolicy' };
  }
  if (value.embedUrl !== undefined && value.embedUrl !== null && value.embedUrl !== '') {
    return { valid: false, message: 'Self-hosted H5P must not configure embedUrl' };
  }
  if (value.preferredHeight !== undefined) {
    if (typeof value.preferredHeight !== 'number' || !Number.isFinite(value.preferredHeight) || value.preferredHeight <= 0) {
      return { valid: false, message: 'H5P preferredHeight must be a positive finite number' };
    }
  }

  return { valid: true };
}

export function normalizeH5PDisplayConfig(
  value: unknown,
  baseUrl = 'https://mofacts.local/'
): H5PDisplayConfig {
  const validation = validateH5PDisplayConfig(value, baseUrl);
  if (!validation.valid) {
    throw new Error(validation.message || 'Invalid H5P display config');
  }

  const config = value as Record<string, unknown>;
  if (config.sourceType === 'self-hosted') {
    return {
      sourceType: 'self-hosted',
      contentId: String(config.contentId).trim(),
      packageAssetId: String(config.packageAssetId).trim(),
      library: String(config.library).trim(),
      completionPolicy: config.completionPolicy === 'xapi-passed' ? 'xapi-passed' : 'xapi-completed',
      scorePolicy: (
        config.scorePolicy === 'correct-if-passed' ||
        config.scorePolicy === 'correct-if-full-score'
      ) ? config.scorePolicy : 'record-only',
      ...(config.preferredHeight !== undefined
        ? { preferredHeight: Number(config.preferredHeight) }
        : {}),
    };
  }

  return {
    sourceType: 'external-embed',
    embedUrl: String(config.embedUrl).trim(),
    completionPolicy: config.completionPolicy === 'viewed' ? 'viewed' : 'manual-continue',
    ...(config.preferredHeight !== undefined
      ? { preferredHeight: Number(config.preferredHeight) }
      : {}),
  };
}

export const normalizeH5PDisplayConfigPhase1 = normalizeH5PDisplayConfig;
