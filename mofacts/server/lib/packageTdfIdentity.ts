import { Meteor } from 'meteor/meteor';

import { validateAutoTutorContent } from '../../common/lib/autoTutorContract';
import {
  TDF_ID_PATTERN,
  validateConditionFamilyTutor,
} from '../../common/lib/tdfIdentityContract';
import type { UploadedPackageFile } from './packageParser';
import { assertNoH5PContent } from '../../common/lib/unsupportedContent';

const crypto = require('crypto');

export type PackageTdfIdentityEntry = {
  fileName: string;
  tdfId: string;
  incomingTdfId: string | null;
  action: 'create' | 'update';
  lessonName: string;
  conditionTdfIds: Array<string | null>;
  targetRevision: number;
  beforeImage: Record<string, unknown> | null;
};

export type PackageTdfIdentityMode = 'preserve' | 'copy';

export type PackageTdfIdentityPlan = {
  fingerprint: string;
  entries: PackageTdfIdentityEntry[];
  updates: Array<{ tdfId: string; fileName: string; lessonName: string }>;
  creates: Array<{ tdfId: string; fileName: string; lessonName: string }>;
};

type IdentityDeps = {
  Tdfs: {
    find: (selector: Record<string, unknown>, options?: Record<string, unknown>) => {
      fetchAsync: () => Promise<any[]>;
    };
    findOneAsync: (selector: Record<string, unknown>, options?: Record<string, unknown>) => Promise<any>;
  };
  userCanManageTdf: (userId: string, tdf: any) => boolean | Promise<boolean>;
};

