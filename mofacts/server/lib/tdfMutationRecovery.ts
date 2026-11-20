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
  'packageWriteJobId',
  'conditionCounts',
  'tdfAvailability',
  'tdfIdentityState',
] as const;
const TERMINAL_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const PACKAGE_WRITE_OWNERSHIP = 'job-id-v1';

export async function rollbackPackageTdfWrite(Tdfs: RecoveryDeps['Tdfs'], jobId: string, operation: {
  tdfId: string;
  action: 'create' | 'update';
  targetRevision: number;
  beforeImage: UnknownRecord | null;
}) {
  const owner = { _id: operation.tdfId, packageWriteJobId: jobId };
  const current = await Tdfs.findOneAsync(owner, { fields: { tdfRevision: 1 } });
  if (!current) return;
  const selector = { ...owner, tdfRevision: operation.targetRevision + 1 };
  if (current.tdfRevision !== selector.tdfRevision) {
    throw new Error('Package-owned TDF revision changed before rollback');
  }
  if (operation.action === 'create') {
    if (await Tdfs.removeAsync(selector) !== 1) throw new Error('Package-owned TDF changed during rollback');
    return;
  }
  if (!operation.beforeImage) throw new Error('Package update has no rollback snapshot');
  const before = operation.beforeImage;
  const setFields: UnknownRecord = { tdfRevision: operation.targetRevision };
  const unsetFields: UnknownRecord = {};
  for (const field of PACKAGE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(before, field) && before[field] !== undefined) setFields[field] = before[field];
    else unsetFields[field] = '';
  }
  const changed = await Tdfs.updateAsync(selector, {
    $set: setFields, ...(Object.keys(unsetFields).length > 0 ? { $unset: unsetFields } : {}),
  });
  if (changed !== 1) throw new Error('Package-owned TDF changed during rollback');
}

export async function reconcileInterruptedTdfMutationJobs(deps: RecoveryDeps) {
  const jobs = await deps.TdfMutationJobs.find(
    { kind: 'package-upload', status: { $in: ['committing', 'recovery-required'] } },
    { sort: { updatedAt: 1 }, limit: 300 },
  ).fetchAsync();
  let recovered = 0;
  for (const job of jobs) {
    if (job.contentWriteOwnership !== PACKAGE_WRITE_OWNERSHIP) {
      await deps.TdfMutationJobs.updateAsync({ _id: job._id, status: 'committing' }, {
        $set: { status: 'recovery-required', updatedAt: new Date() },
        $unset: { cleanupAt: '', confirmationExpiresAt: '' },
      });
      deps.serverConsole('[TDF mutation recovery] legacy job requires operator review', job._id);
      continue;
    }
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
          await deps.DynamicAssets.removeAsync({ _id: mediaMutation.newAssetId, 'meta.mutationJobId': job._id });
        }
        const previousAssets = Array.isArray(mediaMutation?.previousAssets) ? mediaMutation.previousAssets : [];
        for (const previousAsset of previousAssets) {
          await deps.DynamicAssets.collection.updateAsync(
            { _id: previousAsset._id, 'meta.mutationBackupFor': job._id },
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
        await rollbackPackageTdfWrite(deps.Tdfs, job._id, operation);
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
