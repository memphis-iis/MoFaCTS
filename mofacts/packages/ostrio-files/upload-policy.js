// MoFaCTS upload boundary. The persisted pending record is the authority.
export function uploadMethodNames(collectionName) {
  return {
    _Abort: `_FilesCollectionAbort_${collectionName}`,
    _Write: `_FilesCollectionWrite_${collectionName}`,
    _Start: `_FilesCollectionStart_${collectionName}`,
    _Remove: `_FilesCollectionRemove_${collectionName}`,
  };
}

export function isOwnedPendingUpload(pending, userId) {
  return typeof userId === 'string' && userId.length > 0
    && typeof pending?.file?.userId === 'string'
    && pending.file.userId === userId
    && pending.isFinished !== true;
}

// Serialize operations for one upload, including start, finish and abort.
// A rejected operation must not poison the queue or retain an idle upload.
export function createUploadQueue() {
  const pending = new Map();
  return (fileId, action) => {
    const previous = pending.get(fileId) || Promise.resolve();
    const operation = previous.catch(() => {}).then(action);
    const settled = operation.then(() => {}, () => {});
    pending.set(fileId, settled);
    void settled.then(() => {
      if (pending.get(fileId) === settled) pending.delete(fileId);
    });
    return operation;
  };
}
