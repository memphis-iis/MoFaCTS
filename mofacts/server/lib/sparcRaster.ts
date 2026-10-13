import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../common/lib/sparcPromptImage';

const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
/** Bound decoding and whitelist raster signatures; never admit SVG or arbitrary uploaded content. */
export function parseSparcRaster(mediaType: unknown, base64: unknown) {
  if (typeof mediaType !== 'string' || !extensions[mediaType] || typeof base64 !== 'string'
    || base64.length > Math.ceil(SPARC_PROMPT_IMAGE_SETTINGS.maxBytes / 3) * 4
    || !/^[a-zA-Z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error('SPARC image requires a PNG, JPEG or WebP raster of at most 8 MB');
  }
  const bytes = Buffer.from(base64, 'base64');
  const validHeader = mediaType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mediaType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!validHeader || bytes.length > SPARC_PROMPT_IMAGE_SETTINGS.maxBytes) throw new Error('SPARC image bytes do not match their raster format');
  return { bytes, mediaType, extension: extensions[mediaType]! };
}
