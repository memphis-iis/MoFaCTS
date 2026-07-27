import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import {
  AI_CONTENT_CONTRACT_VERSION,
  getAiContentSaveBlockingIssues,
  validateAiContentSaveContract,
  type AiContentSaveContract,
} from '../../common/aiContentContract';
import type { UploadedPackageFile } from '../lib/packageParser';

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

type AiGeneratedPackageSavePayload = {
  packageAssetId?: unknown;
  packageFileName?: unknown;
  creationSummary?: unknown;
  contract?: unknown;
  uploadIntegrity?: unknown;
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
  requireCreatorDisplayName: (userId: string) => Promise<string>;
  ingestGeneratedPackage: (args: {
    actingUserId: string;
    packageAsset: any;
    packageAssetId: string;
    uploadIntegrity: unknown;
    contract: AiContentSaveContract;
    creationSummary: string;
  }) => Promise<Array<Record<string, unknown>>>;
};

function requireRecord(value: unknown, fieldName: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Meteor.Error(400, `${fieldName} must be an object`);
  }
  return value as UnknownRecord;
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

export function prepareAiGeneratedPackage(
  unzippedFiles: UploadedPackageFile[],
  contract: AiContentSaveContract,
  isTeacherOrAdmin: boolean,
): { tdfFileName: string; title: string; moduleId: string } {
  const tdfFiles = unzippedFiles.filter((file) => file.type === 'tdf');
  const stimFiles = unzippedFiles.filter((file) => file.type === 'stim');
  if (tdfFiles.length !== 1 || stimFiles.length !== 1) {
    throw new Meteor.Error('ai-content-contract-module-mismatch', 'AI Content Creator packages must contain exactly one TDF and one stimulus file.');
  }
  const tdfFile = tdfFiles[0]!;
  const stimFile = stimFiles[0]!;
  const tutor = requireRecord(tdfFile.contents, 'Generated package TDF').tutor as TdfPayload['tdfs']['tutor'] | undefined;
  const stimuli = requireRecord(stimFile.contents, 'Generated package stimuli');
  if (!tutor?.setspec || String(tutor.setspec.stimulusfile || '').trim() !== stimFile.name) {
    throw new Meteor.Error('ai-content-contract-invalid', 'Generated package TDF does not reference its stimulus file.');
  }
  const units = Array.isArray(tutor.unit) ? tutor.unit as Array<Record<string, unknown>> : [];
  const hasLearningSession = units.some((unit) => Boolean(unit.learningsession));
  const hasAssessmentSession = units.some((unit) => Boolean(unit.assessmentsession));
  if ((contract.mode === 'learning' && (!hasLearningSession || hasAssessmentSession))
    || (contract.mode === 'test' && (!hasAssessmentSession || hasLearningSession))) {
    throw new Meteor.Error('ai-content-contract-module-mismatch', 'Generated package mode does not match the reviewed Learning or Test selection.');
  }
  const clusters = Array.isArray((stimuli.setspec as any)?.clusters) ? (stimuli.setspec as any).clusters : [];
  const stims = clusters.flatMap((cluster: any) => Array.isArray(cluster?.stims) ? cluster.stims : []);
  if (stims.length !== contract.pairs.length) {
    throw new Meteor.Error('ai-content-contract-item-mismatch', 'Generated package item count does not match the reviewed stimulus-response pairs.');
  }
  const mediaNameCounts = new Map<string, number>();
  for (const file of unzippedFiles.filter((candidate) => candidate.type === 'media')) {
    mediaNameCounts.set(file.name, (mediaNameCounts.get(file.name) || 0) + 1);
  }
  contract.pairs.forEach((pair, index) => {
    const stim = stims[index] || {};
    const response = String(stim.response?.correctResponse || '').trim();
    if (response !== pair.response.trim()) {
      throw new Meteor.Error('ai-content-contract-item-mismatch', `Generated package pair ${index + 1} does not match the reviewed response.`);
    }
    const imgSrc = String(stim.display?.imgSrc || '').trim();
    if (pair.kind === 'image') {
      const fileName = String(pair.image?.fileName || '').trim();
      if (imgSrc !== fileName || mediaNameCounts.get(fileName) !== 1) {
        throw new Meteor.Error('ai-content-contract-media-mismatch', `Generated package is missing reviewed image "${fileName}".`);
      }
    } else if (String(stim.display?.text || '').trim() !== pair.stimulus.trim() || imgSrc) {
      throw new Meteor.Error('ai-content-contract-item-mismatch', `Generated package pair ${index + 1} does not match the reviewed stimulus.`);
    }
  });
  if (!isTeacherOrAdmin) tutor.setspec.userselect = 'false';
  const mediaVisibilityLockReason = getGeneratedMediaVisibilityLockReason(stimuli);
  const existingLockReason = String(tutor.setspec.aiVisibilityLockReason || '').trim();
  if (mediaVisibilityLockReason || existingLockReason) {
    tutor.setspec.userselect = 'false';
    tutor.setspec.aiVisibilityLockReason = existingLockReason || mediaVisibilityLockReason;
  }
  return {
    tdfFileName: tdfFile.name,
    title: String(tutor.setspec.lessonname || contract.title).trim(),
    moduleId: contract.mode === 'test' ? 'assessmentSession' : 'learningSession',
  };
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

      return callbacks.ingestGeneratedPackage({
        actingUserId,
        packageAsset,
        packageAssetId,
        uploadIntegrity: payload.uploadIntegrity,
        contract,
        creationSummary: typeof payload.creationSummary === 'string' ? payload.creationSummary : '',
      });
    },
  };
}
