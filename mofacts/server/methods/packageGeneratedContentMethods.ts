import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import {
  AI_CONTENT_CONTRACT_VERSION,
  getAiContentSaveBlockingIssues,
  validateAiContentSaveContract,
  type AiContentSaveContract,
} from '../../common/aiContentContract';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
};

type TdfSetspecLike = {
  lessonname: string;
  stimulusfile?: string;
  userselect?: string;
  aiVisibilityLockReason?: string;
};

type TdfPayload = {
  tdfs: {
    tutor: {
      setspec: TdfSetspecLike;
      unit?: unknown[];
    };
  };
};

type PackagePayload = {
  fileName: string;
  packageFile?: string;
  packageAssetId?: string;
  stimFileName: string;
  stimuli: unknown;
  tdfs: TdfPayload['tdfs'];
};

type UpsertResult = {
  stimuliSetId?: string | number | null;
  result?: boolean;
  errmsg?: string;
};

type AiGeneratedPackageEntry = {
  moduleId?: unknown;
  title?: unknown;
  tdfFile?: unknown;
  stimFile?: unknown;
  itemCount?: unknown;
  tutor?: unknown;
  stimuli?: unknown;
};

type AiGeneratedPackageSavePayload = {
  packageAssetId?: unknown;
  packageFileName?: unknown;
  entries?: unknown;
  creationSummary?: unknown;
  contract?: unknown;
};

type PackageGeneratedContentDeps = {
  DynamicAssets: any;
  normalizeCanonicalId: (value: unknown) => string | null;
  userIsInRoleAsync: (userId: string, roles: string[]) => Promise<boolean>;
  getTdfByFileName: (filename: string) => Promise<any>;
  legacyTrim: (value: unknown) => string;
  updateStimDisplayTypeMap: (stimuliSetIds: unknown[] | null) => Promise<unknown>;
};

type PackageGeneratedContentCallbacks = {
  upsertPackage: (packageJSON: PackagePayload, ownerId: string) => Promise<UpsertResult>;
  requireCreatorDisplayName: (userId: string) => Promise<string>;
};

function requireRecord(value: unknown, fieldName: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Meteor.Error(400, `${fieldName} must be an object`);
  }
  return value as UnknownRecord;
}

function normalizeGeneratedPackageFileName(value: unknown, packageAssetId: string, ext: string): string {
  const fileName = typeof value === 'string' ? value.trim() : '';
  if (fileName) {
    return fileName;
  }
  return `${packageAssetId}.${ext || 'zip'}`;
}

function artifactKindLabel(moduleId: string): string {
  if (moduleId === 'assessmentSession') {
    return 'Assessment session';
  }
  return 'Learning session';
}

function hasAttributionEvidence(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const attribution = value as Record<string, unknown>;
  return Boolean(
    String(attribution.sourceUrl || '').trim() &&
    String(attribution.licenseName || '').trim() &&
    String(attribution.licenseUrl || '').trim()
  );
}

function getGeneratedMediaVisibilityLockReason(stimuli: UnknownRecord): string {
  const clusters = Array.isArray((stimuli.setspec as any)?.clusters)
    ? (stimuli.setspec as any).clusters
    : [];
  for (const cluster of clusters) {
    const stims = Array.isArray(cluster?.stims) ? cluster.stims : [];
    for (const stim of stims) {
      const display = stim?.display && typeof stim.display === 'object' && !Array.isArray(stim.display)
        ? stim.display as Record<string, unknown>
        : {};
      const hasMedia = ['imgSrc', 'audioSrc', 'videoSrc'].some((field) => String(display[field] || '').trim());
      if (hasMedia && !hasAttributionEvidence(display.attribution)) {
        return 'Generated media content requires source and license attribution evidence before public sharing.';
      }
    }
  }
  return '';
}

