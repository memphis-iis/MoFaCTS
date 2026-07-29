type UnknownRecord = Record<string, unknown>;

type RecoveryDeps = {
  TdfMutationJobs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<number>;
  };
  Tdfs: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<number>;
    removeAsync: (selector: UnknownRecord) => Promise<number>;
  };
  DynamicAssets: {
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
    collection: {
      updateAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
    };
  };
  serverConsole: (...args: unknown[]) => void;
};

const PACKAGE_FIELDS = [
  'tdfFileName',
  'content',
  'ownerId',
  'stimuliSetId',
  'rawStimuliFile',
  'stimuli',
  'packageFile',
  'packageAssetId',
  'conditionCounts',
  'tdfAvailability',
  'tdfIdentityState',
] as const;
const TERMINAL_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function reconcileInterruptedTdfMutationJobs(deps: RecoveryDeps) {
  const jobs = await deps.TdfMutationJobs.find(
    { kind: 'package-upload', status: { $in: ['committing', 'recovery-required'] } },
    { sort: { updatedAt: 1 }, limit: 300 },
  ).fetchAsync();
  let recovered = 0;
  for (const job of jobs) {
    let failed = false;
    try {
      await deps.DynamicAssets.removeAsync({ 'meta.mutationJobId': job._id });
    } catch (error) {
      failed = true;
      deps.serverConsole('[TDF mutation recovery] unjournaled media cleanup error', job._id, error);
    }
    const mediaMutations = Array.isArray(job.mediaMutations) ? [...job.mediaMutations].reverse() : [];
    for (const mediaMutation of mediaMutations) {
      try {
        if (mediaMutation?.newAssetId) {
          await deps.DynamicAssets.removeAsync({ _id: mediaMutation.newAssetId });
        }
        const previousAssets = Array.isArray(mediaMutation?.previousAssets) ? mediaMutation.previousAssets : [];
        for (const previousAsset of previousAssets) {
          await deps.DynamicAssets.collection.updateAsync(
            { _id: previousAsset._id },
            { $set: { name: previousAsset.name, fileName: previousAsset.fileName, meta: previousAsset.meta || {} } },
          );
        }
      } catch (error) {
        failed = true;
        deps.serverConsole('[TDF mutation recovery] media rollback error', job._id, mediaMutation?.newAssetId, error);
      }
    }
    const operations = Array.isArray(job.operations) ? [...job.operations].reverse() : [];
    for (const operation of operations) {
      try {
        if (operation?.action === 'create') {
          await deps.Tdfs.removeAsync({ _id: operation.tdfId, packageAssetId: job.packageAssetId });
          continue;
        }
        const before = operation?.beforeImage && typeof operation.beforeImage === 'object'
          ? operation.beforeImage as UnknownRecord
          : {};
        const targetRevision = Number.isInteger(operation?.targetRevision) ? operation.targetRevision : 0;
        const current = await deps.Tdfs.findOneAsync(
          { _id: operation.tdfId },
          { fields: { _id: 1, tdfRevision: 1 } },
        );
        const currentRevision = Number.isInteger(current?.tdfRevision) ? current.tdfRevision : 0;
        if (currentRevision === targetRevision) {
          continue;
        }
        const setFields: UnknownRecord = { tdfRevision: targetRevision };
        const unsetFields: UnknownRecord = {};
        for (const field of PACKAGE_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(before, field) && before[field] !== undefined) setFields[field] = before[field];
          else unsetFields[field] = '';
        }
        const changed = await deps.Tdfs.updateAsync(
          { _id: operation.tdfId, tdfRevision: targetRevision + 1 },
          { $set: setFields, ...(Object.keys(unsetFields).length > 0 ? { $unset: unsetFields } : {}) },
        );
        if (changed !== 1) {
          await deps.Tdfs.updateAsync(
            { _id: operation.tdfId },
            { $set: { tdfAvailability: 'repair-required' } },
          );
          failed = true;
        }
      } catch (error) {
        failed = true;
        deps.serverConsole('[TDF mutation recovery] rollback error', job._id, operation?.tdfId, error);
      }
    }
    await deps.TdfMutationJobs.updateAsync(
      { _id: job._id, status: { $in: ['committing', 'recovery-required'] } },
      {
        $set: {
          status: failed ? 'recovery-required' : 'rolled-back',
          updatedAt: new Date(),
          ...(failed ? {} : { cleanupAt: new Date(Date.now() + TERMINAL_JOB_RETENTION_MS) }),
        },
        $unset: { confirmationExpiresAt: '' },
      },
    );
    if (!failed) recovered += 1;
  }
  return { scanned: jobs.length, recovered };
}
