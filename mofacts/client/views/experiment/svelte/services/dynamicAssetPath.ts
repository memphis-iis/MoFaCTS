export type DynamicAssetIdentity = Record<string, unknown> & {
  _id?: unknown;
  name?: unknown;
  fileName?: unknown;
};

export function isExternalMediaPath(value: unknown): boolean {
  return /^https?:\/\//i.test(String(value || '').trim());
}

export function buildCanonicalDynamicAssetPath(
  asset: DynamicAssetIdentity,
  requestedFileName = '',
): string {
  const assetId = String(asset?._id || '').trim();
  if (!assetId) {
    throw new Error('[Media Resolver] Dynamic asset is missing its canonical _id');
  }
  const fileName = String(asset?.name || asset?.fileName || requestedFileName || 'asset').trim();
  return `/cdn/storage/Assets/${encodeURIComponent(assetId)}/original/${encodeURIComponent(fileName)}`;
}
