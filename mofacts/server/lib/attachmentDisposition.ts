/** RFC 6266 attachment name: an ASCII quoted name plus the full UTF-8 name. */
export function attachmentDisposition(fileName: string): string {
  if (!fileName || Array.from(fileName).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error('Download filename must be nonempty and contain no control characters');
  }
  const asciiName = fileName.replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/g, '\\$&');
  const encodedName = encodeURIComponent(fileName).replace(/['()*]/g,
    character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}
