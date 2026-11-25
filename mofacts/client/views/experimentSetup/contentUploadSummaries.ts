import { validateConditionFamilyTutor } from '../../../common/lib/tdfIdentityContract';
import { supportsSparcVideoCatalog } from '../../../common/lib/sparcVideoCatalog';
import { stimuliSetCandidates, stimuliSetCountKey } from '../../../common/lib/contentUploadMetadata';

type TdfLike = {
  _id?: string;
  hasAPIKeys?: boolean;
  ownerId?: string;
  accessors?: Array<{ userId?: string }>;
  packageFile?: string | null;
  packageAssetId?: unknown;
  stimuliSetId?: unknown;
  conditionCounts?: unknown[];
  rawStimuliFile?: unknown;
  stimuli?: Array<Record<string, unknown>>;
  content?: {
    fileName?: string;
    tdfs?: {
      tutor?: {
        setspec?: {
          lessonname?: string;
          userselect?: string;
          textToSpeechAPIKey?: unknown;
          speechAPIKey?: unknown;
          openRouterApiKey?: unknown;
          condition?: string[];
          conditionTdfIds?: Array<string | null>;
          experimentTarget?: string;
          aiVisibilityLockReason?: string;
          contentLanguage?: string;
          recommendedUiLocales?: string[];
          translationStatus?: string;
        };
      };
    };
  };
};

export function buildContentUploadSummaries(
  tdfs: TdfLike[], resolvedConditionDocs: TdfLike[],
  assetCounts: Array<{ stimuliSetId: string | number; count: number }>,
) {
  const resolvedConditionsById = new Map<string, TdfLike>();
  for (const conditionDoc of resolvedConditionDocs) {
    const resolvedId = typeof conditionDoc?._id === 'string' ? conditionDoc._id : '';
    if (!resolvedId) {
      continue;
    }
    resolvedConditionsById.set(resolvedId, conditionDoc);
  }

  const assetCountsByStimuliSetId = new Map(assetCounts.map(row => [stimuliSetCountKey(row.stimuliSetId), row.count]));
  const summaries = [];
  for (const tdf of tdfs as TdfLike[]) {

    const setspec = tdf.content?.tdfs?.tutor?.setspec;
    const assetCount = stimuliSetCandidates(tdf.stimuliSetId)
      .reduce<number>((total, candidate) => total + (assetCountsByStimuliSetId.get(stimuliSetCountKey(candidate)) || 0), 0);
      const summary = {
      _id: tdf._id,
      ownerId: tdf.ownerId,
      packageFile: tdf.packageFile || null,
      packageAssetId: typeof tdf.packageAssetId === 'string' ? tdf.packageAssetId : null,
      stimuliSetId: tdf.stimuliSetId || null,
      lessonName: setspec?.lessonname || 'Unknown Lesson',
      fileName: tdf.content?.fileName || 'unknown.xml',
      experimentTarget: typeof setspec?.experimentTarget === 'string' ? setspec.experimentTarget : '',
      isPublic: setspec?.userselect === 'true',
      contentLanguage: typeof setspec?.contentLanguage === 'string' ? setspec.contentLanguage : '',
      recommendedUiLocales: Array.isArray(setspec?.recommendedUiLocales) ? setspec.recommendedUiLocales : [],
      translationStatus: typeof setspec?.translationStatus === 'string' ? setspec.translationStatus : '',
      publicVisibilityLocked: Boolean(setspec?.aiVisibilityLockReason),
      publicVisibilityLockReason: typeof setspec?.aiVisibilityLockReason === 'string' ? setspec.aiVisibilityLockReason : '',
      hasAPIKeys: Boolean((tdf as any).hasAPIKeys),
      supportsSparcVideoCatalog: supportsSparcVideoCatalog(tdf),
      assetCount,
      conditions: [] as Array<{ condition: string; tdfId: string | null; count: number | null; supportsSparcVideoCatalog: boolean }>,
      errors: [] as string[],
    };

    if (!setspec) {
      summary.errors.push('TDF missing required structure.');
    }

    const conditions = Array.isArray(setspec?.condition) ? setspec.condition : [];
    if (conditions.length > 0) {
      const familyValidation = validateConditionFamilyTutor(tdf.content?.tdfs?.tutor, { requireCanonicalIds: true });
      const resolvedConditionIds = familyValidation.conditionTdfIds.map((id) => resolvedConditionsById.get(id)?._id ?? null);
      if (familyValidation.errors.length > 0 || resolvedConditionIds.some((id) => !id)) {
        summary.errors.push('Condition identity repair is required before this lesson can be used.');
      }

      if (Array.isArray(tdf.conditionCounts)) {
        if (tdf.conditionCounts.length < conditions.length) {
          summary.errors.push('Condition counts length mismatch. Please click the refresh icon for this lesson.');
        }
        summary.conditions = conditions.map((conditionFilename: string, index: number) => ({
          condition: conditionFilename,
          tdfId: resolvedConditionIds[index] ?? null,
          count: typeof tdf.conditionCounts?.[index] === 'number' ? tdf.conditionCounts[index] : null,
          supportsSparcVideoCatalog: supportsSparcVideoCatalog(resolvedConditionsById.get(resolvedConditionIds[index] ?? '')),
        }));
      } else {
        summary.errors.push('Condition counts not found. Condition count reset needed. Please click the refresh icon for this lesson.');
        summary.conditions = conditions.map((conditionFilename: string, index: number) => ({
          condition: conditionFilename,
          tdfId: resolvedConditionIds[index] ?? null,
          count: null,
          supportsSparcVideoCatalog: supportsSparcVideoCatalog(resolvedConditionsById.get(resolvedConditionIds[index] ?? '')),
        }));
      }
    }

    summaries.push(summary);
  }

  return summaries;
}
