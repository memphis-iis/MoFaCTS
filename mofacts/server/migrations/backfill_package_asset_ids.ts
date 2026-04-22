import { Tdfs } from '../../common/Collections';

const serverConsole = (...args: any[]) => {
  console.log(new Date().toString(), ...args);
};
const TdfsAny = Tdfs as any;

function extractPackageAssetId(packageFile: unknown) {
  if (typeof packageFile !== 'string' || !packageFile.trim()) {
    return null;
  }

  const packageFileName = packageFile.trim().split('/').pop()?.split('\\').pop() || '';
  if (!packageFileName) {
    return null;
  }

  const packageAssetId = packageFileName.split('.').shift()?.trim() || '';
  return packageAssetId || null;
}

export async function backfillPackageAssetIds() {
  serverConsole('Checking for missing packageAssetId fields on TDFs...');

  const docsNeedingBackfill = await TdfsAny.find(
    {
      packageFile: { $exists: true, $ne: null },
      $or: [
        { packageAssetId: { $exists: false } },
        { packageAssetId: null },
        { packageAssetId: '' }
      ]
    },
    { fields: { _id: 1, packageFile: 1 } }
  ).fetchAsync() as Array<{ _id: string; packageFile?: unknown }>;

  if (docsNeedingBackfill.length === 0) {
    serverConsole('No packageAssetId backfill needed');
    return { updated: 0, skipped: 0 };
  }

  let updated = 0;
  let skipped = 0;

  for (const doc of docsNeedingBackfill) {
    const packageAssetId = extractPackageAssetId(doc.packageFile);
    if (!packageAssetId) {
      skipped += 1;
      continue;
    }

    await TdfsAny.updateAsync({ _id: doc._id }, { $set: { packageAssetId } });
    updated += 1;
  }

  serverConsole('Package asset id backfill complete', { updated, skipped });
  return { updated, skipped };
}
