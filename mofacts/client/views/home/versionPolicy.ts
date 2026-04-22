export type VersionMeta = {
  tdfId: string;
  lineageId: string | null;
  versionMajor: number | null;
  publishedAtMs: number | null;
  isPublished: boolean | null;
};

type VersionPolicyDecision = {
  passes: boolean;
  metadataInvalid: boolean;
  reason: string;
};

function hasValidVersionMeta(meta: VersionMeta | undefined): boolean {
  return !!(meta?.lineageId && meta.versionMajor !== null);
}

export function evaluateDashboardVersionPolicy(params: {
  tdfId: string;
  isAssigned: boolean;
  hasMeaningfulProgress: boolean;
  versionMeta: VersionMeta | undefined;
  currentVersionByLineage: Map<string, string>;
}): VersionPolicyDecision {
  const { tdfId, isAssigned, hasMeaningfulProgress, versionMeta, currentVersionByLineage } = params;
  const validMeta = hasValidVersionMeta(versionMeta);

  if (!validMeta) {
    if (isAssigned) {
      return {
        passes: true,
        metadataInvalid: true,
        reason: 'assignment-override-metadata-invalid',
      };
    }
    if (hasMeaningfulProgress) {
      return {
        passes: true,
        metadataInvalid: true,
        reason: 'inflight-metadata-invalid',
      };
    }
    return {
      passes: false,
      metadataInvalid: true,
      reason: 'metadata-invalid-no-progress',
    };
  }

  const currentTdfForLineage = currentVersionByLineage.get(versionMeta!.lineageId!);
  const isCurrentVersion = currentTdfForLineage === tdfId;
  if (!isCurrentVersion && !hasMeaningfulProgress && !isAssigned) {
    return {
      passes: false,
      metadataInvalid: false,
      reason: 'legacy-without-progress',
    };
  }

  return {
    passes: true,
    metadataInvalid: false,
    reason: isCurrentVersion ? 'current-version' : 'legacy-with-progress',
  };
}
