import {
  maybeSendPackageUploadEmail,
  type DynamicAssetLike,
  type MethodContext,
  type PackageUploadRuntimeState,
  type ProcessPackageUploadDeps,
  type SaveContentResult,
} from './packageUploadShared';

async function sendPackageUploadSuccessEmail(
  emailToggle: boolean,
  deps: ProcessPackageUploadDeps,
  state: PackageUploadRuntimeState
) {
  await maybeSendPackageUploadEmail(
    emailToggle,
    deps,
    'Package Upload Successful',
    'Package upload successful: ' + state.fileName
  );
}

export async function applyPackageUploadSideEffects(args: {
  context: MethodContext;
  fileObj: DynamicAssetLike;
  emailToggle: boolean;
  deps: ProcessPackageUploadDeps;
  state: PackageUploadRuntimeState;
  isTeacherOrAdmin: boolean;
  results: SaveContentResult[];
}) {
  const { context, fileObj, emailToggle, deps, state, isTeacherOrAdmin, results } = args;

  deps.serverConsole('Package upload completed with', results.length, 'results');

  if (!isTeacherOrAdmin) {
    const today = new Date().toISOString().split('T')[0];
    await deps.UserUploadQuota.upsertAsync(
      { userId: context.userId, date: today },
      {
        $inc: { uploadCount: 1, totalBytes: fileObj.size || 0 },
        $setOnInsert: { userId: context.userId, date: today }
      }
    );
    await deps.AuditLog.insertAsync({
      action: 'user_upload',
      userId: context.userId,
      filename: state.fileName,
      size: fileObj.size,
      timestamp: new Date()
    });
  }

  await sendPackageUploadSuccessEmail(emailToggle, deps, state);
}
