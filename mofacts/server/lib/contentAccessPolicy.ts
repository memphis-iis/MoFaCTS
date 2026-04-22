type TdfLike = {
  ownerId?: unknown;
  accessors?: Array<{ userId?: unknown }> | unknown;
  content?: {
    fileName?: unknown;
    tdfs?: {
      tutor?: {
        setspec?: {
          userselect?: unknown;
        };
      };
    };
  };
} | null | undefined;

function normalizeString(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function isTdfOwner(userId: unknown, tdf: TdfLike) {
  const normalizedUserId = normalizeString(userId);
  if (!normalizedUserId || !tdf) {
    return false;
  }
  return normalizeString(tdf.ownerId) === normalizedUserId;
}

function hasSharedTdfAccess(userId: unknown, tdf: TdfLike) {
  const normalizedUserId = normalizeString(userId);
  if (!normalizedUserId || !tdf || !Array.isArray(tdf.accessors)) {
    return false;
  }
  return tdf.accessors.some((entry) => normalizeString(entry?.userId) === normalizedUserId);
}

function isPublicTdf(tdf: TdfLike) {
  if (!tdf) {
    return false;
  }
  return normalizeString(tdf.content?.tdfs?.tutor?.setspec?.userselect).toLowerCase() === 'true';
}

function canViewDashboardTdf(userId: unknown, tdf: TdfLike) {
  return isTdfOwner(userId, tdf) || hasSharedTdfAccess(userId, tdf) || isPublicTdf(tdf);
}

function canAccessContentUploadTdf(userId: unknown, tdf: TdfLike) {
  return isTdfOwner(userId, tdf) || hasSharedTdfAccess(userId, tdf);
}

function canDownloadOwnedTdfData(userId: unknown, tdf: TdfLike) {
  return isTdfOwner(userId, tdf);
}

export { canAccessContentUploadTdf, canDownloadOwnedTdfData, canViewDashboardTdf, hasSharedTdfAccess, isTdfOwner };
