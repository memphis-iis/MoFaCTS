type UploadIntegrity = {
  expectedSize: number;
  sha256?: string;
};

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function getUploadIntegrity(file: File): Promise<UploadIntegrity> {
  const expectedSize = Number.isFinite(file.size) ? file.size : 0;
  const cryptoSubtle = globalThis.crypto?.subtle;
  if (!cryptoSubtle || typeof file.arrayBuffer !== 'function') {
    return { expectedSize };
  }

  try {
    const digest = await cryptoSubtle.digest('SHA-256', await file.arrayBuffer());
    return {
      expectedSize,
      sha256: toHex(digest)
    };
  } catch (_error) {
    return { expectedSize };
  }
}