export function createPackageGeneratedContentMethods(
  deps: PackageGeneratedContentDeps,
  callbacks: PackageGeneratedContentCallbacks
) {
  return {
    saveAiGeneratedPackageContent: async function(this: MethodContext, payload: AiGeneratedPackageSavePayload) {
      check(payload, Object);
      const actingUserId = deps.normalizeCanonicalId(this.userId);
      if (!actingUserId) {
        throw new Meteor.Error(401, 'Must be logged in to save generated content');
      }
      await callbacks.requireCreatorDisplayName(actingUserId);

      let contract: AiContentSaveContract;
      let contractIssues: string[];
      try {
        contract = validateAiContentSaveContract(payload.contract);
        contractIssues = getAiContentSaveBlockingIssues(contract);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AI content contract is structurally invalid.';
        if (message.includes('contract version')) throw new Meteor.Error('ai-content-contract-version', `AI content contract version ${AI_CONTENT_CONTRACT_VERSION} is required.`);
        throw new Meteor.Error('ai-content-contract-invalid', message);
      }
      if (contractIssues.length > 0) {
        throw new Meteor.Error('ai-content-contract-incomplete', contractIssues.join(' '));
      }

      const packageAssetId = deps.normalizeCanonicalId(payload.packageAssetId);
      if (!packageAssetId) {
        throw new Meteor.Error(400, 'Package asset id is required');
      }
      const packageAsset = await deps.DynamicAssets.findOneAsync({ _id: packageAssetId });
      if (!packageAsset) {
        throw new Meteor.Error(404, 'Package asset not found');
      }
      const assetOwnerId = typeof packageAsset.userId === 'string' ? packageAsset.userId.trim() : '';
      const isAdmin = await deps.userIsInRoleAsync(actingUserId, ['admin']);
      if (assetOwnerId && assetOwnerId !== actingUserId && !isAdmin) {
        throw new Meteor.Error(403, 'Can only save generated packages you uploaded');
      }
      if (packageAsset.meta?.uploadPurpose !== 'package') {
        throw new Meteor.Error(400, 'Generated content must be saved from a package-purpose upload');
      }

      const isTeacherOrAdmin = await deps.userIsInRoleAsync(actingUserId, ['admin', 'teacher']);
      const packageExt = typeof packageAsset.ext === 'string' && packageAsset.ext.trim()
        ? packageAsset.ext.trim()
        : 'zip';
      const packageFile = normalizeGeneratedPackageFileName(payload.packageFileName, packageAssetId, packageExt);
      const entries = Array.isArray(payload.entries) ? payload.entries as AiGeneratedPackageEntry[] : [];
      if (entries.length === 0) {
        throw new Meteor.Error(400, 'Generated package has no content entries');
      }
      if (entries.length !== 1) {
        throw new Meteor.Error('ai-content-contract-module-mismatch', 'AI Content Creator saves exactly one Learning or Test content system.');
      }
      const expectedModule = contract.mode === 'test' ? 'assessmentSession' : 'learningSession';

      const seenTdfFiles = new Set<string>();
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index] || {};
        const moduleId = typeof entry.moduleId === 'string' ? entry.moduleId : '';
        if (moduleId !== expectedModule) {
          throw new Meteor.Error('ai-content-contract-module-mismatch', 'Generated package mode does not match the reviewed Learning or Test selection.');
        }
        if (Number(entry.itemCount) !== contract.pairs.length) {
          throw new Meteor.Error('ai-content-contract-item-mismatch', 'Generated package item count does not match the reviewed stimulus-response pairs.');
        }
        const tdfFile = typeof entry.tdfFile === 'string' ? entry.tdfFile.trim() : '';
        if (!tdfFile) {
          throw new Meteor.Error(400, 'Generated package entry is missing TDF filename');
        }
        if (seenTdfFiles.has(tdfFile)) {
          throw new Meteor.Error(
            'generated-package-name-conflict',
            `Generated content includes more than one system named "${tdfFile}". Choose a different name.`,
            JSON.stringify({
              entryIndex: index,
              tdfFile,
              title: typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : tdfFile,
            })
          );
        }
        seenTdfFiles.add(tdfFile);
        const existingTdf = await deps.getTdfByFileName(tdfFile);
        if (existingTdf?._id) {
          throw new Meteor.Error(
            'generated-package-name-conflict',
            `Content already exists under the name "${tdfFile}". Choose a different name.`,
            JSON.stringify({
              entryIndex: index,
              tdfFile,
              title: typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : tdfFile,
            })
          );
        }
      }

      const outputs: Array<Record<string, unknown>> = [];
      const touchedStimuliSetIds = new Set<string | number>();
      for (const entry of entries) {
        const tdfFile = typeof entry.tdfFile === 'string' ? entry.tdfFile.trim() : '';
        const stimFile = typeof entry.stimFile === 'string' ? entry.stimFile.trim() : '';
        if (!tdfFile || !stimFile) {
          throw new Meteor.Error(400, 'Generated package entry is missing TDF or stimulus filename');
        }
        const tutor = requireRecord(entry.tutor, 'Generated package entry tutor') as TdfPayload['tdfs']['tutor'];
        const stimuli = requireRecord(entry.stimuli, 'Generated package entry stimuli');
        tutor.setspec = tutor.setspec || { lessonname: '' };
        tutor.setspec.stimulusfile = stimFile;
        if (!deps.legacyTrim(tutor.setspec.lessonname)) {
          tutor.setspec.lessonname = typeof entry.title === 'string' ? entry.title.trim() : tdfFile.replace(/_TDF\.json$/i, '');
        }
        if (!isTeacherOrAdmin) {
          tutor.setspec.userselect = 'false';
        }
        const mediaVisibilityLockReason = getGeneratedMediaVisibilityLockReason(stimuli);
        const existingLockReason = String(tutor.setspec.aiVisibilityLockReason || '').trim();
        if (mediaVisibilityLockReason || existingLockReason) {
          tutor.setspec.userselect = 'false';
          tutor.setspec.aiVisibilityLockReason = existingLockReason || mediaVisibilityLockReason;
        }
        const tdfs = { tutor };
        const result = await callbacks.upsertPackage({
          fileName: tdfFile,
          tdfs,
          stimuli,
          stimFileName: stimFile,
          packageFile,
          packageAssetId,
        }, actingUserId);
        if (result?.result === false) {
          throw new Meteor.Error('generated-package-save-failed', result.errmsg || 'Generated package save failed');
        }
        if (result?.stimuliSetId !== undefined && result?.stimuliSetId !== null) {
          touchedStimuliSetIds.add(result.stimuliSetId);
        }
        const savedTdf = await deps.getTdfByFileName(tdfFile);
        const tdfId = typeof savedTdf?._id === 'string' ? savedTdf._id : '';
        const moduleId = typeof entry.moduleId === 'string' ? entry.moduleId : 'learningSession';
        const title = typeof entry.title === 'string' && entry.title.trim()
          ? entry.title.trim()
          : deps.legacyTrim(tutor.setspec.lessonname) || tdfFile;
        outputs.push({
          moduleId,
          title,
          artifactKindLabel: artifactKindLabel(moduleId),
          ...(tdfId ? { tdfId, route: '/contentUpload', editRoute: `/contentEdit/${tdfId}`, tdfEditRoute: `/tdfEdit/${tdfId}` } : {}),
          packageAssetId,
          itemCount: Number.isFinite(Number(entry.itemCount)) ? Number(entry.itemCount) : 0,
          summary: typeof payload.creationSummary === 'string' ? payload.creationSummary : '',
        });
      }

      if (touchedStimuliSetIds.size > 0) {
        await deps.updateStimDisplayTypeMap(Array.from(touchedStimuliSetIds));
      }
      return outputs;
    },
  };
}
