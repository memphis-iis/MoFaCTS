import { createBrowserSnapshotStore } from './browserSnapshotStore';
import { CONTENT_UPLOAD_CACHE_VERSION, type ContentUploadSnapshot } from '../../common/lib/contentUploadMetadata';

export const contentUploadSnapshotStore = createBrowserSnapshotStore<ContentUploadSnapshot>(
  userId => `mofacts.contentUploadMetadata.v${CONTENT_UPLOAD_CACHE_VERSION}.${userId}`,
  (value: unknown, userId: string): value is ContentUploadSnapshot => {
    const snapshot = value as ContentUploadSnapshot | null;
    return snapshot?.version === CONTENT_UPLOAD_CACHE_VERSION && snapshot.userId === userId
      && Number.isFinite(snapshot.generatedAt) && Array.isArray(snapshot.records)
      && snapshot.records.every(record => record?.userId === userId && typeof record._id === 'string'
        && ['tdf', 'stim', 'count'].includes(record.kind) && record.data && typeof record.data === 'object');
  },
);

/** Logout clears this feature's private metadata even if its lazy page was never opened. */
export function clearContentUploadSnapshots(): void {
  const storage = window.localStorage;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith('mofacts.contentUploadMetadata.')) keys.push(key);
  }
  keys.forEach(key => storage.removeItem(key));
}