function hashValue(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function packageEntryKey(value: string) {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').trim().toLowerCase();
}

function readIncomingTdfId(file: UploadedPackageFile): string | null {
  const contents = file.contents as Record<string, unknown> | null;
  if (!contents || !Object.prototype.hasOwnProperty.call(contents, 'tdfId')) {
    return null;
  }
  const rawId = contents.tdfId;
  if (typeof rawId !== 'string' || rawId !== rawId.trim() || !TDF_ID_PATTERN.test(rawId)) {
    throw new Meteor.Error(
      'invalid-tdf-id',
      `TDF "${file.name}" has an invalid tdfId. Server-managed TDF ids must contain only letters, numbers, underscores, or hyphens.`
    );
  }
  return rawId;
}

function readConditionIds(file: UploadedPackageFile): Array<string | null> {
  const rawIds = (file.contents as any)?.tutor?.setspec?.conditionTdfIds;
  if (rawIds === undefined) return [];
  if (!Array.isArray(rawIds)) {
    throw new Meteor.Error('invalid-condition-tdf-ids', `TDF "${file.name}" has invalid conditionTdfIds.`);
  }
  return rawIds.map((rawId: unknown, index: number) => {
    if (rawId === null || rawId === '') {
      throw new Meteor.Error(
        'invalid-condition-tdf-id',
        `TDF "${file.name}" has a missing conditionTdfIds value at position ${index + 1}.`
      );
    }
    if (typeof rawId !== 'string' || rawId !== rawId.trim() || !TDF_ID_PATTERN.test(rawId)) {
      throw new Meteor.Error(
        'invalid-condition-tdf-id',
        `TDF "${file.name}" has an invalid conditionTdfIds value at position ${index + 1}.`
      );
    }
    return rawId;
  });
}

function readConditions(file: UploadedPackageFile): string[] {
  const rawConditions = (file.contents as any)?.tutor?.setspec?.condition;
  if (rawConditions === undefined) return [];
  if (!Array.isArray(rawConditions)) {
    throw new Meteor.Error('invalid-conditions', `TDF "${file.name}" has an invalid condition list.`);
  }
  return rawConditions.map((rawCondition: unknown, index: number) => {
    if (typeof rawCondition !== 'string' || !rawCondition.trim()) {
      throw new Meteor.Error(
        'invalid-condition-reference',
        `TDF "${file.name}" has an invalid condition reference at position ${index + 1}.`
      );
    }
    return rawCondition.trim();
  });
}

function readLessonName(file: UploadedPackageFile) {
  return String((file.contents as any)?.tutor?.setspec?.lessonname || '').trim();
}

function readExperimentTarget(file: UploadedPackageFile) {
  return String((file.contents as any)?.tutor?.setspec?.experimentTarget || '').trim().toLowerCase();
}

function validatePackageContent(unzippedFiles: UploadedPackageFile[]) {
  const tdfFiles = unzippedFiles.filter((file) => file.type === 'tdf');
  if (tdfFiles.length === 0) {
    throw new Meteor.Error('package-has-no-tdf', 'Package does not contain a TDF JSON file.');
  }

  const packageEntriesByName = new Map<string, UploadedPackageFile>();
  for (const file of unzippedFiles) {
    const key = packageEntryKey(file.name);
    if (!key) {
      throw new Meteor.Error('invalid-package-filename', 'Package contains an empty filename.');
    }
    if (packageEntriesByName.has(key)) {
      throw new Meteor.Error(
        'duplicate-package-filename',
        `Package contains more than one entry named "${file.name}" when compared case-insensitively.`
      );
    }
    packageEntriesByName.set(key, file);
  }

  const stimuliByName = new Map<string, UploadedPackageFile>();
  for (const stimulus of unzippedFiles.filter((file) => file.type === 'stim')) {
    stimuliByName.set(packageEntryKey(stimulus.name), stimulus);
  }

  for (const tdf of tdfFiles) {
    const contents = tdf.contents as any;
    assertNoH5PContent(contents);
    const setspec = contents?.tutor?.setspec;
    if (!setspec || typeof setspec !== 'object') {
      throw new Meteor.Error('invalid-package-tdf', `TDF "${tdf.name}" is missing tutor.setspec.`);
    }
    if (!readLessonName(tdf)) {
      throw new Meteor.Error('invalid-package-tdf', `TDF "${tdf.name}" has no lessonname.`);
    }
    const stimulusFileName = typeof setspec.stimulusfile === 'string' ? setspec.stimulusfile.trim() : '';
    if (!stimulusFileName) {
      throw new Meteor.Error('invalid-package-tdf', `TDF "${tdf.name}" has no stimulusfile.`);
    }
    const stimulus = stimuliByName.get(packageEntryKey(stimulusFileName));
    if (!stimulus) {
      throw new Meteor.Error(
        'missing-package-stimulus',
        `TDF "${tdf.name}" references missing stimulus file "${stimulusFileName}".`
      );
    }
    const autoTutorValidation = validateAutoTutorContent({
      tdf: { tutor: contents.tutor },
      stimuli: stimulus.contents,
    });
    if (!autoTutorValidation.valid) {
      throw new Meteor.Error(
        'invalid-package-content',
        `TDF "${tdf.name}" has invalid AutoTutor content: ${autoTutorValidation.errors.join('; ')}`
      );
    }
    assertNoH5PContent(stimulus.contents);
    const familyValidation = validateConditionFamilyTutor(contents.tutor);
    if (familyValidation.errors.length > 0) {
      throw new Meteor.Error(
        'invalid-package-tdf-shape',
        `TDF "${tdf.name}" has invalid root/unit structure: ${familyValidation.errors.join('; ')}`
      );
    }
  }
}

async function allocateUnusedTdfId(
  deps: IdentityDeps,
  reservedIds: Set<string>
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `tdf_${crypto.randomBytes(12).toString('hex')}`;
    if (!TDF_ID_PATTERN.test(candidate) || reservedIds.has(candidate)) continue;
    const existing = await deps.Tdfs.findOneAsync({ _id: candidate }, { fields: { _id: 1 } });
    if (!existing) return candidate;
  }
  throw new Meteor.Error('tdf-id-allocation-failed', 'Could not allocate a unique TDF id for this package.');
}

export async function preflightPackageTdfIdentities(args: {
  unzippedFiles: UploadedPackageFile[];
  packageAssetId: string;
  ownerId: string;
  deps: IdentityDeps;
  identityMode?: PackageTdfIdentityMode;
}): Promise<PackageTdfIdentityPlan> {
  const { unzippedFiles, packageAssetId, ownerId, deps, identityMode = 'preserve' } = args;
  validatePackageContent(unzippedFiles);
  const tdfFiles = unzippedFiles.filter((file) => file.type === 'tdf');
  const filesByName = new Map<string, UploadedPackageFile>();
  const incomingIdByFile = new Map<UploadedPackageFile, string | null>();
  const incomingIds = new Set<string>();
  const referencedConditionIds = new Set<string>();

  for (const file of tdfFiles) {
    const fileKey = packageEntryKey(file.name);
    if (filesByName.has(fileKey)) {
      throw new Meteor.Error('duplicate-package-tdf-filename', `Package contains more than one TDF named "${file.name}".`);
    }
    filesByName.set(fileKey, file);
    const incomingTdfId = readIncomingTdfId(file);
    if (incomingTdfId) {
      if (incomingIds.has(incomingTdfId)) {
        throw new Meteor.Error('duplicate-package-tdf-id', `Package contains duplicate tdfId "${incomingTdfId}".`);
      }
      incomingIds.add(incomingTdfId);
    }
    for (const conditionTdfId of readConditionIds(file)) {
      if (conditionTdfId && identityMode === 'preserve') referencedConditionIds.add(conditionTdfId);
    }
    incomingIdByFile.set(file, identityMode === 'copy' ? null : incomingTdfId);
  }

  const suppliedIds = identityMode === 'preserve'
    ? new Set([...incomingIds, ...referencedConditionIds])
    : new Set<string>();
  const existingDocs = suppliedIds.size > 0
    ? await deps.Tdfs.find({ _id: { $in: Array.from(suppliedIds) } }).fetchAsync()
    : [];
  const existingById = new Map(existingDocs.map((doc: any) => [String(doc._id), doc]));

  for (const existing of existingDocs) {
    if (!(await deps.userCanManageTdf(ownerId, existing))) {
      throw new Meteor.Error(
        'tdf-id-not-manageable',
        `TDF id "${String(existing._id)}" belongs to content this account cannot manage.`
      );
    }
  }

  const reservedIds = new Set(existingById.keys());
  const entries: PackageTdfIdentityEntry[] = [];
  const entryByFileName = new Map<string, PackageTdfIdentityEntry>();
  const entryByTdfId = new Map<string, PackageTdfIdentityEntry>();

  for (const file of tdfFiles) {
    const incomingTdfId = incomingIdByFile.get(file) || null;
    const tdfId = incomingTdfId || await allocateUnusedTdfId(deps, reservedIds);
    reservedIds.add(tdfId);
    const entry: PackageTdfIdentityEntry = {
      fileName: file.name,
      tdfId,
      incomingTdfId,
      action: existingById.has(tdfId) ? 'update' : 'create',
      lessonName: readLessonName(file),
      conditionTdfIds: [],
      targetRevision: Number.isInteger(existingById.get(tdfId)?.tdfRevision)
        ? existingById.get(tdfId).tdfRevision
        : 0,
      beforeImage: existingById.has(tdfId) ? {
        tdfFileName: existingById.get(tdfId).tdfFileName,
        content: existingById.get(tdfId).content,
        ownerId: existingById.get(tdfId).ownerId,
        stimuliSetId: existingById.get(tdfId).stimuliSetId,
        rawStimuliFile: existingById.get(tdfId).rawStimuliFile,
        stimuli: existingById.get(tdfId).stimuli,
        packageFile: existingById.get(tdfId).packageFile,
        packageAssetId: existingById.get(tdfId).packageAssetId,
        conditionCounts: existingById.get(tdfId).conditionCounts,
        tdfAvailability: existingById.get(tdfId).tdfAvailability,
        tdfIdentityState: existingById.get(tdfId).tdfIdentityState,
        tdfRevision: Number.isInteger(existingById.get(tdfId).tdfRevision)
          ? existingById.get(tdfId).tdfRevision
          : 0,
      } : null,
    };
    entries.push(entry);
    entryByFileName.set(packageEntryKey(entry.fileName), entry);
    entryByTdfId.set(entry.tdfId, entry);
  }

  const targetOwners = new Map<string, PackageTdfIdentityEntry>();
  for (const file of tdfFiles) {
    const target = readExperimentTarget(file);
    if (!target) continue;
    const entry = entryByFileName.get(packageEntryKey(file.name))!;
    const prior = targetOwners.get(target);
    if (prior && prior.tdfId !== entry.tdfId) {
      throw new Meteor.Error(
        'duplicate-package-experiment-target',
        `Package contains more than one TDF using experiment target "${target}".`
      );
    }
    targetOwners.set(target, entry);
  }
  if (targetOwners.size > 0) {
    const existingTargets = await deps.Tdfs.find({
      'content.tdfs.tutor.setspec.experimentTarget': { $in: [...targetOwners.keys()] },
      tdfAvailability: 'available',
    }, { fields: { _id: 1, 'content.tdfs.tutor.setspec.experimentTarget': 1 } }).fetchAsync();
    for (const existing of existingTargets) {
      const target = String(existing?.content?.tdfs?.tutor?.setspec?.experimentTarget || '').trim().toLowerCase();
      const planned = targetOwners.get(target);
      if (planned && String(existing?._id || '') !== planned.tdfId) {
        throw new Meteor.Error(
          'ambiguous-experiment-target',
          `Experiment target "${target}" is already assigned to another available TDF.`
        );
      }
    }
  }

  for (const file of tdfFiles) {
    const conditions = readConditions(file);
    const suppliedConditionIds = readConditionIds(file);
    if (suppliedConditionIds.length > 0 && suppliedConditionIds.length !== conditions.length) {
      throw new Meteor.Error(
        'condition-identity-length-mismatch',
        `TDF "${file.name}" must provide one conditionTdfIds entry for each condition filename.`
      );
    }
  }

  for (const file of tdfFiles) {
    const entry = entryByFileName.get(packageEntryKey(file.name))!;
    const conditions = readConditions(file);
    const suppliedConditionIds = readConditionIds(file);
    entry.conditionTdfIds = [];
    for (let index = 0; index < conditions.length; index += 1) {
      const conditionName = conditions[index]!;
      const suppliedConditionId = identityMode === 'copy' ? null : suppliedConditionIds[index] || null;
      const localByName = entryByFileName.get(packageEntryKey(conditionName)) || null;
      const localById = suppliedConditionId ? entryByTdfId.get(suppliedConditionId) || null : null;

      if (suppliedConditionId) {
        if (!localById) {
          throw new Meteor.Error(
            'missing-condition-tdf-id',
            `TDF "${file.name}" references condition TDF id "${suppliedConditionId}", but that child is not in the package.`
          );
        }
        if (!localByName) {
          throw new Meteor.Error(
            'missing-condition-tdf',
            `TDF "${file.name}" references condition file "${conditionName}", but that child is not in the package.`
          );
        }
        if (localByName.tdfId !== suppliedConditionId) {
          throw new Meteor.Error(
            'condition-identity-mismatch',
            `TDF "${file.name}" maps condition "${conditionName}" to a different tdfId than its packaged child.`
          );
        }
        entry.conditionTdfIds.push(suppliedConditionId);
        continue;
      }

      if (localByName) {
        entry.conditionTdfIds.push(localByName.tdfId);
        continue;
      }
      throw new Meteor.Error(
        'missing-condition-tdf',
        `TDF "${file.name}" references condition file "${conditionName}", but that child is not in the package.`
      );
    }

    const existing = existingById.get(entry.tdfId);
    const previousConditionIds = Array.isArray(existing?.content?.tdfs?.tutor?.setspec?.conditionTdfIds)
      ? existing.content.tdfs.tutor.setspec.conditionTdfIds.filter((id: unknown): id is string => typeof id === 'string' && !!id)
      : [];
    const removedConditionId = previousConditionIds.find((id: string) => !entry.conditionTdfIds.includes(id));
    if (removedConditionId) {
      throw new Meteor.Error(
        'condition-removal-forbidden',
        `TDF "${file.name}" cannot remove established condition TDF "${removedConditionId}".`
      );
    }
  }

  const fingerprint = hashValue({
    packageAssetId,
    identityMode,
    entries: entries
      .map((entry) => {
        const existing = existingById.get(entry.tdfId);
        return {
          fileName: entry.fileName,
          incomingTdfId: entry.incomingTdfId,
          tdfId: entry.tdfId,
          action: entry.action,
          targetRevision: entry.targetRevision,
          conditionTdfIds: entry.conditionTdfIds,
          existingHash: existing
            ? hashValue({ ownerId: existing.ownerId, stimuliSetId: existing.stimuliSetId, content: existing.content })
            : null,
        };
      })
      .sort((left, right) => left.fileName.localeCompare(right.fileName)),
  });

  return {
    fingerprint,
    entries,
    updates: entries
      .filter((entry) => entry.action === 'update')
      .map(({ tdfId, fileName, lessonName }) => ({ tdfId, fileName, lessonName })),
    creates: entries
      .filter((entry) => entry.action === 'create')
      .map(({ tdfId, fileName, lessonName }) => ({ tdfId, fileName, lessonName })),
  };
}

export function isValidTdfId(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && TDF_ID_PATTERN.test(value);
}
